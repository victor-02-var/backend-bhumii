'use strict';
const { validationResult } = require('express-validator');
const authService = require('./auth.service');
const { verifyAccessToken } = require('../../utils/jwt');

function handleValidation(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ success: false, errors: errors.array() });
    return false;
  }
  return true;
}

async function sendOTP(req, res, next) {
  if (!handleValidation(req, res)) return;
  try {
    const result = await authService.sendSignupOTP(req.body.email);
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
}

async function verifyOTP(req, res, next) {
  if (!handleValidation(req, res)) return;
  try {
    const result = await authService.verifySignupOTP(req.body.email, req.body.otp);
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
}

async function signup(req, res, next) {
  if (!handleValidation(req, res)) return;
  try {
    const { tempToken, fullName, password, role, state, district, designation, phone } = req.body;
    let payload;
    try {
      payload = verifyAccessToken(tempToken);
    } catch {
      return res.status(400).json({ success: false, message: 'Invalid or expired verification token. Please restart signup.' });
    }
    const result = await authService.completeSignup(payload, { fullName, password, role, state, district, designation, phone });
    res.status(201).json({ success: true, ...result });
  } catch (err) { next(err); }
}

async function login(req, res, next) {
  if (!handleValidation(req, res)) return;
  try {
    const result = await authService.login(req.body.email, req.body.password, req);
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
}

async function logout(req, res, next) {
  try {
    const { refreshToken } = req.body;
    const result = await authService.logout(refreshToken, req.user.userId, req);
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
}

async function refreshToken(req, res, next) {
  if (!handleValidation(req, res)) return;
  try {
    const result = await authService.refreshToken(req.body.refreshToken);
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
}

async function forgotPassword(req, res, next) {
  if (!handleValidation(req, res)) return;
  try {
    const result = await authService.sendForgotPasswordOTP(req.body.email);
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
}

async function verifyResetOTP(req, res, next) {
  if (!handleValidation(req, res)) return;
  try {
    const result = await authService.verifyPasswordResetOTP(req.body.email, req.body.otp);
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
}

async function resetPassword(req, res, next) {
  if (!handleValidation(req, res)) return;
  try {
    const { tempToken, newPassword } = req.body;
    let payload;
    try {
      payload = verifyAccessToken(tempToken);
    } catch {
      return res.status(400).json({ success: false, message: 'Invalid or expired reset token. Please request a new OTP.' });
    }
    const result = await authService.resetPassword(payload, newPassword);
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
}

module.exports = { sendOTP, verifyOTP, signup, login, logout, refreshToken, forgotPassword, verifyResetOTP, resetPassword };
