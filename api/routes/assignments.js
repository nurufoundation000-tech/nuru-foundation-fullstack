const express = require('express');
const router = express.Router();
const { authenticateToken, requireRole } = require('../middleware/auth');
const prisma = require('../config/database');

// Create assignment
router.post('/', authenticateToken, requireRole(['tutor']), async (req, res) => {
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
router.get('/:id', authenticateToken, async (req, res) => {
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
router.post('/:id/submit', authenticateToken, requireRole(['student']), async (req, res) => {
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

module.exports = router;
