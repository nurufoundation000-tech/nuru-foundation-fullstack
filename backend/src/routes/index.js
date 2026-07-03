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
const CohortController = require('../controllers/cohortController.js');
const UploadController = require('../controllers/uploadController.js');
const SessionController = require('../controllers/sessionController.js');
const ForumController = require('../controllers/forumController.js');
const NotificationController = require('../controllers/notificationController.js');
const { sendWelcomeEmail, getEmailStatus } = require('../lib/email.js');
const { authenticateToken, requireRole } = require('../middleware/auth.js');
const { generateInitialInvoices, checkAndUpdateInvoiceStatuses, isStudentLocked } = require('../lib/invoices.js');

const requireTutor = [authenticateToken, requireRole(['tutor'])];
const requireAdmin = [authenticateToken, requireRole(['admin'])];

// ==================== AUTH ROUTES ====================
router.post('/auth/login', AuthController.login);
router.post('/auth/register', AuthController.register);
router.get('/auth/verify', authenticateToken, AuthController.verify);

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

// ==================== STUDENT NOTES ROUTES ====================
router.get('/student/notes/:courseId', authenticateToken, requireRole(['student', 'tutor', 'admin']), StudentController.getCourseNotes);
router.post('/student/notes/:noteId/mark-read', authenticateToken, requireRole(['student']), StudentController.markNoteRead);

// ==================== STUDENT PAYMENT ROUTES ====================
router.get('/student/credit-balance', authenticateToken, requireRole(['student']), StudentController.getCreditBalance);
router.get('/student/is-locked', authenticateToken, requireRole(['student']), StudentController.isLocked);
router.get('/student/invoices', authenticateToken, requireRole(['student']), StudentController.getInvoices);
router.post('/student/pay/:invoiceId', authenticateToken, requireRole(['student']), MpesaController.initiatePayment);
router.get('/student/payment-status/:invoiceId', authenticateToken, requireRole(['student']), MpesaController.checkPaymentStatus);
router.get('/student/course-notes-access/:courseId', authenticateToken, requireRole(['student']), StudentController.checkNotesAccess);

// ==================== TUTOR DASHBOARD ROUTES ====================
router.get('/tutor/courses', authenticateToken, requireRole(['tutor', 'admin']), TutorController.getTutorCourses);
router.get('/tutor/courses/:courseId/lessons', authenticateToken, requireTutor, TutorController.getCourseLessons);
router.get('/tutor/transactions', authenticateToken, requireTutor, TutorController.getTransactions);

// Tutor Lesson Management
router.get('/tutor/lessons', authenticateToken, requireTutor, TutorController.getTutorLessons);
router.post('/tutor/lessons', authenticateToken, requireTutor, TutorController.createTutorLesson);
router.put('/tutor/lessons/:id', authenticateToken, requireTutor, TutorController.updateTutorLesson);
router.delete('/tutor/lessons/:id', authenticateToken, requireTutor, TutorController.deleteTutorLesson);
router.put('/tutor/lessons/reorder', authenticateToken, requireTutor, TutorController.reorderLessons);

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
router.put('/tutor/notes/reorder', authenticateToken, requireTutor, TutorController.reorderNotes);

// Tutor Enrollment Management
router.get('/tutor/enrollments', authenticateToken, requireTutor, TutorController.getTutorEnrollments);
router.post('/tutor/enrollments', authenticateToken, requireTutor, TutorController.createTutorEnrollment);
router.delete('/tutor/enrollments/:id', authenticateToken, requireTutor, TutorController.deleteTutorEnrollment);
router.get('/tutor/students', authenticateToken, requireTutor, TutorController.getTutorStudents);
router.get('/tutor/courses/:courseId/notes', authenticateToken, requireTutor, TutorController.getCourseNotes);

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
router.get('/admin/tutors', authenticateToken, requireAdmin, AdminController.getTutors);
router.get('/admin/users', authenticateToken, requireAdmin, AdminController.getUsers);
router.post('/admin/users', authenticateToken, requireAdmin, AdminController.createUser);
router.put('/admin/users/:id', authenticateToken, requireAdmin, AdminController.updateUser);
router.delete('/admin/users/:id', authenticateToken, requireAdmin, AdminController.deleteUser);

// Admin Analytics
router.get('/admin/analytics', authenticateToken, requireAdmin, AdminController.getAnalytics);

// Admin Settings
router.get('/admin/settings', authenticateToken, requireAdmin, AdminController.getSettings);
router.put('/admin/settings', authenticateToken, requireAdmin, AdminController.updateSettings);

// Admin Course Pricing
router.get('/admin/course-pricing', authenticateToken, requireAdmin, AdminController.getCoursePricing);
router.post('/admin/course-pricing', authenticateToken, requireAdmin, AdminController.createOrUpdatePricing);

// Admin Global Settings
router.get('/admin/global-settings', authenticateToken, requireAdmin, AdminController.getGlobalSettings);
router.post('/admin/global-settings', authenticateToken, requireAdmin, AdminController.updateGlobalSettings);

