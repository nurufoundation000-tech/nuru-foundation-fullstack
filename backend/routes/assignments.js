const express = require('express');
const router = express.Router();
const { authenticateToken, requireRole } = require('../middleware/auth');
const prisma = require('../config/database');

router.post('/:id/submit', authenticateToken, requireRole(['student']), async (req, res) => {
  const { id } = req.params;
  const { codeSubmission } = req.body;

  try {
    const assignment = await prisma.assignment.findUnique({
      where: { id: parseInt(id) }
    });

    if (!assignment) {
      return res.status(404).json({ message: 'Assignment not found' });
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
