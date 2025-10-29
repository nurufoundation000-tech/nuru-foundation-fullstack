const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
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

  console.log('🔍 Admin Users API Request:', req.url, req.method);

  try {
    const body = await parseJsonBody(req);
    const path = req.url;
    const method = req.method;
    const query = parseQueryParams(path);
    const basePath = path.split('?')[0];

    // GET ALL USERS - GET /
    if (basePath === '/' && method === 'GET') {
      const admin = await requireAdmin(req);

      const { 
        page = 1, 
        limit = 50, 
        search,
        role,
        status 
      } = query;

      const offset = (parseInt(page) - 1) * parseInt(limit);

      // Build where clause
      let where = {};

      // Search filter
      if (search) {
        where.OR = [
          { username: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
          { fullName: { contains: search, mode: 'insensitive' } }
        ];
      }

      // Role filter
      if (role && role !== 'all') {
        where.role = {
          name: role
        };
      }

      // Status filter
      if (status && status !== 'all') {
        where.isActive = status === 'active';
      }

      const [users, total] = await Promise.all([
        prisma.user.findMany({
          where,
          include: {
            role: {
              select: { name: true }
            },
            _count: {
              select: {
                courses: true,
                enrollments: true,
                submissions: true
              }
            }
          },
          skip: offset,
          take: parseInt(limit),
          orderBy: { createdAt: 'desc' }
        }),
        prisma.user.count({ where })
      ]);

      return res.json({
        data: users,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit))
        }
      });
    }

    // GET SINGLE USER - GET /:id
    if (basePath.match(/^\/(\d+)$/) && method === 'GET') {
      const admin = await requireAdmin(req);
      const match = basePath.match(/^\/(\d+)$/);
      const userId = parseInt(match[1]);

      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: {
          role: true,
          courses: {
            include: {
              course: {
                select: { title: true, category: true }
              }
            }
          },
          enrollments: {
            include: {
              course: {
                select: { title: true, tutor: { select: { username: true } } }
              }
            }
          },
          submissions: {
            include: {
              assignment: {
                select: { title: true, lesson: { select: { title: true } } }
              }
            }
          }
        }
      });

      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }

      return res.json(user);
    }

    // CREATE USER - POST /
    if (basePath === '/' && method === 'POST') {
      const admin = await requireAdmin(req);

      const { username, email, password, fullName, role: roleName } = body;

      // Validate required fields
      if (!username || !email || !password) {
        return res.status(400).json({ 
          message: 'Username, email, and password are required' 
        });
      }

      // Check if user already exists
      const existingUser = await prisma.user.findFirst({
        where: {
          OR: [
            { email: email },
            { username: username }
          ]
        }
      });

      if (existingUser) {
        return res.status(400).json({ message: 'User already exists' });
      }

      // Get role ID
      const role = await prisma.role.findFirst({
        where: { name: roleName || 'student' }
      });

      if (!role) {
        return res.status(400).json({ message: 'Invalid role' });
      }

      // Hash password
      const saltRounds = 12;
      const passwordHash = await bcrypt.hash(password, saltRounds);

      // Create user
      const newUser = await prisma.user.create({
        data: {
          username,
          email,
          passwordHash,
          fullName,
          roleId: role.id
        },
        include: {
          role: true
        }
      });

      // Remove password from response
      const { passwordHash: _, ...userWithoutPassword } = newUser;

      return res.status(201).json(userWithoutPassword);
    }

    // UPDATE USER - PUT /:id
    if (basePath.match(/^\/(\d+)$/) && method === 'PUT') {
      const admin = await requireAdmin(req);
      const match = basePath.match(/^\/(\d+)$/);
      const userId = parseInt(match[1]);

      const { username, email, fullName, role: roleName, isActive } = body;

      // Check if user exists
      const existingUser = await prisma.user.findUnique({
        where: { id: userId }
      });

      if (!existingUser) {
        return res.status(404).json({ message: 'User not found' });
      }

      // Get role ID if role is being updated
      let roleId;
      if (roleName) {
        const role = await prisma.role.findFirst({
          where: { name: roleName }
        });
        if (!role) {
          return res.status(400).json({ message: 'Invalid role' });
        }
        roleId = role.id;
      }

      const updateData = {
        ...(username && { username }),
        ...(email && { email }),
        ...(fullName && { fullName }),
        ...(roleId && { roleId }),
        ...(typeof isActive === 'boolean' && { isActive })
      };

      const updatedUser = await prisma.user.update({
        where: { id: userId },
        data: updateData,
        include: {
          role: true
        }
      });

      // Remove password from response
      const { passwordHash, ...userWithoutPassword } = updatedUser;

      return res.json(userWithoutPassword);
    }

    // DELETE USER - DELETE /:id
    if (basePath.match(/^\/(\d+)$/) && method === 'DELETE') {
      const admin = await requireAdmin(req);
      const match = basePath.match(/^\/(\d+)$/);
      const userId = parseInt(match[1]);

      // Check if user exists
      const existingUser = await prisma.user.findUnique({
        where: { id: userId }
      });

      if (!existingUser) {
        return res.status(404).json({ message: 'User not found' });
      }

      // Prevent admin from deleting themselves
      if (existingUser.id === admin.id) {
        return res.status(400).json({ message: 'Cannot delete your own account' });
      }

      // Delete user (this will cascade to related records based on your schema)
      await prisma.user.delete({
        where: { id: userId }
      });

      return res.json({ message: 'User deleted successfully' });
    }

    // Route not found
    return res.status(404).json({ message: 'Admin users endpoint not found' });

  } catch (error) {
    console.error('❌ Admin Users API Error:', error);
    
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