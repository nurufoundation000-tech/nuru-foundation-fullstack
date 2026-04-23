const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const { sendWelcomeEmail } = require('./api/lib/email');
const db = require('./api/lib/db');
const { initiateSTKPush, queryTransactionStatus, parseCallbackPayload, isMpesaConfigured, simulatePayment, formatPhoneNumber } = require('./api/lib/mpesa');

const app = express();
const PORT = process.env.PORT;

// ==================== HELPER FUNCTIONS ====================

async function getGlobalSettings() {
  try {
    const fs = require('fs');
    const settingsPath = './global-billing.json';
    let settings = { billingDay: 1, gracePeriodDays: 2 };
    if (fs.existsSync(settingsPath)) {
      settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    }
    return settings;
  } catch (error) {
    console.error('Error loading global settings:', error);
    return { billingDay: 1, gracePeriodDays: 2 };
  }
}

async function generateInitialInvoices(studentId) {
  const settings = await getGlobalSettings();
  const enrollments = await db.query(`
    SELECT e.*, c.title as course_title, cp.initial_payment, cp.is_active
    FROM enrollments e
    JOIN courses c ON e.course_id = c.id
    LEFT JOIN course_pricing cp ON c.id = cp.course_id
    WHERE e.student_id = ?
  `, [studentId]);

  for (const enrollment of enrollments) {
    if (!enrollment.initial_payment || !enrollment.is_active) continue;

    const existing = await db.getOne(`
      SELECT id FROM invoices 
      WHERE student_id = ? AND course_id = ? AND type = 'initial'
    `, [studentId, enrollment.courseId]);

    if (!existing) {
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 7);
      const gracePeriodEnd = new Date(dueDate);
      gracePeriodEnd.setDate(gracePeriodEnd.getDate() + settings.gracePeriodDays);

      await db.insert('invoices', {
        student_id: studentId,
        course_id: enrollment.courseId,
        type: 'initial',
        amount: enrollment.initial_payment,
        status: 'pending',
        due_date: dueDate,
        grace_period_end: gracePeriodEnd
      });
      console.log(`Created initial invoice for student ${studentId}, course ${enrollment.courseId}`);
    }
  }
}

async function checkAndUpdateInvoiceStatuses() {
  const settings = await getGlobalSettings();
  const now = new Date();

  const overdueInvoices = await db.query(`
    SELECT id, student_id FROM invoices 
    WHERE status = 'pending' AND grace_period_end < ?
  `, [now]);

  for (const invoice of overdueInvoices) {
    await db.update('invoices', invoice.id, {
      status: 'locked',
      locked_at: now
    });
    console.log(`Invoice ${invoice.id} marked as locked, student ${invoice.student_id} locked out`);
  }
}

async function generateMonthlyInvoices() {
  const settings = await getGlobalSettings();
  const billingDay = settings.billingDay;
  const today = new Date();

  const enrollments = await db.query(`
    SELECT e.*, cp.monthly_amount, cp.billing_duration, cp.is_active
    FROM enrollments e
    LEFT JOIN course_pricing cp ON e.course_id = cp.course_id
    WHERE cp.is_active = 1 AND cp.monthly_amount > 0
  `);

  for (const enrollment of enrollments) {
    if (!enrollment.monthly_amount) continue;

    const billingDuration = enrollment.billing_duration || 1;
    const existingMonthly = await db.query(`
      SELECT id FROM invoices 
      WHERE student_id = ? AND course_id = ? AND type = 'monthly'
      ORDER BY created_at ASC
    `, [enrollment.studentId, enrollment.courseId]);

    if (existingMonthly.length >= billingDuration) continue;

    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const alreadyBilled = existingMonthly.find(inv => new Date(inv.created_at) >= startOfMonth);
    if (alreadyBilled) continue;

    let dueDate = new Date(today.getFullYear(), today.getMonth(), billingDay);
    if (today.getDate() > billingDay) {
      dueDate = new Date(today.getFullYear(), today.getMonth() + 1, billingDay);
    }

    const gracePeriodEnd = new Date(dueDate);
    gracePeriodEnd.setDate(gracePeriodEnd.getDate() + settings.gracePeriodDays);

    await db.insert('invoices', {
      student_id: enrollment.studentId,
      course_id: enrollment.courseId,
      type: 'monthly',
      month_number: existingMonthly.length + 1,
      amount: enrollment.monthly_amount,
      status: 'pending',
      due_date: dueDate,
      grace_period_end: gracePeriodEnd,
      last_billed_at: today
    });
  }
}

async function isStudentLocked(studentId) {
  const invoice = await db.getOne(`
    SELECT id FROM invoices 
    WHERE student_id = ? AND status = 'locked'
  `, [studentId]);
  return !!invoice;
}

// ==================== MIDDLEWARE SETUP ====================
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static('frontend'));
app.use(express.static('.'));

