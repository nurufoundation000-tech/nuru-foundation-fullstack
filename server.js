const express = require('express');
const cors = require('cors');
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const { sendWelcomeEmail } = require('./api/lib/email');
const { initiateSTKPush, queryTransactionStatus, parseCallbackPayload, isMpesaConfigured, simulatePayment, formatPhoneNumber } = require('./api/lib/mpesa');

const app = express();
const prisma = new PrismaClient();
const PORT = process.env.PORT || 3000;

require('dotenv').config();

// ==================== HELPER FUNCTIONS ====================

// Load global billing settings
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

// Generate initial invoice for student on first login
async function generateInitialInvoices(studentId) {
  const settings = await getGlobalSettings();
  const enrollments = await prisma.enrollment.findMany({
    where: { studentId },
    include: {
      course: {
        include: { coursePricing: true }
      }
    }
  });

  for (const enrollment of enrollments) {
    const pricing = enrollment.course.coursePricing;
    if (!pricing || !pricing.isActive) continue;

    // Check if initial invoice already exists
    const existingInitial = await prisma.invoice.findFirst({
      where: {
        studentId,
        courseId: enrollment.courseId,
        type: 'initial'
      }
    });

    if (!existingInitial) {
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 7); // Due in 7 days
      
      const gracePeriodEnd = new Date(dueDate);
      gracePeriodEnd.setDate(gracePeriodEnd.getDate() + settings.gracePeriodDays);

      await prisma.invoice.create({
        data: {
          studentId,
          courseId: enrollment.courseId,
          type: 'initial',
          amount: pricing.initialPayment,
          status: 'pending',
          dueDate,
          gracePeriodEnd
        }
      });
      console.log(`Created initial invoice for student ${studentId}, course ${enrollment.courseId}`);
    }
  }
}

// Check and update invoice statuses - mark overdue and lock accounts
async function checkAndUpdateInvoiceStatuses() {
  const settings = await getGlobalSettings();
  const now = new Date();

  // Find all pending invoices where grace period has ended
  const overdueInvoices = await prisma.invoice.findMany({
    where: {
      status: 'pending',
      gracePeriodEnd: { lt: now }
    }
  });

  for (const invoice of overdueInvoices) {
    await prisma.invoice.update({
      where: { id: invoice.id },
      data: {
        status: 'locked',
        lockedAt: now
      }
    });

    // Optionally: deactivate the user
    // await prisma.user.update({
    //   where: { id: invoice.studentId },
    //   data: { isActive: false }
    // });
    console.log(`Invoice ${invoice.id} marked as locked, student ${invoice.studentId} locked out`);
  }
}

// Generate monthly invoices
async function generateMonthlyInvoices() {
  const settings = await getGlobalSettings();
  const billingDay = settings.billingDay;
  const today = new Date();
  
  // Get all active enrollments
  const enrollments = await prisma.enrollment.findMany({
    include: {
      course: {
        include: { coursePricing: true }
      }
    }
  });

  for (const enrollment of enrollments) {
    const pricing = enrollment.course.coursePricing;
    if (!pricing || !pricing.isActive || !pricing.monthlyAmount || pricing.monthlyAmount <= 0) {
      continue;
    }

    const billingDuration = pricing.billingDuration || 1;
    
    // Count how many monthly invoices already exist for this enrollment
    const existingMonthlyInvoices = await prisma.invoice.findMany({
      where: {
        studentId: enrollment.studentId,
        courseId: enrollment.courseId,
        type: 'monthly'
      },
      orderBy: { createdAt: 'asc' }
    });

    // Only create new invoices if we haven't reached billingDuration
    if (existingMonthlyInvoices.length >= billingDuration) {
      console.log(`Student ${enrollment.studentId}, course ${enrollment.courseId}: already has ${billingDuration} monthly invoices`);
      continue;
    }

    // Check if already billed this month
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const alreadyBilledThisMonth = existingMonthlyInvoices.find(inv => new Date(inv.createdAt) >= startOfMonth);
    
    if (alreadyBilledThisMonth) {
      continue;
    }

    // Calculate due date (billing day of current or next month)
    let dueDate = new Date(today.getFullYear(), today.getMonth(), billingDay);
    if (today.getDate() > billingDay) {
      // Move to next month
      dueDate = new Date(today.getFullYear(), today.getMonth() + 1, billingDay);
    }

    const gracePeriodEnd = new Date(dueDate);
    gracePeriodEnd.setDate(gracePeriodEnd.getDate() + settings.gracePeriodDays);

    const monthNumber = existingMonthlyInvoices.length + 1;
    await prisma.invoice.create({
      data: {
        studentId: enrollment.studentId,
        courseId: enrollment.courseId,
        type: 'monthly',
        monthNumber,
        amount: pricing.monthlyAmount,
        status: 'pending',
        dueDate,
        gracePeriodEnd,
        lastBilledAt: today
      }
    });
    console.log(`Created monthly invoice #${monthNumber} for student ${enrollment.studentId}, course ${enrollment.courseId}`);
  }
}

// Check if student has any locked invoices (account locked)
async function isStudentLocked(studentId) {
  const lockedInvoice = await prisma.invoice.findFirst({
    where: {
      studentId,
      status: 'locked'
    }
  });
  return !!lockedInvoice;
}

// ==================== MIDDLEWARE SETUP ====================
app.use(cors());
app.use(express.json());
app.use(express.static('frontend'));
app.use(express.static('.'));

// ==================== AUTHENTICATION MIDDLEWARE ====================
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const token = authHeader.slice(7);
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret');
    
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      include: { role: true }
    });

    if (!user || !user.isActive) {
      return res.status(403).json({ error: 'User not found or inactive' });
    }

    // Check if student has locked invoices
    if (user.role?.name === 'student') {
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
      roleId: user.roleId,
      roleName: user.role?.name,
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

// Role-based middleware
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

// Shorthand middleware combinations
const requireStudent = [authenticateToken, requireRole(['student'])];
const requireTutor = [authenticateToken, requireRole(['tutor'])];
const requireAdmin = [authenticateToken, requireRole(['admin'])];

// ==================== HEALTH CHECK ====================
app.get('/api/health', async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
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
    
    console.log('🔐 Login attempt:', email);

    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      include: { role: true }
    });

    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    if (!user.isActive) {
      return res.status(401).json({ error: 'Account is deactivated' });
    }

    const validPassword = await bcrypt.compare(password, user.passwordHash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const { passwordHash, ...userWithoutPassword } = user;
    
    // Generate JWT token
    const token = jwt.sign(
      { 
        userId: user.id,
        email: user.email,
        role: user.role?.name || 'user'
      },
      process.env.JWT_SECRET || 'fallback-secret',
      { expiresIn: '24h' }
    );

    // If student, generate initial invoices if not already created
    if (user.role?.name === 'student') {
      await generateInitialInvoices(user.id);
      await checkAndUpdateInvoiceStatuses();
      
      // Check if student is locked
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

// Function to generate a random password
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

    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [
          { email: email.toLowerCase() },
          { username: username }
        ]
      }
    });

    if (existingUser) {
      return res.status(409).json({
        error: existingUser.email === email.toLowerCase()
          ? 'User already exists with this email'
          : 'Username is already taken'
      });
    }

    // Generate a random password
    const generatedPassword = generateRandomPassword();
    const hashedPassword = await bcrypt.hash(generatedPassword, 12);

    const user = await prisma.user.create({
      data: {
        email: email.toLowerCase(),
        passwordHash: hashedPassword,
        username,
        fullName: fullName.trim(),
        roleId: roleId || null,
        isActive: true
      },
      include: {
        role: true
      }
    });

    // Send welcome email with login credentials
    try {
      await sendWelcomeEmail(email, username, generatedPassword);
      console.log('Welcome email sent to:', email);
    } catch (emailError) {
      console.error('Failed to send welcome email:', emailError);
      // Don't fail registration if email fails, but log it
    }

    const { passwordHash, ...userWithoutPassword } = user;
    
    // Generate JWT token for registration
    const token = jwt.sign(
      { 
        userId: user.id,
        email: user.email,
        role: user.role?.name || 'user'
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

// ==================== USER MANAGEMENT ROUTES ====================
app.get('/api/users/me', authenticateToken, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      include: { role: true }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const { passwordHash, ...userWithoutPassword } = user;
    res.json({ success: true, user: userWithoutPassword });

  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Failed to get user data' });
  }
});

