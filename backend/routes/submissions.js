const express = require('express');
const router = express.Router();
const { authenticateToken, requireRole } = require('../middleware/auth');
const prisma = require('../config/database');

// Get submissions for grading (tutors only)
router.get('/', authenticateToken, requireRole(['tutor']), async (req, res) => {
  try {
    const submissions = await prisma.submission.findMany({
      where: {
        assignment: {
          lesson: {
            course: {
              tutorId: req.user.userId
            }
          }
        }
      },
      include: {
        assignment: {
          select: { id: true, title: true, maxScore: true, lesson: { select: { title: true, course: { select: { title: true } } } } }
        },
        student: {
          select: { id: true, username: true, fullName: true }
        }
      },
      orderBy: { submittedAt: 'desc' }
    });

    res.json(submissions);
  } catch (error) {
    console.error('Get submissions error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Grade submission
router.put('/:id/grade', authenticateToken, requireRole(['tutor']), async (req, res) => {
  const { id } = req.params;
  const { grade, feedback } = req.body;

  try {
    const submission = await prisma.submission.findUnique({
      where: { id: parseInt(id) },
      include: {
        assignment: {
          include: {
            lesson: {
              include: {
                course: true
              }
            }
          }
        }
      }
    });

    if (!submission) {
      return res.status(404).json({ message: 'Submission not found' });
    }

    if (submission.assignment.lesson.course.tutorId !== req.user.userId) {
      return res.status(403).json({ message: 'Not authorized to grade this submission' });
    }

    const updatedSubmission = await prisma.submission.update({
      where: { id: parseInt(id) },
      data: {
        grade: parseInt(grade),
        feedback
      }
    });

    res.json(updatedSubmission);
  } catch (error) {
    console.error('Grade submission error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
