const jwt = require('jsonwebtoken');
const prisma = require('../../lib/prisma');

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

  return {
    userId: user.id,
    roleId: user.roleId,
    roleName: user.role?.name,
    username: user.username
  };
};

const requireRole = (allowedRoles) => {
  return async (req) => {
    const user = await authenticateToken(req);
    if (!allowedRoles.includes(user.roleName)) {
      throw new Error(`Access denied. Required roles: ${allowedRoles.join(', ')}`);
    }
    return user;
  };
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

// Extract the actual path by removing /api/courses prefix
const getCleanPath = (fullPath) => {
  // Remove /api/courses prefix if it exists
  let cleanPath = fullPath;
  if (cleanPath.startsWith('/api/courses')) {
    cleanPath = cleanPath.replace('/api/courses', '');
  }
  // If path is empty after removal, make it root
  if (cleanPath === '') {
    cleanPath = '/';
  }
  return cleanPath;
};

// Main serverless function
module.exports = async (req, res) => {
  setCorsHeaders(res);
  
  // Handle preflight OPTIONS request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // DEBUG: Log the request
  console.log('🔍 Courses Request:', {
    originalUrl: req.url,
    method: req.method
  });

  try {
    const body = await parseJsonBody(req);
    const originalPath = req.url;
    const method = req.method;
    
    // Get clean path by removing API prefix
    const path = getCleanPath(originalPath);
    const query = parseQueryParams(originalPath);

    console.log('🔍 Processing courses - Original:', originalPath, 'Clean:', path, 'Method:', method);

    // ROOT ENDPOINT - GET / (list all published courses)
    if (path === '/' && method === 'GET') {
      console.log('🔍 Handling GET courses');
      
      const courses = await prisma.course.findMany({
        where: { isPublished: true },
        include: {
          tutor: {
            select: { username: true, fullName: true, profilePicUrl: true }
          },
          _count: {
            select: { enrollments: true, lessons: true }
          }
        }
      });

      return res.json(courses);
    }

    // GET USER PROGRESS - GET /progress
    if (path === '/progress' && method === 'GET') {
      console.log('🔍 Handling GET user progress');
      
      const user = await authenticateToken(req);

      const enrollments = await prisma.enrollment.findMany({
        where: { studentId: user.userId },
        include: {
          course: {
            select: {
              id: true,
              title: true,
              description: true,
              thumbnailUrl: true,
              tutor: { select: { username: true, fullName: true } },
              _count: {
                select: { lessons: true }
              }
            }
          }
        }
      });

      // Calculate completed lessons for each enrollment
      const progressWithDetails = await Promise.all(
        enrollments.map(async (enrollment) => {
          const completedLessons = await prisma.lessonProgress.count({
            where: {
              enrollmentId: enrollment.id,
              isCompleted: true
            }
          });

          return {
            ...enrollment,
            completedLessons,
            totalLessons: enrollment.course._count.lessons
          };
        })
      );

      return res.json(progressWithDetails);
    }

    // CREATE COURSE - POST /
    if (path === '/' && method === 'POST') {
      console.log('🔍 Handling POST course');
      
      const user = await authenticateToken(req);
      
      // Check if user has tutor or admin role
      const userWithRole = await prisma.user.findUnique({
        where: { id: user.userId },
        include: { role: true }
      });

      if (!userWithRole || (userWithRole.role.name !== 'tutor' && userWithRole.role.name !== 'admin')) {
        return res.status(403).json({ message: 'Only tutors or admins can create courses' });
      }

      const { title, description, category, level, thumbnailUrl } = body;

      const course = await prisma.course.create({
        data: {
          title,
          description,
          category,
          level,
          thumbnailUrl,
          tutorId: user.userId
        }
      });

      return res.status(201).json(course);
    }

    // ENROLL IN COURSE - POST /:id/enroll
    if (path.match(/^\/(\d+)\/enroll$/) && method === 'POST') {
      console.log('🔍 Handling course enrollment');
      
      const user = await authenticateToken(req);
      
      // Check if user has student role
      const userWithRole = await prisma.user.findUnique({
        where: { id: user.userId },
        include: { role: true }
      });

      if (!userWithRole || userWithRole.role.name !== 'student') {
        return res.status(403).json({ message: 'Only students can enroll in courses' });
      }

      const match = path.match(/^\/(\d+)\/enroll$/);
      const courseId = parseInt(match[1]);

      // Check if course exists and is published
      const course = await prisma.course.findFirst({
        where: { id: courseId, isPublished: true }
      });

      if (!course) {
        return res.status(404).json({ message: 'Course not found' });
      }

      // Check if already enrolled
      const existingEnrollment = await prisma.enrollment.findUnique({
        where: {
          studentId_courseId: {
            studentId: user.userId,
            courseId: courseId
          }
        }
      });

      if (existingEnrollment) {
        return res.status(400).json({ message: 'Already enrolled in this course' });
      }

      // Create enrollment
      const enrollment = await prisma.enrollment.create({
        data: {
          studentId: user.userId,
          courseId: courseId
        }
      });

      return res.status(201).json({
        message: 'Successfully enrolled in course',
        enrollment
      });
    }

    // Add other course routes here following the same pattern...

    // If no route matches, return detailed 404
    console.log('❌ Courses route not found:', { originalPath, cleanPath: path, method });
    
    return res.status(404).json({ 
      message: 'Courses endpoint not found',
      requestedPath: originalPath,
      cleanPath: path,
      method: method,
      availableEndpoints: [
        'GET / - Get all published courses',
        'POST / - Create new course (tutors/admins only)',
        'POST /:id/enroll - Enroll in course (students only)'
      ]
    });

  } catch (error) {
    console.error('❌ Courses API Error:', error);
    
    // Handle specific errors
    if (error.message.includes('Access token required')) {
      return res.status(401).json({ message: error.message });
    }
    if (error.message.includes('Access denied') || error.message.includes('User not found')) {
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