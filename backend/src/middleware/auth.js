// middleware/auth.js - Authentication Middleware (CommonJS)
const jwt = require('jsonwebtoken');
const db = require('../config/database.js');
const { isStudentLocked, checkAndUpdateInvoiceStatuses } = require('../lib/invoices.js');

async function authenticateToken(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const token = authHeader.slice(7);
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await db.getOne('SELECT * FROM users WHERE id = ?', [decoded.userId]);

    if (!user || !user.is_active) {
      return res.status(403).json({ error: 'User not found or inactive' });
    }

    let role = null;
    if (user.role_id) {
      role = await db.getOne('SELECT name FROM roles WHERE id = ?', [user.role_id]);
    }

    if (role?.name === 'student') {
      await checkAndUpdateInvoiceStatuses();
      const locked = await isStudentLocked(user.id);
      req.userIsLocked = locked;
    }

    req.user = {
      userId: user.id,
      roleId: user.role_id,
      roleName: role?.name || 'student',
      username: user.username,
      email: user.email,
      isLocked: !!req.userIsLocked
    };

    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      console.warn('Token expired for user');
      return res.status(401).json({ error: 'Token expired' });
    }
    if (error.name === 'JsonWebTokenError') {
      console.warn('Invalid token:', error.message);
      return res.status(401).json({ error: 'Invalid token' });
    }
    console.error('Token verification error:', error);
    return res.status(401).json({ error: 'Authentication failed' });
  }
}

function requireRole(allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    if (!allowedRoles.includes(req.user.roleName)) {
      return res.status(403).json({
        error: `Access denied. Required roles: ${allowedRoles.join(', ')}`
      });
    }
    next();
  };
}

// Blocks access for students whose invoices are past due (locked) until they pay.
// Paywall-exempt routes (payment, profile, notifications) must NOT use this middleware.
function blockLockedStudent(req, res, next) {
  if (req.user?.roleName === 'student' && req.user.isLocked) {
    return res.status(403).json({
      error: 'Account locked due to unpaid invoices. Please complete payment to regain access.',
      locked: true
    });
  }
  next();
}

const requireStudent = [authenticateToken, requireRole(['student'])];
const requireTutor = [authenticateToken, requireRole(['tutor'])];
const requireAdmin = [authenticateToken, requireRole(['admin'])];
const requireStudentNotLocked = [authenticateToken, requireRole(['student']), blockLockedStudent];

module.exports = {
  authenticateToken,
  requireRole,
  requireStudent,
  requireTutor,
  requireAdmin,
  blockLockedStudent,
  requireStudentNotLocked
};
