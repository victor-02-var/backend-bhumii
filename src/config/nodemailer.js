'use strict';
require('dotenv').config();
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '587', 10),
  secure: false, // STARTTLS
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

// Verify connection on startup (only in non-test env)
if (process.env.NODE_ENV !== 'test') {
  transporter.verify((error) => {
    if (error) {
      console.warn('[Nodemailer] SMTP connection warning:', error.message);
    } else {
      console.log('[Nodemailer] SMTP server ready');
    }
  });
}

module.exports = transporter;
