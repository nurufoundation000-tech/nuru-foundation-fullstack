const express = require('express');
const router = express.Router();
const { authenticateToken, requireRole } = require('../middleware/auth');
const prisma = require('../config/database');

router.get('/profile', authenticateToken, (req, res) => {
  res.json({ user: req.user });
});

// Get all students (for tutors to enroll students)
router.get('/students', authenticateToken, requireRole(['tutor']), async (req, res) => {
  try {
    const students = await prisma.user.findMany({
      where: {
        role: {
          name: 'student'
        }
      },
      select: {
        id: true,
        username: true,
        fullName: true,
        email: true,
        profilePicUrl: true
      }
    });

    res.json(students);
  } catch (error) {
    console.error('Error fetching students:', error);
    res.status(500).json({ message: 'Failed to fetch students' });
  }
});

module.exports = router;
