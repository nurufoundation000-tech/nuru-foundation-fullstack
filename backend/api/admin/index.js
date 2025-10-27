const jwt = require('jsonwebtoken');
const prisma = require('../../lib/prisma');

// Helper functions (keep these)
const getPaginationParams = (req) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 50;
  const offset = (page - 1) * limit;
  return { page, limit, offset };
};

const applySearchFilter = (search, searchFields) => {
  if (!search || !searchFields.length) return {};
  return {
    OR: searchFields.map(field => ({
      [field]: {
        contains: search,
        mode: 'insensitive'
      }
    }))
  };
};

// Auth middleware as function
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

// Main handler
module.exports = async (req, res) => {
  setCorsHeaders(res);
  
  // Handle preflight OPTIONS request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const path = req.url;
    
    // USERS CRUD
    if (path === '/users' && req.method === 'GET') {
      const user = await requireRole(['admin'])(req);
      const { page, limit, offset } = getPaginationParams(req);
      const search = req.query.search;
      const searchFields = ['username', 'email', 'fullName'];
      const where = applySearchFilter(search, searchFields);

      const [users, total] = await Promise.all([
        prisma.user.findMany({
          where,
          include: {
            role: true,
            _count: {
              select: {
                courses: true,
                enrollments: true,
                submissions: true
              }
            }
          },
          skip: offset,
          take: limit,
          orderBy: { createdAt: 'desc' }
        }),
        prisma.user.count({ where })
      ]);

      return res.json({
        data: users,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      });
    }

    // Add other routes similarly...

    // If no route matches
    res.status(404).json({ message: 'Route not found' });
    
  } catch (error) {
    console.error('API Error:', error);
    
    if (error.message.includes('Access token required')) {
      return res.status(401).json({ message: error.message });
    }
    if (error.message.includes('Access denied') || error.message.includes('User not found')) {
      return res.status(403).json({ message: error.message });
    }
    
    res.status(500).json({ message: 'Server error' });
  }
};