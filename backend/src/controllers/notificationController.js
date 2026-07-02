const db = require('../config/database.js');

async function getNotifications(req, res) {
  try {
    const notifications = await db.query(`
      SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50
    `, [req.user.userId]);

    const unreadCount = await db.getOne(`
      SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = 0
    `, [req.user.userId]);

    res.json({ success: true, data: notifications, unreadCount: unreadCount.count });
  } catch (error) {
    console.error('Get notifications error:', error);
    res.status(500).json({ error: 'Failed to load notifications' });
  }
}

async function markAsRead(req, res) {
  try {
    const notificationId = parseInt(req.params.id);
    if (isNaN(notificationId)) {
      return res.status(400).json({ error: 'Invalid notification ID' });
    }

    await db.query('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?', [notificationId, req.user.userId]);
    res.json({ success: true, message: 'Notification marked as read' });
  } catch (error) {
    console.error('Mark read error:', error);
    res.status(500).json({ error: 'Failed to update notification' });
  }
}

async function markAllAsRead(req, res) {
  try {
    await db.query('UPDATE notifications SET is_read = 1 WHERE user_id = ?', [req.user.userId]);
    res.json({ success: true, message: 'All notifications marked as read' });
  } catch (error) {
    console.error('Mark all read error:', error);
    res.status(500).json({ error: 'Failed to update notifications' });
  }
}

async function createNotification(userId, title, body, type = 'info', link = null) {
  try {
    await db.query(`
      INSERT INTO notifications (user_id, title, body, type, link) VALUES (?, ?, ?, ?, ?)
    `, [userId, title, body, type, link]);
  } catch (error) {
    console.error('Create notification error:', error);
  }
}

module.exports = { getNotifications, markAsRead, markAllAsRead, createNotification };