// Admin Transactions
router.get('/admin/transactions', authenticateToken, requireAdmin, AdminController.getAdminTransactions);

// Admin Invoices
router.get('/admin/invoices', authenticateToken, requireAdmin, AdminController.getAdminInvoices);
router.post('/admin/invoices/:id/unlock', authenticateToken, requireAdmin, AdminController.unlockInvoice);

// Admin Enrollment Edit/Delete
router.put('/admin/enrollments/:id', authenticateToken, requireAdmin, AdminController.updateEnrollment);
router.delete('/admin/enrollments/:id', authenticateToken, requireAdmin, AdminController.adminDeleteEnrollment);

// Student Installment Schedule
router.get('/student/installments/:courseId', authenticateToken, requireRole(['student']), AdminController.getInstallmentSchedule);

// ==================== COHORT MANAGEMENT ROUTES ====================
router.get('/admin/cohorts', authenticateToken, requireAdmin, CohortController.getCohorts);
router.get('/admin/cohorts/:id', authenticateToken, requireAdmin, CohortController.getCohort);
router.post('/admin/cohorts', authenticateToken, requireAdmin, CohortController.createCohort);
router.put('/admin/cohorts/:id', authenticateToken, requireAdmin, CohortController.updateCohort);
router.delete('/admin/cohorts/:id', authenticateToken, requireAdmin, CohortController.deleteCohort);
router.post('/admin/cohorts/:id/students', authenticateToken, requireAdmin, CohortController.addStudentToCohort);
router.delete('/admin/cohorts/:id/students/:studentId', authenticateToken, requireAdmin, CohortController.removeStudentFromCohort);
router.get('/admin/cohorts/:id/available-students', authenticateToken, requireAdmin, CohortController.getAvailableStudents);

// ==================== MPESA ROUTES ====================
router.post('/mpesa/callback', MpesaController.handleCallback);
router.post('/mpesa/initiate', authenticateToken, requireRole(['student']), MpesaController.initiatePayment);
router.get('/mpesa/status/:checkoutRequestId', authenticateToken, requireRole(['student']), MpesaController.checkPaymentStatus);
router.get('/mpesa/config', authenticateToken, requireAdmin, MpesaController.getConfiguration);
router.post('/mpesa/simulate', authenticateToken, requireAdmin, MpesaController.simulateCallback);

