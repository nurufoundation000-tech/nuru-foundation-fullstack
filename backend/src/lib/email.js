// lib/email.js - Email Service (CommonJS)
const nodemailer = require('nodemailer');
const crypto = require('crypto');
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

async function sendContactEmail({ name, email, phone, message }) {
  if (!transporter) {
    return { success: false, sent: false, error: 'Email transporter not configured' };
  }

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: 'admin@nurufoundations.com',
    subject: `New Contact Form Message from ${name}`,
    text: `
New Contact Form Submission
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Name: ${name}
Email: ${email}
Phone: ${phone || 'Not provided'}

Message:
${message}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Submitted via nurufoundations.com contact form.
    `,
    html: `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><style>
body{font-family:Arial,sans-serif;line-height:1.6;color:#333;max-width:600px;margin:0 auto;padding:20px;background:#f9f9f9}
.container{background:white;border-radius:10px;padding:30px;box-shadow:0 2px 10px rgba(0,0,0,0.1)}
.header{text-align:center;margin-bottom:30px;border-bottom:2px solid #27ae60;padding-bottom:15px}
.header h1{color:#27ae60;margin:0;font-size:1.5rem}
.badge{display:inline-block;background:#27ae60;color:white;padding:4px 12px;border-radius:12px;font-size:0.8rem;margin-top:5px}
.field{margin:15px 0}
.label{font-weight:bold;color:#6c757d;font-size:0.85rem;display:block;margin-bottom:3px}
.value{color:#2c3e50;font-size:1rem}
.message-box{background:#f8f9fa;border-left:4px solid #27ae60;padding:15px;border-radius:6px;margin:15px 0;white-space:pre-wrap}
.footer{text-align:center;margin-top:30px;padding-top:15px;border-top:1px solid #dee2e6;color:#6c757d;font-size:0.85rem}
</style></head>
<body>
<div class="container">
<div class="header"><h1>New Contact Form Message</h1><span class="badge">nurufoundations.com</span></div>
<div class="field"><span class="label">Name</span><span class="value">${name}</span></div>
<div class="field"><span class="label">Email</span><span class="value">${email}</span></div>
<div class="field"><span class="label">Phone</span><span class="value">${phone || 'Not provided'}</span></div>
<div class="field"><span class="label">Message</span><div class="message-box">${message}</div></div>
<div class="footer"><p>This message was sent from the contact form on nurufoundations.com</p></div>
</div>
</body>
</html>`
  };

  try {
    log('INFO', 'Email', `Sending contact form email from: ${email}`);
    const info = await transporter.sendMail(mailOptions);
    log('INFO', 'Email', 'Contact form email sent', { messageId: info.messageId });
    return { success: true, sent: true };
  } catch (error) {
    log('ERROR', 'Email', 'Failed to send contact email', error);
    return { success: false, sent: false, error: error.message };
  }
}

