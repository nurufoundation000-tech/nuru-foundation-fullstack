const jwt = require('jsonwebtoken');
const prisma = require('../lib/prisma');

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

// Main serverless function
module.exports = async (req, res) => {
  setCorsHeaders(res);
  
  // Handle preflight OPTIONS request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const path = req.url;
    const method = req.method;

    // GET USER PROFILE - GET /profile
    if (path === '/profile' && method === 'GET') {
      const user = await authenticateToken(req);
      return res.json({ user });
    }

    // GET ALL STUDENTS - GET /students
    if (path === '/students' && method === 'GET') {
      const user = await requireRole(['tutor'])(req);

      const students = await prisma.user.findMany({
        where: {
          role: {
            name: 'student'
          }
        },
        select: {
          id: true,
          username: true,
          fullName: true,
          email: true,
          profilePicUrl: true
        }
      });

      return res.json(students);
    }

    // Route not found
    return res.status(404).json({ message: 'Route not found' });

  } catch (error) {
    console.error('Users API Error:', error);
    
    // Handle specific errors
    if (error.message.includes('Access token required')) {
      return res.status(401).json({ message: error.message });
    }
    if (error.message.includes('Access denied') || error.message.includes('User not found')) {
      return res.status(403).json({ message: error.message });
    }
    if (error.message.includes('jwt')) {
      return res.status(403).json({ message: 'Invalid or expired token' });
    }
    
    // Generic server error
    return res.status(500).json({ message: 'Server error' });
  }
};