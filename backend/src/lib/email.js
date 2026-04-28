// lib/email.js - Email Service (CommonJS)
const nodemailer = require('nodemailer');
require('dotenv').config();
const { log } = require('./logger.js');

let transporter = null;
let lastError = null;
let configuredHost = 'nurufoundations.com';
let configuredPort = 465;

if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
  log('INFO', 'Email', 'Creating SMTP transporter', {
    host: process.env.EMAIL_HOST || 'nurufoundations.com',
    port: parseInt(process.env.EMAIL_PORT || '465'),
    user: process.env.EMAIL_USER
  });
  
  configuredHost = process.env.EMAIL_HOST || 'nurufoundations.com';
  configuredPort = parseInt(process.env.EMAIL_PORT || '465');
  
  const smtpConfig = {
    host: process.env.EMAIL_HOST || 'nurufoundations.com',
    port: parseInt(process.env.EMAIL_PORT || '465'),
    secure: parseInt(process.env.EMAIL_PORT || '465') === 465,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    },
    tls: {
      rejectUnauthorized: false
    }
  };
  
  transporter = nodemailer.createTransport(smtpConfig);

  // Verify SMTP connection
  transporter.verify((error, success) => {
    if (error) {
      lastError = error;
      log('ERROR', 'Email', 'SMTP connection verification failed', error);
      log('ERROR', 'Email', 'Please check: 1) Email account exists in cPanel, 2) Password is correct, 3) Host is correct (try mail.yourdomain.com)');
    } else {
      log('INFO', 'Email', 'SMTP server is ready to send messages');
    }
  });
} else {
  log('WARN', 'Email', 'EMAIL_USER or EMAIL_PASS not set - email disabled');
}

function getEmailStatus() {
  return {
    configured: !!transporter,
    lastError: lastError ? lastError.message : null,
    host: configuredHost,
    port: configuredPort,
    user: process.env.EMAIL_USER || 'not set'
  };
}

async function sendWelcomeEmail(to, username, password) {
  const loginUrl = process.env.FRONTEND_URL || 'https://nurufoundations.com';

  if (!transporter) {
    return { success: false, sent: false, error: 'Email transporter not configured' };
  }

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: to,
    subject: 'Welcome to Nuru Foundation',
    text: `
Welcome to Nuru Foundation!

Your account has been successfully created.

LOGIN DETAILS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Email: ${to}
Username: ${username}
Password: ${password}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Go to: ${loginUrl}/login.html

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
IMPORTANT SECURITY NOTES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

* Change your password after first login
* Never share your password with anyone
* Use the "Forgot Password" feature if needed

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Best regards,
The Nuru Foundation Team

${loginUrl}
    `,
    html: `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Welcome to Nuru Foundation</title>
    <style>
        body { font-family: 'Arial', sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9; }
        .container { background: white; border-radius: 10px; padding: 30px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .header { text-align: center; margin-bottom: 30px; }
        .header h1 { color: #2c3e50; margin-bottom: 10px; }
        .credentials-box { background: #f8f9fa; border-left: 4px solid #3498db; padding: 25px; border-radius: 8px; margin: 25px 0; }
        .label { font-weight: bold; color: #495057; }
        .value { font-family: 'Courier New', monospace; padding: 5px 10px; background: white; border-radius: 4px; border: 1px solid #ced4da; }
        .password-value { color: #e74c3c; font-weight: bold; }
        .login-button { display: block; width: 100%; text-align: center; background: #3498db; color: white; padding: 15px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px; margin: 25px 0; }
        .login-button:hover { background: #2980b9; }
        .security-box { background: #fff3cd; border: 1px solid #ffeaa7; padding: 20px; border-radius: 8px; margin: 25px 0; }
        .footer { text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #dee2e6; color: #6c757d; font-size: 14px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Welcome to Nuru Foundation!</h1>
            <p>Your account has been successfully created</p>
        </div>
        
        <div class="credentials-box">
            <h3>Your Login Details</h3>
            <p><span class="label">Email:</span> <span class="value">${to}</span></p>
            <p><span class="label">Username:</span> <span class="value">${username}</span></p>
            <p><span class="label">Password:</span> <span class="value password-value">${password}</span></p>
        </div>
        
        <a href="${loginUrl}/login.html" class="login-button">Click Here to Login</a>
        
        <div class="security-box">
            <h3>Security Reminder</h3>
            <ul>
                <li><strong>Change your password</strong> after first login using the "Forgot Password" feature</li>
                <li>Never share your password with anyone</li>
            </ul>
        </div>
        
        <div class="footer">
            <p><strong>Best regards,<br>The Nuru Foundation Team</strong></p>
            <p><a href="${loginUrl}" style="color: #3498db;">${loginUrl}</a></p>
        </div>
    </div>
</body>
</html>
    `
  };

  try {
    log('INFO', 'Email', `Attempting to send welcome email to: ${to}`);
    
    const info = await transporter.sendMail(mailOptions);
    
    log('INFO', 'Email', 'Email sent successfully', {
      messageId: info.messageId,
      response: info.response,
      recipient: to
    });
    
    return { success: true, messageId: info.messageId, sent: true };
  } catch (error) {
    log('ERROR', 'Email', 'Failed to send email', error);
    return { success: false, error: error.message, sent: false };
  }
}

module.exports = {
  sendWelcomeEmail,
  getEmailStatus
};