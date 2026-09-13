'use strict';
const bcrypt = require('bcryptjs');
const supabase = require('../../config/supabase');
const { signAccessToken, signRefreshToken, signTempToken, verifyRefreshToken } = require('../../utils/jwt');
const { generateOTP, storeOTP, verifyOTP } = require('../../utils/otp');
const { sendOTPEmail, sendWelcomeEmail } = require('../../utils/mailer');
const { writeAuditLog } = require('../../middleware/audit');

const BCRYPT_ROUNDS = 12;

/**
 * Step 1 of signup — Send OTP to email
 */
async function sendSignupOTP(email) {
  // Check if email already registered
  const { data: existing } = await supabase
    .from('users')
    .select('id')
    .eq('email', email.toLowerCase())
    .maybeSingle();

  if (existing) {
    const err = new Error('An account with this email already exists.');
    err.statusCode = 409;
    throw err;
  }

  const otp = generateOTP();
  await storeOTP(email.toLowerCase(), otp, 'signup');
  await sendOTPEmail(email, otp, 'signup');
  return { message: `OTP sent to ${email}. Valid for ${process.env.OTP_EXPIRY_MINUTES || 10} minutes.` };
}

/**
 * Step 2 of signup — Verify OTP
 * Returns a short-lived temp token to continue registration
 */
async function verifySignupOTP(email, otp) {
  const result = await verifyOTP(email.toLowerCase(), otp, 'signup');
  if (!result.valid) {
    const err = new Error(result.reason);
    err.statusCode = 400;
    throw err;
  }
  // Issue a 20-min token proving OTP was verified
  const tempToken = signTempToken({ email: email.toLowerCase(), otpVerified: true, purpose: 'signup' });
  return { verified: true, tempToken };
}

/**
 * Step 3 of signup — Complete registration
 */
