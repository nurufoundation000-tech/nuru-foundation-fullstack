const nodemailer = require('nodemailer');
require('dotenv').config();

let transporter = null;

if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
  transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    }
  });
}

const sendWelcomeEmail = async (to, username) => {
  const loginUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
  
  if (!transporter) {
    return { success: true, logged: true };
  }

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: to,
    subject: 'Welcome to Nuru Foundation',
    text: `
Welcome to Nuru Foundation!

Your account has been successfully created.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📧 LOGIN DETAILS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Email: ${to}
Username: ${username}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Go to: ${loginUrl}/login.html

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️  IMPORTANT SECURITY NOTES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

• Change your password after first login
• Never share your password with anyone
• Use the "Forgot Password" feature if needed

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

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
              </div>
              
              <a href="${loginUrl}/login.html" class="login-button">Click Here to Login</a>
              
              <div class="security-box">
                  <h3>⚠️ Security Reminder</h3>
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
    await transporter.sendMail(mailOptions);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

module.exports = { sendWelcomeEmail };