if (process.env.NODE_ENV === 'production') {
  app.use((req, res, next) => {
    console.log(`${req.method} ${req.url} - ${new Date().toISOString()}`);
    next();
  });
}

// ==================== AUTHENTICATION MIDDLEWARE ====================
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const token = authHeader.slice(7);
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret');
    
    const user = await db.getOne('SELECT * FROM users WHERE id = ?', [decoded.userId]);

    if (!user || !user.is_active) {
      return res.status(403).json({ error: 'User not found or inactive' });
    }

    let role = null;
    if (user.role_id) {
      role = await db.getOne('SELECT name FROM roles WHERE id = ?', [user.role_id]);
    }

    if (role?.name === 'student') {
      await checkAndUpdateInvoiceStatuses();
      const isLocked = await isStudentLocked(user.id);
      if (isLocked) {
        return res.status(403).json({ 
          error: 'Account locked due to unpaid invoices. Please pay to regain access.',
          locked: true 
        });
      }
    }

    req.user = {
      userId: user.id,
      roleId: user.role_id,
      roleName: role?.name || 'student',
      username: user.username,
      email: user.email
    };
    
    next();
  } catch (error) {
    console.error('Token verification error:', error);
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Invalid token' });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
    }
    return res.status(401).json({ error: 'Authentication failed' });
  }
};

const requireRole = (allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    if (!allowedRoles.includes(req.user.roleName)) {
      return res.status(403).json({ 
        error: `Access denied. Required roles: ${allowedRoles.join(', ')}` 
      });
    }
    next();
  };
};

const requireStudent = [authenticateToken, requireRole(['student'])];
const requireTutor = [authenticateToken, requireRole(['tutor'])];
const requireAdmin = [authenticateToken, requireRole(['admin'])];

// ==================== HEALTH CHECK ====================
app.get('/api/health', async (req, res) => {
  try {
    await db.query('SELECT 1');
    res.json({ 
      status: 'OK', 
      database: 'connected',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ 
      status: 'ERROR', 
      database: 'disconnected',
      error: error.message 
    });
  }
});

// ==================== AUTHENTICATION ROUTES ====================
app.post('/api/auth/login', async (req, res) => {
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

    if (role?.name === 'student') {
      await generateInitialInvoices(user.id);
      await checkAndUpdateInvoiceStatuses();
      const isLocked = await isStudentLocked(user.id);
      if (isLocked) {
        return res.status(403).json({ 
          error: 'Account locked due to unpaid invoices. Please pay to regain access.',
          locked: true
        });
      }
    }

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
});

function generateRandomPassword(length = 12) {
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
  let password = '';
  for (let i = 0; i < length; i++) {
    password += charset.charAt(Math.floor(Math.random() * charset.length));
  }
  return password;
}

app.post('/api/auth/register', async (req, res) => {
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

    try {
      await sendWelcomeEmail(email, username, generatedPassword);
      console.log('Welcome email sent to:', email);
    } catch (emailError) {
      console.error('Failed to send welcome email:', emailError);
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
});

// ==================== USER ROUTES ====================
app.get('/api/users/me', authenticateToken, async (req, res) => {
  try {
    const user = await db.getOne('SELECT * FROM users WHERE id = ?', [req.user.userId]);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    let role = null;
    if (user.role_id) {
      role = await db.getOne('SELECT name FROM roles WHERE id = ?', [user.role_id]);
    }

    const { password_hash, ...userWithoutPassword } = user;
    res.json({ success: true, user: { ...userWithoutPassword, role: role?.name } });

  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Failed to get user data' });
  }
});

app.put('/api/users/profile', authenticateToken, async (req, res) => {
  try {
    const { fullName, username, email } = req.body;
    
    const existingUser = await db.getOne('SELECT * FROM users WHERE id = ?', [req.user.userId]);

    if (!existingUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (email && email !== existingUser.email) {
      const emailExists = await db.getOne('SELECT id FROM users WHERE email = ? AND id != ?', [email.toLowerCase(), req.user.userId]);
      if (emailExists) {
        return res.status(409).json({ error: 'Email already exists' });
      }
    }

    if (username && username !== existingUser.username) {
      const usernameExists = await db.getOne('SELECT id FROM users WHERE username = ? AND id != ?', [username, req.user.userId]);
      if (usernameExists) {
        return res.status(409).json({ error: 'Username already exists' });
      }
    }

    const updateData = {};
    if (fullName) updateData.full_name = fullName;
    if (username) updateData.username = username;
    if (email) updateData.email = email.toLowerCase();
    updateData.updated_at = new Date();

    await db.update('users', req.user.userId, updateData);

    const user = await db.getOne('SELECT * FROM users WHERE id = ?', [req.user.userId]);
    const { password_hash, ...userWithoutPassword } = user;
    res.json({ success: true, user: userWithoutPassword });

  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

app.put('/api/users/change-password', authenticateToken, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current password and new password are required' });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters long' });
    }

    const user = await db.getOne('SELECT password_hash FROM users WHERE id = ?', [req.user.userId]);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const validPassword = await bcrypt.compare(currentPassword, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 12);
    await db.update('users', req.user.userId, { password_hash: hashedPassword });
    
    res.json({ success: true, message: 'Password changed successfully' });

  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ error: 'Failed to change password' });
  }
});