async function sendNewsletterConfirmation(to) {
  if (!transporter) {
    return { success: false, sent: false, error: 'Email transporter not configured' };
  }

  const siteUrl = process.env.FRONTEND_URL || 'https://nurufoundations.com';

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to,
    subject: 'Thank you for subscribing to Nuru Foundation updates!',
    text: `
Thank you for subscribing!

You've been added to the Nuru Foundation mailing list. We'll keep you updated on:
- New courses and programs
- Upcoming cohorts and enrollment dates
- Events and workshops
- Educational resources and tips

You can unsubscribe at any time by replying to this email.

Best regards,
The Nuru Foundation Team
${siteUrl}
    `,
    html: `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><style>
body{font-family:Arial,sans-serif;line-height:1.6;color:#333;max-width:600px;margin:0 auto;padding:20px;background:#f9f9f9}
.container{background:white;border-radius:10px;padding:30px;box-shadow:0 2px 10px rgba(0,0,0,0.1)}
.header{text-align:center;margin-bottom:30px}
.header h1{color:#27ae60;margin-bottom:5px}
.check{font-size:3rem;margin:10px 0}
.features{background:#f8f9fa;border-radius:8px;padding:20px;margin:20px 0}
.features li{margin:8px 0;color:#2c3e50}
.footer{text-align:center;margin-top:30px;padding-top:15px;border-top:1px solid #dee2e6;color:#6c757d;font-size:0.85rem}
</style></head>
<body>
<div class="container">
<div class="header">
<div class="check">&#10004;</div>
<h1>You're subscribed!</h1>
<p style="color:#6c757d;">Thank you for joining the Nuru Foundation community</p>
</div>
<p>You've been added to our mailing list. We'll keep you updated on:</p>
<div class="features">
<ul>
<li>New courses and programs</li>
<li>Upcoming cohorts and enrollment dates</li>
<li>Events and workshops</li>
<li>Educational resources and tips</li>
</ul>
</div>
<p style="font-size:0.85rem;color:#6c757d;">You can unsubscribe at any time by replying to this email.</p>
<div class="footer">
<p><strong>Best regards,<br>The Nuru Foundation Team</strong></p>
<p><a href="${siteUrl}" style="color:#27ae60;">${siteUrl}</a></p>
</div>
</div>
</body>
</html>`
  };

  try {
    log('INFO', 'Email', `Sending newsletter confirmation to: ${to}`);
    const info = await transporter.sendMail(mailOptions);
    log('INFO', 'Email', 'Newsletter confirmation sent', { messageId: info.messageId });
    return { success: true, sent: true };
  } catch (error) {
    log('ERROR', 'Email', 'Failed to send newsletter confirmation', error);
    return { success: false, sent: false, error: error.message };
  }
}

async function sendPasswordResetEmail(to, resetLink) {
  if (!transporter) {
    return { success: false, sent: false, error: 'Email transporter not configured' };
  }

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: to,
    subject: 'Reset Your Password - Nuru Foundation',
    text: `
You requested a password reset for your Nuru Foundation account.

Click the link below to reset your password (link expires in 1 hour):
${resetLink}

If you did not request this, please ignore this email.

Best regards,
The Nuru Foundation Team
    `,
    html: `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Reset Your Password</title>
    <style>
        body { font-family: 'Arial', sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9; }
        .container { background: white; border-radius: 10px; padding: 30px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .header { text-align: center; margin-bottom: 30px; }
        .header h1 { color: #2c3e50; margin-bottom: 10px; }
        .reset-button { display: block; width: 100%; text-align: center; background: #1e3c72; color: white; padding: 15px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px; margin: 25px 0; box-sizing: border-box; }
        .reset-button:hover { background: #2a5298; }
        .warning-box { background: #fff3cd; border: 1px solid #ffeaa7; padding: 20px; border-radius: 8px; margin: 25px 0; }
        .footer { text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #dee2e6; color: #6c757d; font-size: 14px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Reset Your Password</h1>
            <p>Nuru Foundation</p>
        </div>
        
        <p>You requested a password reset for your Nuru Foundation account.</p>
        
        <a href="${resetLink}" class="reset-button">Reset Password</a>
        
        <p style="color: #6c757d; font-size: 14px;">This link will expire in 1 hour.</p>
        
        <div class="warning-box">
            <p style="margin: 0; font-size: 14px;"><strong>Didn't request this?</strong> If you did not request a password reset, please ignore this email. Your account is secure.</p>
        </div>
        
        <div class="footer">
            <p><strong>Best regards,<br>The Nuru Foundation Team</strong></p>
        </div>
    </div>
</body>
</html>
    `
  };

  try {
    log('INFO', 'Email', `Attempting to send password reset email to: ${to}`);
    const info = await transporter.sendMail(mailOptions);
    log('INFO', 'Email', 'Password reset email sent successfully', {
      messageId: info.messageId,
      response: info.response,
      recipient: to
    });
    return { success: true, messageId: info.messageId, sent: true };
  } catch (error) {
    log('ERROR', 'Email', 'Failed to send password reset email', error);
    return { success: false, error: error.message, sent: false };
  }
}

module.exports = {
  sendWelcomeEmail,
  sendContactEmail,
  sendNewsletterConfirmation,
  sendPasswordResetEmail,
  getEmailStatus
};