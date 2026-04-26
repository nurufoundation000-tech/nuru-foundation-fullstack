// middleware/auth.js - Authentication Middleware (with student locking)
import jwt from 'jsonwebtoken';
import db from '../config/database.js';
import { isStudentLocked, checkAndUpdateInvoiceStatuses, generateInitialInvoices } from '../lib/invoices.js';

export async function authenticateToken(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const token = authHeader.slice(7);
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret');

    const user = await db.getOne('SELECT * FROM users WHERE id = ?', [decoded.userId]);

    if (!user || !user.is_active) {
      return res.status(403).json({ error: 'User not found or inactive' });
    }

    let role = null;
    if (user.role_id) {
      role = await db.getOne('SELECT name FROM roles WHERE id = ?', [user.role_id]);
    }

    // Check if student has overdue invoices and lock them if needed
    if (role?.name === 'student') {
      await checkAndUpdateInvoiceStatuses();
      const locked = await isStudentLocked(user.id);
      if (locked) {
        return res.status(403).json({ 
          error: 'Account locked due to unpaid invoices. Please pay to regain access.',
          locked: true 
        });
      }
    }

    req.user = {
      userId: user.id,
      roleId: user.role_id,
      roleName: role?.name || 'student',
      username: user.username,
      email: user.email
    };

    next();
  } catch (error) {
    console.error('Token verification error:', error);
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Invalid token' });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
    }
    return res.status(401).json({ error: 'Authentication failed' });
  }
}

export function requireRole(allowedRoles) {
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

export const requireStudent = [authenticateToken, requireRole(['student'])];
export const requireTutor = [authenticateToken, requireRole(['tutor'])];
export const requireAdmin = [authenticateToken, requireRole(['admin'])];

export default {
  authenticateToken,
  requireRole,
  requireStudent,
  requireTutor,
  requireAdmin
};