app.put('/api/users/set-password', authenticateToken, async (req, res) => {
  try {
    const { newPassword } = req.body;

    if (!newPassword) {
      return res.status(400).json({ error: 'New password is required' });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters long' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 12);
    await db.update('users', req.user.userId, { 
      password_hash: hashedPassword,
      must_change_password: false
    });
    
    res.json({ success: true, message: 'Password set successfully' });

  } catch (error) {
    console.error('Set password error:', error);
    res.status(500).json({ error: 'Failed to set password' });
  }
});

app.put('/api/users/skip-password-change', authenticateToken, async (req, res) => {
  try {
    await db.update('users', req.user.userId, { must_change_password: false });
    res.json({ success: true, message: 'Password change skipped' });
  } catch (error) {
    console.error('Skip password error:', error);
    res.status(500).json({ error: 'Failed to skip password change' });
  }
});

// ==================== COURSE ROUTES ====================
app.get('/api/courses', async (req, res) => {
  try {
    const courses = await db.query(`
      SELECT c.*, u.full_name as tutor_name, u.username as tutor_username,
             (SELECT COUNT(*) FROM enrollments WHERE course_id = c.id) as enrollments_count,
             (SELECT COUNT(*) FROM lessons WHERE course_id = c.id) as lessons_count
      FROM courses c
      JOIN users u ON c.tutor_id = u.id
      ORDER BY c.created_at DESC
    `);

    res.json({ success: true, data: courses });

  } catch (error) {
    console.error('Get courses error:', error);
    res.status(500).json({ error: 'Failed to load courses' });
  }
});

app.get('/api/courses/:id', async (req, res) => {
  try {
    const courseId = parseInt(req.params.id);
    
    if (isNaN(courseId)) {
      return res.status(400).json({ error: 'Invalid course ID' });
    }
    
    const course = await db.getOne(`
      SELECT c.*, u.full_name as tutor_name, u.username as tutor_username, u.bio as tutor_bio
      FROM courses c
      JOIN users u ON c.tutor_id = u.id
      WHERE c.id = ?
    `, [courseId]);

    if (!course) {
      return res.status(404).json({ error: 'Course not found' });
    }

    const lessons = await db.query(`
      SELECT * FROM lessons WHERE course_id = ? ORDER BY order_index ASC
    `, [courseId]);

    res.json({
      success: true,
      data: { ...course, lessons }
    });

  } catch (error) {
    console.error('Get course error:', error);
    res.status(500).json({ error: 'Failed to load course' });
  }
});

app.post('/api/courses/:id/enroll', authenticateToken, async (req, res) => {
  try {
    const courseId = parseInt(req.params.id);
    
    if (isNaN(courseId)) {
      return res.status(400).json({ error: 'Invalid course ID' });
    }
    
    const course = await db.getOne('SELECT id FROM courses WHERE id = ?', [courseId]);

    if (!course) {
      return res.status(404).json({ error: 'Course not found' });
    }

    const existingEnrollment = await db.getOne(`
      SELECT id FROM enrollments WHERE student_id = ? AND course_id = ?
    `, [req.user.userId, courseId]);

    if (existingEnrollment) {
      return res.status(409).json({ error: 'Already enrolled in this course' });
    }

    const enrollmentId = await db.insert('enrollments', {
      student_id: req.user.userId,
      course_id: courseId,
      enrolled_at: new Date()
    });

    const enrollment = await db.getOne('SELECT * FROM enrollments WHERE id = ?', [enrollmentId]);
    
    res.status(201).json({
      success: true,
      data: enrollment,
      message: 'Successfully enrolled in course'
    });

  } catch (error) {
    console.error('Enroll error:', error);
    res.status(500).json({ error: 'Failed to enroll in course' });
  }
});

// ==================== STUDENT DASHBOARD ROUTES ====================
app.get('/api/student/courses', authenticateToken, async (req, res) => {
  try {
    const enrollments = await db.query(`
      SELECT e.*, c.title, c.description, c.category,
             t.full_name as tutor_name, t.username as tutor_username,
             (SELECT COUNT(*) FROM lessons WHERE course_id = c.id) as total_lessons,
             (SELECT COUNT(*) FROM lesson_progress lp 
              JOIN lessons l ON lp.lesson_id = l.id 
              WHERE lp.enrollment_id = e.id AND lp.is_completed = 1) as completed_lessons
      FROM enrollments e
      JOIN courses c ON e.course_id = c.id
      JOIN users t ON c.tutor_id = t.id
      WHERE e.student_id = ?
      ORDER BY e.enrolled_at DESC
    `, [req.user.userId]);

    const progressData = enrollments.map(enrollment => {
      const totalLessons = enrollment.total_lessons || 0;
      const completedLessons = enrollment.completed_lessons || 0;
      const progress = totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0;

      return {
        id: enrollment.id,
        enrolledAt: enrollment.enrolled_at,
        progress,
        completedLessons,
        totalLessons,
        course: {
          id: enrollment.course_id,
          title: enrollment.title,
          description: enrollment.description,
          category: enrollment.category,
          tutor: { fullName: enrollment.tutor_name, username: enrollment.tutor_username }
        }
      };
    });

    res.json({ success: true, data: progressData });

  } catch (error) {
    console.error('Get student courses error:', error);
    res.status(500).json({ error: 'Failed to load student courses' });
  }
});

app.get('/api/courses/progress', authenticateToken, async (req, res) => {
  try {
    const enrollments = await db.query(`
      SELECT e.*, c.title, c.description, c.category,
             t.full_name as tutor_name, t.username as tutor_username,
             (SELECT COUNT(*) FROM lessons WHERE course_id = c.id) as total_lessons,
             (SELECT COUNT(*) FROM lesson_progress lp 
              JOIN lessons l ON lp.lesson_id = l.id 
              WHERE lp.enrollment_id = e.id AND lp.is_completed = 1) as completed_lessons
      FROM enrollments e
      JOIN courses c ON e.course_id = c.id
      JOIN users t ON c.tutor_id = t.id
      WHERE e.student_id = ?
      ORDER BY e.enrolled_at DESC
    `, [req.user.userId]);

    const progressData = enrollments.map(enrollment => {
      const totalLessons = enrollment.total_lessons || 0;
      const completedLessons = enrollment.completed_lessons || 0;
      const progress = totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0;

      return {
        id: enrollment.id,
        progress,
        completedLessons,
        totalLessons,
        course: {
          id: enrollment.course_id,
          title: enrollment.title,
          category: enrollment.category,
          tutor: { fullName: enrollment.tutor_name, username: enrollment.tutor_username }
        }
      };
    });

    res.json({ success: true, data: progressData });

  } catch (error) {
    console.error('Get progress error:', error);
    res.status(500).json({ error: 'Failed to load progress data' });
  }
});

app.post('/api/lessons/:lessonId/complete', authenticateToken, async (req, res) => {
  try {
    const lessonId = parseInt(req.params.lessonId);
    
    if (isNaN(lessonId)) {
      return res.status(400).json({ error: 'Invalid lesson ID' });
    }
    
    const lesson = await db.getOne(`
      SELECT l.*, c.id as course_id 
      FROM lessons l
      JOIN courses c ON l.course_id = c.id
      WHERE l.id = ?
    `, [lessonId]);

    if (!lesson) {
      return res.status(404).json({ error: 'Lesson not found' });
    }

    const enrollment = await db.getOne(`
      SELECT id FROM enrollments 
      WHERE student_id = ? AND course_id = ?
    `, [req.user.userId, lesson.course_id]);

    if (!enrollment) {
      return res.status(403).json({ error: 'You are not enrolled in this course' });
    }

    const alreadyCompleted = await db.getOne(`
      SELECT id FROM lesson_progress 
      WHERE enrollment_id = ? AND lesson_id = ?
    `, [enrollment.id, lessonId]);

    if (alreadyCompleted) {
      return res.status(409).json({ error: 'Lesson already completed' });
    }

    await db.insert('lesson_progress', {
      enrollment_id: enrollment.id,
      lesson_id: lessonId,
      is_completed: true,
      completed_at: new Date()
    });

    res.json({ success: true, message: 'Lesson marked as completed' });

  } catch (error) {
    console.error('Complete lesson error:', error);
    res.status(500).json({ error: 'Failed to mark lesson as completed' });
  }
});

app.delete('/api/student/courses/:enrollmentId/unenroll', authenticateToken, async (req, res) => {
  try {
    const enrollmentId = parseInt(req.params.enrollmentId);
    
    if (isNaN(enrollmentId)) {
      return res.status(400).json({ error: 'Invalid enrollment ID' });
    }
    
    const enrollment = await db.getOne(`
      SELECT id FROM enrollments 
      WHERE id = ? AND student_id = ?
    `, [enrollmentId, req.user.userId]);

    if (!enrollment) {
      return res.status(404).json({ error: 'Enrollment not found' });
    }

    await db.query('DELETE FROM lesson_progress WHERE enrollment_id = ?', [enrollmentId]);
    await db.query('DELETE FROM enrollments WHERE id = ?', [enrollmentId]);

    res.json({ success: true, message: 'Successfully unenrolled from course' });

  } catch (error) {
    console.error('Unenroll error:', error);
    res.status(500).json({ error: 'Failed to unenroll from course' });
  }
});

// ==================== TUTOR DASHBOARD ROUTES ====================
app.get('/api/tutor/courses', requireTutor, async (req, res) => {
  try {
    const courses = await db.query(`
      SELECT c.*,
             (SELECT COUNT(*) FROM enrollments WHERE course_id = c.id) as enrollments_count,
             (SELECT COUNT(*) FROM lessons WHERE course_id = c.id) as lessons_count
      FROM courses c
      WHERE c.tutor_id = ?
      ORDER BY c.created_at DESC
    `, [req.user.userId]);

    res.json({ success: true, data: courses });

  } catch (error) {
    console.error('Get tutor courses error:', error);
    res.status(500).json({ error: 'Failed to load tutor courses' });
  }
});

app.post('/api/tutor/courses', requireTutor, async (req, res) => {
  try {
    const { title, description, category, level, isPublished } = req.body;

    if (!title || !description || !category) {
      return res.status(400).json({ error: 'Title, description, and category are required' });
    }

    const courseId = await db.insert('courses', {
      title,
      description,
      category,
      level: level || 'beginner',
      is_published: isPublished || false,
      tutor_id: req.user.userId,
      created_at: new Date()
    });

    const course = await db.getOne('SELECT * FROM courses WHERE id = ?', [courseId]);

    res.status(201).json({
      success: true,
      data: course,
      message: 'Course created successfully'
    });

  } catch (error) {
    console.error('Create course error:', error);
    res.status(500).json({ error: 'Failed to create course' });
  }
});

app.put('/api/tutor/courses/:id', requireTutor, async (req, res) => {
  try {
    const courseId = parseInt(req.params.id);
    
    if (isNaN(courseId)) {
      return res.status(400).json({ error: 'Invalid course ID' });
    }
    
    const { title, description, category, level, isPublished } = req.body;

    const existingCourse = await db.getOne(`
      SELECT id FROM courses WHERE id = ? AND tutor_id = ?
    `, [courseId, req.user.userId]);

    if (!existingCourse) {
      return res.status(404).json({ error: 'Course not found or access denied' });
    }

    const updateData = { updated_at: new Date() };
    if (title) updateData.title = title;
    if (description) updateData.description = description;
    if (category) updateData.category = category;
    if (level) updateData.level = level;
    if (isPublished !== undefined) updateData.is_published = isPublished;

    await db.update('courses', courseId, updateData);

    const course = await db.getOne('SELECT * FROM courses WHERE id = ?', [courseId]);

    res.json({ success: true, data: course, message: 'Course updated successfully' });

  } catch (error) {
    console.error('Update course error:', error);
    res.status(500).json({ error: 'Failed to update course' });
  }
});

app.get('/api/tutor/courses/:courseId/lessons', requireTutor, async (req, res) => {
  try {
    const courseId = parseInt(req.params.courseId);
    
    if (isNaN(courseId)) {
      return res.status(400).json({ error: 'Invalid course ID' });
    }

    const course = await db.getOne(`
      SELECT id FROM courses WHERE id = ? AND tutor_id = ?
    `, [courseId, req.user.userId]);

    if (!course) {
      return res.status(404).json({ error: 'Course not found or access denied' });
    }

    const lessons = await db.query(`
      SELECT * FROM lessons WHERE course_id = ? ORDER BY order_index ASC
    `, [courseId]);

    res.json({ success: true, data: lessons });

  } catch (error) {
    console.error('Get lessons error:', error);
    res.status(500).json({ error: 'Failed to load lessons' });
  }
});

app.get('/api/tutor/transactions', requireTutor, async (req, res) => {
  try {
    const tutorCourses = await db.query(`
      SELECT id FROM courses WHERE tutor_id = ?
    `, [req.user.userId]);
    
    const courseIds = tutorCourses.map(c => c.id);
    
    if (courseIds.length === 0) {
      return res.json({ success: true, data: [] });
    }
    
    const placeholders = courseIds.map(() => '?').join(', ');
    const transactions = await db.query(`
      SELECT i.*, u.full_name, u.username, u.email, c.title as course_title, c.category
      FROM invoices i
      JOIN users u ON i.student_id = u.id
      JOIN courses c ON i.course_id = c.id
      WHERE i.status = 'paid' AND i.course_id IN (${placeholders})
      ORDER BY i.paid_at DESC
    `, courseIds);
    
    res.json({ success: true, data: transactions });
  } catch (error) {
    console.error('Get tutor transactions error:', error);
    res.status(500).json({ error: 'Failed to get transactions' });
  }
});

// ==================== ADMIN DASHBOARD ROUTES ====================
app.get('/api/admin/dashboard/stats', requireAdmin, async (req, res) => {
  try {
    const [totalUsers, totalCourses, totalEnrollments] = await Promise.all([
      db.query('SELECT COUNT(*) as count FROM users'),
      db.query('SELECT COUNT(*) as count FROM courses'),
      db.query('SELECT COUNT(*) as count FROM enrollments')
    ]);

    const recentUsers = await db.query(`
      SELECT id, full_name, email, created_at FROM users ORDER BY created_at DESC LIMIT 5
    `);

    const recentCourses = await db.query(`
      SELECT c.id, c.title, u.full_name as tutor_name, c.created_at 
      FROM courses c
      JOIN users u ON c.tutor_id = u.id
      ORDER BY c.created_at DESC LIMIT 5
    `);

    const recentActivity = [
      ...recentUsers.map(user => ({
        description: `New user registered: ${user.full_name || user.email}`,
        timestamp: user.created_at
      })),
      ...recentCourses.map(course => ({
        description: `New course created: ${course.title} by ${course.tutor_name}`,
        timestamp: course.created_at
      }))
    ].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, 10);

    res.json({
      success: true,
      stats: {
        totalUsers: totalUsers[0]?.count || 0,
        totalCourses: totalCourses[0]?.count || 0,
        totalEnrollments: totalEnrollments[0]?.count || 0,
        revenue: (totalEnrollments[0]?.count || 0) * 49.99
      },
      recentActivity
    });

  } catch (error) {
    console.error('Dashboard stats error:', error);
    res.status(500).json({ error: 'Failed to load dashboard data' });
  }
});

