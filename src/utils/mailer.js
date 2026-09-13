'use strict';
/**
 * Mailer utility — styled HTML emails via Nodemailer
 */
const transporter = require('../config/nodemailer');

const FROM = process.env.EMAIL_FROM || '"LandGuard AI" <noreply@example.com>';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

/**
 * Shared HTML email shell
 */
function wrapEmail(title, bodyHtml) {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <style>
    body { font-family: Arial, sans-serif; background: #f4f6f9; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 30px auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 12px rgba(0,0,0,0.1); }
    .header { background: linear-gradient(135deg, #1a3a5c 0%, #2d6a9f 100%); padding: 30px; text-align: center; }
    .header h1 { color: #ffffff; margin: 0; font-size: 22px; letter-spacing: 0.5px; }
    .header p { color: #a8ccec; margin: 6px 0 0; font-size: 13px; }
    .body { padding: 32px 36px; color: #333333; }
    .otp-box { background: #f0f7ff; border: 2px dashed #2d6a9f; border-radius: 8px; text-align: center; padding: 20px; margin: 24px 0; }
    .otp-code { font-size: 40px; font-weight: bold; color: #1a3a5c; letter-spacing: 10px; }
    .expiry { color: #888; font-size: 13px; margin-top: 8px; }
    .alert-box { border-left: 4px solid #e53935; background: #fff5f5; padding: 16px; border-radius: 4px; margin: 20px 0; }
    .alert-box.warning { border-color: #f57c00; background: #fff8f0; }
    .alert-box.critical { border-color: #b71c1c; background: #ffebee; }
    .badge { display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: bold; }
    .badge-critical { background: #ffcdd2; color: #b71c1c; }
    .badge-high { background: #ffe0b2; color: #e65100; }
    .badge-medium { background: #fff9c4; color: #f57f17; }
    .badge-low { background: #c8e6c9; color: #2e7d32; }
    .btn { display: inline-block; padding: 12px 28px; background: #2d6a9f; color: white; text-decoration: none; border-radius: 6px; font-weight: bold; margin-top: 16px; }
    .footer { background: #f4f6f9; padding: 20px; text-align: center; color: #999; font-size: 12px; }
    table { width: 100%; border-collapse: collapse; margin: 16px 0; }
    th { background: #1a3a5c; color: white; padding: 10px; text-align: left; font-size: 13px; }
    td { padding: 10px; border-bottom: 1px solid #e8e8e8; font-size: 13px; }
    tr:last-child td { border-bottom: none; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🏗️ LandGuard AI</h1>
      <p>Predictive Analytics for Land Acquisition Delays</p>
    </div>
    <div class="body">
      <h2 style="color:#1a3a5c; margin-top:0;">${title}</h2>
      ${bodyHtml}
    </div>
    <div class="footer">
      <p>SIH PS-25017 | Ministry of Rural Development | Department of Land Resources</p>
      <p>This is an automated message. Do not reply to this email.</p>
    </div>
  </div>
</body>
</html>`;
}

/**
 * Send OTP email for signup or password reset
 */
async function sendOTPEmail(to, otp, purpose) {
  const isReset = purpose === 'password_reset';
  const subject = isReset
    ? 'LandGuard AI — Password Reset OTP'
    : 'LandGuard AI — Email Verification OTP';

  const body = `
    <p>Hello,</p>
    <p>${isReset ? 'You requested a password reset for your LandGuard AI account.' : 'Thank you for registering with LandGuard AI. Please verify your email address using the OTP below.'}</p>
    <div class="otp-box">
      <div class="otp-code">${otp}</div>
      <div class="expiry">⏱️ This OTP expires in <strong>${process.env.OTP_EXPIRY_MINUTES || 10} minutes</strong></div>
    </div>
    <p style="color:#888; font-size:13px;">If you did not request this, please ignore this email. Do not share this OTP with anyone.</p>
  `;

  await transporter.sendMail({
    from: FROM,
    to,
    subject,
    html: wrapEmail(isReset ? 'Password Reset Request' : 'Verify Your Email', body),
  });
}

/**
 * Send high-risk project alert email
 */
async function sendAlertEmail(to, alertData) {
  const {
    projectName,
    projectCode,
    riskScore,
    riskCategory,
    alertType,
    topFactors = [],
    recommendations = [],
    projectId,
  } = alertData;

  const badgeClass = `badge-${riskCategory.toLowerCase()}`;
  const factorRows = topFactors
    .map(
      (f) =>
        `<tr><td>${f.factor}</td><td>${(f.contribution * 100).toFixed(1)}%</td><td>${f.description}</td></tr>`
    )
    .join('');

  const recRows = recommendations
    .slice(0, 3)
    .map(
      (r) =>
        `<tr><td><span class="badge badge-${r.priority === 'URGENT' ? 'critical' : r.priority === 'HIGH' ? 'high' : 'medium'}">${r.priority}</span></td><td>${r.action}</td><td>${r.owner || '—'}</td></tr>`
    )
    .join('');

  const body = `
    <div class="alert-box ${riskCategory === 'Critical' ? 'critical' : 'warning'}">
      <p style="margin:0; font-weight:bold;">⚠️ ${alertType.replace(/_/g, ' ').toUpperCase()}</p>
      <p style="margin:6px 0 0; font-size:13px;">Immediate attention required for this land acquisition project.</p>
    </div>

    <table>
      <tr><td><strong>Project</strong></td><td>${projectName}</td></tr>
      <tr><td><strong>Code</strong></td><td>${projectCode}</td></tr>
      <tr><td><strong>Risk Score</strong></td><td><strong>${riskScore.toFixed(1)}%</strong> &nbsp;<span class="badge ${badgeClass}">${riskCategory}</span></td></tr>
    </table>

    ${topFactors.length > 0 ? `
    <h3 style="color:#1a3a5c;">🔍 Top Delay Factors</h3>
    <table>
      <tr><th>Factor</th><th>Contribution</th><th>Description</th></tr>
      ${factorRows}
    </table>` : ''}

    ${recommendations.length > 0 ? `
    <h3 style="color:#1a3a5c;">💡 Recommended Actions</h3>
    <table>
      <tr><th>Priority</th><th>Action</th><th>Owner</th></tr>
      ${recRows}
    </table>` : ''}

    <a href="${FRONTEND_URL}/projects/${projectId}" class="btn">View Project Dashboard →</a>
  `;

  await transporter.sendMail({
    from: FROM,
    to,
    subject: `🚨 [${riskCategory.toUpperCase()}] ${projectName} — LandGuard AI Alert`,
    html: wrapEmail(`Project Risk Alert: ${projectName}`, body),
  });
}

/**
 * Send welcome email after successful signup
 */
async function sendWelcomeEmail(to, fullName, role) {
  const body = `
    <p>Hello <strong>${fullName}</strong>,</p>
    <p>Welcome to <strong>LandGuard AI</strong> — the Predictive Analytics System for Early Detection of Land Acquisition Delays.</p>
    <p>Your account has been created with the following details:</p>
    <table>
      <tr><td><strong>Email</strong></td><td>${to}</td></tr>
      <tr><td><strong>Role</strong></td><td>${role.replace(/_/g, ' ')}</td></tr>
    </table>
    <p>You can now log in and access your dashboard to monitor land acquisition projects and receive AI-powered delay predictions.</p>
    <a href="${FRONTEND_URL}/login" class="btn">Go to Dashboard →</a>
  `;

  await transporter.sendMail({
    from: FROM,
    to,
    subject: 'Welcome to LandGuard AI',
    html: wrapEmail('Welcome to LandGuard AI', body),
  });
}

module.exports = { sendOTPEmail, sendAlertEmail, sendWelcomeEmail };
