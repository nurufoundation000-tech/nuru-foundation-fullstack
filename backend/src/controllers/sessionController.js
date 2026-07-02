const db = require('../config/database.js');

async function getUpcomingSessions(req, res) {
  try {
    const studentId = req.user.userId;
    const sessions = await db.query(`
      SELECT ls.*, c.title as course_title
      FROM live_sessions ls
      JOIN courses c ON ls.course_id = c.id
      WHERE ls.session_date >= CURDATE()
      ORDER BY ls.session_date ASC, ls.session_time ASC
      LIMIT 50
    `);

    res.json({ success: true, data: sessions });
  } catch (error) {
    console.error('Get upcoming sessions error:', error);
    res.status(500).json({ error: 'Failed to load sessions' });
  }
}

async function getCourseSessions(req, res) {
  try {
    const courseId = parseInt(req.params.courseId);
    if (isNaN(courseId)) {
      return res.status(400).json({ error: 'Invalid course ID' });
    }

    const sessions = await db.query(`
      SELECT ls.*, l.title as lesson_title
      FROM live_sessions ls
      LEFT JOIN lessons l ON ls.lesson_id = l.id
      WHERE ls.course_id = ?
      ORDER BY ls.session_date DESC, ls.session_time DESC
    `, [courseId]);

    res.json({ success: true, data: sessions });
  } catch (error) {
    console.error('Get course sessions error:', error);
    res.status(500).json({ error: 'Failed to load sessions' });
  }
}

async function createSession(req, res) {
  try {
    const { courseId, lessonId, title, description, meetingLink, sessionDate, sessionTime, durationMinutes } = req.body;

    if (!courseId || !title || !meetingLink || !sessionDate || !sessionTime) {
      return res.status(400).json({ error: 'Missing required fields: courseId, title, meetingLink, sessionDate, sessionTime' });
    }

    const result = await db.query(`
      INSERT INTO live_sessions (course_id, lesson_id, title, description, meeting_link, session_date, session_time, duration_minutes, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [courseId, lessonId || null, title, description || null, meetingLink, sessionDate, sessionTime, durationMinutes || 60, req.user.userId]);

    res.status(201).json({ success: true, id: result.insertId, message: 'Session created' });
  } catch (error) {
    console.error('Create session error:', error);
    res.status(500).json({ error: 'Failed to create session' });
  }
}

async function updateSession(req, res) {
  try {
    const sessionId = parseInt(req.params.id);
    if (isNaN(sessionId)) {
      return res.status(400).json({ error: 'Invalid session ID' });
    }

    const { title, description, meetingLink, sessionDate, sessionTime, durationMinutes } = req.body;
    await db.query(`
      UPDATE live_sessions SET title = ?, description = ?, meeting_link = ?, session_date = ?, session_time = ?, duration_minutes = ? WHERE id = ?
    `, [title, description, meetingLink, sessionDate, sessionTime, durationMinutes, sessionId]);

    res.json({ success: true, message: 'Session updated' });
  } catch (error) {
    console.error('Update session error:', error);
    res.status(500).json({ error: 'Failed to update session' });
  }
}

async function deleteSession(req, res) {
  try {
    const sessionId = parseInt(req.params.id);
    if (isNaN(sessionId)) {
      return res.status(400).json({ error: 'Invalid session ID' });
    }

    await db.query('DELETE FROM live_sessions WHERE id = ?', [sessionId]);
    res.json({ success: true, message: 'Session deleted' });
  } catch (error) {
    console.error('Delete session error:', error);
    res.status(500).json({ error: 'Failed to delete session' });
  }
}

async function getTutorSessions(req, res) {
  try {
    const tutorId = req.user.userId;
    const sessions = await db.query(`
      SELECT ls.*, c.title as course_title
      FROM live_sessions ls
      JOIN courses c ON ls.course_id = c.id
      WHERE ls.created_by = ? OR c.tutor_id = ?
      ORDER BY ls.session_date DESC, ls.session_time DESC
    `, [tutorId, tutorId]);

    res.json({ success: true, data: sessions });
  } catch (error) {
    console.error('Get tutor sessions error:', error);
    res.status(500).json({ error: 'Failed to load sessions' });
  }
}

module.exports = { getUpcomingSessions, getCourseSessions, createSession, updateSession, deleteSession, getTutorSessions };