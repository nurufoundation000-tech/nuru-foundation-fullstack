const express = require('express');
const router = express.Router();
const { authenticateToken, requireRole } = require('../middleware/auth');
const prisma = require('../config/database');

router.post('/actions', authenticateToken, requireRole(['admin']), async (req, res) => {
  const { actionType, description } = req.body;

  try {
    const action = await prisma.adminAction.create({
      data: {
        adminId: req.user.userId,
        actionType,
        description
      }
    });

    res.status(201).json(action);
  } catch (error) {
    console.error('Create admin action error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
