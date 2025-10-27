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

// Set CORS headers
const setCorsHeaders = (res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
};

// Parse JSON body
const parseJsonBody = (req) => {
  return new Promise((resolve, reject) => {
    if (req.method === 'GET' || req.method === 'DELETE') {
      return resolve({});
    }
    
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

// Main serverless function
module.exports = async (req, res) => {
  setCorsHeaders(res);
  
  // Handle preflight OPTIONS request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const body = await parseJsonBody(req);
    const path = req.url;
    const method = req.method;

    // CREATE ASSIGNMENT - POST /
    if (path === '/' && method === 'POST') {
      const user = await requireRole(['tutor'])(req);
      const { title, description, maxScore, lessonId } = body;

      // Check if lesson belongs to tutor's course
      const lesson = await prisma.lesson.findUnique({
        where: { id: parseInt(lessonId) },
        include: { course: true }
      });

      if (!lesson) {
        return res.status(404).json({ message: 'Lesson not found' });
      }

      if (lesson.course.tutorId !== user.userId) {
        return res.status(403).json({ message: 'Not authorized to create assignments for this lesson' });
      }

      const assignment = await prisma.assignment.create({
        data: {
          title,
          description,
          maxScore: maxScore || 100,
          lessonId: parseInt(lessonId)
        }
      });

      return res.status(201).json(assignment);
    }

    // GET SINGLE ASSIGNMENT - GET /:id
    if (path.match(/^\/(\d+)$/) && method === 'GET') {
      const user = await authenticateToken(req);
      const match = path.match(/^\/(\d+)$/);
      const assignmentId = parseInt(match[1]);

      const assignment = await prisma.assignment.findUnique({
        where: { id: assignmentId },
        include: {
          lesson: {
            include: {
              course: {
                select: { 
                  id: true, 
                  tutorId: true, 
                  enrollments: { 
                    select: { studentId: true } 
                  } 
                }
              }
            }
          },
          submissions: {
            where: { studentId: user.userId },
            select: { id: true, grade: true, feedback: true, submittedAt: true }
          }
        }
      });

      if (!assignment) {
        return res.status(404).json({ message: 'Assignment not found' });
      }

      const isTutor = assignment.lesson.course.tutorId === user.userId;
      const isEnrolled = assignment.lesson.course.enrollments.some(e => e.studentId === user.userId);

      if (!isTutor && !isEnrolled) {
        return res.status(403).json({ message: 'Not authorized to view this assignment' });
      }

      return res.json(assignment);
    }

    // SUBMIT ASSIGNMENT - POST /:id/submit
    if (path.match(/^\/(\d+)\/submit$/) && method === 'POST') {
      const user = await requireRole(['student'])(req);
      const match = path.match(/^\/(\d+)\/submit$/);
      const assignmentId = parseInt(match[1]);
      const { codeSubmission } = body;

      const assignment = await prisma.assignment.findUnique({
        where: { id: assignmentId },
        include: {
          lesson: {
            include: {
              course: {
                select: { enrollments: { select: { studentId: true } } }
              }
            }
          }
        }
      });

      if (!assignment) {
        return res.status(404).json({ message: 'Assignment not found' });
      }

      // Check if student is enrolled in the course
      const isEnrolled = assignment.lesson.course.enrollments.some(e => e.studentId === user.userId);
      if (!isEnrolled) {
        return res.status(403).json({ message: 'Not enrolled in this course' });
      }

      // Check if already submitted
      const existingSubmission = await prisma.submission.findFirst({
        where: {
          assignmentId: assignmentId,
          studentId: user.userId
        }
      });

      if (existingSubmission) {
        return res.status(400).json({ message: 'Assignment already submitted' });
      }

      const submission = await prisma.submission.create({
        data: {
          assignmentId: assignmentId,
          studentId: user.userId,
          codeSubmission
        }
      });

      return res.status(201).json({ submission });
    }

    // Route not found
    return res.status(404).json({ message: 'Route not found' });

  } catch (error) {
    console.error('API Error:', error);
    
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
    return res.status(500).json({ message: 'Server error' });
  }
};