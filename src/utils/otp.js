'use strict';
/**
 * OTP utility — generate, hash, and verify one-time passwords
 * Uses bcrypt for hashing (same as passwords — consistent security model)
 */
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const supabase = require('../config/supabase');

const OTP_LENGTH = parseInt(process.env.OTP_LENGTH || '6', 10);
const OTP_EXPIRY_MINUTES = parseInt(process.env.OTP_EXPIRY_MINUTES || '10', 10);
const BCRYPT_ROUNDS = 10;

/**
 * Generate a random numeric OTP
 */
function generateOTP() {
  const max = Math.pow(10, OTP_LENGTH);
  const min = Math.pow(10, OTP_LENGTH - 1);
  return String(crypto.randomInt(min, max));
}

/**
 * Store a hashed OTP in the database
 * Clears any previous unused OTPs for same email+purpose first
 */
async function storeOTP(email, otp, purpose) {
  const otpHash = await bcrypt.hash(otp, BCRYPT_ROUNDS);
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000).toISOString();

  // Invalidate old OTPs for this email+purpose
  await supabase
    .from('otp_store')
    .update({ used: true })
    .eq('email', email)
    .eq('purpose', purpose)
    .eq('used', false);

  const { error } = await supabase
    .from('otp_store')
    .insert({ email, otp_hash: otpHash, purpose, expires_at: expiresAt });

  if (error) throw new Error(`Failed to store OTP: ${error.message}`);
}

/**
 * Verify an OTP against stored hash
 * Returns { valid: true } or { valid: false, reason: '...' }
 */
async function verifyOTP(email, otp, purpose) {
  const { data: records, error } = await supabase
    .from('otp_store')
    .select('*')
    .eq('email', email)
    .eq('purpose', purpose)
    .eq('used', false)
    .order('created_at', { ascending: false })
    .limit(1);

  if (error || !records || records.length === 0) {
    return { valid: false, reason: 'No OTP found. Please request a new one.' };
  }

  const record = records[0];

  // Check expiry
  if (new Date(record.expires_at) < new Date()) {
    return { valid: false, reason: 'OTP has expired. Please request a new one.' };
  }

  // Check hash
  const isMatch = await bcrypt.compare(otp, record.otp_hash);
  if (!isMatch) {
    return { valid: false, reason: 'Invalid OTP.' };
  }

  // Mark as used
  await supabase
    .from('otp_store')
    .update({ used: true })
    .eq('id', record.id);

  return { valid: true };
}

module.exports = { generateOTP, storeOTP, verifyOTP };
