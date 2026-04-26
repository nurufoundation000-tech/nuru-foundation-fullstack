// controllers/tutorController.js - Tutor Dashboard Controller
import db from '../config/database.js';

export async function getTutorCourses(req, res) {
  try {
    const courses = await db.query(`
      SELECT c.*,
             (SELECT COUNT(*) FROM enrollments WHERE course_id = c.id) as enrollments_count,
             (SELECT COUNT(*) FROM lessons WHERE course_id = c.id) as lessons_count
      FROM courses c
      WHERE c.tutor_id = ?
      ORDER BY c.created_at DESC
    `, [req.user.userId]);

    res.json({ success: true, data: courses });

  } catch (error) {
    console.error('Get tutor courses error:', error);
    res.status(500).json({ error: 'Failed to load tutor courses' });
  }
}

export async function createCourse(req, res) {
  try {
    const { title, description, category, level, isPublished } = req.body;

    if (!title || !description || !category) {
      return res.status(400).json({ error: 'Title, description, and category are required' });
    }

    const courseId = await db.insert('courses', {
      title,
      description,
      category,
      level: level || 'beginner',
      is_published: isPublished || false,
      tutor_id: req.user.userId,
      created_at: new Date()
    });

    const course = await db.getOne('SELECT * FROM courses WHERE id = ?', [courseId]);

    res.status(201).json({
      success: true,
      data: course,
      message: 'Course created successfully'
    });

  } catch (error) {
    console.error('Create course error:', error);
    res.status(500).json({ error: 'Failed to create course' });
  }
}

export async function updateCourse(req, res) {
  try {
    const courseId = parseInt(req.params.id);

    if (isNaN(courseId)) {
      return res.status(400).json({ error: 'Invalid course ID' });
    }

    const { title, description, category, level, isPublished } = req.body;

    const existingCourse = await db.getOne(`
      SELECT id FROM courses WHERE id = ? AND tutor_id = ?
    `, [courseId, req.user.userId]);

    if (!existingCourse) {
      return res.status(404).json({ error: 'Course not found or access denied' });
    }

    const updateData = { updated_at: new Date() };
    if (title) updateData.title = title;
    if (description) updateData.description = description;
    if (category) updateData.category = category;
    if (level) updateData.level = level;
    if (isPublished !== undefined) updateData.is_published = isPublished;

    await db.update('courses', courseId, updateData);

    const course = await db.getOne('SELECT * FROM courses WHERE id = ?', [courseId]);

    res.json({ success: true, data: course, message: 'Course updated successfully' });

  } catch (error) {
    console.error('Update course error:', error);
    res.status(500).json({ error: 'Failed to update course' });
  }
}

export async function getCourseLessons(req, res) {
  try {
    const courseId = parseInt(req.params.courseId);

    if (isNaN(courseId)) {
      return res.status(400).json({ error: 'Invalid course ID' });
    }

    const course = await db.getOne(`
      SELECT id FROM courses WHERE id = ? AND tutor_id = ?
    `, [courseId, req.user.userId]);

    if (!course) {
      return res.status(404).json({ error: 'Course not found or access denied' });
    }

    const lessons = await db.query(`
      SELECT * FROM lessons WHERE course_id = ? ORDER BY order_index ASC
    `, [courseId]);

    res.json({ success: true, data: lessons });

  } catch (error) {
    console.error('Get lessons error:', error);
    res.status(500).json({ error: 'Failed to load lessons' });
  }
}

export async function getTransactions(req, res) {
  try {
    const tutorCourses = await db.query(`
      SELECT id FROM courses WHERE tutor_id = ?
    `, [req.user.userId]);

    const courseIds = tutorCourses.map(c => c.id);

    if (courseIds.length === 0) {
      return res.json({ success: true, data: [] });
    }

    const placeholders = courseIds.map(() => '?').join(', ');
    const transactions = await db.query(`
      SELECT i.*, u.full_name, u.username, u.email, c.title as course_title, c.category
      FROM invoices i
      JOIN users u ON i.student_id = u.id
      JOIN courses c ON i.course_id = c.id
      WHERE i.status = 'paid' AND i.course_id IN (${placeholders})
      ORDER BY i.paid_at DESC
    `, courseIds);

    res.json({ success: true, data: transactions });
  } catch (error) {
    console.error('Get tutor transactions error:', error);
    res.status(500).json({ error: 'Failed to get transactions' });
  }
}

export default {
  getTutorCourses,
  createCourse,
  updateCourse,
  getCourseLessons,
  getTransactions
};