async function completeSignup(tempTokenPayload, { fullName, password, role, state, district, designation, phone }) {
  if (!tempTokenPayload.otpVerified || tempTokenPayload.purpose !== 'signup') {
    const err = new Error('Invalid registration token. Please restart the signup process.');
    err.statusCode = 400;
    throw err;
  }

  const email = tempTokenPayload.email;

  // Double-check no duplicate crept in between OTP and signup
  const { data: existing } = await supabase
    .from('users')
    .select('id')
    .eq('email', email)
    .maybeSingle();
  if (existing) {
    const err = new Error('Account already exists.');
    err.statusCode = 409;
    throw err;
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  const { data: user, error } = await supabase
    .from('users')
    .insert({
      email,
      password_hash: passwordHash,
      full_name: fullName,
      role: role || 'district_officer',
      state: state || null,
      district: district || null,
      designation: designation || null,
      phone: phone || null,
      is_verified: true,
    })
    .select('id, email, full_name, role, state, district, designation, is_verified, created_at')
    .single();

  if (error) throw error;

  // Send welcome email (fire and forget)
  sendWelcomeEmail(email, fullName, user.role).catch(() => {});

  const { accessToken, refreshToken } = await issueTokenPair(user);
  return { user, accessToken, refreshToken };
}

/**
 * Login with email + password
 */
async function login(email, password, req) {
  const { data: user, error } = await supabase
    .from('users')
    .select('*')
    .eq('email', email.toLowerCase())
    .maybeSingle();

  if (error || !user) {
    const err = new Error('Invalid email or password.');
    err.statusCode = 401;
    throw err;
  }

  if (!user.is_active) {
    const err = new Error('Your account has been deactivated. Please contact an administrator.');
    err.statusCode = 403;
    throw err;
  }

  const passwordMatch = await bcrypt.compare(password, user.password_hash);
  if (!passwordMatch) {
    const err = new Error('Invalid email or password.');
    err.statusCode = 401;
    throw err;
  }

  // Update last_login
  await supabase.from('users').update({ last_login: new Date().toISOString() }).eq('id', user.id);

  await writeAuditLog({
    userId: user.id,
    userEmail: user.email,
    action: 'LOGIN',
    resourceType: 'auth',
    summary: `User ${user.email} logged in`,
    req,
  });

  const { accessToken, refreshToken } = await issueTokenPair(user);

  // Remove sensitive field before returning
  const { password_hash, ...safeUser } = user;
  return { user: safeUser, accessToken, refreshToken };
}

/**
 * Refresh access token using refresh token
 */
async function refreshToken(token) {
  let payload;
  try {
    payload = verifyRefreshToken(token);
  } catch {
    const err = new Error('Invalid or expired refresh token.');
    err.statusCode = 401;
    throw err;
  }

  // Verify token is not revoked in DB
  const tokenHash = hashToken(token);
  const { data: storedToken } = await supabase
    .from('refresh_tokens')
    .select('*')
    .eq('user_id', payload.userId)
    .eq('token_hash', tokenHash)
    .eq('revoked', false)
    .maybeSingle();

  if (!storedToken || new Date(storedToken.expires_at) < new Date()) {
    const err = new Error('Refresh token is no longer valid. Please log in again.');
    err.statusCode = 401;
    throw err;
  }

  // Fetch fresh user data
  const { data: user } = await supabase
    .from('users')
    .select('id, email, role, state, district')
    .eq('id', payload.userId)
    .single();

  if (!user) {
    const err = new Error('User not found.');
    err.statusCode = 401;
    throw err;
  }

  const newAccessToken = signAccessToken({
    userId: user.id,
    email: user.email,
    role: user.role,
    state: user.state,
    district: user.district,
  });

  return { accessToken: newAccessToken };
}

/**
 * Logout — revoke refresh token
 */
async function logout(token, userId, req) {
  if (token) {
    const tokenHash = hashToken(token);
    await supabase
      .from('refresh_tokens')
      .update({ revoked: true })
      .eq('user_id', userId)
      .eq('token_hash', tokenHash);
  }
  await writeAuditLog({
    userId,
    action: 'LOGOUT',
    resourceType: 'auth',
    summary: `User ${userId} logged out`,
    req,
  });
  return { message: 'Logged out successfully.' };
}

/**
 * Forgot password — send OTP
 */
async function sendForgotPasswordOTP(email) {
  const { data: user } = await supabase
    .from('users')
    .select('id')
    .eq('email', email.toLowerCase())
    .maybeSingle();

  // Always return same message to prevent email enumeration
  const message = 'If an account with this email exists, a password reset OTP has been sent.';
  if (!user) return { message };

  const otp = generateOTP();
  await storeOTP(email.toLowerCase(), otp, 'password_reset');
  await sendOTPEmail(email, otp, 'password_reset');
  return { message };
}

/**
 * Verify password reset OTP — returns temp token
 */
async function verifyPasswordResetOTP(email, otp) {
  const result = await verifyOTP(email.toLowerCase(), otp, 'password_reset');
  if (!result.valid) {
    const err = new Error(result.reason);
    err.statusCode = 400;
    throw err;
  }
  const tempToken = signTempToken({
    email: email.toLowerCase(),
    otpVerified: true,
    purpose: 'password_reset',
  });
  return { verified: true, tempToken };
}

/**
 * Reset password with temp token
 */
async function resetPassword(tempTokenPayload, newPassword) {
  if (!tempTokenPayload.otpVerified || tempTokenPayload.purpose !== 'password_reset') {
    const err = new Error('Invalid reset token. Please request a new OTP.');
    err.statusCode = 400;
    throw err;
  }

  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
  const { error } = await supabase
    .from('users')
    .update({ password_hash: passwordHash, updated_at: new Date().toISOString() })
    .eq('email', tempTokenPayload.email);

  if (error) throw error;

  // Revoke all existing refresh tokens for this user on password reset
  const { data: user } = await supabase
    .from('users')
    .select('id')
    .eq('email', tempTokenPayload.email)
    .single();
  if (user) {
    await supabase.from('refresh_tokens').update({ revoked: true }).eq('user_id', user.id);
  }

  return { message: 'Password reset successfully. Please log in with your new password.' };
}

// ─── PRIVATE HELPERS ─────────────────────────────────────────────────────────

async function issueTokenPair(user) {
  const tokenPayload = {
    userId: user.id,
    email: user.email,
    role: user.role,
    state: user.state,
    district: user.district,
  };

  const accessToken = signAccessToken(tokenPayload);
  const refreshToken = signRefreshToken(tokenPayload);

  // Store hashed refresh token
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  await supabase.from('refresh_tokens').insert({
    user_id: user.id,
    token_hash: hashToken(refreshToken),
    expires_at: expiresAt,
  });

  return { accessToken, refreshToken };
}

function hashToken(token) {
  const crypto = require('crypto');
  return crypto.createHash('sha256').update(token).digest('hex');
}

module.exports = {
  sendSignupOTP,
  verifySignupOTP,
  completeSignup,
  login,
  refreshToken,
  logout,
  sendForgotPasswordOTP,
  verifyPasswordResetOTP,
  resetPassword,
};