// ==================== CRON WEBHOOK ROUTES (for external cron-job.org) ====================
router.get('/cron/generate-monthly-invoices', async (req, res) => {
  try {
    const token = req.query.token || req.headers['x-cron-token'];
    if (token !== process.env.CRON_SECRET) {
      return res.status(401).json({ error: 'Invalid token' });
    }
    await generateMonthlyInvoices();
    await checkAndUpdateInvoiceStatuses();
    res.json({ success: true, message: 'Monthly invoices generated and statuses updated' });
  } catch (error) {
    console.error('Cron error:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/cron/check-overdue', async (req, res) => {
  try {
    const token = req.query.token || req.headers['x-cron-token'];
    if (token !== process.env.CRON_SECRET) {
      return res.status(401).json({ error: 'Invalid token' });
    }
    await checkAndUpdateInvoiceStatuses();
    res.json({ success: true, message: 'Overdue invoices checked and locked' });
  } catch (error) {
    console.error('Cron error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==================== RECEIPT ROUTES ====================
router.get('/receipt/:invoiceId', async (req, res) => {
  try {
    const invoiceId = parseInt(req.params.invoiceId);
    if (isNaN(invoiceId)) {
      return res.status(400).send('Invalid invoice ID');
    }

    const invoice = await db.getOne(`
      SELECT i.*, u.full_name, u.email, u.username, c.title as course_title
      FROM invoices i
      JOIN users u ON i.student_id = u.id
      JOIN courses c ON i.course_id = c.id
      WHERE i.id = ?
    `, [invoiceId]);

    if (!invoice) {
      return res.status(404).send('Invoice not found');
    }

    const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Receipt - Nuru Foundation</title>
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;600;700&display=swap" rel="stylesheet">
<style>
* { margin:0; padding:0; box-sizing:border-box; }
body { font-family:'Poppins',sans-serif; background:#f8f9fa; padding:40px; display:flex; justify-content:center; }
.receipt { max-width:600px; width:100%; background:white; border-radius:15px; padding:40px; box-shadow:0 10px 40px rgba(0,0,0,0.1); }
.header { text-align:center; margin-bottom:30px; padding-bottom:20px; border-bottom:2px solid #27ae60; }
.header h1 { color:#27ae60; font-size:1.5rem; margin-bottom:5px; }
.header p { color:#6c757d; font-size:0.9rem; }
.receipt-title { text-align:center; margin-bottom:30px; }
.receipt-title h2 { color:#2c3e50; font-size:1.2rem; }
.receipt-table { width:100%; border-collapse:collapse; }
.receipt-table td { padding:10px 12px; border-bottom:1px solid #eee; }
.receipt-table td:first-child { font-weight:600; color:#6c757d; width:120px; }
.receipt-table td:last-child { color:#2c3e50; }
.total-row td { font-weight:700; font-size:1.1rem; border-top:2px solid #27ae60; border-bottom:none; padding-top:15px; }
.total-row td:last-child { color:#27ae60; }
.status-badge { display:inline-block; padding:4px 12px; border-radius:12px; font-size:0.85rem; font-weight:600; }
.status-badge.paid { background:#d4edda; color:#155724; }
.status-badge.pending { background:#fef3cd; color:#856404; }
.footer { text-align:center; margin-top:30px; padding-top:20px; border-top:1px solid #eee; font-size:0.8rem; color:#6c757d; }
@media print { body { padding:0; } .receipt { box-shadow:none; } }
</style></head>
<body>
<div class="receipt">
<div class="header"><h1>NURU Foundation</h1><p>Payment Receipt</p></div>
<div class="receipt-title"><h2>${invoice.status === 'paid' ? 'Payment Confirmed' : 'Invoice'}</h2></div>
<table class="receipt-table">
<tr><td>Invoice #</td><td>${invoice.id}</td></tr>
<tr><td>Student</td><td>${invoice.full_name} (${invoice.email})</td></tr>
<tr><td>Course</td><td>${invoice.course_title}</td></tr>
<tr><td>Type</td><td>${invoice.type === 'initial' ? 'Deposit' : invoice.type === 'monthly' ? 'Monthly Installment' : invoice.type}</td></tr>
${invoice.month_number ? '<tr><td>Month</td><td>' + invoice.month_number + '</td></tr>' : ''}
<tr><td>Amount</td><td>KES ${parseFloat(invoice.amount).toLocaleString()}</td></tr>
<tr><td>Status</td><td><span class="status-badge ${invoice.status}">${invoice.status.toUpperCase()}</span></td></tr>
<tr><td>Date</td><td>${invoice.paid_at ? new Date(invoice.paid_at).toLocaleDateString() : new Date(invoice.created_at).toLocaleDateString()}</td></tr>
${invoice.mpesa_receipt ? '<tr><td>M-Pesa Ref</td><td>' + invoice.mpesa_receipt + '</td></tr>' : ''}
${invoice.transaction_id ? '<tr><td>Trans. ID</td><td>' + invoice.transaction_id + '</td></tr>' : ''}
<tr class="total-row"><td>Total Paid</td><td>KES ${parseFloat(invoice.amount).toLocaleString()}</td></tr>
</table>
<div class="footer"><p>Nuru Foundation — Empowering Through Education</p><p>Thank you for your payment!</p></div>
</div>
<script>window.print();</script></body></html>`;

    res.send(html);
  } catch (error) {
    console.error('Receipt error:', error);
    res.status(500).send('Error generating receipt');
  }
});

// ==================== STUDENT ASSIGNMENT ROUTES ====================
router.get('/student/assignments', authenticateToken, requireRole(['student']), StudentController.getStudentAssignments);
router.get('/assignments/:id', authenticateToken, requireRole(['student']), StudentController.getAssignment);
router.post('/assignments/:id/submit', authenticateToken, requireRole(['student']), StudentController.submitAssignment);

// ==================== FILE UPLOAD ROUTES ====================
router.post('/upload/image', authenticateToken, requireRole(['tutor', 'admin']), UploadController.upload.single('file'), UploadController.uploadImage);
router.post('/upload/file', authenticateToken, requireRole(['tutor', 'admin']), UploadController.upload.single('file'), UploadController.uploadFile);

// ==================== LIVE SESSION ROUTES ====================
router.get('/sessions/upcoming', authenticateToken, SessionController.getUpcomingSessions);
router.get('/sessions/course/:courseId', authenticateToken, SessionController.getCourseSessions);
router.post('/sessions', authenticateToken, requireRole(['tutor', 'admin']), SessionController.createSession);
router.put('/sessions/:id', authenticateToken, requireRole(['tutor', 'admin']), SessionController.updateSession);
router.delete('/sessions/:id', authenticateToken, requireRole(['tutor', 'admin']), SessionController.deleteSession);
router.get('/tutor/sessions', authenticateToken, requireRole(['tutor', 'admin']), SessionController.getTutorSessions);

// ==================== FORUM ROUTES ====================
router.get('/forum/course/:courseId', authenticateToken, ForumController.getCoursePosts);
router.get('/forum/posts/:id', authenticateToken, ForumController.getPost);
router.post('/forum/posts', authenticateToken, ForumController.createPost);
router.post('/forum/posts/:postId/comments', authenticateToken, ForumController.createComment);
router.delete('/forum/posts/:id', authenticateToken, ForumController.deletePost);

// ==================== NOTIFICATION ROUTES ====================
router.get('/notifications', authenticateToken, NotificationController.getNotifications);
router.put('/notifications/:id/read', authenticateToken, NotificationController.markAsRead);
router.put('/notifications/read-all', authenticateToken, NotificationController.markAllAsRead);

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

module.exports = router;





