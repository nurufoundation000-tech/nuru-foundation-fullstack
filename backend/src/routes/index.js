// routes/index.js - Main API Routes (CommonJS)
const express = require('express');
const router = express.Router();

const AuthController = require('../controllers/authController.js');
const UserController = require('../controllers/userController.js');
const CourseController = require('../controllers/courseController.js');
const StudentController = require('../controllers/studentController.js');
const TutorController = require('../controllers/tutorController.js');
const AdminController = require('../controllers/adminController.js');
const MpesaController = require('../controllers/mpesaController.js');
const { sendWelcomeEmail, getEmailStatus } = require('../lib/email.js');
const { authenticateToken, requireRole } = require('../middleware/auth.js');
const { generateInitialInvoices, checkAndUpdateInvoiceStatuses, isStudentLocked } = require('../lib/invoices.js');

const requireTutor = [authenticateToken, requireRole(['tutor'])];
const requireAdmin = [authenticateToken, requireRole(['admin'])];

// ==================== AUTH ROUTES ====================
router.post('/auth/login', AuthController.login);
router.post('/auth/register', authenticateToken, requireRole(['admin', 'tutor']), AuthController.register);

// ==================== USER ROUTES ====================
router.get('/users/me', authenticateToken, UserController.getCurrentUser);
router.put('/users/profile', authenticateToken, UserController.updateProfile);
router.put('/users/change-password', authenticateToken, UserController.changePassword);
router.put('/users/set-password', authenticateToken, UserController.setPassword);
router.put('/users/skip-password-change', authenticateToken, UserController.skipPasswordChange);

// ==================== COURSE ROUTES ====================
router.get('/courses', CourseController.getAllCourses);
router.get('/courses/:id', CourseController.getCourseById);
router.get('/courses/slug/:slug', CourseController.getCourseBySlug);
router.post('/courses/:id/enroll', authenticateToken, CourseController.enrollInCourse);

// ==================== STUDENT DASHBOARD ROUTES ====================
router.get('/student/courses', authenticateToken, requireRole(['student', 'tutor', 'admin']), StudentController.getStudentCourses);
router.get('/student/courses/progress', authenticateToken, requireRole(['student', 'admin']), StudentController.getProgress);
router.put('/student/courses/:enrollmentId/progress', authenticateToken, requireRole(['student']), StudentController.updateProgress);
router.post('/student/lessons/:lessonId/complete', authenticateToken, requireRole(['student']), StudentController.completeLesson);
router.delete('/student/courses/:enrollmentId/unenroll', authenticateToken, requireRole(['student']), StudentController.unenrollFromCourse);

// ==================== STUDENT LESSON ROUTES ====================
router.get('/student/lessons', authenticateToken, requireRole(['student', 'tutor', 'admin']), StudentController.getLessons);
router.post('/student/lessons', authenticateToken, requireRole(['tutor', 'admin']), StudentController.createLesson);
router.get('/student/lessons/:id', authenticateToken, requireRole(['student', 'tutor', 'admin']), StudentController.getLesson);
router.put('/student/lessons/:id', authenticateToken, requireRole(['tutor', 'admin']), StudentController.updateLesson);
router.delete('/student/lessons/:id', authenticateToken, requireRole(['tutor', 'admin']), StudentController.deleteLesson);

// ==================== STUDENT PAYMENT ROUTES ====================
router.get('/student/credit-balance', authenticateToken, requireRole(['student']), StudentController.getCreditBalance);
router.get('/student/is-locked', authenticateToken, requireRole(['student']), StudentController.isLocked);
router.get('/student/invoices', authenticateToken, requireRole(['student']), StudentController.getInvoices);
router.post('/student/pay/:invoiceId', authenticateToken, requireRole(['student']), MpesaController.initiatePayment);
router.get('/student/payment-status/:invoiceId', authenticateToken, requireRole(['student']), MpesaController.checkPaymentStatus);
router.get('/student/course-notes-access/:courseId', authenticateToken, requireRole(['student']), StudentController.checkNotesAccess);

// ==================== TUTOR DASHBOARD ROUTES ====================
router.get('/tutor/courses', authenticateToken, requireRole(['tutor', 'admin']), TutorController.getTutorCourses);
router.post('/tutor/courses', authenticateToken, requireTutor, TutorController.createCourse);
router.put('/tutor/courses/:id', authenticateToken, requireTutor, TutorController.updateCourse);
router.get('/tutor/courses/:courseId/lessons', authenticateToken, requireTutor, TutorController.getCourseLessons);
router.get('/tutor/transactions', authenticateToken, requireTutor, TutorController.getTransactions);

// Tutor Lesson Management
router.get('/tutor/lessons', authenticateToken, requireTutor, TutorController.getTutorLessons);
router.post('/tutor/lessons', authenticateToken, requireTutor, TutorController.createTutorLesson);
router.put('/tutor/lessons/:id', authenticateToken, requireTutor, TutorController.updateTutorLesson);
router.delete('/tutor/lessons/:id', authenticateToken, requireTutor, TutorController.deleteTutorLesson);

