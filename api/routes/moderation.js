const express = require('express');
const router = express.Router();
const { authenticateToken, requireRole } = require('../middleware/auth');
const prisma = require('../config/database');

router.get('/logs', authenticateToken, requireRole(['moderator', 'admin']), async (req, res) => {
  try {
    const logs = await prisma.moderationLog.findMany({
      orderBy: { createdAt: 'desc' }
    });

    res.json(logs);
  } catch (error) {
    console.error('Get moderation logs error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
