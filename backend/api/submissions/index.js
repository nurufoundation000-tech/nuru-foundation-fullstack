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

  try {
    const body = await parseJsonBody(req);
    const path = req.url;
    const method = req.method;

    // GET SUBMISSIONS FOR GRADING - GET /
    if (path === '/' && method === 'GET') {
      const user = await requireRole(['tutor'])(req);

      const submissions = await prisma.submission.findMany({
        where: {
          assignment: {
            lesson: {
              course: {
                tutorId: user.userId
              }
            }
          }
        },
        include: {
          assignment: {
            select: { 
              id: true, 
              title: true, 
              maxScore: true, 
              lesson: { 
                select: { 
                  title: true, 
                  course: { 
                    select: { title: true } 
                  } 
                } 
              } 
            }
          },
          student: {
            select: { id: true, username: true, fullName: true }
          }
        },
        orderBy: { submittedAt: 'desc' }
      });

      return res.json(submissions);
    }

    // GRADE SUBMISSION - PUT /:id/grade
    if (path.match(/^\/(\d+)\/grade$/) && method === 'PUT') {
      const user = await requireRole(['tutor'])(req);
      const match = path.match(/^\/(\d+)\/grade$/);
      const submissionId = parseInt(match[1]);
      const { grade, feedback } = body;

      const submission = await prisma.submission.findUnique({
        where: { id: submissionId },
        include: {
          assignment: {
            include: {
              lesson: {
                include: {
                  course: true
                }
              }
            }
          }
        }
      });

      if (!submission) {
        return res.status(404).json({ message: 'Submission not found' });
      }

      if (submission.assignment.lesson.course.tutorId !== user.userId) {
        return res.status(403).json({ message: 'Not authorized to grade this submission' });
      }

      const updatedSubmission = await prisma.submission.update({
        where: { id: submissionId },
        data: {
          grade: parseInt(grade),
          feedback
        }
      });

      return res.json(updatedSubmission);
    }

    // Route not found
    return res.status(404).json({ message: 'Route not found' });

  } catch (error) {
    console.error('Submissions API Error:', error);
    
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