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

const CHUNK_SIZE = 50;

const VALID_TYPES = ['info', 'success', 'warning', 'error'];

async function createNotification(userId, title, body, type = 'info', link = null) {
  if (!VALID_TYPES.includes(type)) {
    console.warn('Invalid notification type:', type, '- defaulting to info');
    type = 'info';
  }
  try {
    await db.query(`
      INSERT INTO notifications (user_id, title, body, type, link) VALUES (?, ?, ?, ?, ?)
    `, [userId, title, body, type, link]);
    try { require('../lib/socket.js').emitToUser(userId, 'new-notification', { title, body, type }); } catch (e) { /* socket may not be initialized */ }
    return { success: true };
  } catch (error) {
    console.error('Create notification error:', error);
    return { success: false, error: error.message };
  }
}

async function createNotificationsForUsers(userIds, title, body, type = 'info', link = null) {
  if (!userIds || userIds.length === 0) return { success: true, count: 0 };
  if (!VALID_TYPES.includes(type)) {
    console.warn('Invalid notification type:', type, '- defaulting to info');
    type = 'info';
  }

  let inserted = 0;
  for (let i = 0; i < userIds.length; i += CHUNK_SIZE) {
    const chunk = userIds.slice(i, i + CHUNK_SIZE);
    const values = chunk.map(id => [id, title, body || null, type, link || null]);
    const placeholders = values.map(() => '(?, ?, ?, ?, ?)').join(', ');
    const flattened = values.flat();
    try {
      await db.query(`
        INSERT INTO notifications (user_id, title, body, type, link) VALUES ${placeholders}
      `, flattened);
      inserted += chunk.length;
      chunk.forEach(id => {
        try { require('../lib/socket.js').emitToUser(id, 'new-notification', { title, body, type }); } catch (e) { /* socket may not be initialized */ }
      });
    } catch (error) {
      console.error('Batch notification insert error:', error);
    }
  }

  return { success: true, count: inserted };
}

async function getUnreadCount(req, res) {
  try {
    const result = await db.getOne(`
      SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = 0
    `, [req.user.userId]);
    res.json({ count: result.count });
  } catch (error) {
    console.error('Get unread count error:', error);
    res.status(500).json({ error: 'Failed to get unread count' });
  }
}

async function bulkCreateNotifications(req, res) {
  try {
    const { userIds, role, title, body, type, link } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({ error: 'Title is required' });
    }

    let targetUserIds = userIds;

    if (role) {
      const roleRow = await db.getOne('SELECT id FROM roles WHERE name = ?', [role]);
      if (!roleRow) {
        return res.status(400).json({ error: 'Invalid role: ' + role });
      }
      const users = await db.query('SELECT id FROM users WHERE role_id = ? AND is_active = 1', [roleRow.id]);
      targetUserIds = users.map(u => u.id);
    }

    if (!targetUserIds || targetUserIds.length === 0) {
      return res.status(400).json({ error: 'No recipients specified' });
    }

    const safeType = VALID_TYPES.includes(type) ? type : 'info';

    const values = targetUserIds.map(id => [id, title, body || null, safeType, link || null]);
    const placeholders = values.map(() => '(?, ?, ?, ?, ?)').join(', ');
    const flattened = values.flat();

    await db.query(`
      INSERT INTO notifications (user_id, title, body, type, link) VALUES ${placeholders}
    `, flattened);

    res.json({ success: true, count: targetUserIds.length });
  } catch (error) {
    console.error('Bulk notification error:', error);
    res.status(500).json({ error: 'Failed to send notifications' });
  }
}

module.exports = { getNotifications, markAsRead, markAllAsRead, createNotification, createNotificationsForUsers, getUnreadCount, bulkCreateNotifications };