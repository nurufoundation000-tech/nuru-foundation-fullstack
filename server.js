const express = require('express');
const cors = require('cors');
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const path = require('path');

const app = express();
const prisma = new PrismaClient();
const PORT = process.env.PORT || 3000;

require('dotenv').config();

// ==================== MIDDLEWARE SETUP ====================
app.use(cors());
app.use(express.json());
app.use(express.static('frontend'));
app.use(express.static('.'));

// ==================== ROUTE IMPORTS ====================
const studentRoutes = require('./api/routes/student');
const tutorRoutes = require('./api/routes/tutor');

// ==================== API ROUTES ====================
app.use('/api/student', studentRoutes);
app.use('/api/tutor', tutorRoutes);

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
    const token = `nuru_${Date.now()}_${user.id}`;

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

app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, username, fullName, roleId } = req.body;

    if (!email || !password || !username || !fullName) {
      return res.status(400).json({ 
        error: 'Email, password, username, and full name are required' 
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

    const hashedPassword = await bcrypt.hash(password, 12);

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

    const { passwordHash, ...userWithoutPassword } = user;
    const token = `nuru_${Date.now()}_${user.id}`;

    res.status(201).json({
      success: true,
      user: userWithoutPassword,
      token,
      message: 'Registration successful'
    });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// ==================== USER MANAGEMENT ROUTES ====================
app.get('/api/users/me', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const token = authHeader.slice(7);
    const userId = token.split('_')[2];
    
    if (!userId) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    const user = await prisma.user.findUnique({
      where: { id: parseInt(userId) },
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

// ==================== ADMIN ROUTES ====================
const requireAdmin = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const token = authHeader.slice(7);
    const userId = token.split('_')[2];
    
    if (!userId) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    const user = await prisma.user.findUnique({
      where: { id: parseInt(userId) },
      include: { role: true }
    });

    if (!user || user.role?.name !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    req.adminUser = user;
    next();
  } catch (error) {
    console.error('Admin auth error:', error);
    res.status(500).json({ error: 'Authentication failed' });
  }
};

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

// Get student's course progress
app.get('/api/student/courses/progress', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const token = authHeader.slice(7);
    const userId = token.split('_')[2];
    
    if (!userId) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    // Get user enrollments with progress
    const enrollments = await prisma.enrollment.findMany({
      where: {
        studentId: parseInt(userId)
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
                isPublished: true
              }
            }
          }
        },
        completedLessons: {
          select: {
            lessonId: true
          }
        }
      }
    });

    // Calculate progress for each course
    const progressData = enrollments.map(enrollment => {
      const totalLessons = enrollment.course.lessons.filter(lesson => lesson.isPublished).length;
      const completedLessons = enrollment.completedLessons.length;
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

// Unenroll from course
app.delete('/api/student/courses/:enrollmentId/unenroll', async (req, res) => {
  try {
    const { enrollmentId } = req.params;
    
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const token = authHeader.slice(7);
    const userId = token.split('_')[2];
    
    if (!userId) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    // Verify the enrollment belongs to the user
    const enrollment = await prisma.enrollment.findFirst({
      where: {
        id: parseInt(enrollmentId),
        studentId: parseInt(userId)
      }
    });

    if (!enrollment) {
      return res.status(404).json({ error: 'Enrollment not found' });
    }

    // Delete the enrollment and associated completed lessons
    await prisma.$transaction([
      prisma.completedLesson.deleteMany({
        where: { enrollmentId: parseInt(enrollmentId) }
      }),
      prisma.enrollment.delete({
        where: { id: parseInt(enrollmentId) }
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

app.post('/api/admin/users', requireAdmin, async (req, res) => {
  try {
    const { username, email, fullName, role, password } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Username, email, and password are required' });
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

    let userRole = await prisma.role.findUnique({ where: { name: role } });
    if (!userRole) {
      userRole = await prisma.role.create({ data: { name: role } });
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const user = await prisma.user.create({
      data: {
        username,
        email: email.toLowerCase(),
        fullName,
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

    const { passwordHash, ...userWithoutPassword } = user;

    res.status(201).json({
      success: true,
      data: userWithoutPassword,
      message: 'User created successfully'
    });

  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({ error: 'Failed to create user' });
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

    if (req.adminUser.id === parseInt(id)) {
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

// Get course progress (for compatibility with existing frontend)
app.get('/api/courses/progress', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const token = authHeader.slice(7);
    const userId = token.split('_')[2];
    
    if (!userId) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    // Get user enrollments with progress
    const enrollments = await prisma.enrollment.findMany({
      where: {
        studentId: parseInt(userId)
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
                isPublished: true
              }
            }
          }
        },
        completedLessons: {
          select: {
            lessonId: true
          }
        }
      }
    });

    // Calculate progress for each course
    const progressData = enrollments.map(enrollment => {
      const totalLessons = enrollment.course.lessons.filter(lesson => lesson.isPublished).length;
      const completedLessons = enrollment.completedLessons.length;
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

// ==================== PUBLIC COURSE CATALOG ====================
app.get('/api/courses/public', async (req, res) => {
  try {
    const courses = await prisma.course.findMany({
      where: { isPublished: true },
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
    console.error('Public courses error:', error);
    res.status(500).json({ error: 'Failed to load courses' });
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