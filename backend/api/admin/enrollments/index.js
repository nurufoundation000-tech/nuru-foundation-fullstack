const jwt = require('jsonwebtoken');
const prisma = require('../../../lib/prisma');

// Helper functions
const authenticateToken = async (req) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    throw new Error('Access token required');
  }

  const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret');
  const user = await prisma.user.findUnique({
    where: { id: decoded.userId },
    include: { role: true }
  });

  if (!user || !user.isActive) {
    throw new Error('User not found or inactive');
  }

  return user;
};

const requireAdmin = async (req) => {
  const user = await authenticateToken(req);
  if (user.role.name !== 'admin') {
    throw new Error('Admin access required');
  }
  return user;
};

// Helper function to parse JSON body
const parseJsonBody = (req) => {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(new Error('Invalid JSON body'));
      }
    });
  });
};

// Helper function to parse query parameters
const parseQueryParams = (url) => {
  const query = {};
  const urlParts = url.split('?');
  if (urlParts[1]) {
    const params = new URLSearchParams(urlParts[1]);
    for (const [key, value] of params) {
      query[key] = value;
    }
  }
  return query;
};

// Set CORS headers
const setCorsHeaders = (res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
};

// Main serverless function
module.exports = async (req, res) => {
  setCorsHeaders(res);
  
  // Handle preflight OPTIONS request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  console.log('🔍 Admin Enrollments API Request:', req.url, req.method);

  try {
    const body = await parseJsonBody(req);
    const path = req.url;
    const method = req.method;
    const query = parseQueryParams(path);
    const basePath = path.split('?')[0];

    // GET ALL ENROLLMENTS - GET /
    if (basePath === '/' && method === 'GET') {
      const admin = await requireAdmin(req);

      const { 
        page = 1, 
        limit = 50, 
        search,
        course,
        student
      } = query;

      const offset = (parseInt(page) - 1) * parseInt(limit);

      // Build where clause
      let where = {};

      // Search filter
      if (search) {
        where.OR = [
          { student: { username: { contains: search, mode: 'insensitive' } } },
          { student: { email: { contains: search, mode: 'insensitive' } } },
          { course: { title: { contains: search, mode: 'insensitive' } } }
        ];
      }

      // Course filter
      if (course) {
        where.course = {
          title: { contains: course, mode: 'insensitive' }
        };
      }

      // Student filter
      if (student) {
        where.student = {
          username: { contains: student, mode: 'insensitive' }
        };
      }

      const [enrollments, total] = await Promise.all([
        prisma.enrollment.findMany({
          where,
          include: {
            student: {
              select: { 
                id: true, 
                username: true, 
                fullName: true, 
                email: true 
              }
            },
            course: {
              select: { 
                id: true, 
                title: true, 
                tutor: { 
                  select: { username: true, fullName: true } 
                } 
              }
            },
            lessonProgress: {
              select: { 
                id: true,
                lesson: { select: { title: true } },
                isCompleted: true 
              }
            }
          },
          skip: offset,
          take: parseInt(limit),
          orderBy: { enrolledAt: 'desc' }
        }),
        prisma.enrollment.count({ where })
      ]);

      // Calculate progress for each enrollment
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

      return res.json({
        data: enrollmentsWithProgress,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit))
        }
      });
    }

    // CREATE ENROLLMENT - POST /
    if (basePath === '/' && method === 'POST') {
      const admin = await requireAdmin(req);

      const { studentId, courseId } = body;

      // Validate required fields
      if (!studentId || !courseId) {
        return res.status(400).json({ 
          message: 'Student ID and Course ID are required' 
        });
      }

      // Verify student exists
      const student = await prisma.user.findUnique({
        where: { id: parseInt(studentId) },
        include: { role: true }
      });

      if (!student || student.role.name !== 'student') {
        return res.status(400).json({ message: 'Invalid student ID' });
      }

      // Verify course exists
      const course = await prisma.course.findUnique({
        where: { id: parseInt(courseId) }
      });

      if (!course) {
        return res.status(400).json({ message: 'Invalid course ID' });
      }

      // Check if already enrolled
      const existingEnrollment = await prisma.enrollment.findUnique({
        where: {
          studentId_courseId: {
            studentId: parseInt(studentId),
            courseId: parseInt(courseId)
          }
        }
      });

      if (existingEnrollment) {
        return res.status(400).json({ message: 'Student is already enrolled in this course' });
      }

      // Create enrollment
      const enrollment = await prisma.enrollment.create({
        data: {
          studentId: parseInt(studentId),
          courseId: parseInt(courseId),
          enrolledAt: new Date()
        },
        include: {
          student: {
            select: { username: true, fullName: true, email: true }
          },
          course: {
            select: { title: true, tutor: { select: { username: true } } }
          }
        }
      });

      return res.status(201).json(enrollment);
    }

    // DELETE ENROLLMENT - DELETE /:id
    if (basePath.match(/^\/(\d+)$/) && method === 'DELETE') {
      const admin = await requireAdmin(req);
      const match = basePath.match(/^\/(\d+)$/);
      const enrollmentId = parseInt(match[1]);

      // Check if enrollment exists
      const existingEnrollment = await prisma.enrollment.findUnique({
        where: { id: enrollmentId }
      });

      if (!existingEnrollment) {
        return res.status(404).json({ message: 'Enrollment not found' });
      }

      // Delete enrollment and related lesson progress
      await prisma.lessonProgress.deleteMany({
        where: { enrollmentId: enrollmentId }
      });

      await prisma.enrollment.delete({
        where: { id: enrollmentId }
      });

      return res.json({ message: 'Enrollment deleted successfully' });
    }

    // Route not found
    return res.status(404).json({ message: 'Admin enrollments endpoint not found' });

  } catch (error) {
    console.error('❌ Admin Enrollments API Error:', error);
    
    // Handle specific errors
    if (error.message.includes('Access token required')) {
      return res.status(401).json({ message: error.message });
    }
    if (error.message.includes('Admin access required')) {
      return res.status(403).json({ message: error.message });
    }
    if (error.message.includes('Invalid JSON')) {
      return res.status(400).json({ message: error.message });
    }
    if (error.message.includes('jwt')) {
      return res.status(403).json({ message: 'Invalid or expired token' });
    }
    
    // Generic server error
    return res.status(500).json({ 
      message: 'Server error',
      error: process.env.NODE_ENV === 'production' ? undefined : error.message
    });
  }
};