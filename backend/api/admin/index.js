const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const prisma = require('../../lib/prisma');

// Helper functions
const authenticateToken = async (req) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) throw new Error('Access token required');
  
  const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret');
  const user = await prisma.user.findUnique({
    where: { id: decoded.userId },
    include: { role: true }
  });
  
  if (!user || !user.isActive) throw new Error('User not found or inactive');
  return user;
};

const requireAdmin = async (req) => {
  const user = await authenticateToken(req);
  if (user.role.name !== 'admin') throw new Error('Admin access required');
  return user;
};

const parseJsonBody = (req) => {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk.toString());
    req.on('end', () => {
      try { resolve(body ? JSON.parse(body) : {}); } 
      catch (error) { reject(new Error('Invalid JSON body')); }
    });
  });
};

const setCorsHeaders = (res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
};

// Extract path from URL
const getPath = (url) => {
  return url.split('?')[0];
};

// Main serverless function - handles ALL admin routes
module.exports = async (req, res) => {
  setCorsHeaders(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  console.log('🔍 Admin API Request:', req.url, req.method);

  try {
    const body = await parseJsonBody(req);
    const path = getPath(req.url);
    const method = req.method;

    // DASHBOARD STATS - GET /dashboard/stats
    if (path === '/dashboard/stats' && method === 'GET') {
      const admin = await requireAdmin(req);
      
      const [totalUsers, totalCourses, totalEnrollments, recentUsers, recentEnrollments] = await Promise.all([
        prisma.user.count(),
        prisma.course.count(),
        prisma.enrollment.count(),
        prisma.user.findMany({
          where: { createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
          take: 5,
          orderBy: { createdAt: 'desc' },
          select: { username: true, createdAt: true }
        }),
        prisma.enrollment.findMany({
          where: { enrolledAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
          take: 5,
          orderBy: { enrolledAt: 'desc' },
          include: {
            student: { select: { username: true } },
            course: { select: { title: true } }
          }
        })
      ]);

      // Generate recent activity
      const recentActivity = [
        ...recentUsers.map(user => ({
          description: `New user registered: ${user.username}`,
          timestamp: user.createdAt,
          type: 'user_registration'
        })),
        ...recentEnrollments.map(enrollment => ({
          description: `${enrollment.student.username} enrolled in ${enrollment.course.title}`,
          timestamp: enrollment.enrolledAt,
          type: 'enrollment'
        }))
      ].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, 10);

      return res.json({
        stats: {
          totalUsers,
          totalCourses,
          totalEnrollments,
          revenue: '$0', // Placeholder - add your payment logic
          recentUsers: recentUsers.length,
          recentEnrollments: recentEnrollments.length
        },
        recentActivity
      });
    }

    // USERS - GET /users
    if (path === '/users' && method === 'GET') {
      const admin = await requireAdmin(req);
      
      const users = await prisma.user.findMany({
        include: { 
          role: true, 
          _count: { 
            select: { courses: true, enrollments: true, submissions: true } 
          } 
        },
        orderBy: { createdAt: 'desc' }
      });
      
      return res.json(users);
    }

    // CREATE USER - POST /users
    if (path === '/users' && method === 'POST') {
      const admin = await requireAdmin(req);
      
      const { username, email, password, fullName, role: roleName } = body;

      if (!username || !email || !password) {
        return res.status(400).json({ message: 'Username, email, and password are required' });
      }

      // Check if user exists
      const existingUser = await prisma.user.findFirst({
        where: { OR: [{ email }, { username }] }
      });

      if (existingUser) {
        return res.status(400).json({ message: 'User already exists' });
      }

      // Get role
      const role = await prisma.role.findFirst({
        where: { name: roleName || 'student' }
      });

      if (!role) {
        return res.status(400).json({ message: 'Invalid role' });
      }

      // Hash password and create user
      const passwordHash = await bcrypt.hash(password, 12);
      const newUser = await prisma.user.create({
        data: { username, email, passwordHash, fullName, roleId: role.id },
        include: { role: true }
      });

      const { passwordHash: _, ...userWithoutPassword } = newUser;
      return res.status(201).json(userWithoutPassword);
    }

    // COURSES - GET /courses  
    if (path === '/courses' && method === 'GET') {
      const admin = await requireAdmin(req);
      
      const courses = await prisma.course.findMany({
        include: { 
          tutor: { select: { username: true, fullName: true, email: true } },
          _count: { select: { enrollments: true, lessons: true, courseReviews: true } }
        },
        orderBy: { createdAt: 'desc' }
      });
      
      return res.json({ data: courses });
    }

    // CREATE COURSE - POST /courses
    if (path === '/courses' && method === 'POST') {
      const admin = await requireAdmin(req);
      
      const { title, description, category, level, thumbnailUrl, isPublished, tutorId } = body;

      if (!title || !description) {
        return res.status(400).json({ message: 'Title and description are required' });
      }

      const course = await prisma.course.create({
        data: {
          title,
          description,
          category: category || 'General',
          level: level || 'Beginner',
          thumbnailUrl,
          isPublished: isPublished || false,
          tutorId: tutorId || admin.id
        },
        include: {
          tutor: { select: { username: true, fullName: true } }
        }
      });

      return res.status(201).json(course);
    }

    // ENROLLMENTS - GET /enrollments
    if (path === '/enrollments' && method === 'GET') {
      const admin = await requireAdmin(req);
      
      const enrollments = await prisma.enrollment.findMany({
        include: {
          student: { select: { username: true, fullName: true, email: true } },
          course: { select: { title: true, tutor: { select: { username: true } } } },
          lessonProgress: { select: { isCompleted: true } }
        },
        orderBy: { enrolledAt: 'desc' }
      });

      // Add progress calculation
      const enrollmentsWithProgress = enrollments.map(enrollment => {
        const totalLessons = enrollment.course._count?.lessons || 0;
        const completedLessons = enrollment.lessonProgress.filter(p => p.isCompleted).length;
        const progress = totalLessons > 0 ? (completedLessons / totalLessons) * 100 : 0;

        return {
          ...enrollment,
          progress: Math.round(progress),
          completedLessons,
          totalLessons
        };
      });

      return res.json({ data: enrollmentsWithProgress });
    }

    // Route not found
    return res.status(404).json({ message: 'Admin endpoint not found' });

  } catch (error) {
    console.error('❌ Admin API Error:', error);
    if (error.message.includes('Access token required')) return res.status(401).json({ message: error.message });
    if (error.message.includes('Admin access required')) return res.status(403).json({ message: error.message });
    if (error.message.includes('Invalid JSON')) return res.status(400).json({ message: error.message });
    if (error.message.includes('jwt')) return res.status(403).json({ message: 'Invalid token' });
    return res.status(500).json({ message: 'Server error' });
  }
};