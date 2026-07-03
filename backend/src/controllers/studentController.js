// controllers/studentController.js - Student Dashboard Controller (CommonJS)
const db = require('../config/database.js');
const { isStudentLocked } = require('../lib/invoices.js');

async function getStudentCourses(req, res) {
  try {
    const enrollments = await db.query(`
      SELECT e.*, c.title, c.description, c.category,
             (SELECT GROUP_CONCAT(tu.full_name SEPARATOR ', ') FROM course_tutors ct JOIN users tu ON ct.tutor_id = tu.id WHERE ct.course_id = c.id) as tutor_name,
             (SELECT GROUP_CONCAT(tu.username SEPARATOR ', ') FROM course_tutors ct JOIN users tu ON ct.tutor_id = tu.id WHERE ct.course_id = c.id) as tutor_username,
             (SELECT COUNT(*) FROM lessons WHERE course_id = c.id) as total_lessons,
             (SELECT COUNT(*) FROM lesson_progress lp 
              JOIN lessons l ON lp.lesson_id = l.id 
              WHERE lp.enrollment_id = e.id AND lp.is_completed = 1) as completed_lessons,
             (SELECT COUNT(*) FROM course_notes WHERE course_id = c.id) as total_notes,
             (SELECT COUNT(*) FROM note_progress np 
              JOIN course_notes cn ON np.note_id = cn.id 
              WHERE np.student_id = e.student_id AND cn.course_id = c.id) as read_notes
      FROM enrollments e
      JOIN courses c ON e.course_id = c.id
      WHERE e.student_id = ?
      ORDER BY e.enrolled_at DESC
    `, [req.user.userId]);

    const progressData = enrollments.map(enrollment => {
      const totalLessons = enrollment.total_lessons || 0;
      const totalNotes = enrollment.total_notes || 0;
      const completedLessons = enrollment.completed_lessons || 0;
      const readNotes = enrollment.read_notes || 0;
      const totalItems = totalLessons + totalNotes;
      const completedItems = completedLessons + readNotes;
      const progress = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;

      return {
        id: enrollment.id,
        enrolledAt: enrollment.enrolled_at,
        progress,
        completedLessons,
        totalLessons,
        readNotes,
        totalNotes,
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

async function getProgress(req, res) {
  try {
    const enrollments = await db.query(`
      SELECT e.*, c.title, c.description, c.category,
             (SELECT GROUP_CONCAT(tu.full_name SEPARATOR ', ') FROM course_tutors ct JOIN users tu ON ct.tutor_id = tu.id WHERE ct.course_id = c.id) as tutor_name,
             (SELECT GROUP_CONCAT(tu.username SEPARATOR ', ') FROM course_tutors ct JOIN users tu ON ct.tutor_id = tu.id WHERE ct.course_id = c.id) as tutor_username,
             (SELECT COUNT(*) FROM lessons WHERE course_id = c.id) as total_lessons,
             (SELECT COUNT(*) FROM lesson_progress lp 
              JOIN lessons l ON lp.lesson_id = l.id 
              WHERE lp.enrollment_id = e.id AND lp.is_completed = 1) as completed_lessons,
             (SELECT COUNT(*) FROM course_notes WHERE course_id = c.id) as total_notes,
             (SELECT COUNT(*) FROM note_progress np 
              JOIN course_notes cn ON np.note_id = cn.id 
              WHERE np.student_id = e.student_id AND cn.course_id = c.id) as read_notes
      FROM enrollments e
      JOIN courses c ON e.course_id = c.id
      WHERE e.student_id = ?
      ORDER BY e.enrolled_at DESC
    `, [req.user.userId]);

    const progressData = enrollments.map(enrollment => {
      const totalLessons = enrollment.total_lessons || 0;
      const totalNotes = enrollment.total_notes || 0;
      const completedLessons = enrollment.completed_lessons || 0;
      const readNotes = enrollment.read_notes || 0;
      const totalItems = totalLessons + totalNotes;
      const completedItems = completedLessons + readNotes;
      const progress = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;

      return {
        id: enrollment.id,
        enrolledAt: enrollment.enrolled_at,
        lastAccessedAt: enrollment.last_accessed_at,
        progress,
        completedLessons,
        totalLessons,
        readNotes,
        totalNotes,
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

async function completeLesson(req, res) {
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

    const counts = await db.getOne(`
      SELECT
        (SELECT COUNT(*) FROM lessons WHERE course_id = ?) as total_lessons,
        (SELECT COUNT(*) FROM lesson_progress lp
         JOIN lessons l ON lp.lesson_id = l.id
         WHERE lp.enrollment_id = ? AND lp.is_completed = 1) as completed_lessons,
        (SELECT COUNT(*) FROM course_notes WHERE course_id = ?) as total_notes,
        (SELECT COUNT(*) FROM note_progress np
         JOIN course_notes cn ON np.note_id = cn.id
         WHERE np.student_id = ? AND cn.course_id = ?) as read_notes
    `, [lesson.course_id, enrollment.id, lesson.course_id, req.user.userId, lesson.course_id]);

    const totalItems = (counts.total_lessons || 0) + (counts.total_notes || 0);
    const completedItems = (counts.completed_lessons || 0) + (counts.read_notes || 0);
    const courseProgress = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) / 100 : 0;

    res.json({ success: true, message: 'Lesson marked as completed', courseProgress });

  } catch (error) {
    console.error('Complete lesson error:', error);
    res.status(500).json({ error: 'Failed to mark lesson as completed' });
  }
}

// Get lessons for a course
async function getLessons(req, res) {
  try {
    const courseId = req.query.courseId;
    
    if (!courseId) {
      return res.status(400).json({ error: 'courseId is required' });
    }

    const lessons = await db.query(`
      SELECT * FROM lessons 
      WHERE course_id = ? 
      ORDER BY order_index ASC
    `, [courseId]);

    res.json({ success: true, data: lessons });
  } catch (error) {
    console.error('Get lessons error:', error);
    res.status(500).json({ error: 'Failed to load lessons' });
  }
}

// Get single lesson
async function getLesson(req, res) {
  try {
    const lessonId = parseInt(req.params.id);
    
    if (isNaN(lessonId)) {
      return res.status(400).json({ error: 'Invalid lesson ID' });
    }

    const lesson = await db.getOne('SELECT * FROM lessons WHERE id = ?', [lessonId]);
    
    if (!lesson) {
      return res.status(404).json({ error: 'Lesson not found' });
    }

    res.json({ success: true, data: lesson });
  } catch (error) {
    console.error('Get lesson error:', error);
    res.status(500).json({ error: 'Failed to load lesson' });
  }
}

// Create lesson (tutor/admin)
async function createLesson(req, res) {
  try {
    const { courseId, title, content, orderIndex } = req.body;

    if (!courseId || !title) {
      return res.status(400).json({ error: 'courseId and title are required' });
    }

    const lessonId = await db.insert('lessons', {
      course_id: courseId,
      title,
      content: content || '',
      order_index: orderIndex || 0
    });

    res.status(201).json({ success: true, data: { id: lessonId } });
  } catch (error) {
    console.error('Create lesson error:', error);
    res.status(500).json({ error: 'Failed to create lesson' });
  }
}

// Update lesson (tutor/admin)
async function updateLesson(req, res) {
  try {
    const lessonId = parseInt(req.params.id);
    const { title, content, orderIndex } = req.body;

    if (isNaN(lessonId)) {
      return res.status(400).json({ error: 'Invalid lesson ID' });
    }

    await db.update('lessons', lessonId, {
      title: title,
      content: content,
      order_index: orderIndex
    });

    res.json({ success: true, message: 'Lesson updated successfully' });
  } catch (error) {
    console.error('Update lesson error:', error);
    res.status(500).json({ error: 'Failed to update lesson' });
  }
}

// Delete lesson (tutor/admin)
async function deleteLesson(req, res) {
  try {
    const lessonId = parseInt(req.params.id);

    if (isNaN(lessonId)) {
      return res.status(400).json({ error: 'Invalid lesson ID' });
    }

    await db.query('DELETE FROM lesson_progress WHERE lesson_id = ?', [lessonId]);
    await db.query('DELETE FROM lessons WHERE id = ?', [lessonId]);

    res.json({ success: true, message: 'Lesson deleted successfully' });
  } catch (error) {
    console.error('Delete lesson error:', error);
    res.status(500).json({ error: 'Failed to delete lesson' });
  }
}

// Update course progress
async function updateProgress(req, res) {
  try {
    const enrollmentId = parseInt(req.params.enrollmentId);
    const { progress } = req.body;

    if (isNaN(enrollmentId)) {
      return res.status(400).json({ error: 'Invalid enrollment ID' });
    }

    // Update logic - calculate progress based on completed lessons
    res.json({ success: true, message: 'Progress updated successfully' });
  } catch (error) {
    console.error('Update progress error:', error);
    res.status(500).json({ error: 'Failed to update progress' });
  }
}

// Get credit balance
async function getCreditBalance(req, res) {
  try {
    res.json({ success: true, balance: 0 });
  } catch (error) {
    console.error('Get credit balance error:', error);
    res.status(500).json({ error: 'Failed to get balance' });
  }
}

// Check if student is locked
async function isLocked(req, res) {
  try {
    const locked = await isStudentLocked(req.user.userId);
    res.json({ success: true, isLocked: locked });
  } catch (error) {
    console.error('Is locked check error:', error);
    res.status(500).json({ error: 'Failed to check lock status' });
  }
}

// Get student invoices
async function getInvoices(req, res) {
  try {
    const invoices = await db.query(`
      SELECT i.*, c.title as course_title, cp.monthly_amount
      FROM invoices i
      JOIN courses c ON i.course_id = c.id
      LEFT JOIN course_pricing cp ON c.id = cp.course_id AND cp.is_active = 1
      WHERE i.student_id = ?
      ORDER BY i.created_at DESC
    `, [req.user.userId]);

    const data = invoices.map(inv => ({
      id: inv.id,
      type: inv.type,
      amount: inv.amount,
      status: inv.status,
      dueDate: inv.due_date,
      gracePeriodEnd: inv.grace_period_end,
      paidAt: inv.paid_at,
      mpesaReceipt: inv.mpesa_receipt,
      transactionId: inv.transaction_id,
      checkoutRequestId: inv.checkout_request_id,
      monthNumber: inv.month_number,
      course: {
        title: inv.course_title,
        coursePricing: {
          monthlyAmount: inv.monthly_amount || inv.amount
        }
      }
    }));

    res.json({ success: true, data });
  } catch (error) {
    console.error('Get invoices error:', error);
    res.status(500).json({ error: 'Failed to load invoices' });
  }
}

async function unenrollFromCourse(req, res) {
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

// Check if student can access notes for a course (enrollment + payment check)
async function checkNotesAccess(req, res) {
  try {
    const courseId = parseInt(req.params.courseId);

    if (isNaN(courseId)) {
      return res.status(400).json({ error: 'Invalid course ID' });
    }

    // 1. Check enrollment
    const enrollment = await db.getOne(`
      SELECT id FROM enrollments 
      WHERE student_id = ? AND course_id = ?
    `, [req.user.userId, courseId]);

    if (!enrollment) {
      return res.status(403).json({ access: false, reason: 'not_enrolled' });
    }

    // 2. Check for unpaid/locked invoices for this course
    const unpaidInvoice = await db.getOne(`
      SELECT id, status, amount, due_date 
      FROM invoices 
      WHERE student_id = ? AND course_id = ? AND status IN ('pending', 'locked')
      ORDER BY due_date ASC
      LIMIT 1
    `, [req.user.userId, courseId]);

    if (unpaidInvoice) {
      return res.json({ 
        access: false, 
        reason: 'payment_required',
        invoice: {
          id: unpaidInvoice.id,
          status: unpaidInvoice.status,
          amount: unpaidInvoice.amount,
          dueDate: unpaidInvoice.due_date
        }
      });
    }

    res.json({ access: true });
  } catch (error) {
    console.error('Check notes access error:', error);
    res.status(500).json({ error: 'Failed to check access' });
  }
}

async function getCourseNotes(req, res) {
  try {
    const courseId = parseInt(req.params.courseId);

    if (isNaN(courseId)) {
      return res.status(400).json({ error: 'Invalid course ID' });
    }

    const enrollment = await db.getOne(
      'SELECT id FROM enrollments WHERE student_id = ? AND course_id = ?',
      [req.user.userId, courseId]
    );

    if (!enrollment) {
      return res.status(403).json({ error: 'Not enrolled in this course' });
    }

    const locked = await isStudentLocked(req.user.userId);
    if (locked) {
      return res.status(403).json({ error: 'Access locked due to unpaid invoices' });
    }

    const notes = await db.query(`
      SELECT n.*,
             (SELECT np.id FROM note_progress np WHERE np.note_id = n.id AND np.student_id = ?) as is_read
      FROM course_notes n
      WHERE n.course_id = ?
      ORDER BY n.order_index ASC, n.created_at ASC
    `, [req.user.userId, courseId]);

    const transformed = notes.map(note => ({
      id: note.id,
      title: note.title,
      content: note.content,
      orderIndex: note.order_index || 0,
      referenceUrl: note.reference_url || null,
      isRead: !!note.is_read,
      createdAt: note.created_at,
      updatedAt: note.updated_at
    }));

    await db.query(
      'UPDATE enrollments SET last_accessed_at = ? WHERE id = ?',
      [new Date(), enrollment.id]
    );

    res.json({ success: true, data: transformed });
  } catch (error) {
    console.error('Get course notes error:', error);
    res.status(500).json({ error: 'Failed to load course notes' });
  }
}

async function markNoteRead(req, res) {
  try {
    const noteId = parseInt(req.params.noteId);

    if (isNaN(noteId)) {
      return res.status(400).json({ error: 'Invalid note ID' });
    }

    const note = await db.getOne(
      `SELECT n.id, n.course_id FROM course_notes n
       JOIN enrollments e ON n.course_id = e.course_id
       WHERE n.id = ? AND e.student_id = ?`,
      [noteId, req.user.userId]
    );

    if (!note) {
      return res.status(404).json({ error: 'Note not found or not enrolled' });
    }

    const existing = await db.getOne(
      'SELECT id FROM note_progress WHERE student_id = ? AND note_id = ?',
      [req.user.userId, noteId]
    );

    if (!existing) {
      await db.insert('note_progress', {
        student_id: req.user.userId,
        note_id: noteId,
        read_at: new Date()
      });
    }

    const enrollment = await db.getOne(
      'SELECT id FROM enrollments WHERE student_id = ? AND course_id = ?',
      [req.user.userId, note.course_id]
    );

    const counts = await db.getOne(`
      SELECT
        (SELECT COUNT(*) FROM lessons WHERE course_id = ?) as total_lessons,
        (SELECT COUNT(*) FROM lesson_progress lp
         JOIN lessons l ON lp.lesson_id = l.id
         WHERE lp.enrollment_id = ? AND lp.is_completed = 1) as completed_lessons,
        (SELECT COUNT(*) FROM course_notes WHERE course_id = ?) as total_notes,
        (SELECT COUNT(*) FROM note_progress np
         JOIN course_notes cn ON np.note_id = cn.id
         WHERE np.student_id = ? AND cn.course_id = ?) as read_notes
    `, [note.course_id, enrollment.id, note.course_id, req.user.userId, note.course_id]);

    const totalItems = (counts.total_lessons || 0) + (counts.total_notes || 0);
    const completedItems = (counts.completed_lessons || 0) + (counts.read_notes || 0);
    const courseProgress = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) / 100 : 0;

    res.json({ success: true, message: 'Note marked as read', courseProgress });
  } catch (error) {
    console.error('Mark note read error:', error);
    res.status(500).json({ error: 'Failed to mark note as read' });
  }
}

async function getStudentAssignments(req, res) {
  try {
    const studentId = req.user.userId;
    const assignments = await db.query(`
      SELECT a.*, l.title as lesson_title, l.course_id,
             c.title as course_title,
             s.id as submission_id, s.grade, s.feedback, s.submitted_at
      FROM assignments a
      JOIN lessons l ON a.lesson_id = l.id
      JOIN courses c ON l.course_id = c.id
      JOIN enrollments e ON e.course_id = c.id AND e.student_id = ?
      LEFT JOIN submissions s ON s.assignment_id = a.id AND s.student_id = ?
      ORDER BY a.created_at DESC
    `, [studentId, studentId]);

    const transformed = assignments.map(a => ({
      id: a.id,
      title: a.title,
      description: a.description,
      maxScore: a.max_score,
      lessonTitle: a.lesson_title,
      courseTitle: a.course_title,
      courseId: a.course_id,
      submission: a.submission_id ? {
        id: a.submission_id,
        grade: a.grade,
        feedback: a.feedback,
        submittedAt: a.submitted_at
      } : null
    }));

    res.json({ success: true, data: transformed });
  } catch (error) {
    console.error('Get student assignments error:', error);
    res.status(500).json({ error: 'Failed to load assignments' });
  }
}

async function getAssignment(req, res) {
  try {
    const assignmentId = parseInt(req.params.id);
    if (isNaN(assignmentId)) {
      return res.status(400).json({ error: 'Invalid assignment ID' });
    }

    const assignment = await db.getOne(`
      SELECT a.*, l.course_id, c.title as course_title
      FROM assignments a
      JOIN lessons l ON a.lesson_id = l.id
      JOIN courses c ON l.course_id = c.id
      WHERE a.id = ?
    `, [assignmentId]);

    if (!assignment) {
      return res.status(404).json({ error: 'Assignment not found' });
    }

    const submissions = await db.query(`
      SELECT * FROM submissions WHERE assignment_id = ? AND student_id = ?
    `, [assignmentId, req.user.userId]);

    res.json({
      id: assignment.id,
      lessonId: assignment.lesson_id,
      courseId: assignment.course_id,
      title: assignment.title,
      description: assignment.description,
      maxScore: assignment.max_score,
      submissions: submissions.map(s => ({
        id: s.id,
        codeSubmission: s.code_submission,
        grade: s.grade,
        feedback: s.feedback,
        submittedAt: s.submitted_at
      }))
    });
  } catch (error) {
    console.error('Get assignment error:', error);
    res.status(500).json({ error: 'Failed to load assignment' });
  }
}

async function submitAssignment(req, res) {
  try {
    const assignmentId = parseInt(req.params.id);
    if (isNaN(assignmentId)) {
      return res.status(400).json({ error: 'Invalid assignment ID' });
    }

    const { codeSubmission } = req.body;
    if (!codeSubmission) {
      return res.status(400).json({ error: 'Code submission is required' });
    }

    const existing = await db.getOne(`
      SELECT id FROM submissions WHERE assignment_id = ? AND student_id = ?
    `, [assignmentId, req.user.userId]);

    if (existing) {
      return res.status(400).json({ error: 'Already submitted this assignment' });
    }

    const result = await db.query(`
      INSERT INTO submissions (assignment_id, student_id, code_submission) VALUES (?, ?, ?)
    `, [assignmentId, req.user.userId, codeSubmission]);

    res.status(201).json({ success: true, id: result.insertId, message: 'Assignment submitted successfully' });
  } catch (error) {
    console.error('Submit assignment error:', error);
    res.status(500).json({ error: 'Failed to submit assignment' });
  }
}

module.exports = {
  getStudentCourses,
  getProgress,
  getLessons,
  getLesson,
  createLesson,
  updateLesson,
  deleteLesson,
  completeLesson,
  unenrollFromCourse,
  updateProgress,
  getCreditBalance,
  isLocked,
  getInvoices,
  checkNotesAccess,
  getCourseNotes,
  markNoteRead,
  getStudentAssignments,
  getAssignment,
  submitAssignment
};