app.get('/api/admin/courses', requireAdmin, async (req, res) => {
  try {
    const courses = await db.query(`
      SELECT c.*, u.full_name as tutor_name, u.email as tutor_email, cp.*
      FROM courses c
      JOIN users u ON c.tutor_id = u.id
      LEFT JOIN course_pricing cp ON c.id = cp.course_id
      ORDER BY c.created_at DESC
    `);
    
    res.json({ success: true, data: courses });
  } catch (error) {
    console.error('Get courses error:', error);
    res.status(500).json({ error: 'Failed to fetch courses' });
  }
});

app.post('/api/admin/courses', requireAdmin, async (req, res) => {
  try {
    const { title, description, category, level, thumbnailUrl, isPublished, pricing } = req.body;
    
    if (!title || !description) {
      return res.status(400).json({ error: 'Title and description are required' });
    }

    const adminUser = await db.getOne(`
      SELECT id FROM users WHERE role_id = (SELECT id FROM roles WHERE name = 'admin')
    `);

    const courseId = await db.insert('courses', {
      title,
      description,
      category: category || 'General',
      level: level || 'Beginner',
      thumbnail_url: thumbnailUrl || '',
      is_published: isPublished || false,
      tutor_id: adminUser?.id,
      created_at: new Date()
    });

    if (pricing && (pricing.initialPayment > 0 || pricing.monthlyAmount > 0)) {
      await db.insert('course_pricing', {
        course_id: courseId,
        initial_payment: pricing.initialPayment,
        monthly_amount: pricing.monthlyAmount,
        billing_duration: pricing.billingDuration || 1,
        is_active: true
      });
    }

    const course = await db.getOne('SELECT * FROM courses WHERE id = ?', [courseId]);
    res.status(201).json({ success: true, data: course });

  } catch (error) {
    console.error('Create course error:', error);
    res.status(500).json({ error: 'Failed to create course' });
  }
});