// Tutor Assignment Management
router.get('/tutor/assignments', authenticateToken, requireTutor, TutorController.getTutorAssignments);
router.post('/tutor/assignments', authenticateToken, requireTutor, TutorController.createTutorAssignment);
router.put('/tutor/assignments/:id', authenticateToken, requireTutor, TutorController.updateTutorAssignment);
router.delete('/tutor/assignments/:id', authenticateToken, requireTutor, TutorController.deleteTutorAssignment);

// Tutor Submission Management
router.get('/tutor/submissions', authenticateToken, requireTutor, TutorController.getTutorSubmissions);
router.put('/tutor/submissions/:id/grade', authenticateToken, requireTutor, TutorController.gradeSubmission);

// Tutor Notes Management
router.get('/tutor/notes', authenticateToken, requireTutor, TutorController.getTutorNotes);
router.post('/tutor/notes', authenticateToken, requireTutor, TutorController.createTutorNote);
router.put('/tutor/notes/:id', authenticateToken, requireTutor, TutorController.updateTutorNote);
router.delete('/tutor/notes/:id', authenticateToken, requireTutor, TutorController.deleteTutorNote);

// Tutor Enrollment Management
router.get('/tutor/enrollments', authenticateToken, requireTutor, TutorController.getTutorEnrollments);
router.post('/tutor/enrollments', authenticateToken, requireTutor, TutorController.createTutorEnrollment);
router.delete('/tutor/enrollments/:id', authenticateToken, requireTutor, TutorController.deleteTutorEnrollment);
router.get('/tutor/students', authenticateToken, requireTutor, TutorController.getTutorStudents);

// ==================== ADMIN DASHBOARD ROUTES ====================
router.get('/admin/dashboard/stats', authenticateToken, requireAdmin, AdminController.getDashboardStats);
router.get('/admin/courses', authenticateToken, requireAdmin, AdminController.getCourses);
router.post('/admin/courses', authenticateToken, requireAdmin, AdminController.createCourse);
router.put('/admin/courses/:id', authenticateToken, requireAdmin, AdminController.updateCourse);
router.delete('/admin/courses/:id', authenticateToken, requireAdmin, AdminController.deleteCourse);
router.get('/admin/enrollments', authenticateToken, requireAdmin, AdminController.getEnrollments);
router.post('/admin/enrollments', authenticateToken, requireAdmin, AdminController.createEnrollment);
router.get('/admin/students', authenticateToken, requireAdmin, AdminController.getStudents);
router.get('/admin/courses-list', authenticateToken, requireAdmin, AdminController.getCoursesList);
router.get('/admin/users', authenticateToken, requireAdmin, AdminController.getUsers);
router.post('/admin/users', authenticateToken, requireAdmin, AdminController.createUser);
router.put('/admin/users/:id', authenticateToken, requireAdmin, AdminController.updateUser);
router.delete('/admin/users/:id', authenticateToken, requireAdmin, AdminController.deleteUser);

// ==================== MPESA ROUTES ====================
router.post('/mpesa/callback', MpesaController.handleCallback);
router.post('/mpesa/initiate', authenticateToken, requireRole(['student']), MpesaController.initiatePayment);
router.get('/mpesa/status/:checkoutRequestId', authenticateToken, MpesaController.checkPaymentStatus);
router.get('/mpesa/config', MpesaController.getConfiguration);
router.post('/mpesa/simulate', authenticateToken, requireAdmin, MpesaController.simulateCallback);

// ==================== EMAIL DIAGNOSTIC ROUTES ====================
router.get('/admin/email-status', authenticateToken, requireAdmin, (req, res) => {
  const status = getEmailStatus();
  res.json(status);
});

router.post('/admin/test-email', authenticateToken, requireAdmin, async (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ error: 'Email address required' });
  }
  
  try {
    const result = await sendWelcomeEmail(email, 'testuser', 'TestPassword123');
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== DEBUG ROUTE (REMOVE AFTER FIX) ====================
router.get('/debug/check-user', async (req, res) => {
  const db = require('../config/database.js');
  const email = req.query.email || 'hymasindeian@gmail.com';
  
  try {
    const user = await db.getOne('SELECT id, email, is_active, is_locked, role_id FROM users WHERE email = ?', [email]);
    
    if (!user) {
      return res.json({ error: 'User not found', email });
    }
    
    const role = user.role_id ? await db.getOne('SELECT id, name FROM roles WHERE id = ?', [user.role_id]) : null;
    const tutorRole = await db.getOne('SELECT id, name FROM roles WHERE name = ?', ['tutor']);
    
    res.json({
      user: { id: user.id, email: user.email, is_active: user.is_active, is_locked: user.is_locked, role_id: user.role_id },
      userRole: role,
      tutorRoleExists: tutorRole
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Temporary: Activate user (REMOVE AFTER FIX)
router.get('/debug/activate-user', async (req, res) => {
  const db = require('../config/database.js');
  const email = req.query.email || 'hymasindeian@gmail.com';
  
  try {
    await db.query('UPDATE users SET is_active = 1 WHERE email = ?', [email]);
    res.json({ success: true, message: `User ${email} activated` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;