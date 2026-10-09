// middleware/auth.js - Authentication Middleware (CommonJS)
const jwt = require('jsonwebtoken');
const db = require('../config/database.js');
const { getStudentLockState, checkAndUpdateInvoiceStatuses } = require('../lib/invoices.js');

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

    let lockLevel = 'none';
    let isLocked = false;
    if (role?.name === 'student') {
      await checkAndUpdateInvoiceStatuses();
      const lockState = await getStudentLockState(user.id);
      lockLevel = lockState.level;
      isLocked = lockLevel !== 'none';
    }

    req.user = {
      userId: user.id,
      roleId: user.role_id,
      roleName: role?.name || 'student',
      username: user.username,
      email: user.email,
      isLocked: isLocked,
      lockLevel: lockLevel
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

// Blocks students with ANY unpaid obligation (deposit or locked monthly invoice).
// Paywall-exempt routes (payment, profile, notifications) must NOT use this middleware.
function blockLockedStudent(req, res, next) {
  if (req.user?.roleName === 'student' && req.user.isLocked) {
    return res.status(403).json({
      error: 'Account locked due to unpaid invoices. Please complete payment to regain access.',
      locked: true,
      lockLevel: req.user.lockLevel
    });
  }
  next();
}

// Blocks ONLY students with an unpaid deposit. Monthly-locked students pass through,
// so controllers can serve free courses and flag paid ones as locked.
function blockDepositOnly(req, res, next) {
  if (req.user?.roleName === 'student' && req.user.lockLevel === 'deposit') {
    return res.status(403).json({
      error: 'Your deposit is unpaid. Please complete payment to gain access to courses.',
      locked: true,
      lockLevel: 'deposit'
    });
  }
  next();
}

// Course-aware lock gate: allows a monthly-locked student to access FREE courses
// while still blocking paid courses. Total block remains for unpaid deposits.
async function blockLockedCourse(req, res, next) {
  if (req.user?.roleName === 'student' && req.user.lockLevel === 'deposit') {
    return res.status(403).json({
      error: 'Your deposit is unpaid. Please complete payment to gain access to courses.',
      locked: true,
      lockLevel: 'deposit'
    });
  }

  if (!req.user || req.user.lockLevel !== 'monthly') {
    return next();
  }

  if (req.user.roleName !== 'student') {
    return next();
  }

  let courseId = null;
  if (req.query.courseId) courseId = req.query.courseId;
  else if (req.params.courseId) courseId = req.params.courseId;
  else if (req.params.enrollmentId) {
    const enrollment = await db.getOne('SELECT course_id FROM enrollments WHERE id = ?', [req.params.enrollmentId]);
    courseId = enrollment?.course_id;
  } else if (req.params.lessonId) {
    const lesson = await db.getOne('SELECT course_id FROM lessons WHERE id = ?', [req.params.lessonId]);
    courseId = lesson?.course_id;
  } else if (req.params.noteId) {
    const note = await db.getOne('SELECT course_id FROM course_notes WHERE id = ?', [req.params.noteId]);
    courseId = note?.course_id;
  } else if (req.params.postId) {
    const post = await db.getOne('SELECT course_id FROM forum_posts WHERE id = ?', [req.params.postId]);
    courseId = post?.course_id;
  } else if (req.params.id) {
    if (req.path.startsWith('/student/lessons')) {
      const lesson = await db.getOne('SELECT course_id FROM lessons WHERE id = ?', [req.params.id]);
      courseId = lesson?.course_id;
    } else if (req.path.startsWith('/forum')) {
      const post = await db.getOne('SELECT course_id FROM forum_posts WHERE id = ?', [req.params.id]);
      courseId = post?.course_id;
    } else {
      const assignment = await db.getOne(`
        SELECT l.course_id FROM assignments a
        JOIN lessons l ON a.lesson_id = l.id
        WHERE a.id = ?
      `, [req.params.id]);
      courseId = assignment?.course_id;
    }
  }

  if (!courseId) {
    return next();
  }

  const course = await db.getOne('SELECT is_free FROM courses WHERE id = ?', [courseId]);
  if (course && course.is_free) {
    return next();
  }

  return res.status(403).json({
    error: 'This course requires an up to date payment. Please pay to regain access.',
    locked: true,
    lockLevel: 'monthly'
  });
}

const requireStudent = [authenticateToken, requireRole(['student'])];
const requireTutor = [authenticateToken, requireRole(['tutor'])];
const requireAdmin = [authenticateToken, requireRole(['admin'])];
const requireStudentNotLocked = [authenticateToken, requireRole(['student']), blockLockedStudent];
const requireStudentDepositOnly = [authenticateToken, requireRole(['student']), blockDepositOnly];

module.exports = {
  authenticateToken,
  requireRole,
  requireStudent,
  requireTutor,
  requireAdmin,
  blockLockedStudent,
  blockDepositOnly,
  blockLockedCourse,
  requireStudentNotLocked,
  requireStudentDepositOnly
};
