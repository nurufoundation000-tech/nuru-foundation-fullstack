const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const jwt = require('jsonwebtoken');
const prisma = require('../../lib/prisma');

// Load environment variables
if (process.env.NODE_ENV !== 'production') {
  try {
    require('dotenv-flow').config();
  } catch (err) {
    console.warn('dotenv-flow not loaded (production environment):', err.message);
  }
}

const app = express();

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

// Auth middleware
const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'Access token required' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret');

    // Verify user still exists and get role info
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      include: { role: true }
    });

    if (!user || !user.isActive) {
      return res.status(403).json({ message: 'User not found or inactive' });
    }

    req.user = {
      userId: user.id,
      roleId: user.roleId,
      roleName: user.role?.name,
      username: user.username
    };

    next();
  } catch (error) {
    console.error('Token verification error:', error);
    return res.status(403).json({ message: 'Invalid or expired token' });
  }
};

// Middleware to check specific roles
const requireRole = (allowedRoles) => {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    if (!allowedRoles.includes(req.user.roleName)) {
      return res.status(403).json({
        message: `Access denied. Required roles: ${allowedRoles.join(', ')}`
      });
    }

    next();
  };
};

app.get('/logs', authenticateToken, requireRole(['moderator', 'admin']), async (req, res) => {
  try {
    const logs = await prisma.moderationLog.findMany({
      orderBy: { createdAt: 'desc' }
    });

    res.json(logs);
  } catch (error) {
    console.error('Get moderation logs error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Error:', error);
  res.status(500).json({ message: 'Something went wrong!' });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

module.exports = app;