app.put('/api/admin/courses/:id', requireAdmin, async (req, res) => {
  try {
    const courseId = parseInt(req.params.id);
    const { title, description, category, level, thumbnailUrl, isPublished, pricing } = req.body;
    
    const existingCourse = await db.getOne('SELECT id FROM courses WHERE id = ?', [courseId]);
    if (!existingCourse) {
      return res.status(404).json({ error: 'Course not found' });
    }

    const updateData = { updated_at: new Date() };
    if (title) updateData.title = title;
    if (description) updateData.description = description;
    if (category) updateData.category = category;
    if (level) updateData.level = level;
    if (thumbnailUrl !== undefined) updateData.thumbnail_url = thumbnailUrl;
    if (isPublished !== undefined) updateData.is_published = isPublished;

    await db.update('courses', courseId, updateData);

    if (pricing) {
      const existingPricing = await db.getOne('SELECT id FROM course_pricing WHERE course_id = ?', [courseId]);
      if (existingPricing) {
        await db.update('course_pricing', existingPricing.id, {
          initial_payment: pricing.initialPayment || 0,
          monthly_amount: pricing.monthlyAmount || 0,
          billing_duration: pricing.billingDuration || 1,
          is_active: pricing.isActive !== undefined ? pricing.isActive : true
        });
      } else if (pricing.initialPayment > 0 || pricing.monthlyAmount > 0) {
        await db.insert('course_pricing', {
          course_id: courseId,
          initial_payment: pricing.initialPayment || 0,
          monthly_amount: pricing.monthlyAmount || 0,
          billing_duration: pricing.billingDuration || 1,
          is_active: pricing.isActive !== undefined ? pricing.isActive : true
        });
      }
    }

    const course = await db.getOne('SELECT * FROM courses WHERE id = ?', [courseId]);
    res.json({ success: true, data: course });

  } catch (error) {
    console.error('Update course error:', error);
    res.status(500).json({ error: 'Failed to update course' });
  }
});

