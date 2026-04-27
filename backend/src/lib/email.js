// lib/email.js - Email Service (CommonJS) - Debug Version
const nodemailer = require('nodemailer');
require('dotenv').config();

console.log('[Email] Initializing email service...');
console.log('[Email] EMAIL_USER set:', !!process.env.EMAIL_USER);
console.log('[Email] EMAIL_PASS set:', !!process.env.EMAIL_PASS);

let transporter = null;

if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
  console.log('[Email] Creating cPanel SMTP transporter for:', process.env.EMAIL_USER);
  console.log('[Email] SMTP Host: nurufoundations.com, Port: 465');
  transporter = nodemailer.createTransport({
    host: 'nurufoundations.com',
    port: 465,
    secure: true,  // true for port 465 (SSL/TLS)
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    },
    tls: {
      rejectUnauthorized: false  // Allow self-signed certs from shared hosting
    }
  });
  console.log('[Email] Transporter created successfully');
} else {
  console.log('[Email] FATAL: EMAIL_USER or EMAIL_PASS not set in environment!');
}

async function sendWelcomeEmail(to, username, password) {
  const loginUrl = process.env.FRONTEND_URL || 'https://nurufoundations.com';

  console.log('[Email] Attempting to send welcome email to:', to);

  if (!transporter) {
    console.log('[Email] FATAL ERROR: Transporter is null - email will NOT be sent');
    console.log('[Email] This usually means EMAIL_USER or EMAIL_PASS is missing from .env');
    return { success: false, logged: true };
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
    console.log('[Email] Sending email with options:', JSON.stringify({
      from: mailOptions.from,
      to: mailOptions.to,
      subject: mailOptions.subject
    }));
    
    const info = await transporter.sendMail(mailOptions);
    console.log('[Email] SUCCESS: Email sent! Message ID:', info.messageId);
    console.log('[Email] SUCCESS: Response:', info.response);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('[Email] FATAL ERROR: Failed to send email!');
    console.error('[Email] Error name:', error.name);
    console.error('[Email] Error message:', error.message);
    console.error('[Email] Error code:', error.code);
    console.error('[Email] Error command:', error.command);
    console.error('[Email] Full error stack:', error.stack);
    return { success: false, error: error.message };
  }
}

module.exports = {
  sendWelcomeEmail
};