// Update user profile
app.put('/api/users/profile', authenticateToken, async (req, res) => {
  try {
    const { fullName, username, email } = req.body;
    
    const existingUser = await prisma.user.findUnique({
      where: { id: req.user.userId }
    });

    if (!existingUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if email is already taken by another user
    if (email && email !== existingUser.email) {
      const emailExists = await prisma.user.findFirst({
        where: {
          email: email.toLowerCase(),
          NOT: { id: req.user.userId }
        }
      });
      if (emailExists) {
        return res.status(409).json({ error: 'Email already exists' });
      }
    }

    // Check if username is already taken by another user
    if (username && username !== existingUser.username) {
      const usernameExists = await prisma.user.findFirst({
        where: {
          username: username,
          NOT: { id: req.user.userId }
        }
      });
      if (usernameExists) {
        return res.status(409).json({ error: 'Username already exists' });
      }
    }

    const updatedUser = await prisma.user.update({
      where: { id: req.user.userId },
      data: {
        fullName: fullName || existingUser.fullName,
        username: username || existingUser.username,
        email: email ? email.toLowerCase() : existingUser.email
      },
      include: { role: true }
    });

    const { passwordHash, ...userWithoutPassword } = updatedUser;

    res.json({
      success: true,
      user: userWithoutPassword,
      message: 'Profile updated successfully'
    });

  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// Change password
app.put('/api/users/change-password', authenticateToken, async (req, res) => {
  try {
    console.log('🔐 Change password request received');
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ 
        success: false,
        error: 'Current password and new password are required' 
      });
    }

    // Change from 6 to 8 to match frontend
    if (newPassword.length < 8) {
      return res.status(400).json({ 
        success: false,
        error: 'New password must be at least 8 characters long' 
      });
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.userId }
    });

    if (!user) {
      return res.status(404).json({ 
        success: false,
        error: 'User not found' 
      });
    }

    const validPassword = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!validPassword) {
      return res.status(401).json({ 
        success: false,
        error: 'Current password is incorrect' 
      });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 12);

    await prisma.user.update({
      where: { id: req.user.userId },
      data: { passwordHash: hashedPassword }
    });

    console.log('✅ Password changed successfully for user:', req.user.userId);
    
    res.json({
      success: true,
      message: 'Password changed successfully'
    });

  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to change password' 
    });
  }
});

// Set password (for first login - no old password required)
app.put('/api/users/set-password', authenticateToken, async (req, res) => {
  try {
    console.log('🔐 Set password request received (first login)');
    const { newPassword } = req.body;

    if (!newPassword) {
      return res.status(400).json({ 
        success: false,
        error: 'New password is required' 
      });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ 
        success: false,
        error: 'Password must be at least 8 characters long' 
      });
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.userId }
    });

    if (!user) {
      return res.status(404).json({ 
        success: false,
        error: 'User not found' 
      });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 12);

    await prisma.user.update({
      where: { id: req.user.userId },
      data: { 
        passwordHash: hashedPassword,
        mustChangePassword: false
      }
    });

    console.log('✅ Password set successfully for user:', req.user.userId);
    
    res.json({
      success: true,
      message: 'Password set successfully'
    });

  } catch (error) {
    console.error('Set password error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to set password' 
    });
  }
});

// Skip password change (first login)
app.put('/api/users/skip-password-change', authenticateToken, async (req, res) => {
  try {
    console.log('⏭️ Skip password change request received');
    
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId }
    });

    if (!user) {
      return res.status(404).json({ 
        success: false,
        error: 'User not found' 
      });
    }

    await prisma.user.update({
      where: { id: req.user.userId },
      data: { mustChangePassword: false }
    });

    console.log('✅ Password change skipped for user:', req.user.userId);
    
    res.json({
      success: true,
      message: 'Password change skipped'
    });

  } catch (error) {
    console.error('Skip password change error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to skip password change' 
    });
  }
});