app.delete('/api/admin/courses/:id', requireAdmin, async (req, res) => {
  try {
    const courseId = parseInt(req.params.id);
    
    const course = await db.getOne('SELECT id FROM courses WHERE id = ?', [courseId]);
    if (!course) {
      return res.status(404).json({ error: 'Course not found' });
    }

    await db.query('DELETE FROM courses WHERE id = ?', [courseId]);
    res.json({ success: true, message: 'Course deleted successfully' });

  } catch (error) {
    console.error('Delete course error:', error);
    res.status(500).json({ error: 'Failed to delete course' });
  }
});

app.get('/api/admin/enrollments', requireAdmin, async (req, res) => {
  try {
    const enrollments = await db.query(`
      SELECT e.*, u.full_name, u.email, c.title as course_title, t.full_name as tutor_name
      FROM enrollments e
      JOIN users u ON e.student_id = u.id
      JOIN courses c ON e.course_id = c.id
      JOIN users t ON c.tutor_id = t.id
      ORDER BY e.enrolled_at DESC
    `);
    
    res.json({ success: true, data: enrollments });
  } catch (error) {
    console.error('Get enrollments error:', error);
    res.status(500).json({ error: 'Failed to fetch enrollments' });
  }
});

app.post('/api/admin/enrollments', requireAdmin, async (req, res) => {
  try {
    const { studentId, courseId } = req.body;
    
    if (!studentId || !courseId) {
      return res.status(400).json({ error: 'Student ID and Course ID are required' });
    }
    
    const student = await db.getOne(`
      SELECT id FROM users WHERE id = ? AND role_id = (SELECT id FROM roles WHERE name = 'student')
    `, [studentId]);
    
    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }
    
    const course = await db.getOne('SELECT id FROM courses WHERE id = ?', [courseId]);
    if (!course) {
      return res.status(404).json({ error: 'Course not found' });
    }
    
    const existingEnrollment = await db.getOne(`
      SELECT id FROM enrollments WHERE student_id = ? AND course_id = ?
    `, [studentId, courseId]);
    
    if (existingEnrollment) {
      return res.status(409).json({ error: 'Student is already enrolled in this course' });
    }
    
    const enrollmentId = await db.insert('enrollments', {
      student_id: studentId,
      course_id: courseId,
      enrolled_at: new Date()
    });
    
    const enrollment = await db.getOne('SELECT * FROM enrollments WHERE id = ?', [enrollmentId]);
    
    res.status(201).json({ success: true, data: enrollment, message: 'Student enrolled successfully' });

  } catch (error) {
    console.error('Enroll student error:', error);
    res.status(500).json({ error: 'Failed to enroll student' });
  }
});

