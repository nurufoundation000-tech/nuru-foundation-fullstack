// routes/index.js - Main API Routes
import express from 'express';
const router = express.Router();

import AuthController from '../controllers/authController.js';
import UserController from '../controllers/userController.js';
import CourseController from '../controllers/courseController.js';
import StudentController from '../controllers/studentController.js';
import TutorController from '../controllers/tutorController.js';
import AdminController from '../controllers/adminController.js';
import MpesaController from '../controllers/mpesaController.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { generateInitialInvoices, checkAndUpdateInvoiceStatuses, isStudentLocked } from '../lib/invoices.js';

const requireTutor = [authenticateToken, requireRole(['tutor'])];
const requireAdmin = [authenticateToken, requireRole(['admin'])];

// ==================== AUTH ROUTES ====================
router.post('/auth/login', AuthController.login);
router.post('/auth/register', AuthController.register);

// ==================== USER ROUTES ====================
router.get('/users/me', authenticateToken, UserController.getCurrentUser);
router.put('/users/profile', authenticateToken, UserController.updateProfile);
router.put('/users/change-password', authenticateToken, UserController.changePassword);
router.put('/users/set-password', authenticateToken, UserController.setPassword);
router.put('/users/skip-password-change', authenticateToken, UserController.skipPasswordChange);

// ==================== COURSE ROUTES ====================
router.get('/courses', CourseController.getAllCourses);
router.get('/courses/:id', CourseController.getCourseById);
router.post('/courses/:id/enroll', authenticateToken, CourseController.enrollInCourse);

// ==================== STUDENT DASHBOARD ROUTES ====================
router.get('/student/courses', authenticateToken, requireRole(['student', 'tutor', 'admin']), StudentController.getStudentCourses);
router.get('/courses/progress', authenticateToken, requireRole(['student', 'admin']), StudentController.getProgress);
router.post('/lessons/:lessonId/complete', authenticateToken, requireRole(['student']), StudentController.completeLesson);
router.delete('/student/courses/:enrollmentId/unenroll', authenticateToken, requireRole(['student']), StudentController.unenrollFromCourse);

// ==================== TUTOR DASHBOARD ROUTES ====================
router.get('/tutor/courses', authenticateToken, requireRole(['tutor', 'admin']), TutorController.getTutorCourses);
router.post('/tutor/courses', authenticateToken, requireTutor, TutorController.createCourse);
router.put('/tutor/courses/:id', authenticateToken, requireTutor, TutorController.updateCourse);
router.get('/tutor/courses/:courseId/lessons', authenticateToken, requireTutor, TutorController.getCourseLessons);
router.get('/tutor/transactions', authenticateToken, requireTutor, TutorController.getTransactions);

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

// ==================== MPESA ROUTES ====================
// Public callback endpoint (no auth required)
router.post('/mpesa/callback', MpesaController.handleCallback);

// Protected M-Pesa endpoints
router.post('/mpesa/initiate', authenticateToken, requireRole(['student']), MpesaController.initiatePayment);
router.get('/mpesa/status/:checkoutRequestId', authenticateToken, MpesaController.checkPaymentStatus);
router.get('/mpesa/config', MpesaController.getConfiguration);

// Admin simulation endpoint (for testing)
router.post('/mpesa/simulate', authenticateToken, requireAdmin, MpesaController.simulateCallback);

export default router;