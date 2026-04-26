// controllers/courseController.js - Course Controller
import db from '../config/database.js';

export async function getAllCourses(req, res) {
  try {
    const courses = await db.query(`
      SELECT c.*, u.full_name as tutor_name, u.username as tutor_username,
             (SELECT COUNT(*) FROM enrollments WHERE course_id = c.id) as enrollments_count,
             (SELECT COUNT(*) FROM lessons WHERE course_id = c.id) as lessons_count
      FROM courses c
      JOIN users u ON c.tutor_id = u.id
      ORDER BY c.created_at DESC
    `);

    res.json({ success: true, data: courses });

  } catch (error) {
    console.error('Get courses error:', error);
    res.status(500).json({ error: 'Failed to load courses' });
  }
}

export async function getCourseById(req, res) {
  try {
    const courseId = parseInt(req.params.id);

    if (isNaN(courseId)) {
      return res.status(400).json({ error: 'Invalid course ID' });
    }

    const course = await db.getOne(`
      SELECT c.*, u.full_name as tutor_name, u.username as tutor_username, u.bio as tutor_bio
      FROM courses c
      JOIN users u ON c.tutor_id = u.id
      WHERE c.id = ?
    `, [courseId]);

    if (!course) {
      return res.status(404).json({ error: 'Course not found' });
    }

    const lessons = await db.query(`
      SELECT * FROM lessons WHERE course_id = ? ORDER BY order_index ASC
    `, [courseId]);

    res.json({
      success: true,
      data: { ...course, lessons }
    });

  } catch (error) {
    console.error('Get course error:', error);
    res.status(500).json({ error: 'Failed to load course' });
  }
}

export async function enrollInCourse(req, res) {
  try {
    const courseId = parseInt(req.params.id);

    if (isNaN(courseId)) {
      return res.status(400).json({ error: 'Invalid course ID' });
    }

    const course = await db.getOne('SELECT id FROM courses WHERE id = ?', [courseId]);

    if (!course) {
      return res.status(404).json({ error: 'Course not found' });
    }

    const existingEnrollment = await db.getOne(`
      SELECT id FROM enrollments WHERE student_id = ? AND course_id = ?
    `, [req.user.userId, courseId]);

    if (existingEnrollment) {
      return res.status(409).json({ error: 'Already enrolled in this course' });
    }

    const enrollmentId = await db.insert('enrollments', {
      student_id: req.user.userId,
      course_id: courseId,
      enrolled_at: new Date()
    });

    const enrollment = await db.getOne('SELECT * FROM enrollments WHERE id = ?', [enrollmentId]);

    res.status(201).json({
      success: true,
      data: enrollment,
      message: 'Successfully enrolled in course'
    });

  } catch (error) {
    console.error('Enroll error:', error);
    res.status(500).json({ error: 'Failed to enroll in course' });
  }
}

export default {
  getAllCourses,
  getCourseById,
  enrollInCourse
};