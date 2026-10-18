// lib/email.js - Email Service (CommonJS)
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
require('dotenv').config();
const { log } = require('./logger.js');

// Email template cache
const templateCache = {};

function renderTemplate(name, data) {
  if (!templateCache[name]) {
    const templatePath = path.join(__dirname, '..', 'email-templates', `${name}.html`);
    if (!fs.existsSync(templatePath)) {
      log('ERROR', 'Email', `Template not found: ${name}.html`);
      return '';
    }
    templateCache[name] = fs.readFileSync(templatePath, 'utf8');
  }
  let html = templateCache[name];
  for (const [key, value] of Object.entries(data)) {
    html = html.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), String(value ?? ''));
  }
  return html;
}

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

async function sendWelcomeEmail(to, username, resetLink) {
  const siteUrl = process.env.FRONTEND_URL || 'https://nurufoundations.com';

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

Username: ${username}
Email: ${to}

To set your password, click the link below (expires in 1 hour):
${resetLink}

If you did not create this account, please ignore this email.

Best regards,
The Nuru Foundation Team
${siteUrl}
    `,
    html: renderTemplate('welcome', {
      username,
      email: to,
      resetLink,
      siteUrl
    })
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
    html: renderTemplate('contact', {
      name,
      email,
      phone: phone || 'Not provided',
      message,
      siteUrl: 'nurufoundations.com'
    })
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
    html: renderTemplate('newsletter', { siteUrl })
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
    html: renderTemplate('password-reset', { resetLink })
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