app.get('/api/admin/students', requireAdmin, async (req, res) => {
  try {
    const students = await db.query(`
      SELECT id, full_name, email, username 
      FROM users 
      WHERE role_id = (SELECT id FROM roles WHERE name = 'student') AND is_active = 1
      ORDER BY full_name ASC
    `);
    
    res.json({ success: true, data: students });
  } catch (error) {
    console.error('Get students error:', error);
    res.status(500).json({ error: 'Failed to fetch students' });
  }
});

app.get('/api/admin/courses-list', requireAdmin, async (req, res) => {
  try {
    const courses = await db.query(`
      SELECT c.id, c.title, c.category, u.full_name as tutor_name
      FROM courses c
      JOIN users u ON c.tutor_id = u.id
      ORDER BY c.title ASC
    `);
    
    res.json({ success: true, data: courses });
  } catch (error) {
    console.error('Get courses error:', error);
    res.status(500).json({ error: 'Failed to fetch courses' });
  }
});

app.get('/api/admin/users', requireAdmin, async (req, res) => {
  try {
    const users = await db.query(`
      SELECT u.*, r.name as role_name,
             (SELECT COUNT(*) FROM courses WHERE tutor_id = u.id) as courses_count,
             (SELECT COUNT(*) FROM enrollments WHERE student_id = u.id) as enrollments_count
      FROM users u
      LEFT JOIN roles r ON u.role_id = r.id
      ORDER BY u.created_at DESC
    `);
    
    res.json({ success: true, data: users, total: users.length });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

app.post('/api/admin/users', requireAdmin, async (req, res) => {
  try {
    const { username, email, fullName, role } = req.body;

    if (!username || !email || !fullName || !role) {
      return res.status(400).json({ error: 'Username, email, full name, and role are required' });
    }

    const existingUser = await db.getOne(`
      SELECT id FROM users WHERE email = ? OR username = ?
    `, [email.toLowerCase(), username]);

    if (existingUser) {
      return res.status(409).json({ error: 'User already exists' });
    }

    let roleRow = await db.getOne('SELECT id FROM roles WHERE name = ?', [role]);
    if (!roleRow) {
      roleRow = await db.insert('roles', { name: role });
    }

    const generatedPassword = generateRandomPassword();
    const hashedPassword = await bcrypt.hash(generatedPassword, 12);

    const userId = await db.insert('users', {
      username,
      email: email.toLowerCase(),
      full_name: fullName.trim(),
      password_hash: hashedPassword,
      role_id: roleRow.id || roleRow,
      is_active: true,
      date_joined: new Date()
    });

    console.log('User created:', email);

    let emailResult = { success: false };
    try {
      emailResult = await sendWelcomeEmail(email, username, generatedPassword);
    } catch (emailError) {
      console.error('Failed to send welcome email:', emailError.message);
    }

    const user = await db.getOne('SELECT * FROM users WHERE id = ?', [userId]);
    const { password_hash, ...userWithoutPassword } = user;

    res.status(201).json({
      success: true,
      data: userWithoutPassword,
      emailStatus: { sent: emailResult.success || false },
      message: emailResult.success 
        ? 'User created successfully! Welcome email sent.' 
        : `User created! Credentials - Username: ${username}, Password: ${generatedPassword}`
    });

  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({ error: 'Failed to create user: ' + error.message });
  }
});

app.put('/api/admin/users/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { username, email, fullName, role, isActive } = req.body;

    const existingUser = await db.getOne('SELECT * FROM users WHERE id = ?', [parseInt(id)]);

    if (!existingUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (email && email !== existingUser.email) {
      const emailExists = await db.getOne('SELECT id FROM users WHERE email = ? AND id != ?', [email.toLowerCase(), parseInt(id)]);
      if (emailExists) {
        return res.status(409).json({ error: 'Email already exists' });
      }
    }

    if (username && username !== existingUser.username) {
      const usernameExists = await db.getOne('SELECT id FROM users WHERE username = ? AND id != ?', [username, parseInt(id)]);
      if (usernameExists) {
        return res.status(409).json({ error: 'Username already exists' });
      }
    }

    const updateData = { updated_at: new Date() };
    if (username) updateData.username = username;
    if (email) updateData.email = email.toLowerCase();
    if (fullName !== undefined) updateData.full_name = fullName;
    if (isActive !== undefined) updateData.is_active = isActive;

    if (role) {
      const roleRow = await db.getOne('SELECT id FROM roles WHERE name = ?', [role]);
      if (roleRow) {
        updateData.role_id = roleRow.id;
      }
    }

    await db.update('users', parseInt(id), updateData);

    const user = await db.getOne('SELECT * FROM users WHERE id = ?', [parseInt(id)]);
    const { password_hash, ...userWithoutPassword } = user;

    res.json({ success: true, data: userWithoutPassword });

  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// ==================== STATIC FILE ROUTES ====================
app.get('/courses.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend', 'courses.html'));
});

app.get('/login.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend', 'login.html'));
});

