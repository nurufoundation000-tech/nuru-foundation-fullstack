const nodemailer = require('nodemailer');
require('dotenv').config();

console.log('📧 Email system initializing...');
console.log('   EMAIL_USER:', process.env.EMAIL_USER || 'NOT CONFIGURED');
console.log('   EMAIL_PASS:', process.env.EMAIL_PASS ? 'SET' : 'NOT SET');

let transporter = null;

// Only create transporter if credentials are configured
if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
  try {
    transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });
    console.log('✅ Email transporter created successfully');
  } catch (error) {
    console.error('❌ Failed to create email transporter:', error.message);
  }
} else {
  console.log('⚠️  Email credentials not configured. Emails will be logged but not sent.');
}

const sendWelcomeEmail = async (to, username, password) => {
  console.log('\n📧 [EMAIL LOG] Would send welcome email to:', to);
  console.log('   Username:', username);
  console.log('   Password:', password);
  console.log('   Login URL:', process.env.FRONTEND_URL || 'http://localhost:3000');
  
  const loginUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
  
  // If no transporter, just log and return success (for testing)
  if (!transporter) {
    console.log('⚠️  Email not sent (no transporter). Credentials logged above.');
    return { 
      success: true,  // Return true so user creation doesn't fail
      error: 'Email not configured - credentials logged above',
      logged: true
    };
  }

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: to,
    subject: 'Welcome to Nuru Foundation - Your Login Credentials',
    text: `
Welcome to Nuru Foundation!

Your account has been successfully created. Here are your login details:

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📧 LOGIN CREDENTIALS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🔐 Email Address: ${to}
👤 Username: ${username}
🔑 Password: ${password}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔗 LOGIN INSTRUCTIONS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. Go to: ${loginUrl}/login.html
2. Enter your email: ${to}
3. Enter your password: ${password}
4. Click "Login"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️  IMPORTANT SECURITY NOTES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

• Save these credentials in a secure place
• Change your password after first login
• Never share your password with anyone
• If you forgot your password, contact support

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📞 NEED HELP?
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

If you have any questions or need assistance, 
please contact our support team.

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
              body {
                  font-family: 'Arial', sans-serif;
                  line-height: 1.6;
                  color: #333;
                  max-width: 600px;
                  margin: 0 auto;
                  padding: 20px;
                  background-color: #f9f9f9;
              }
              .container {
                  background: white;
                  border-radius: 10px;
                  padding: 30px;
                  box-shadow: 0 2px 10px rgba(0,0,0,0.1);
              }
              .header {
                  text-align: center;
                  margin-bottom: 30px;
              }
              .header h1 {
                  color: #2c3e50;
                  margin-bottom: 10px;
              }
              .credentials-box {
                  background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%);
                  border-left: 4px solid #3498db;
                  padding: 25px;
                  border-radius: 8px;
                  margin: 25px 0;
              }
              .credentials-box h3 {
                  color: #2c3e50;
                  margin-top: 0;
                  margin-bottom: 20px;
                  font-size: 18px;
              }
              .credential-item {
                  margin-bottom: 15px;
                  padding-bottom: 15px;
                  border-bottom: 1px solid #dee2e6;
              }
              .credential-item:last-child {
                  border-bottom: none;
                  margin-bottom: 0;
                  padding-bottom: 0;
              }
              .label {
                  font-weight: bold;
                  color: #495057;
                  display: inline-block;
                  width: 120px;
              }
              .value {
                  color: #212529;
                  font-family: 'Courier New', monospace;
                  font-size: 16px;
                  padding: 5px 10px;
                  background: white;
                  border-radius: 4px;
                  border: 1px solid #ced4da;
              }
              .login-steps {
                  background: #e8f4f8;
                  padding: 20px;
                  border-radius: 8px;
                  margin: 25px 0;
              }
              .login-steps h3 {
                  color: #0c5460;
                  margin-top: 0;
              }
              .step {
                  display: flex;
                  align-items: center;
                  margin-bottom: 15px;
              }
              .step-number {
                  background: #3498db;
                  color: white;
                  width: 30px;
                  height: 30px;
                  border-radius: 50%;
                  display: flex;
                  align-items: center;
                  justify-content: center;
                  margin-right: 15px;
                  font-weight: bold;
              }
              .security-box {
                  background: #fff3cd;
                  border: 1px solid #ffeaa7;
                  padding: 20px;
                  border-radius: 8px;
                  margin: 25px 0;
              }
              .security-box h3 {
                  color: #856404;
                  margin-top: 0;
              }
              .login-button {
                  display: block;
                  width: 100%;
                  text-align: center;
                  background: linear-gradient(135deg, #3498db 0%, #2980b9 100%);
                  color: white;
                  padding: 15px;
                  text-decoration: none;
                  border-radius: 8px;
                  font-weight: bold;
                  font-size: 16px;
                  margin: 25px 0;
                  transition: transform 0.3s ease;
              }
              .login-button:hover {
                  transform: translateY(-2px);
                  background: linear-gradient(135deg, #2980b9 0%, #1c6ea4 100%);
              }
              .footer {
                  text-align: center;
                  margin-top: 30px;
                  padding-top: 20px;
                  border-top: 1px solid #dee2e6;
                  color: #6c757d;
                  font-size: 14px;
              }
              @media (max-width: 600px) {
                  .container {
                      padding: 20px;
                  }
                  .label {
                      width: 100px;
                  }
                  .value {
                      font-size: 14px;
                  }
              }
          </style>
      </head>
      <body>
          <div class="container">
              <div class="header">
                  <h1>Welcome to Nuru Foundation! 🎉</h1>
                  <p>Your account has been successfully created</p>
              </div>
              
              <div class="credentials-box">
                  <h3>📧 Your Login Credentials</h3>
                  
                  <div class="credential-item">
                      <span class="label">Email Address:</span>
                      <span class="value">${to}</span>
                  </div>
                  
                  <div class="credential-item">
                      <span class="label">Username:</span>
                      <span class="value">${username}</span>
                  </div>
                  
                  <div class="credential-item">
                      <span class="label">Password:</span>
                      <span class="value">${password}</span>
                  </div>
              </div>
              
              <a href="${loginUrl}/login.html" class="login-button">
                  🚀 Click Here to Login
              </a>
              
              <div class="login-steps">
                  <h3>📝 Login Instructions</h3>
                  
                  <div class="step">
                      <div class="step-number">1</div>
                      <div>Go to: <strong>${loginUrl}/login.html</strong></div>
                  </div>
                  
                  <div class="step">
                      <div class="step-number">2</div>
                      <div>Enter your email: <strong>${to}</strong></div>
                  </div>
                  
                  <div class="step">
                      <div class="step-number">3</div>
                      <div>Enter your password: <strong>${password}</strong></div>
                  </div>
                  
                  <div class="step">
                      <div class="step-number">4</div>
                      <div>Click the <strong>"Login"</strong> button</div>
                  </div>
              </div>
              
              <div class="security-box">
                  <h3>⚠️ Important Security Notes</h3>
                  <ul style="margin: 10px 0; padding-left: 20px;">
                      <li>Save these credentials in a secure place</li>
                      <li><strong>Change your password after first login</strong></li>
                      <li>Never share your password with anyone</li>
                      <li>Use a strong, unique password</li>
                      <li>If you suspect unauthorized access, contact support immediately</li>
                  </ul>
              </div>
              
              <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; margin: 20px 0;">
                  <h3 style="margin-top: 0; color: #2c3e50;">💡 Tips for First-Time Users</h3>
                  <ul style="margin: 10px 0; padding-left: 20px;">
                      <li>Bookmark the login page for easy access</li>
                      <li>Complete your profile after logging in</li>
                      <li>Explore available courses and resources</li>
                      <li>Check your dashboard for personalized content</li>
                  </ul>
              </div>
              
              <div class="footer">
                  <p>If you have any questions or need assistance, please contact our support team.</p>
                  <p><strong>Best regards,<br>The Nuru Foundation Team</strong></p>
                  <p style="margin-top: 20px;">
                      <a href="${loginUrl}" style="color: #3498db; text-decoration: none;">${loginUrl}</a>
                  </p>
                  <p style="font-size: 12px; color: #95a5a6; margin-top: 20px;">
                      This is an automated message. Please do not reply to this email.
                  </p>
              </div>
          </div>
      </body>
      </html>
    `
  };

  try {
    console.log('📤 Attempting to send email...');
    const info = await transporter.sendMail(mailOptions);
    console.log('✅ Email sent successfully!');
    console.log('   Message ID:', info.messageId);
    console.log('   Response:', info.response);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('❌ Email sending failed:');
    console.log('   Error:', error.message);
    console.log('   Code:', error.code);
    
    // If email fails, still return success so user creation doesn't fail
    // The generated password will be returned to admin to share manually
    return { 
      success: false, 
      error: error.message,
      code: error.code
    };
  }
};

module.exports = {
  sendWelcomeEmail
};