// ==================== COURSE ROUTES ====================
// Get all courses (public)
app.get('/api/courses', async (req, res) => {
  try {
    const courses = await prisma.course.findMany({
      include: {
        tutor: {
          select: {
            id: true,
            fullName: true,
            username: true
          }
        },
        _count: {
          select: {
            lessons: true,
            enrollments: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json({
      success: true,
      data: courses
    });

  } catch (error) {
    console.error('Get courses error:', error);
    res.status(500).json({ error: 'Failed to load courses' });
  }
});

// Get single course
app.get('/api/courses/:id', async (req, res) => {
  try {
    const courseId = parseInt(req.params.id);
    
    if (isNaN(courseId)) {
      return res.status(400).json({ error: 'Invalid course ID' });
    }
    
    const course = await prisma.course.findUnique({
      where: { id: courseId },
      include: {
        tutor: {
          select: {
            id: true,
            fullName: true,
            username: true,
            bio: true
          }
        },
        lessons: {
          orderBy: { orderIndex: 'asc' },
          select: {
            id: true,
            title: true,
            description: true,
            orderIndex: true,
            duration: true
          }
        },
        _count: {
          select: {
            lessons: true,
            enrollments: true
          }
        }
      }
    });

    if (!course) {
      return res.status(404).json({ error: 'Course not found' });
    }

    res.json({
      success: true,
      data: course
    });

  } catch (error) {
    console.error('Get course error:', error);
    res.status(500).json({ error: 'Failed to load course' });
  }
});

// Enroll in course
app.post('/api/courses/:id/enroll', authenticateToken, async (req, res) => {
  try {
    const courseId = parseInt(req.params.id);
    
    if (isNaN(courseId)) {
      return res.status(400).json({ error: 'Invalid course ID' });
    }
    
    // Check if course exists
    const course = await prisma.course.findUnique({
      where: { id: courseId }
    });

    if (!course) {
      return res.status(404).json({ error: 'Course not found' });
    }

    // Check if already enrolled
    const existingEnrollment = await prisma.enrollment.findFirst({
      where: {
        studentId: req.user.userId,
        courseId: courseId
      }
    });

    if (existingEnrollment) {
      return res.status(409).json({ error: 'Already enrolled in this course' });
    }

    // Create enrollment
    const enrollment = await prisma.enrollment.create({
      data: {
        studentId: req.user.userId,
        courseId: courseId,
        enrolledAt: new Date()
      },
      include: {
        course: {
          include: {
            tutor: {
              select: {
                id: true,
                fullName: true,
                username: true
              }
            }
          }
        }
      }
    });

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
// Get student's enrolled courses
app.get('/api/student/courses', authenticateToken, async (req, res) => {
  try {
    const enrollments = await prisma.enrollment.findMany({
      where: {
        studentId: req.user.userId
      },
      include: {
        course: {
          include: {
            tutor: {
              select: {
                id: true,
                fullName: true,
                username: true
              }
            },
            lessons: {
              select: {
                id: true,
                title: true,
                orderIndex: true
              }
            }
          }
        },
        lessonProgress: {
          where: { isCompleted: true },
          select: {
            lessonId: true
          }
        }
      },
      orderBy: { enrolledAt: 'desc' }
    });

    const progressData = enrollments.map(enrollment => {
      const totalLessons = enrollment.course.lessons.length;
      const completedLessons = enrollment.lessonProgress.length;
      const progress = totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0;

      return {
        id: enrollment.id,
        enrolledAt: enrollment.enrolledAt,
        progress: progress,
        completedLessons: completedLessons,
        totalLessons: totalLessons,
        course: {
          id: enrollment.course.id,
          title: enrollment.course.title,
          description: enrollment.course.description,
          category: enrollment.course.category,
          tutor: enrollment.course.tutor
        }
      };
    });

    res.json({
      success: true,
      data: progressData
    });

  } catch (error) {
    console.error('Get student courses error:', error);
    res.status(500).json({ error: 'Failed to load student courses' });
  }
});

// Get student's enrolled courses with progress
app.get('/api/student/courses/progress', authenticateToken, async (req, res) => {
  try {
    const enrollments = await prisma.enrollment.findMany({
      where: {
        studentId: req.user.userId
      },
      include: {
        course: {
          include: {
            tutor: {
              select: {
                id: true,
                fullName: true,
                username: true
              }
            },
            lessons: {
              select: {
                id: true,
                title: true,
                orderIndex: true
              }
            }
          }
        },
        lessonProgress: {
          where: { isCompleted: true },
          select: {
            lessonId: true
          }
        }
      },
      orderBy: { enrolledAt: 'desc' }
    });

    const progressData = enrollments.map(enrollment => {
      const totalLessons = enrollment.course.lessons.length;
      const completedLessons = enrollment.lessonProgress.length;
      const progress = totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0;

      return {
        id: enrollment.id,
        enrolledAt: enrollment.enrolledAt,
        progress: progress,
        completedLessons: completedLessons,
        totalLessons: totalLessons,
        course: {
          id: enrollment.course.id,
          title: enrollment.course.title,
          description: enrollment.course.description,
          category: enrollment.course.category,
          tutor: enrollment.course.tutor
        }
      };
    });

    res.json({
      success: true,
      data: progressData
    });

  } catch (error) {
    console.error('Get student courses progress error:', error);
    res.status(500).json({ error: 'Failed to load student courses progress' });
  }
});

// Get course progress (legacy endpoint)
app.get('/api/courses/progress', authenticateToken, async (req, res) => {
  try {
    const enrollments = await prisma.enrollment.findMany({
      where: {
        studentId: req.user.userId
      },
      include: {
        course: {
          include: {
            tutor: {
              select: {
                id: true,
                fullName: true,
                username: true
              }
            },
            lessons: {
              select: {
                id: true,
                title: true,
                orderIndex: true
              }
            }
          }
        },
        lessonProgress: {
          where: { isCompleted: true },
          select: {
            lessonId: true
          }
        }
      }
    });

    const progressData = enrollments.map(enrollment => {
      const totalLessons = enrollment.course.lessons.length;
      const completedLessons = enrollment.lessonProgress.length;
      const progress = totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0;

      return {
        id: enrollment.id,
        enrolledAt: enrollment.enrolledAt,
        progress: progress,
        completedLessons: completedLessons,
        totalLessons: totalLessons,
        course: {
          id: enrollment.course.id,
          title: enrollment.course.title,
          description: enrollment.course.description,
          category: enrollment.course.category,
          tutor: enrollment.course.tutor
        }
      };
    });

    res.json({
      success: true,
      data: progressData
    });

  } catch (error) {
    console.error('Get progress error:', error);
    res.status(500).json({ error: 'Failed to load progress data' });
  }
});

// Mark lesson as completed
app.post('/api/lessons/:lessonId/complete', authenticateToken, async (req, res) => {
  try {
    const lessonId = parseInt(req.params.lessonId);
    
    if (isNaN(lessonId)) {
      return res.status(400).json({ error: 'Invalid lesson ID' });
    }
    
    // Get the lesson
    const lesson = await prisma.lesson.findUnique({
      where: { id: lessonId },
      include: {
        course: {
          include: {
            enrollments: {
              where: {
                studentId: req.user.userId
              }
            }
          }
        }
      }
    });

    if (!lesson) {
      return res.status(404).json({ error: 'Lesson not found' });
    }

    // Check if user is enrolled in the course
    const enrollment = lesson.course.enrollments[0];
    if (!enrollment) {
      return res.status(403).json({ error: 'You are not enrolled in this course' });
    }

    // Check if already completed
    const alreadyCompleted = await prisma.completedLesson.findFirst({
      where: {
        enrollmentId: enrollment.id,
        lessonId: lessonId
      }
    });

    if (alreadyCompleted) {
      return res.status(409).json({ error: 'Lesson already completed' });
    }

    // Mark as completed
    await prisma.completedLesson.create({
      data: {
        enrollmentId: enrollment.id,
        lessonId: lessonId,
        completedAt: new Date()
      }
    });

    res.json({
      success: true,
      message: 'Lesson marked as completed'
    });

  } catch (error) {
    console.error('Complete lesson error:', error);
    res.status(500).json({ error: 'Failed to mark lesson as completed' });
  }
});

// Unenroll from course
app.delete('/api/student/courses/:enrollmentId/unenroll', authenticateToken, async (req, res) => {
  try {
    const enrollmentId = parseInt(req.params.enrollmentId);
    
    if (isNaN(enrollmentId)) {
      return res.status(400).json({ error: 'Invalid enrollment ID' });
    }
    
    // Verify the enrollment belongs to the user
    const enrollment = await prisma.enrollment.findFirst({
      where: {
        id: enrollmentId,
        studentId: req.user.userId
      }
    });

    if (!enrollment) {
      return res.status(404).json({ error: 'Enrollment not found' });
    }

    // Delete the enrollment and associated completed lessons
    await prisma.$transaction([
      prisma.completedLesson.deleteMany({
        where: { enrollmentId: enrollmentId }
      }),
      prisma.enrollment.delete({
        where: { id: enrollmentId }
      })
    ]);

    res.json({
      success: true,
      message: 'Successfully unenrolled from course'
    });

  } catch (error) {
    console.error('Unenroll error:', error);
    res.status(500).json({ error: 'Failed to unenroll from course' });
  }
});

// ==================== TUTOR DASHBOARD ROUTES ====================
// Get tutor's courses
app.get('/api/tutor/courses', requireTutor, async (req, res) => {
  try {
    const courses = await prisma.course.findMany({
      where: {
        tutorId: req.user.userId
      },
      include: {
        _count: {
          select: {
            lessons: true,
            enrollments: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json({
      success: true,
      data: courses
    });

  } catch (error) {
    console.error('Get tutor courses error:', error);
    res.status(500).json({ error: 'Failed to load tutor courses' });
  }
});

// Create course (tutor only)
app.post('/api/tutor/courses', requireTutor, async (req, res) => {
  try {
    const { title, description, category, level, isPublished } = req.body;

    if (!title || !description || !category) {
      return res.status(400).json({ 
        error: 'Title, description, and category are required' 
      });
    }

    const course = await prisma.course.create({
      data: {
        title,
        description,
        category,
        level: level || 'beginner',
        isPublished: isPublished || false,
        tutorId: req.user.userId
      },
      include: {
        tutor: {
          select: {
            id: true,
            fullName: true,
            username: true
          }
        }
      }
    });

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

// Update course (tutor only)
app.put('/api/tutor/courses/:id', requireTutor, async (req, res) => {
  try {
    const courseId = parseInt(req.params.id);
    
    if (isNaN(courseId)) {
      return res.status(400).json({ error: 'Invalid course ID' });
    }
    
    const { title, description, category, level, isPublished } = req.body;

    // Verify the course belongs to the tutor
    const existingCourse = await prisma.course.findFirst({
      where: {
        id: courseId,
        tutorId: req.user.userId
      }
    });

    if (!existingCourse) {
      return res.status(404).json({ error: 'Course not found or access denied' });
    }

    const updatedCourse = await prisma.course.update({
      where: { id: courseId },
      data: {
        title: title || existingCourse.title,
        description: description || existingCourse.description,
        category: category || existingCourse.category,
        level: level || existingCourse.level,
        isPublished: isPublished !== undefined ? isPublished : existingCourse.isPublished
      },
      include: {
        tutor: {
          select: {
            id: true,
            fullName: true,
            username: true
          }
        },
        _count: {
          select: {
            lessons: true,
            enrollments: true
          }
        }
      }
    });

    res.json({
      success: true,
      data: updatedCourse,
      message: 'Course updated successfully'
    });

  } catch (error) {
    console.error('Update course error:', error);
    res.status(500).json({ error: 'Failed to update course' });
  }
});

// Get course lessons (tutor only)
app.get('/api/tutor/courses/:courseId/lessons', requireTutor, async (req, res) => {
  try {
    const courseId = parseInt(req.params.courseId);
    
    if (isNaN(courseId)) {
      return res.status(400).json({ error: 'Invalid course ID' });
    }

    // Verify the course belongs to the tutor
    const course = await prisma.course.findFirst({
      where: {
        id: courseId,
        tutorId: req.user.userId
      }
    });

    if (!course) {
      return res.status(404).json({ error: 'Course not found or access denied' });
    }

    const lessons = await prisma.lesson.findMany({
      where: { courseId: courseId },
      orderBy: { orderIndex: 'asc' }
    });

    res.json({
      success: true,
      data: lessons
    });

  } catch (error) {
    console.error('Get lessons error:', error);
    res.status(500).json({ error: 'Failed to load lessons' });
  }
});

// Tutor: Get transactions for students in their courses
app.get('/api/tutor/transactions', requireTutor, async (req, res) => {
  try {
    // Get tutor's courses
    const tutorCourses = await prisma.course.findMany({
      where: { tutorId: req.user.userId },
      select: { id: true }
    });
    
    const courseIds = tutorCourses.map(c => c.id);
    
    if (courseIds.length === 0) {
      return res.json({ success: true, data: [] });
    }
    
    // Get all paid invoices for students in tutor's courses
    const transactions = await prisma.invoice.findMany({
      where: {
        status: 'paid',
        courseId: { in: courseIds }
      },
      include: {
        student: { select: { id: true, fullName: true, username: true, email: true } },
        course: { select: { id: true, title: true, category: true } }
      },
      orderBy: { paidAt: 'desc' }
    });
    
    res.json({ success: true, data: transactions });
  } catch (error) {
    console.error('Get tutor transactions error:', error);
    res.status(500).json({ error: 'Failed to get transactions' });
  }
});

// ==================== ADMIN DASHBOARD ROUTES ====================
// Admin Dashboard Stats
app.get('/api/admin/dashboard/stats', requireAdmin, async (req, res) => {
  try {
    const [
      totalUsers,
      totalCourses,
      totalEnrollments,
      recentUsers,
      recentCourses
    ] = await Promise.all([
      prisma.user.count(),
      prisma.course.count(),
      prisma.enrollment.count(),
      prisma.user.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' },
        select: { id: true, fullName: true, email: true, createdAt: true }
      }),
      prisma.course.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' },
        select: { id: true, title: true, tutor: { select: { fullName: true } }, createdAt: true }
      })
    ]);

    const recentActivity = [
      ...recentUsers.map(user => ({
        description: `New user registered: ${user.fullName || user.email}`,
        timestamp: user.createdAt
      })),
      ...recentCourses.map(course => ({
        description: `New course created: ${course.title} by ${course.tutor.fullName}`,
        timestamp: course.createdAt
      }))
    ].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
     .slice(0, 10);

    res.json({
      success: true,
      stats: {
        totalUsers,
        totalCourses,
        totalEnrollments,
        revenue: totalEnrollments * 49.99
      },
      recentActivity
    });

  } catch (error) {
    console.error('Dashboard stats error:', error);
    res.status(500).json({ error: 'Failed to load dashboard data' });
  }
});

// Admin Courses
app.get('/api/admin/courses', requireAdmin, async (req, res) => {
  try {
    const courses = await prisma.course.findMany({
      include: {
        tutor: {
          select: { id: true, fullName: true, email: true }
        },
        coursePricing: true,
        _count: {
          select: {
            enrollments: true,
            lessons: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
    
    res.json({ success: true, data: courses });
  } catch (error) {
    console.error('Get courses error:', error);
    res.status(500).json({ error: 'Failed to fetch courses' });
  }
});

// Admin: Create course
app.post('/api/admin/courses', requireAdmin, async (req, res) => {
  try {
    const { title, description, category, level, thumbnailUrl, isPublished, pricing } = req.body;
    
    if (!title || !description) {
      return res.status(400).json({ error: 'Title and description are required' });
    }

    // Get the admin user to set as tutor or create without tutor
    const adminUser = await prisma.user.findFirst({
      where: { role: { name: 'admin' } }
    });

    const course = await prisma.course.create({
      data: {
        title,
        description,
        category: category || 'General',
        level: level || 'Beginner',
        thumbnailUrl: thumbnailUrl || '',
        isPublished: isPublished || false,
        tutorId: adminUser?.id
      },
      include: {
        tutor: { select: { id: true, fullName: true, email: true } }
      }
    });

    // If pricing is provided, create/update pricing
    if (pricing && (pricing.initialPayment > 0 || pricing.monthlyAmount > 0)) {
      await prisma.coursePricing.upsert({
        where: { courseId: course.id },
        update: {
          initialPayment: pricing.initialPayment,
          monthlyAmount: pricing.monthlyAmount,
          billingDuration: pricing.billingDuration || 1,
          isActive: true
        },
        create: {
          courseId: course.id,
          initialPayment: pricing.initialPayment,
          monthlyAmount: pricing.monthlyAmount,
          billingDuration: pricing.billingDuration || 1,
          isActive: true
        }
      });
    }

    res.status(201).json({ success: true, data: course });
  } catch (error) {
    console.error('Create course error:', error);
    res.status(500).json({ error: 'Failed to create course' });
  }
});

// Admin: Update course
app.put('/api/admin/courses/:id', requireAdmin, async (req, res) => {
  console.log('PUT /api/admin/courses/:id called with params:', req.params);
  console.log('PUT /api/admin/courses/:id body:', req.body);
  try {
    const courseId = parseInt(req.params.id);
    const { title, description, category, level, thumbnailUrl, isPublished, pricing } = req.body;
    
    const existingCourse = await prisma.course.findUnique({ where: { id: courseId } });
    if (!existingCourse) {
      return res.status(404).json({ error: 'Course not found' });
    }

    const course = await prisma.course.update({
      where: { id: courseId },
      data: {
        title: title || existingCourse.title,
        description: description || existingCourse.description,
        category: category || existingCourse.category,
        level: level || existingCourse.level,
        thumbnailUrl: thumbnailUrl !== undefined ? thumbnailUrl : existingCourse.thumbnailUrl,
        isPublished: isPublished !== undefined ? isPublished : existingCourse.isPublished
      },
      include: {
        tutor: { select: { id: true, fullName: true, email: true } }
      }
    });

    // If pricing is provided, create/update pricing
    if (pricing) {
      await prisma.coursePricing.upsert({
        where: { courseId: course.id },
        update: {
          initialPayment: pricing.initialPayment || 0,
          monthlyAmount: pricing.monthlyAmount || 0,
          billingDuration: pricing.billingDuration || 1,
          isActive: pricing.isActive !== undefined ? pricing.isActive : true
        },
        create: {
          courseId: course.id,
          initialPayment: pricing.initialPayment || 0,
          monthlyAmount: pricing.monthlyAmount || 0,
          billingDuration: pricing.billingDuration || 1,
          isActive: pricing.isActive !== undefined ? pricing.isActive : true
        }
      });
    }

    res.json({ success: true, data: course });
  } catch (error) {
    console.error('Update course error:', error);
    res.status(500).json({ error: 'Failed to update course' });
  }
});

// Admin: Delete course
app.delete('/api/admin/courses/:id', requireAdmin, async (req, res) => {
  try {
    const courseId = parseInt(req.params.id);
    
    const existingCourse = await prisma.course.findUnique({ where: { id: courseId } });
    if (!existingCourse) {
      return res.status(404).json({ error: 'Course not found' });
    }

    await prisma.course.delete({ where: { id: courseId } });
    
    res.json({ success: true, message: 'Course deleted successfully' });
  } catch (error) {
    console.error('Delete course error:', error);
    res.status(500).json({ error: 'Failed to delete course' });
  }
});

// Admin Enrollments
app.get('/api/admin/enrollments', requireAdmin, async (req, res) => {
  try {
    const enrollments = await prisma.enrollment.findMany({
      include: {
        student: {
          select: { id: true, fullName: true, email: true }
        },
        course: {
          select: { id: true, title: true, tutor: { select: { fullName: true } } }
        }
      },
      orderBy: { enrolledAt: 'desc' }
    });
    
    res.json({ success: true, data: enrollments });
  } catch (error) {
    console.error('Get enrollments error:', error);
    res.status(500).json({ error: 'Failed to fetch enrollments' });
  }
});

// Admin enroll student in course
app.post('/api/admin/enrollments', requireAdmin, async (req, res) => {
  try {
    const { studentId, courseId } = req.body;
    
    if (!studentId || !courseId) {
      return res.status(400).json({ error: 'Student ID and Course ID are required' });
    }
    
    // Check if student exists and is a student
    const student = await prisma.user.findFirst({
      where: { id: studentId, role: { name: 'student' } }
    });
    
    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }
    
    // Check if course exists
    const course = await prisma.course.findUnique({
      where: { id: courseId }
    });
    
    if (!course) {
      return res.status(404).json({ error: 'Course not found' });
    }
    
    // Check if already enrolled
    const existingEnrollment = await prisma.enrollment.findFirst({
      where: { studentId, courseId }
    });
    
    if (existingEnrollment) {
      return res.status(409).json({ error: 'Student is already enrolled in this course' });
    }
    
    // Create enrollment
    const enrollment = await prisma.enrollment.create({
      data: {
        studentId,
        courseId,
        enrolledAt: new Date()
      },
      include: {
        student: { select: { id: true, fullName: true, email: true } },
        course: { select: { id: true, title: true, category: true } }
      }
    });
    
    res.status(201).json({ 
      success: true, 
      data: enrollment,
      message: 'Student enrolled successfully' 
    });
  } catch (error) {
    console.error('Enroll student error:', error);
    res.status(500).json({ error: 'Failed to enroll student' });
  }
});

// Admin get students list (for dropdown)
app.get('/api/admin/students', requireAdmin, async (req, res) => {
  try {
    const students = await prisma.user.findMany({
      where: { role: { name: 'student' }, isActive: true },
      select: {
        id: true,
        fullName: true,
        email: true,
        username: true
      },
      orderBy: { fullName: 'asc' }
    });
    
    res.json({ success: true, data: students });
  } catch (error) {
    console.error('Get students error:', error);
    res.status(500).json({ error: 'Failed to fetch students' });
  }
});

// Admin get courses list (for dropdown)
app.get('/api/admin/courses-list', requireAdmin, async (req, res) => {
  try {
    const courses = await prisma.course.findMany({
      select: {
        id: true,
        title: true,
        category: true,
        tutor: { select: { fullName: true } }
      },
      orderBy: { title: 'asc' }
    });
    
    res.json({ success: true, data: courses });
  } catch (error) {
    console.error('Get courses error:', error);
    res.status(500).json({ error: 'Failed to fetch courses' });
  }
});

// Admin Users Management
app.get('/api/admin/users', requireAdmin, async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      include: {
        role: true,
        _count: {
          select: {
            courses: true,
            enrollments: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
    
    res.json({ 
      success: true, 
      data: users,
      total: users.length 
    });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// Admin create user (with email)
app.post('/api/admin/users', requireAdmin, async (req, res) => {
  try {
    const { username, email, fullName, role } = req.body;

    console.log('📧 Admin creating user with email notification:', { username, email, fullName, role });

    if (!username || !email || !fullName || !role) {
      return res.status(400).json({ 
        error: 'Username, email, full name, and role are required' 
      });
    }

    // Check if user already exists
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [
          { email: email.toLowerCase() },
          { username: username }
        ]
      }
    });

    if (existingUser) {
      return res.status(409).json({ 
        error: existingUser.email === email.toLowerCase() 
          ? 'User already exists with this email' 
          : 'Username is already taken'
      });
    }

    // Find or create role
    let userRole = await prisma.role.findUnique({ where: { name: role } });
    if (!userRole) {
      userRole = await prisma.role.create({ data: { name: role } });
    }

    // ALWAYS generate password - admin cannot set password
    const generatedPassword = generateRandomPassword();
    console.log('🔐 Generated password:', generatedPassword);
    
    const hashedPassword = await bcrypt.hash(generatedPassword, 12);

    // Create the user
    const user = await prisma.user.create({
      data: {
        username,
        email: email.toLowerCase(),
        fullName: fullName.trim(),
        passwordHash: hashedPassword,
        roleId: userRole.id,
        isActive: true
      },
      include: {
        role: true,
        _count: {
          select: {
            courses: true,
            enrollments: true
          }
        }
      }
    });

    console.log('✅ User created:', user.email);

    // ALWAYS send welcome email
    let emailResult = { success: false };
    try {
      emailResult = await sendWelcomeEmail(email, username, generatedPassword);
      console.log('📧 Welcome email sent to:', email);
    } catch (emailError) {
      console.error('❌ Failed to send welcome email:', emailError.message);
      // Continue even if email fails - user is still created
    }

    const { passwordHash, ...userWithoutPassword } = user;

    // Build response based on email result
    const response = {
      success: true,
      data: userWithoutPassword,
      emailStatus: {
        sent: emailResult.success || false,
        error: emailResult.error || null,
        generatedPassword: generatedPassword // Always include generated password
      }
    };

    // Add appropriate message
    if (emailResult.success) {
      response.message = 'User created successfully! Welcome email sent with login credentials.';
    } else {
      response.message = `User created successfully! Please share these credentials manually: Username: ${username}, Password: ${generatedPassword}`;
    }

    res.status(201).json(response);

  } catch (error) {
    console.error('❌ Create user error:', error);
    res.status(500).json({ error: 'Failed to create user: ' + error.message });
  }
});

app.put('/api/admin/users/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { username, email, fullName, role, isActive } = req.body;

    const existingUser = await prisma.user.findUnique({
      where: { id: parseInt(id) },
      include: { role: true }
    });

    if (!existingUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (email && email !== existingUser.email) {
      const emailExists = await prisma.user.findFirst({
        where: {
          email: email.toLowerCase(),
          NOT: { id: parseInt(id) }
        }
      });
      if (emailExists) {
        return res.status(409).json({ error: 'Email already exists' });
      }
    }

    if (username && username !== existingUser.username) {
      const usernameExists = await prisma.user.findFirst({
        where: {
          username: username,
          NOT: { id: parseInt(id) }
        }
      });
      if (usernameExists) {
        return res.status(409).json({ error: 'Username already exists' });
      }
    }

    let roleId = existingUser.roleId;
    if (role && role.name) {
      const newRole = await prisma.role.findUnique({ where: { name: role.name } });
      if (newRole) {
        roleId = newRole.id;
      }
    }

    const updatedUser = await prisma.user.update({
      where: { id: parseInt(id) },
      data: {
        username: username || existingUser.username,
        email: email ? email.toLowerCase() : existingUser.email,
        fullName: fullName !== undefined ? fullName : existingUser.fullName,
        roleId,
        isActive: isActive !== undefined ? isActive : existingUser.isActive
      },
      include: {
        role: true,
        _count: {
          select: {
            courses: true,
            enrollments: true
          }
        }
      }
    });

    const { passwordHash, ...userWithoutPassword } = updatedUser;

    res.json({
      success: true,
      data: userWithoutPassword,
      message: 'User updated successfully'
    });

  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

app.delete('/api/admin/users/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const user = await prisma.user.findUnique({
      where: { id: parseInt(id) }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (req.user.userId === parseInt(id)) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }

    await prisma.user.delete({
      where: { id: parseInt(id) }
    });

    res.json({
      success: true,
      message: 'User deleted successfully'
    });

  } catch (error) {
    console.error('Delete user error:', error);
    
    if (error.code === 'P2003') {
      return res.status(400).json({ 
        error: 'Cannot delete user with existing courses or enrollments. Deactivate instead.' 
      });
    }
    
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

app.patch('/api/admin/users/:id/status', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { isActive } = req.body;

    const user = await prisma.user.update({
      where: { id: parseInt(id) },
      data: { isActive },
      include: {
        role: true,
        _count: {
          select: {
            courses: true,
            enrollments: true
          }
        }
      }
    });

    const { passwordHash, ...userWithoutPassword } = user;

    res.json({
      success: true,
      data: userWithoutPassword,
      message: `User ${isActive ? 'activated' : 'deactivated'} successfully`
    });

  } catch (error) {
    console.error('Toggle user status error:', error);
    res.status(500).json({ error: 'Failed to update user status' });
  }
});

// ==================== LESSON ROUTES ====================
// Get lesson details
app.get('/api/lessons/:id', authenticateToken, async (req, res) => {
  try {
    const lessonId = parseInt(req.params.id);
    
    if (isNaN(lessonId)) {
      return res.status(400).json({ error: 'Invalid lesson ID' });
    }
    
    const lesson = await prisma.lesson.findUnique({
      where: { id: lessonId },
      include: {
        course: {
          include: {
            enrollments: {
              where: {
                studentId: req.user.userId
              }
            }
          }
        }
      }
    });

    if (!lesson) {
      return res.status(404).json({ error: 'Lesson not found' });
    }

    // Check if user is enrolled in the course
    if (req.user.roleName !== 'admin' && req.user.roleName !== 'tutor') {
      if (!lesson.course.enrollments.length) {
        return res.status(403).json({ error: 'You are not enrolled in this course' });
      }
    }

    // If user is enrolled, check if they've completed this lesson
    let isCompleted = false;
    if (lesson.course.enrollments.length > 0) {
      const enrollment = lesson.course.enrollments[0];
      const completedLesson = await prisma.completedLesson.findFirst({
        where: {
          enrollmentId: enrollment.id,
          lessonId: lessonId
        }
      });
      isCompleted = !!completedLesson;
    }

    // Get next lesson if available
    const nextLesson = await prisma.lesson.findFirst({
      where: {
        courseId: lesson.courseId,
        orderIndex: { gt: lesson.orderIndex }
      },
      orderBy: { orderIndex: 'asc' }
    });

    res.json({
      success: true,
      data: {
        ...lesson,
        isCompleted,
        nextLesson: nextLesson ? {
          id: nextLesson.id,
          title: nextLesson.title,
          orderIndex: nextLesson.orderIndex
        } : null
      }
    });

  } catch (error) {
    console.error('Get lesson error:', error);
    res.status(500).json({ error: 'Failed to load lesson' });
  }
});

// ==================== PAYMENT & BILLING ROUTES ====================

// Admin: Set course pricing
app.post('/api/admin/course-pricing', requireAdmin, async (req, res) => {
  try {
    const { courseId, initialPayment, monthlyAmount, billingDay, billingDuration } = req.body;
    if (!courseId || initialPayment === undefined || monthlyAmount === undefined) {
      return res.status(400).json({ error: 'courseId, initialPayment, and monthlyAmount are required' });
    }
    const course = await prisma.course.findUnique({ where: { id: courseId } });
    if (!course) return res.status(404).json({ error: 'Course not found' });
    const pricing = await prisma.coursePricing.upsert({
      where: { courseId },
      update: { 
        initialPayment, 
        monthlyAmount, 
        billingDay: billingDay || 1, 
        billingDuration: billingDuration || 1, 
        isActive: true 
      },
      create: { 
        courseId, 
        initialPayment, 
        monthlyAmount, 
        billingDay: billingDay || 1, 
        billingDuration: billingDuration || 1, 
        isActive: true 
      }
    });
    res.json({ success: true, data: pricing });
  } catch (error) {
    console.error('Set course pricing error:', error);
    res.status(500).json({ error: 'Failed to set course pricing' });
  }
});

// Admin: Get all course pricing
app.get('/api/admin/course-pricing', requireAdmin, async (req, res) => {
  try {
    const pricing = await prisma.coursePricing.findMany({
      include: { course: { select: { id: true, title: true, category: true } } }
    });
    res.json({ success: true, data: pricing });
  } catch (error) {
    console.error('Get course pricing error:', error);
    res.status(500).json({ error: 'Failed to get course pricing' });
  }
});

// Admin: Get global billing settings
app.get('/api/admin/global-settings', requireAdmin, async (req, res) => {
  try {
    const fs = require('fs');
    const settingsPath = './global-billing.json';
    let settings = { billingDay: 1, gracePeriodDays: 2 };
    if (fs.existsSync(settingsPath)) {
      settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    }
    res.json({ success: true, data: settings });
  } catch (error) {
    console.error('Get global settings error:', error);
    res.status(500).json({ error: 'Failed to get global settings' });
  }
});

// Admin: Update global billing settings
app.post('/api/admin/global-settings', requireAdmin, async (req, res) => {
  try {
    const { billingDay, gracePeriodDays } = req.body;
    const fs = require('fs');
    const settingsPath = './global-billing.json';
    const settings = {
      billingDay: Math.min(28, Math.max(1, billingDay || 1)),
      gracePeriodDays: Math.min(7, Math.max(1, gracePeriodDays || 2))
    };
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
    res.json({ success: true, data: settings });
  } catch (error) {
    console.error('Update global settings error:', error);
    res.status(500).json({ error: 'Failed to update global settings' });
  }
});

// Admin: Get pricing for specific course
app.get('/api/admin/course-pricing/:courseId', requireAdmin, async (req, res) => {
  try {
    const courseId = parseInt(req.params.courseId);
    const pricing = await prisma.coursePricing.findUnique({
      where: { courseId },
      include: { course: { select: { id: true, title: true } } }
    });
    res.json({ success: true, data: pricing });
  } catch (error) {
    console.error('Get course pricing error:', error);
    res.status(500).json({ error: 'Failed to get course pricing' });
  }
});

// Admin: Bill a student (create invoice)
app.post('/api/admin/bill-student', requireAdmin, async (req, res) => {
  try {
    const { studentId, courseId, type } = req.body;
    if (!studentId || !courseId || !type) return res.status(400).json({ error: 'studentId, courseId, and type are required' });
    if (!['initial', 'monthly'].includes(type)) return res.status(400).json({ error: 'type must be "initial" or "monthly"' });
    const student = await prisma.user.findUnique({ where: { id: studentId }, include: { role: true } });
    if (!student || student.role?.name !== 'student') return res.status(404).json({ error: 'Student not found' });
    const course = await prisma.course.findUnique({ where: { id: courseId } });
    if (!course) return res.status(404).json({ error: 'Course not found' });
    const pricing = await prisma.coursePricing.findUnique({ where: { courseId } });
    if (!pricing) return res.status(400).json({ error: 'Course pricing not set' });
    const amount = type === 'initial' ? pricing.initialPayment : pricing.monthlyAmount;
    
    const settings = await getGlobalSettings();
    const dueDate = new Date(); 
    dueDate.setDate(dueDate.getDate() + 7); // 7 days to pay
    const gracePeriodEnd = new Date(dueDate);
    gracePeriodEnd.setDate(gracePeriodEnd.getDate() + settings.gracePeriodDays);
    
    const invoice = await prisma.invoice.create({
      data: { 
        studentId, 
        courseId, 
        type, 
        amount, 
        status: 'pending', 
        dueDate,
        gracePeriodEnd
      },
      include: { student: { select: { id: true, email: true, fullName: true } }, course: { select: { id: true, title: true } } }
    });
    res.json({ success: true, data: invoice });
  } catch (error) {
    console.error('Bill student error:', error);
    res.status(500).json({ error: 'Failed to create invoice' });
  }
});

// Admin: Get all invoices
app.get('/api/admin/invoices', requireAdmin, async (req, res) => {
  try {
    const { status, courseId, studentId } = req.query;
    const where = {};
    if (status) where.status = status;
    if (courseId) where.courseId = parseInt(courseId);
    if (studentId) where.studentId = parseInt(studentId);
    const invoices = await prisma.invoice.findMany({
      where,
      include: { student: { select: { id: true, email: true, fullName: true, username: true } }, course: { select: { id: true, title: true, category: true } } },
      orderBy: { createdAt: 'desc' }
    });
    res.json({ success: true, data: invoices });
  } catch (error) {
    console.error('Get invoices error:', error);
    res.status(500).json({ error: 'Failed to get invoices' });
  }
});

// Admin: Get all transactions (paid invoices)
app.get('/api/admin/transactions', requireAdmin, async (req, res) => {
  try {
    const { studentId, courseId, type, startDate, endDate } = req.query;
    
    const where = { status: 'paid' };
    
    if (studentId) where.studentId = parseInt(studentId);
    if (courseId) where.courseId = parseInt(courseId);
    if (type) where.type = type;
    if (startDate || endDate) {
      where.paidAt = {};
      if (startDate) where.paidAt.gte = new Date(startDate);
      if (endDate) where.paidAt.lte = new Date(endDate + 'T23:59:59');
    }
    
    const transactions = await prisma.invoice.findMany({
      where,
      include: {
        student: { select: { id: true, fullName: true, username: true, email: true } },
        course: { select: { id: true, title: true, category: true } }
      },
      orderBy: { paidAt: 'desc' }
    });
    
    res.json({ success: true, data: transactions });
  } catch (error) {
    console.error('Get transactions error:', error);
    res.status(500).json({ error: 'Failed to get transactions' });
  }
});

// Admin: Unlock student
app.post('/api/admin/invoices/:invoiceId/unlock', requireAdmin, async (req, res) => {
  try {
    const invoiceId = parseInt(req.params.invoiceId);
    const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId } });
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
    const updatedInvoice = await prisma.invoice.update({
      where: { id: invoiceId },
      data: { status: 'paid', paidAt: new Date(), mpesaReceipt: 'ADMIN_UNLOCK' },
      include: { student: { select: { id: true, email: true, fullName: true } }, course: { select: { id: true, title: true } } }
    });
    res.json({ success: true, data: updatedInvoice, message: 'Student unlocked successfully' });
  } catch (error) {
    console.error('Unlock student error:', error);
    res.status(500).json({ error: 'Failed to unlock student' });
  }
});

// Student: Get my invoices
app.get('/api/student/invoices', authenticateToken, async (req, res) => {
  try {
    if (req.user.roleName !== 'student') return res.status(403).json({ error: 'Access denied' });
    
    // Get student's active enrollments first
    const enrollments = await prisma.enrollment.findMany({
      where: { studentId: req.user.userId },
      select: { courseId: true }
    });
    const enrolledCourseIds = enrollments.map(e => e.courseId);
    
    // Only get invoices for courses where student is actively enrolled
    const invoices = await prisma.invoice.findMany({
      where: { 
        studentId: req.user.userId,
        courseId: { in: enrolledCourseIds }
      },
      include: { 
        course: { 
          select: { 
            id: true, 
            title: true, 
            category: true,
            coursePricing: {
              select: {
                monthlyAmount: true,
                billingDuration: true
              }
            }
          } 
        } 
      },
      orderBy: { createdAt: 'desc' }
    });
    const hasOverdue = invoices.some(inv => inv.status === 'overdue');
    const pendingInitial = invoices.find(inv => inv.type === 'initial' && inv.status === 'pending');
    res.json({ success: true, data: invoices, hasOverdue, pendingInitialPayment: pendingInitial ? true : false });
  } catch (error) {
    console.error('Get student invoices error:', error);
    res.status(500).json({ error: 'Failed to get invoices' });
  }
});

// Student: Get credit balance (advance payment info)
app.get('/api/student/credit-balance', authenticateToken, async (req, res) => {
  console.log('[CREDIT-BALANCE] Endpoint hit, user:', req.user?.userId);
  try {
    if (req.user.roleName !== 'student') return res.status(403).json({ error: 'Access denied' });
    
    // Get all enrollments with their courses and pricing
    const enrollments = await prisma.enrollment.findMany({
      where: { studentId: req.user.userId },
      include: {
        course: {
          include: { coursePricing: true }
        }
      }
    });
    
    const creditInfo = [];
    
    for (const enrollment of enrollments) {
      const pricing = enrollment.course.coursePricing;
      const billingDuration = pricing?.billingDuration || 12;
      const monthlyAmount = pricing?.monthlyAmount || 0;
      
      // Get all paid invoices for this enrollment
      const paidInvoices = await prisma.invoice.findMany({
        where: {
          studentId: req.user.userId,
          courseId: enrollment.courseId,
          status: 'paid'
        },
        orderBy: { monthNumber: 'desc' }
      });
      
      // Count total months covered (initial counts as month 1)
      const totalMonthsPaid = paidInvoices.length;
      
      // Calculate months used (based on enrollment date and current date)
      const enrolledAt = new Date(enrollment.enrolledAt);
      const now = new Date();
      const monthsSinceEnrollment = Math.floor((now - enrolledAt) / (30 * 24 * 60 * 60 * 1000)) + 1;
      
      // Calculate advance credit
      const monthsUsed = Math.min(monthsSinceEnrollment, totalMonthsPaid);
      const advanceCredit = Math.max(0, totalMonthsPaid - monthsUsed);
      
      // Calculate expiry
      let expiresAt = enrollment.expiresAt ? new Date(enrollment.expiresAt) : null;
      if (!expiresAt || expiresAt < now) {
        // If expired or no expiry, calculate from paid invoices
        expiresAt = new Date(enrolledAt);
        expiresAt.setMonth(expiresAt.getMonth() + totalMonthsPaid);
      }
      
      creditInfo.push({
        courseId: enrollment.courseId,
        courseTitle: enrollment.course.title,
        billingDuration,
        monthlyAmount,
        totalMonthsPaid,
        monthsUsed,
        advanceCredit,
        expiresAt: expiresAt.toISOString(),
        isExpired: expiresAt < now
      });
    }
    
    res.json({ success: true, data: creditInfo });
  } catch (error) {
    console.error('Get credit balance error:', error);
    res.status(500).json({ error: 'Failed to get credit balance' });
  }
});

// Student: Get initial payment invoice
app.get('/api/student/invoices/initial', authenticateToken, async (req, res) => {
  try {
    if (req.user.roleName !== 'student') return res.status(403).json({ error: 'Access denied' });
    
    // Get student's active enrollments
    const enrollments = await prisma.enrollment.findMany({
      where: { studentId: req.user.userId },
      select: { courseId: true }
    });
    const enrolledCourseIds = enrollments.map(e => e.courseId);
    
    // Only get initial invoice for enrolled courses
    const invoice = await prisma.invoice.findFirst({
      where: { 
        studentId: req.user.userId, 
        type: 'initial', 
        status: 'pending',
        courseId: { in: enrolledCourseIds }
      },
      include: { course: { select: { id: true, title: true, category: true } } }
    });
    res.json({ success: true, data: invoice });
  } catch (error) {
    console.error('Get initial invoice error:', error);
    res.status(500).json({ error: 'Failed to get initial invoice' });
  }
});

// Student: Pay invoice (initiate Mpesa)
app.post('/api/student/pay/:invoiceId', authenticateToken, async (req, res) => {
  try {
    if (req.user.roleName !== 'student') return res.status(403).json({ error: 'Access denied' });
    const invoiceId = parseInt(req.params.invoiceId);
    const { phoneNumber, months = 1 } = req.body;
    if (!phoneNumber) return res.status(400).json({ error: 'Phone number is required for Mpesa payment' });
    
    const invoice = await prisma.invoice.findUnique({ 
      where: { id: invoiceId }, 
      include: { 
        course: { 
          include: { coursePricing: true }
        } 
      } 
    });
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
    if (invoice.studentId !== req.user.userId) return res.status(403).json({ error: 'Access denied' });
    
    // Get monthly amount and calculate total
    const monthlyAmount = invoice.course.coursePricing?.monthlyAmount || invoice.amount;
    const totalAmount = monthlyAmount * months;
    
    // Verify the payment covers at least the requested months
    // (Note: In real M-Pesa, this would be validated on callback based on actual amount paid)
    
    // Verify student is enrolled in the course
    const enrollment = await prisma.enrollment.findFirst({
      where: { studentId: req.user.userId, courseId: invoice.courseId }
    });
    if (!enrollment) return res.status(403).json({ error: 'You are not enrolled in this course' });
    
    if (invoice.status === 'paid') return res.status(400).json({ error: 'Invoice already paid' });
    const formattedPhone = formatPhoneNumber(phoneNumber);
    if (!formattedPhone) return res.status(400).json({ error: 'Invalid phone number format' });
    
    console.log(`[PAYMENT] Initiating payment for invoice ${invoiceId}, amount: ${totalAmount} (${months} month(s)), phone: ${formattedPhone}`);
    console.log(`[PAYMENT] M-Pesa configured: ${isMpesaConfigured()}`);
    
    let paymentResult;
    if (isMpesaConfigured()) {
      console.log(`[PAYMENT] Sending real STK push...`);
      paymentResult = await initiateSTKPush(formattedPhone, totalAmount, invoice.id, `Nuru Foundation - ${invoice.course.title}`);
    } else {
      console.log(`[PAYMENT] Running simulation mode...`);
      paymentResult = simulatePayment(invoice.id, totalAmount);
    }
    
    if (!paymentResult.success) return res.status(400).json({ error: paymentResult.error || 'Failed to initiate payment' });
    
    // Store months in checkoutRequestId for later processing (format: SIM_timestamp_months or checkoutRequestId_months)
    const checkoutWithMonths = `${paymentResult.checkoutRequestId}_${months}`;
    await prisma.invoice.update({ where: { id: invoiceId }, data: { checkoutRequestId: checkoutWithMonths } });
    
    console.log(`[PAYMENT] Payment initiated successfully. CheckoutRequestId: ${paymentResult.checkoutRequestId}, Simulated: ${paymentResult.simulated}, Months: ${months}`);
    
    res.json({ 
      success: true, 
      message: paymentResult.simulated ? 'Payment simulated - M-Pesa not fully configured' : 'STK push sent to your phone', 
      checkoutRequestId: paymentResult.checkoutRequestId, 
      simulated: paymentResult.simulated,
      months,
      totalAmount,
      monthlyAmount
    });
  } catch (error) {
    console.error('Pay invoice error:', error);
    res.status(500).json({ error: 'Failed to initiate payment' });
  }
});

// Process paid invoice with advance payment logic
async function processPaidInvoice(invoiceId, months = 1, receipt = 'PAID', simulated = false) {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: {
      course: {
        include: { coursePricing: true }
      }
    }
  });
  
  if (!invoice) return { success: false, error: 'Invoice not found' };
  
  const monthlyAmount = invoice.course.coursePricing?.monthlyAmount || invoice.amount;
  const billingDuration = invoice.course.coursePricing?.billingDuration || 12;
  
  // Mark current invoice as paid
  await prisma.invoice.update({
    where: { id: invoiceId },
    data: {
      status: 'paid',
      paidAt: new Date(),
      mpesaReceipt: receipt
    }
  });
  
  // Get enrollment
  const enrollment = await prisma.enrollment.findFirst({
    where: { studentId: invoice.studentId, courseId: invoice.courseId }
  });
  
  if (!enrollment) return { success: false, error: 'Enrollment not found' };
  
  // Calculate advance credit - how many months already paid in advance
  const existingAdvanceInvoices = await prisma.invoice.findMany({
    where: {
      studentId: invoice.studentId,
      courseId: invoice.courseId,
      type: 'monthly',
      status: 'paid',
      id: { not: invoiceId }
    }
  });
  
  // Get the latest paid invoice to determine next month number
  const allPaidInvoices = await prisma.invoice.findMany({
    where: {
      studentId: invoice.studentId,
      courseId: invoice.courseId,
      status: 'paid'
    },
    orderBy: { monthNumber: 'desc' }
  });
  
  const latestMonthNumber = allPaidInvoices.length > 0 ? (allPaidInvoices[0].monthNumber || 1) : 0;
  
  // Create advance invoices for future months
  const monthsToCreate = months - 1;
  const currentMonth = new Date().getMonth() + 1;
  const currentYear = new Date().getFullYear();
  
  for (let i = 1; i <= monthsToCreate; i++) {
    const nextMonthNumber = latestMonthNumber + i;
    
    if (nextMonthNumber > billingDuration) break;
    
    // Calculate due date for this future month
    const dueDate = new Date(currentYear, currentMonth + i - 1, 1);
    const gracePeriodEnd = new Date(dueDate);
    gracePeriodEnd.setDate(gracePeriodEnd.getDate() + 7);
    
    // Check if invoice already exists for this month
    const existingInvoice = await prisma.invoice.findFirst({
      where: {
        studentId: invoice.studentId,
        courseId: invoice.courseId,
        monthNumber: nextMonthNumber,
        type: 'monthly'
      }
    });
    
    if (!existingInvoice) {
      await prisma.invoice.create({
        data: {
          studentId: invoice.studentId,
          courseId: invoice.courseId,
          type: 'monthly',
          monthNumber: nextMonthNumber,
          amount: monthlyAmount,
          status: 'paid',
          dueDate,
          gracePeriodEnd,
          paidAt: new Date(),
          mpesaReceipt: simulated ? `SIM_ADVANCE_${i}` : `ADVANCE_${i}`,
          lastBilledAt: new Date()
        }
      });
    }
  }
  
  // Update enrollment expiry
  const now = new Date();
  const currentExpiresAt = enrollment.expiresAt ? new Date(enrollment.expiresAt) : now;
  const monthsAhead = currentExpiresAt > now ? months : months;
  
  const newExpiresAt = new Date(currentExpiresAt > now ? currentExpiresAt : now);
  newExpiresAt.setMonth(newExpiresAt.getMonth() + months);
  
  await prisma.enrollment.update({
    where: { id: enrollment.id },
    data: { expiresAt: newExpiresAt }
  });
  
  // Calculate credit balance
  const totalPaidMonths = allPaidInvoices.length + months;
  const creditMonths = Math.max(0, totalPaidMonths - latestMonthNumber);
  
  return {
    success: true,
    monthsCovered: months,
    expiresAt: newExpiresAt,
    advanceCredit: creditMonths
  };
}

// Student: Get payment status
app.get('/api/student/payment-status/:invoiceId', authenticateToken, async (req, res) => {
  try {
    if (req.user.roleName !== 'student') return res.status(403).json({ error: 'Access denied' });
    const invoiceId = parseInt(req.params.invoiceId);
    const invoice = await prisma.invoice.findUnique({ 
      where: { id: invoiceId },
      include: {
        course: {
          include: { coursePricing: true }
        }
      }
    });
    
    // Verify invoice belongs to student AND student is enrolled in the course
    const enrollment = await prisma.enrollment.findFirst({
      where: { studentId: req.user.userId, courseId: invoice?.courseId }
    });
    
    if (!invoice || invoice.studentId !== req.user.userId || !enrollment) {
      return res.status(404).json({ error: 'Invoice not found' });
    }
    
    if (invoice.status === 'paid') return res.json({ success: true, status: 'paid', paidAt: invoice.paidAt, receipt: invoice.mpesaReceipt });
    
    // Extract months from checkoutRequestId (format: checkoutRequestId_months or SIM_timestamp_months)
    let months = 1;
    if (invoice.checkoutRequestId) {
      const parts = invoice.checkoutRequestId.split('_');
      const lastPart = parts[parts.length - 1];
      const parsedMonths = parseInt(lastPart);
      if (!isNaN(parsedMonths) && parsedMonths > 0) {
        months = parsedMonths;
      }
    }
    
    console.log('[PAYMENT-STATUS] Processing invoice:', invoiceId, 'months:', months);
    
    // Handle simulation mode - check if this is a simulated payment
    const isSimulation = invoice.checkoutRequestId && invoice.checkoutRequestId.startsWith('SIM_');
    
    if (isSimulation) {
      // In simulation mode, mark as paid with advance payment logic
      console.log('[PAYMENT-STATUS] Processing as simulation, calling processPaidInvoice');
      try {
        const result = await processPaidInvoice(invoiceId, months, `SIM_${Date.now()}`, true);
        console.log('[PAYMENT-STATUS] processPaidInvoice result:', result);
        return res.json({ 
          success: true, 
          status: 'paid', 
          paidAt: new Date(), 
          receipt: `SIM_${Date.now()}`, 
          simulated: true,
          monthsCovered: result.monthsCovered,
          expiresAt: result.expiresAt,
          advanceCredit: result.advanceCredit
        });
      } catch (err) {
        console.error('[PAYMENT-STATUS] processPaidInvoice error:', err);
        return res.status(500).json({ error: 'Failed to process payment: ' + err.message });
      }
    }
    
    if (invoice.checkoutRequestId && isMpesaConfigured()) {
      const result = await queryTransactionStatus(invoice.checkoutRequestId);
      if (result.success && result.resultCode === '0') {
        const processResult = await processPaidInvoice(invoiceId, months, result.receiptNumber, false);
        return res.json({ 
          success: true, 
          status: 'paid', 
          paidAt: new Date(), 
          receipt: result.receiptNumber,
          monthsCovered: processResult.monthsCovered,
          expiresAt: processResult.expiresAt,
          advanceCredit: processResult.advanceCredit
        });
      }
    }
    const now = new Date();
    if (invoice.dueDate < now && invoice.status === 'pending') {
      await prisma.invoice.update({ where: { id: invoiceId }, data: { status: 'overdue' } });
      return res.json({ success: true, status: 'overdue' });
    }
    res.json({ success: true, status: invoice.status });
  } catch (error) {
    console.error('Payment status error:', error);
    res.status(500).json({ error: 'Failed to check payment status' });
  }
});

// Mpesa Callback
app.post('/api/mpesa/callback', async (req, res) => {
  try {
    const callbackData = parseCallbackPayload(req.body);
    if (!callbackData.success) { console.error('Invalid Mpesa callback:', req.body); return res.status(400).json({ error: 'Invalid callback' }); }
    console.log('Mpesa callback received:', callbackData);
    if (callbackData.resultCode !== 0) { console.log('Payment failed:', callbackData.resultDesc); return res.json({ success: true }); }
    const invoice = await prisma.invoice.findFirst({ where: { checkoutRequestId: callbackData.checkoutRequestId } });
    if (invoice) {
      await prisma.invoice.update({ where: { id: invoice.id }, data: { status: 'paid', paidAt: new Date(), mpesaReceipt: callbackData.receiptNumber } });
      console.log(`Invoice ${invoice.id} marked as paid. Receipt: ${callbackData.receiptNumber}`);
      
      // Check if this was a locked invoice - unlock the account
      // Check if student has any other locked invoices - if none, account is unlocked
      const remainingLocked = await prisma.invoice.findFirst({
        where: {
          studentId: invoice.studentId,
          status: 'locked'
        }
      });
      
      if (!remainingLocked) {
        console.log(`Student ${invoice.studentId} account is now unlocked - all invoices paid`);
      }
    }
    res.json({ success: true });
  } catch (error) {
    console.error('Mpesa callback error:', error);
    res.status(500).json({ error: 'Callback processing failed' });
  }
});

// Student: Get payment history
app.get('/api/student/payment-history', authenticateToken, async (req, res) => {
  try {
    if (req.user.roleName !== 'student') return res.status(403).json({ error: 'Access denied' });
    
    // Get student's active enrollments
    const enrollments = await prisma.enrollment.findMany({
      where: { studentId: req.user.userId },
      select: { courseId: true }
    });
    const enrolledCourseIds = enrollments.map(e => e.courseId);
    
    // Only get payment history for enrolled courses
    const invoices = await prisma.invoice.findMany({
      where: { 
        studentId: req.user.userId, 
        status: 'paid',
        courseId: { in: enrolledCourseIds }
      },
      include: { course: { select: { id: true, title: true } } },
      orderBy: { paidAt: 'desc' }
    });
    res.json({ success: true, data: invoices });
  } catch (error) {
    console.error('Payment history error:', error);
    res.status(500).json({ error: 'Failed to get payment history' });
  }
});

// Check if student has overdue invoices
app.get('/api/student/has-overdue', authenticateToken, async (req, res) => {
  try {
    // Get student's active enrollments
    const enrollments = await prisma.enrollment.findMany({
      where: { studentId: req.user.userId },
      select: { courseId: true }
    });
    const enrolledCourseIds = enrollments.map(e => e.courseId);
    
    // Only check overdue for enrolled courses
    const overdueInvoice = await prisma.invoice.findFirst({ 
      where: { 
        studentId: req.user.userId, 
        status: 'overdue',
        courseId: { in: enrolledCourseIds }
      } 
    });
    res.json({ success: true, hasOverdue: !!overdueInvoice });
  } catch (error) {
    console.error('Check overdue error:', error);
    res.status(500).json({ error: 'Failed to check invoices' });
  }
});

// Check if student is locked
app.get('/api/student/is-locked', authenticateToken, async (req, res) => {
  try {
    await checkAndUpdateInvoiceStatuses();
    
    // Get student's active enrollments
    const enrollments = await prisma.enrollment.findMany({
      where: { studentId: req.user.userId },
      select: { courseId: true }
    });
    const enrolledCourseIds = enrollments.map(e => e.courseId);
    
    // Check if student is locked only for enrolled courses
    const isLocked = await isStudentLocked(req.user.userId);
    const lockedInvoices = await prisma.invoice.findMany({
      where: { 
        studentId: req.user.userId, 
        status: 'locked',
        courseId: { in: enrolledCourseIds }
      },
      include: { course: { select: { title: true } } }
    });
    res.json({ success: true, isLocked, lockedInvoices });
  } catch (error) {
    console.error('Check locked error:', error);
    res.status(500).json({ error: 'Failed to check lock status' });
  }
});

// Cron job to generate monthly invoices (runs daily)
app.post('/api/cron/generate-monthly-invoices', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    // Simple auth for cron endpoint (in production, use proper auth)
    if (!authHeader) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    await generateMonthlyInvoices();
    res.json({ success: true, message: 'Monthly invoices generated' });
  } catch (error) {
    console.error('Generate monthly invoices error:', error);
    res.status(500).json({ error: 'Failed to generate monthly invoices' });
  }
});

// ==================== STATIC FILE ROUTES ====================
// Serve main pages from frontend folder
app.get('/my-courses.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend', 'student-dashboard', 'my-courses.html'));
});

app.get('/student-dashboard/progress.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend', 'student-dashboard', 'progress.html'));
});

app.get('/lesson-viewer.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend', 'student-dashboard', 'lesson-viewer.html'));
});

app.get('/login.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend', 'login.html'));
});

