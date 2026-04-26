// controllers/studentController.js - Student Dashboard Controller
import db from '../config/database.js';

export async function getStudentCourses(req, res) {
  try {
    const enrollments = await db.query(`
      SELECT e.*, c.title, c.description, c.category,
             t.full_name as tutor_name, t.username as tutor_username,
             (SELECT COUNT(*) FROM lessons WHERE course_id = c.id) as total_lessons,
             (SELECT COUNT(*) FROM lesson_progress lp 
              JOIN lessons l ON lp.lesson_id = l.id 
              WHERE lp.enrollment_id = e.id AND lp.is_completed = 1) as completed_lessons
      FROM enrollments e
      JOIN courses c ON e.course_id = c.id
      JOIN users t ON c.tutor_id = t.id
      WHERE e.student_id = ?
      ORDER BY e.enrolled_at DESC
    `, [req.user.userId]);

    const progressData = enrollments.map(enrollment => {
      const totalLessons = enrollment.total_lessons || 0;
      const completedLessons = enrollment.completed_lessons || 0;
      const progress = totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0;

      return {
        id: enrollment.id,
        enrolledAt: enrollment.enrolled_at,
        progress,
        completedLessons,
        totalLessons,
        course: {
          id: enrollment.course_id,
          title: enrollment.title,
          description: enrollment.description,
          category: enrollment.category,
          tutor: { fullName: enrollment.tutor_name, username: enrollment.tutor_username }
        }
      };
    });

    res.json({ success: true, data: progressData });

  } catch (error) {
    console.error('Get student courses error:', error);
    res.status(500).json({ error: 'Failed to load student courses' });
  }
}

export async function getProgress(req, res) {
  try {
    const enrollments = await db.query(`
      SELECT e.*, c.title, c.description, c.category,
             t.full_name as tutor_name, t.username as tutor_username,
             (SELECT COUNT(*) FROM lessons WHERE course_id = c.id) as total_lessons,
             (SELECT COUNT(*) FROM lesson_progress lp 
              JOIN lessons l ON lp.lesson_id = l.id 
              WHERE lp.enrollment_id = e.id AND lp.is_completed = 1) as completed_lessons
      FROM enrollments e
      JOIN courses c ON e.course_id = c.id
      JOIN users t ON c.tutor_id = t.id
      WHERE e.student_id = ?
      ORDER BY e.enrolled_at DESC
    `, [req.user.userId]);

    const progressData = enrollments.map(enrollment => {
      const totalLessons = enrollment.total_lessons || 0;
      const completedLessons = enrollment.completed_lessons || 0;
      const progress = totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0;

      return {
        id: enrollment.id,
        progress,
        completedLessons,
        totalLessons,
        course: {
          id: enrollment.course_id,
          title: enrollment.title,
          category: enrollment.category,
          tutor: { fullName: enrollment.tutor_name, username: enrollment.tutor_username }
        }
      };
    });

    res.json({ success: true, data: progressData });

  } catch (error) {
    console.error('Get progress error:', error);
    res.status(500).json({ error: 'Failed to load progress data' });
  }
}

export async function completeLesson(req, res) {
  try {
    const lessonId = parseInt(req.params.lessonId);

    if (isNaN(lessonId)) {
      return res.status(400).json({ error: 'Invalid lesson ID' });
    }

    const lesson = await db.getOne(`
      SELECT l.*, c.id as course_id 
      FROM lessons l
      JOIN courses c ON l.course_id = c.id
      WHERE l.id = ?
    `, [lessonId]);

    if (!lesson) {
      return res.status(404).json({ error: 'Lesson not found' });
    }

    const enrollment = await db.getOne(`
      SELECT id FROM enrollments 
      WHERE student_id = ? AND course_id = ?
    `, [req.user.userId, lesson.course_id]);

    if (!enrollment) {
      return res.status(403).json({ error: 'You are not enrolled in this course' });
    }

    const alreadyCompleted = await db.getOne(`
      SELECT id FROM lesson_progress 
      WHERE enrollment_id = ? AND lesson_id = ?
    `, [enrollment.id, lessonId]);

    if (alreadyCompleted) {
      return res.status(409).json({ error: 'Lesson already completed' });
    }

    await db.insert('lesson_progress', {
      enrollment_id: enrollment.id,
      lesson_id: lessonId,
      is_completed: true,
      completed_at: new Date()
    });

    res.json({ success: true, message: 'Lesson marked as completed' });

  } catch (error) {
    console.error('Complete lesson error:', error);
    res.status(500).json({ error: 'Failed to mark lesson as completed' });
  }
}

export async function unenrollFromCourse(req, res) {
  try {
    const enrollmentId = parseInt(req.params.enrollmentId);

    if (isNaN(enrollmentId)) {
      return res.status(400).json({ error: 'Invalid enrollment ID' });
    }

    const enrollment = await db.getOne(`
      SELECT id FROM enrollments 
      WHERE id = ? AND student_id = ?
    `, [enrollmentId, req.user.userId]);

    if (!enrollment) {
      return res.status(404).json({ error: 'Enrollment not found' });
    }

    await db.query('DELETE FROM lesson_progress WHERE enrollment_id = ?', [enrollmentId]);
    await db.query('DELETE FROM enrollments WHERE id = ?', [enrollmentId]);

    res.json({ success: true, message: 'Successfully unenrolled from course' });

  } catch (error) {
    console.error('Unenroll error:', error);
    res.status(500).json({ error: 'Failed to unenroll from course' });
  }
}

export default {
  getStudentCourses,
  getProgress,
  completeLesson,
  unenrollFromCourse
};