app.get('/register.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend', 'register.html'));
});

app.get('/about.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend', 'about.html'));
});

app.get('/contact.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend', 'contact.html'));
});

app.get('/community.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend', 'community.html'));
});

app.get('/admin.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend', 'admin.html'));
});

app.get('/student-dashboard/:page', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend', 'student-dashboard', req.params.page));
});

app.get('/tutor-dashboard/:page', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend', 'tutor-dashboard', req.params.page));
});

app.get('/admin-dashboard/:page', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend', 'admin-dashboard', req.params.page));
});

// ==================== CATCH-ALL ROUTE ====================
// For Express 5, no catch-all needed - static files are served via express.static middleware
// API will return 404 for unknown endpoints automatically

// ==================== ERROR HANDLING ====================
app.use((error, req, res, next) => {
  console.error('Global error handler:', error);
  res.status(500).json({ 
    error: 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { details: error.message })
  });
});

// ==================== SERVER STARTUP ====================
const isProduction = process.env.NODE_ENV === 'production';

// Passenger-compatible startup or standalone server
if (PORT) {
  app.listen(PORT, async () => {
    console.log(`🚀 Nuru Foundation Server running on port ${PORT}`);
    console.log(`📚 API available at /api`);
    console.log(`🌍 Frontend available at /`);
    console.log(`📧 Email service: ${process.env.EMAIL_USER ? 'Configured' : 'Not configured'}`);
    console.log(`🔐 JWT Authentication: ${process.env.JWT_SECRET ? 'Enabled' : 'Using fallback secret'}`);
    console.log(`🔧 Environment: ${isProduction ? 'PRODUCTION' : 'DEVELOPMENT'}`);
    
    if (isProduction) {
      console.log(`🌐 Domain: ${process.env.FRONTEND_URL || 'Not configured'}`);
    }
  });
} else {
  module.exports = app;
  console.log('📦 App exported for Passenger (cPanel)');
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down server...');
  await db.close();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('Shutting down server...');
  await db.close();
  process.exit(0);
});