app.get('/courses.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend', 'courses.html'));
});

app.get('/about.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend', 'about.html'));
});

app.get('/contact.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend', 'contact.html'));
});

app.get('/register.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend', 'register.html'));
});

// Dashboard routes
app.get('/', async (req, res) => {
  // Check if student has overdue invoices - redirect to payment
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      const token = authHeader.slice(7);
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret');
      
      // Only check for students
      if (decoded.role === 'student') {
        const overdueInvoice = await prisma.invoice.findFirst({
          where: { 
            studentId: decoded.userId,
            status: { in: ['overdue', 'pending'] }
          }
        });
        
        if (overdueInvoice) {
          return res.redirect('/student-dashboard/payment.html');
        }
      }
    } catch (err) {
      // Token invalid, let it proceed
    }
  }
  
  res.sendFile(path.join(__dirname, 'frontend', 'student-dashboard', 'index.html'));
});

app.get('/tutor-dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend', 'tutor-dashboard', 'index.html'));
});

app.get('/admin-dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend', 'admin-dashboard', 'index.html'));
});

// Dashboard sub-pages
app.get('/student-dashboard/:page', async (req, res, next) => {
  // Check if student has overdue invoices - redirect to payment
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      const token = authHeader.slice(7);
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret');
      
      // Only check for students
      if (decoded.role === 'student') {
        const overdueInvoice = await prisma.invoice.findFirst({
          where: { 
            studentId: decoded.userId,
            status: { in: ['overdue', 'pending'] }
          }
        });
        
        // If has pending/overdue invoices and trying to access a page other than payment, redirect
        if (overdueInvoice && req.params.page !== 'payment.html') {
          return res.redirect('/student-dashboard/payment.html');
        }
      }
    } catch (err) {
      // Token invalid, let it proceed to auth check
    }
  }
  
  const page = req.params.page;
  res.sendFile(path.join(__dirname, 'frontend', 'student-dashboard', page));
});

