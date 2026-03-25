const express = require('express');
const cors = require('cors');
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const { sendWelcomeEmail } = require('./api/lib/email');

const app = express();
const prisma = new PrismaClient();
const PORT = process.env.PORT || 3000;

require('dotenv').config();

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
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend', 'student-dashboard', 'index.html'));
});

app.get('/tutor-dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend', 'tutor-dashboard', 'index.html'));
});

app.get('/admin-dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend', 'admin-dashboard', 'index.html'));
});

// Dashboard sub-pages
app.get('/student-dashboard/:page', (req, res) => {
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