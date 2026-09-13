'use strict';
const { Router } = require('express');
const { body } = require('express-validator');
const ctrl = require('./auth.controller');
const { authenticate } = require('../../middleware/auth');
const { authLimiter } = require('../../middleware/rateLimiter');

const router = Router();

// Apply stricter rate limit to all auth routes
router.use(authLimiter);

const emailRule = body('email').isEmail().normalizeEmail().withMessage('Valid email required.');
const passwordRule = body('password')
  .isLength({ min: 8 })
  .withMessage('Password must be at least 8 characters.')
  .matches(/[A-Z]/).withMessage('Password must contain an uppercase letter.')
  .matches(/[0-9]/).withMessage('Password must contain a number.');
const otpRule = body('otp').isLength({ min: 6, max: 6 }).isNumeric().withMessage('OTP must be 6 digits.');

// ── Signup Flow (3-step OTP) ──────────────────────────────────────
// Step 1: Request OTP
router.post('/send-otp', [emailRule], ctrl.sendOTP);

// Step 2: Verify OTP → get tempToken
router.post('/verify-otp', [emailRule, otpRule], ctrl.verifyOTP);

// Step 3: Complete registration with tempToken
router.post('/signup', [
  body('tempToken').notEmpty().withMessage('Verification token required.'),
  body('fullName').trim().isLength({ min: 2 }).withMessage('Full name required (min 2 chars).'),
  passwordRule,
  body('role')
    .optional()
    .isIn(['district_officer', 'collector', 'state_admin', 'central_admin', 'ministry'])
    .withMessage('Invalid role.'),
  body('state').optional().trim(),
  body('district').optional().trim(),
  body('designation').optional().trim(),
  body('phone').optional({ checkFalsy: true }).isMobilePhone().withMessage('Invalid phone number.'),
], ctrl.signup);

// ── Login ─────────────────────────────────────────────────────────
router.post('/login', [emailRule, body('password').notEmpty()], ctrl.login);

// ── Session Management ────────────────────────────────────────────
router.post('/logout', authenticate, ctrl.logout);

router.post('/refresh-token', [
  body('refreshToken').notEmpty().withMessage('Refresh token required.'),
], ctrl.refreshToken);

// ── Password Reset Flow (2-step OTP) ─────────────────────────────
router.post('/forgot-password', [emailRule], ctrl.forgotPassword);
router.post('/verify-reset-otp', [emailRule, otpRule], ctrl.verifyResetOTP);
router.post('/reset-password', [
  body('tempToken').notEmpty(),
  body('newPassword').isLength({ min: 8 }).matches(/[A-Z]/).matches(/[0-9]/),
], ctrl.resetPassword);

module.exports = router;
