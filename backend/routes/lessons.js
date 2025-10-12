const express = require('express');
const router = express.Router();
const { authenticateToken, requireRole } = require('../middleware/auth');
const prisma = require('../config/database');

router.post('/', authenticateToken, requireRole(['tutor']), async (req, res) => {
  const { title, content, orderIndex, courseId } = req.body;

  try {
    // Check if course belongs to tutor
    const course = await prisma.course.findUnique({
      where: { id: parseInt(courseId) }
    });

    if (!course || course.tutorId !== req.user.userId) {
      return res.status(403).json({ message: 'Not authorized to create lessons for this course' });
    }

    const lesson = await prisma.lesson.create({
      data: {
        title,
        content,
        orderIndex,
        courseId: parseInt(courseId)
      }
    });

    res.status(201).json(lesson);
  } catch (error) {
    console.error('Create lesson error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