app.get('/tutor-dashboard/:page', (req, res) => {
  const page = req.params.page;
  res.sendFile(path.join(__dirname, 'frontend', 'tutor-dashboard', page));
});

app.get('/admin-dashboard/:page', (req, res) => {
  const page = req.params.page;
  res.sendFile(path.join(__dirname, 'frontend', 'admin-dashboard', page));
});

// ==================== SPA CATCH-ALL ROUTE ====================
app.get(/(.*)/, (req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'API endpoint not found' });
  }
  
  // Serve from frontend folder
  res.sendFile(path.join(__dirname, 'frontend', 'index.html'));
});

// ==================== ERROR HANDLING ====================
app.use((error, req, res, next) => {
  console.error('Global error handler:', error);
  res.status(500).json({ 
    error: 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { details: error.message })
  });
});

// ==================== SERVER STARTUP ====================
app.listen(PORT, () => {
  console.log(`🚀 Nuru Foundation Server running on http://localhost:${PORT}`);
  console.log(`📚 API available at http://localhost:${PORT}/api`);
  console.log(`🌍 Frontend available at http://localhost:${PORT}`);
  console.log(`📧 Email service: ${process.env.EMAIL_USER ? 'Configured' : 'Not configured'}`);
  console.log(`🔐 JWT Authentication: ${process.env.JWT_SECRET ? 'Enabled' : 'Using fallback secret'}`);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('🛑 Shutting down server...');
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('🛑 Shutting down server...');
  await prisma.$disconnect();
  process.exit(0);
});