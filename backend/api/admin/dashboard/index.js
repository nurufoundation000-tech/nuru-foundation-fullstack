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

  console.log('🔍 Admin Dashboard Request:', req.url, req.method);

  try {
    const path = req.url;
    const method = req.method;

    // GET DASHBOARD STATS - GET /stats
    if (path === '/stats' && method === 'GET') {
      const admin = await requireAdmin(req);

      // Get all stats in parallel
      const [
        totalUsers,
        totalCourses,
        totalEnrollments,
        totalRevenue,
        recentUsers,
        recentEnrollments
      ] = await Promise.all([
        // Total users count
        prisma.user.count(),
        
        // Total courses count
        prisma.course.count(),
        
        // Total enrollments count
        prisma.enrollment.count(),
        
        // Total revenue (if you have payments table)
        prisma.payment.aggregate({
          _sum: {
            amount: true
          }
        }).then(result => result._sum.amount || 0),
        
        // Recent users (last 7 days)
        prisma.user.findMany({
          where: {
            createdAt: {
              gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
            }
          },
          take: 5,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            username: true,
            email: true,
            createdAt: true
          }
        }),
        
        // Recent enrollments (last 7 days)
        prisma.enrollment.findMany({
          where: {
            enrolledAt: {
              gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
            }
          },
          take: 5,
          orderBy: { enrolledAt: 'desc' },
          include: {
            student: {
              select: { username: true }
            },
            course: {
              select: { title: true }
            }
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
      ].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
       .slice(0, 10);

      return res.json({
        stats: {
          totalUsers,
          totalCourses,
          totalEnrollments,
          revenue: `$${totalRevenue}`,
          recentUsers: recentUsers.length,
          recentEnrollments: recentEnrollments.length
        },
        recentActivity
      });
    }

    // Route not found
    return res.status(404).json({ message: 'Admin dashboard endpoint not found' });

  } catch (error) {
    console.error('❌ Admin Dashboard API Error:', error);
    
    // Handle specific errors
    if (error.message.includes('Access token required')) {
      return res.status(401).json({ message: error.message });
    }
    if (error.message.includes('Admin access required')) {
      return res.status(403).json({ message: error.message });
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