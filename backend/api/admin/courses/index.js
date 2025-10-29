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

  console.log('🔍 Admin Courses API Request:', req.url, req.method);

  try {
    const body = await parseJsonBody(req);
    const path = req.url;
    const method = req.method;
    const query = parseQueryParams(path);
    const basePath = path.split('?')[0];

    // GET ALL COURSES - GET /
    if (basePath === '/' && method === 'GET') {
      const admin = await requireAdmin(req);

      const { 
        page = 1, 
        limit = 50, 
        search,
        status,
        tutor 
      } = query;

      const offset = (parseInt(page) - 1) * parseInt(limit);

      // Build where clause
      let where = {};

      // Search filter
      if (search) {
        where.OR = [
          { title: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
          { category: { contains: search, mode: 'insensitive' } }
        ];
      }

      // Status filter
      if (status && status !== 'all') {
        where.isPublished = status === 'published';
      }

      // Tutor filter
      if (tutor) {
        where.tutor = {
          username: { contains: tutor, mode: 'insensitive' }
        };
      }

      const [courses, total] = await Promise.all([
        prisma.course.findMany({
          where,
          include: {
            tutor: {
              select: { 
                id: true, 
                username: true, 
                fullName: true, 
                email: true 
              }
            },
            _count: {
              select: {
                enrollments: true,
                lessons: true,
                courseReviews: true
              }
            }
          },
          skip: offset,
          take: parseInt(limit),
          orderBy: { createdAt: 'desc' }
        }),
        prisma.course.count({ where })
      ]);

      return res.json({
        data: courses,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit))
        }
      });
    }

    // CREATE COURSE - POST /
    if (basePath === '/' && method === 'POST') {
      const admin = await requireAdmin(req);

      const { 
        title, 
        description, 
        category, 
        level, 
        thumbnailUrl, 
        isPublished,
        tutorId 
      } = body;

      // Validate required fields
      if (!title || !description) {
        return res.status(400).json({ 
          message: 'Title and description are required' 
        });
      }

      // Verify tutor exists if specified
      if (tutorId) {
        const tutor = await prisma.user.findUnique({
          where: { id: parseInt(tutorId) },
          include: { role: true }
        });

        if (!tutor || tutor.role.name !== 'tutor') {
          return res.status(400).json({ message: 'Invalid tutor ID' });
        }
      }

      const course = await prisma.course.create({
        data: {
          title,
          description,
          category: category || 'General',
          level: level || 'Beginner',
          thumbnailUrl,
          isPublished: isPublished || false,
          tutorId: tutorId || admin.id // Use admin as tutor if not specified
        },
        include: {
          tutor: {
            select: { username: true, fullName: true }
          }
        }
      });

      return res.status(201).json(course);
    }

    // UPDATE COURSE - PUT /:id
    if (basePath.match(/^\/(\d+)$/) && method === 'PUT') {
      const admin = await requireAdmin(req);
      const match = basePath.match(/^\/(\d+)$/);
      const courseId = parseInt(match[1]);

      const { 
        title, 
        description, 
        category, 
        level, 
        thumbnailUrl, 
        isPublished,
        tutorId 
      } = body;

      // Check if course exists
      const existingCourse = await prisma.course.findUnique({
        where: { id: courseId }
      });

      if (!existingCourse) {
        return res.status(404).json({ message: 'Course not found' });
      }

      // Verify tutor exists if specified
      if (tutorId) {
        const tutor = await prisma.user.findUnique({
          where: { id: parseInt(tutorId) },
          include: { role: true }
        });

        if (!tutor || tutor.role.name !== 'tutor') {
          return res.status(400).json({ message: 'Invalid tutor ID' });
        }
      }

      const updateData = {
        ...(title && { title }),
        ...(description && { description }),
        ...(category && { category }),
        ...(level && { level }),
        ...(thumbnailUrl && { thumbnailUrl }),
        ...(typeof isPublished === 'boolean' && { isPublished }),
        ...(tutorId && { tutorId: parseInt(tutorId) })
      };

      const updatedCourse = await prisma.course.update({
        where: { id: courseId },
        data: updateData,
        include: {
          tutor: {
            select: { username: true, fullName: true }
          },
          _count: {
            select: {
              enrollments: true,
              lessons: true
            }
          }
        }
      });

      return res.json(updatedCourse);
    }

    // DELETE COURSE - DELETE /:id
    if (basePath.match(/^\/(\d+)$/) && method === 'DELETE') {
      const admin = await requireAdmin(req);
      const match = basePath.match(/^\/(\d+)$/);
      const courseId = parseInt(match[1]);

      // Check if course exists
      const existingCourse = await prisma.course.findUnique({
        where: { id: courseId }
      });

      if (!existingCourse) {
        return res.status(404).json({ message: 'Course not found' });
      }

      // Delete course (this will cascade to related records)
      await prisma.course.delete({
        where: { id: courseId }
      });

      return res.json({ message: 'Course deleted successfully' });
    }

    // Route not found
    return res.status(404).json({ message: 'Admin courses endpoint not found' });

  } catch (error) {
    console.error('❌ Admin Courses API Error:', error);
    
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