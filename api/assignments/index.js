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

// Create assignment
app.post('/', authenticateToken, requireRole(['tutor']), async (req, res) => {
  const { title, description, maxScore, lessonId } = req.body;

  try {
    // Check if lesson belongs to tutor's course
    const lesson = await prisma.lesson.findUnique({
      where: { id: parseInt(lessonId) },
      include: { course: true }
    });

    if (!lesson) {
      return res.status(404).json({ message: 'Lesson not found' });
    }

    if (lesson.course.tutorId !== req.user.userId) {
      return res.status(403).json({ message: 'Not authorized to create assignments for this lesson' });
    }

    const assignment = await prisma.assignment.create({
      data: {
        title,
        description,
        maxScore: maxScore || 100,
        lessonId: parseInt(lessonId)
      }
    });

    res.status(201).json(assignment);
  } catch (error) {
    console.error('Create assignment error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get single assignment
app.get('/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;

  try {
    const assignment = await prisma.assignment.findUnique({
      where: { id: parseInt(id) },
      include: {
        lesson: {
          include: {
            course: {
              select: { id: true, tutorId: true, enrollments: { select: { studentId: true } } }
            }
          }
        },
        submissions: {
          where: { studentId: req.user.userId },
          select: { id: true, grade: true, feedback: true, submittedAt: true }
        }
      }
    });

    if (!assignment) {
      return res.status(404).json({ message: 'Assignment not found' });
    }

    const isTutor = assignment.lesson.course.tutorId === req.user.userId;
    const isEnrolled = assignment.lesson.course.enrollments.some(e => e.studentId === req.user.userId);

    if (!isTutor && !isEnrolled) {
      return res.status(403).json({ message: 'Not authorized to view this assignment' });
    }

    res.json(assignment);
  } catch (error) {
    console.error('Get assignment error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Submit assignment
app.post('/:id/submit', authenticateToken, requireRole(['student']), async (req, res) => {
  const { id } = req.params;
  const { codeSubmission } = req.body;

  try {
    const assignment = await prisma.assignment.findUnique({
      where: { id: parseInt(id) },
      include: {
        lesson: {
          include: {
            course: {
              select: { enrollments: { select: { studentId: true } } }
            }
          }
        }
      }
    });

    if (!assignment) {
      return res.status(404).json({ message: 'Assignment not found' });
    }

    // Check if student is enrolled in the course
    const isEnrolled = assignment.lesson.course.enrollments.some(e => e.studentId === req.user.userId);
    if (!isEnrolled) {
      return res.status(403).json({ message: 'Not enrolled in this course' });
    }

    // Check if already submitted
    const existingSubmission = await prisma.submission.findFirst({
      where: {
        assignmentId: parseInt(id),
        studentId: req.user.userId
      }
    });

    if (existingSubmission) {
      return res.status(400).json({ message: 'Assignment already submitted' });
    }

    const submission = await prisma.submission.create({
      data: {
        assignmentId: parseInt(id),
        studentId: req.user.userId,
        codeSubmission
      }
    });

    res.status(201).json({ submission });
  } catch (error) {
    console.error('Submit assignment error:', error);
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
