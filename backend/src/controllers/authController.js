// controllers/authController.js - Authentication Controller
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import db from '../config/database.js';
import { sendWelcomeEmail } from '../lib/email.js';
import { 
  generateInitialInvoices, 
  checkAndUpdateInvoiceStatuses, 
  isStudentLocked 
} from '../lib/invoices.js';

export async function login(req, res) {
  try {
    const { email, password } = req.body;
    console.log('Login attempt:', email);

    const user = await db.getOne('SELECT * FROM users WHERE email = ?', [email.toLowerCase()]);

    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    if (!user.is_active) {
      return res.status(401).json({ error: 'Account is deactivated' });
    }

    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    let role = null;
    if (user.role_id) {
      role = await db.getOne('SELECT name FROM roles WHERE id = ?', [user.role_id]);
    }

    // Check if student has overdue invoices and lock them if needed
    if (role?.name === 'student') {
      await checkAndUpdateInvoiceStatuses();
      await generateInitialInvoices(user.id);
      const locked = await isStudentLocked(user.id);
      if (locked) {
        return res.status(403).json({ 
          error: 'Account locked due to unpaid invoices. Please pay to regain access.',
          locked: true
        });
      }
    }

    const { password_hash, ...userWithoutPassword } = user;

    const token = jwt.sign(
      {
        userId: user.id,
        email: user.email,
        role: role?.name || 'user'
      },
      process.env.JWT_SECRET || 'fallback-secret',
      { expiresIn: '24h' }
    );

    res.json({
      success: true,
      user: userWithoutPassword,
      token,
      message: 'Login successful'
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
}

function generateRandomPassword(length = 12) {
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
  let password = '';
  for (let i = 0; i < length; i++) {
    password += charset.charAt(Math.floor(Math.random() * charset.length));
  }
  return password;
}

export async function register(req, res) {
  try {
    const { email, username, fullName, roleId } = req.body;

    if (!email || !username || !fullName) {
      return res.status(400).json({
        error: 'Email, username, and full name are required'
      });
    }

    const existingUser = await db.getOne(`
      SELECT id FROM users WHERE email = ? OR username = ?
    `, [email.toLowerCase(), username]);

    if (existingUser) {
      return res.status(409).json({
        error: 'User already exists'
      });
    }

    const generatedPassword = generateRandomPassword();
    const hashedPassword = await bcrypt.hash(generatedPassword, 12);

    const userId = await db.insert('users', {
      email: email.toLowerCase(),
      password_hash: hashedPassword,
      username,
      full_name: fullName.trim(),
      role_id: roleId || null,
      is_active: true,
      must_change_password: true,
      date_joined: new Date()
    });

    const user = await db.getOne('SELECT * FROM users WHERE id = ?', [userId]);

    // Send welcome email
    try {
      await sendWelcomeEmail(email, username, generatedPassword);
      console.log('Welcome email sent to:', email);
    } catch (emailError) {
      console.error('Failed to send welcome email:', emailError.message);
    }

    let role = null;
    if (user.role_id) {
      role = await db.getOne('SELECT name FROM roles WHERE id = ?', [user.role_id]);
    }

    const { password_hash, ...userWithoutPassword } = user;

    const token = jwt.sign(
      {
        userId: user.id,
        email: user.email,
        role: role?.name || 'user'
      },
      process.env.JWT_SECRET || 'fallback-secret',
      { expiresIn: '24h' }
    );

    res.status(201).json({
      success: true,
      user: userWithoutPassword,
      token,
      message: 'Registration successful. Please check your email for login credentials.'
    });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
}

export default {
  login,
  register
};