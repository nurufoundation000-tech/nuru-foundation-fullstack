// controllers/tutorController.js - Tutor Dashboard Controller (CommonJS)
const db = require('../config/database.js');

async function getTutorCourses(req, res) {
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

async function createCourse(req, res) {
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

async function updateCourse(req, res) {
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

async function getCourseLessons(req, res) {
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

async function getTransactions(req, res) {
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

// ==================== TUTOR LESSON MANAGEMENT ====================

async function getTutorLessons(req, res) {
  try {
    const tutorCourses = await db.query(
      'SELECT id FROM courses WHERE tutor_id = ?',
      [req.user.userId]
    );
    const courseIds = tutorCourses.map(c => c.id);

    if (courseIds.length === 0) {
      return res.json({ success: true, data: [], pagination: { page:1, pages:1, total:0 } });
    }

    const placeholders = courseIds.map(() => '?').join(', ');
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 12;
    const offset = (page - 1) * limit;

    const lessons = await db.query(
      `SELECT l.*, c.title as course_title, c.id as course_id, c.tutor_id
       FROM lessons l
       JOIN courses c ON l.course_id = c.id
       WHERE l.course_id IN (${placeholders})
       ORDER BY l.course_id, l.order_index
       LIMIT ? OFFSET ?`,
      [...courseIds, limit, offset]
    );

    // Transform to nested structure expected by frontend
    const transformedLessons = lessons.map(lesson => ({
      id: lesson.id,
      title: lesson.title,
      content: lesson.content,
      video_url: lesson.video_url,
      order_index: lesson.order_index,
      liveLink: lesson.live_link || null,
      courseId: lesson.course_id,
      course: {
        id: lesson.course_id,
        title: lesson.course_title
      },
      createdAt: lesson.created_at,
      updatedAt: lesson.updated_at
    }));

    const countResult = await db.getOne(
      `SELECT COUNT(*) as total FROM lessons WHERE course_id IN (${placeholders})`,
      courseIds
    );

    res.json({
      success: true,
      data: transformedLessons,
      pagination: {
        page,
        pages: Math.ceil(countResult.total / limit),
        total: countResult.total
      }
    });
  } catch (error) {
    console.error('Get tutor lessons error:', error);
    res.status(500).json({ error: 'Failed to load lessons' });
  }
}

async function createTutorLesson(req, res) {
  try {
    const { courseId, title, content, videoUrl, orderIndex, liveLink } = req.body;

    if (!courseId || !title) {
      return res.status(400).json({ error: 'Course ID and title are required' });
    }

    const course = await db.getOne(
      'SELECT id FROM courses WHERE id = ? AND tutor_id = ?',
      [courseId, req.user.userId]
    );

    if (!course) {
      return res.status(403).json({ error: 'Course not found or access denied' });
    }

    const lessonId = await db.insert('lessons', {
      course_id: courseId,
      title,
      content: content || '',
      video_url: videoUrl || null,
      order_index: orderIndex || 0,
      live_link: liveLink || null,
      created_at: new Date(),
      updated_at: new Date()
    });

    const lesson = await db.getOne('SELECT * FROM lessons WHERE id = ?', [lessonId]);

    res.status(201).json({ success: true, data: lesson, message: 'Lesson created successfully' });
  } catch (error) {
    console.error('Create lesson error:', error);
    res.status(500).json({ error: 'Failed to create lesson' });
  }
}

async function updateTutorLesson(req, res) {
  try {
    const lessonId = parseInt(req.params.id);

    if (isNaN(lessonId)) {
      return res.status(400).json({ error: 'Invalid lesson ID' });
    }

    const { title, content, videoUrl, orderIndex, liveLink } = req.body;

    const lesson = await db.getOne(
      `SELECT l.* FROM lessons l
       JOIN courses c ON l.course_id = c.id
       WHERE l.id = ? AND c.tutor_id = ?`,
      [lessonId, req.user.userId]
    );

    if (!lesson) {
      return res.status(404).json({ error: 'Lesson not found or access denied' });
    }

    const updateData = { updated_at: new Date() };
    if (title) updateData.title = title;
    if (content !== undefined) updateData.content = content;
    if (videoUrl !== undefined) updateData.video_url = videoUrl;
    if (orderIndex !== undefined) updateData.order_index = orderIndex;
    if (liveLink !== undefined) updateData.live_link = liveLink;

    await db.update('lessons', lessonId, updateData);

    const updatedLesson = await db.getOne('SELECT * FROM lessons WHERE id = ?', [lessonId]);

    res.json({ success: true, data: updatedLesson, message: 'Lesson updated successfully' });
  } catch (error) {
    console.error('Update lesson error:', error);
    res.status(500).json({ error: 'Failed to update lesson' });
  }
}

async function deleteTutorLesson(req, res) {
  try {
    const lessonId = parseInt(req.params.id);

    if (isNaN(lessonId)) {
      return res.status(400).json({ error: 'Invalid lesson ID' });
    }

    const lesson = await db.getOne(
      `SELECT l.* FROM lessons l
       JOIN courses c ON l.course_id = c.id
       WHERE l.id = ? AND c.tutor_id = ?`,
      [lessonId, req.user.userId]
    );

    if (!lesson) {
      return res.status(404).json({ error: 'Lesson not found or access denied' });
    }

    await db.query('DELETE FROM lessons WHERE id = ?', [lessonId]);

    res.json({ success: true, message: 'Lesson deleted successfully' });
  } catch (error) {
    console.error('Delete lesson error:', error);
    res.status(500).json({ error: 'Failed to delete lesson' });
  }
}

// ==================== TUTOR ASSIGNMENT MANAGEMENT ====================

async function getTutorAssignments(req, res) {
  try {
    const tutorCourses = await db.query(
      'SELECT id FROM courses WHERE tutor_id = ?',
      [req.user.userId]
    );
    const courseIds = tutorCourses.map(c => c.id);

    if (courseIds.length === 0) {
      return res.json({ success: true, data: [], pagination: { page:1, pages:1, total:0 } });
    }

    const placeholders = courseIds.map(() => '?').join(', ');
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 15;
    const offset = (page - 1) * limit;

    const assignments = await db.query(
      `SELECT a.*, l.title as lesson_title, l.id as lesson_id, c.title as course_title, c.id as course_id
       FROM assignments a
       JOIN lessons l ON a.lesson_id = l.id
       JOIN courses c ON l.course_id = c.id
       WHERE l.course_id IN (${placeholders})
       ORDER BY a.created_at DESC
       LIMIT ? OFFSET ?`,
      [...courseIds, limit, offset]
    );

    // Transform to nested structure expected by frontend
    const transformedAssignments = assignments.map(a => ({
      id: a.id,
      title: a.title,
      description: a.description,
      maxScore: a.max_score,
      lessonId: a.lesson_id,
      lesson: {
        id: a.lesson_id,
        title: a.lesson_title,
        course: {
          id: a.course_id,
          title: a.course_title
        }
      },
      _count: { submissions: 0 } // TODO: Add actual count if needed
    }));

    const countResult = await db.getOne(
      `SELECT COUNT(*) as total FROM assignments a
       JOIN lessons l ON a.lesson_id = l.id
       WHERE l.course_id IN (${placeholders})`,
      courseIds
    );

    res.json({
      success: true,
      data: transformedAssignments,
      pagination: {
        page,
        pages: Math.ceil(countResult.total / limit),
        total: countResult.total
      }
    });
  } catch (error) {
    console.error('Get tutor assignments error:', error);
    res.status(500).json({ error: 'Failed to load assignments' });
  }
}

async function createTutorAssignment(req, res) {
  try {
    const { lessonId, title, description, maxScore } = req.body;

    if (!lessonId || !title) {
      return res.status(400).json({ error: 'Lesson ID and title are required' });
    }

    const lesson = await db.getOne(
      `SELECT l.* FROM lessons l
       JOIN courses c ON l.course_id = c.id
       WHERE l.id = ? AND c.tutor_id = ?`,
      [lessonId, req.user.userId]
    );

    if (!lesson) {
      return res.status(403).json({ error: 'Lesson not found or access denied' });
    }

    const assignmentId = await db.insert('assignments', {
      lesson_id: lessonId,
      title,
      description: description || '',
      max_score: maxScore || 100,
      created_at: new Date(),
      updated_at: new Date()
    });

    const assignment = await db.getOne('SELECT * FROM assignments WHERE id = ?', [assignmentId]);

    res.status(201).json({ success: true, data: assignment, message: 'Assignment created successfully' });
  } catch (error) {
    console.error('Create assignment error:', error);
    res.status(500).json({ error: 'Failed to create assignment' });
  }
}

async function updateTutorAssignment(req, res) {
  try {
    const assignmentId = parseInt(req.params.id);

    if (isNaN(assignmentId)) {
      return res.status(400).json({ error: 'Invalid assignment ID' });
    }

    const { title, description, maxScore } = req.body;

    const assignment = await db.getOne(
      `SELECT a.* FROM assignments a
       JOIN lessons l ON a.lesson_id = l.id
       JOIN courses c ON l.course_id = c.id
       WHERE a.id = ? AND c.tutor_id = ?`,
      [assignmentId, req.user.userId]
    );

    if (!assignment) {
      return res.status(404).json({ error: 'Assignment not found or access denied' });
    }

    const updateData = { updated_at: new Date() };
    if (title) updateData.title = title;
    if (description !== undefined) updateData.description = description;
    if (maxScore !== undefined) updateData.max_score = maxScore;

    await db.update('assignments', assignmentId, updateData);

    const updatedAssignment = await db.getOne('SELECT * FROM assignments WHERE id = ?', [assignmentId]);

    res.json({ success: true, data: updatedAssignment, message: 'Assignment updated successfully' });
  } catch (error) {
    console.error('Update assignment error:', error);
    res.status(500).json({ error: 'Failed to update assignment' });
  }
}

async function deleteTutorAssignment(req, res) {
  try {
    const assignmentId = parseInt(req.params.id);

    if (isNaN(assignmentId)) {
      return res.status(400).json({ error: 'Invalid assignment ID' });
    }

    const assignment = await db.getOne(
      `SELECT a.* FROM assignments a
       JOIN lessons l ON a.lesson_id = l.id
       JOIN courses c ON l.course_id = c.id
       WHERE a.id = ? AND c.tutor_id = ?`,
      [assignmentId, req.user.userId]
    );

    if (!assignment) {
      return res.status(404).json({ error: 'Assignment not found or access denied' });
    }

    await db.query('DELETE FROM assignments WHERE id = ?', [assignmentId]);

    res.json({ success: true, message: 'Assignment deleted successfully' });
  } catch (error) {
    console.error('Delete assignment error:', error);
    res.status(500).json({ error: 'Failed to delete assignment' });
  }
}

// ==================== TUTOR SUBMISSION MANAGEMENT ====================

async function getTutorSubmissions(req, res) {
  try {
    const tutorCourses = await db.query(
      'SELECT id FROM courses WHERE tutor_id = ?',
      [req.user.userId]
    );
    const courseIds = tutorCourses.map(c => c.id);

    if (courseIds.length === 0) {
      return res.json({ success: true, data: [], pagination: { page:1, pages:1, total:0 } });
    }

    const placeholders = courseIds.map(() => '?').join(', ');
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 15;
    const offset = (page - 1) * limit;
    const assignmentId = req.query.assignmentId;

    let query = `SELECT s.*, a.title as assignment_title, a.max_score,
                  u.full_name, u.email, u.username,
                  l.title as lesson_title, c.title as course_title
                  FROM submissions s
                  JOIN assignments a ON s.assignment_id = a.id
                  JOIN lessons l ON a.lesson_id = l.id
                  JOIN courses c ON l.course_id = c.id
                  JOIN users u ON s.student_id = u.id
                  WHERE l.course_id IN (${placeholders})`;
    const params = [...courseIds];

    if (assignmentId) {
      query += ' AND s.assignment_id = ?';
      params.push(assignmentId);
    }

    query += ' ORDER BY s.submitted_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const submissions = await db.query(query, params);

    // Transform to nested structure expected by frontend
    const transformedSubmissions = submissions.map(sub => ({
      id: sub.id,
      codeSubmission: sub.code_submission,
      grade: sub.grade,
      feedback: sub.feedback,
      submittedAt: sub.submitted_at,
      student: {
        id: sub.student_id,
        fullName: sub.full_name,
        email: sub.email,
        username: sub.username
      },
      assignment: {
        id: sub.assignment_id,
        title: sub.assignment_title,
        maxScore: sub.max_score,
        lesson: {
          id: sub.lesson_id,
          title: sub.lesson_title,
          course: {
            id: sub.course_id,
            title: sub.course_title
          }
        }
      }
    }));

    res.json({
      success: true,
      data: transformedSubmissions,
      pagination: {
        page,
        pages: 1, // Simplified - can be enhanced later
        total: submissions.length
      }
    });
  } catch (error) {
    console.error('Get tutor submissions error:', error);
    res.status(500).json({ error: 'Failed to load submissions' });
  }
}

async function gradeSubmission(req, res) {
  try {
    const submissionId = parseInt(req.params.id);

    if (isNaN(submissionId)) {
      return res.status(400).json({ error: 'Invalid submission ID' });
    }

    const { grade, feedback } = req.body;

    if (grade === undefined || grade === null) {
      return res.status(400).json({ error: 'Grade is required' });
    }

    const submission = await db.getOne(
      `SELECT s.* FROM submissions s
       JOIN assignments a ON s.assignment_id = a.id
       JOIN lessons l ON a.lesson_id = l.id
       JOIN courses c ON l.course_id = c.id
       WHERE s.id = ? AND c.tutor_id = ?`,
      [submissionId, req.user.userId]
    );

    if (!submission) {
      return res.status(404).json({ error: 'Submission not found or access denied' });
    }

    await db.update('submissions', submissionId, {
      grade: parseInt(grade),
      feedback: feedback || '',
      updated_at: new Date()
    });

    const updatedSubmission = await db.getOne('SELECT * FROM submissions WHERE id = ?', [submissionId]);

    res.json({ success: true, data: updatedSubmission, message: 'Grade saved successfully' });
  } catch (error) {
    console.error('Grade submission error:', error);
    res.status(500).json({ error: 'Failed to save grade' });
  }
}

// ==================== TUTOR NOTES MANAGEMENT ====================

async function getTutorNotes(req, res) {
  try {
    const tutorCourses = await db.query(
      'SELECT id FROM courses WHERE tutor_id = ?',
      [req.user.userId]
    );
    const courseIds = tutorCourses.map(c => c.id);

    if (courseIds.length === 0) {
      return res.json({ success: true, data: [], pagination: { page:1, pages:1, total:0 } });
    }

    const placeholders = courseIds.map(() => '?').join(', ');
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 12;
    const offset = (page - 1) * limit;

    const notes = await db.query(
      `SELECT n.*, c.title as course_title, c.id as course_id
       FROM course_notes n
       JOIN courses c ON n.course_id = c.id
       WHERE n.course_id IN (${placeholders})
       ORDER BY n.updated_at DESC
       LIMIT ? OFFSET ?`,
      [...courseIds, limit, offset]
    );

    const transformedNotes = notes.map(note => ({
      id: note.id,
      title: note.title,
      content: note.content,
      courseId: note.course_id,
      orderIndex: note.order_index || 0,
      referenceUrl: note.reference_url || null,
      course: {
        id: note.course_id,
        title: note.course_title
      },
      createdAt: note.created_at,
      updatedAt: note.updated_at
    }));

    const countResult = await db.getOne(
      `SELECT COUNT(*) as total FROM course_notes WHERE course_id IN (${placeholders})`,
      courseIds
    );

    res.json({
      success: true,
      data: transformedNotes,
      pagination: {
        page,
        pages: Math.ceil(countResult.total / limit),
        total: countResult.total
      }
    });
  } catch (error) {
    console.error('Get tutor notes error:', error);
    res.status(500).json({ error: 'Failed to load notes' });
  }
}

async function createTutorNote(req, res) {
  try {
    const { courseId, title, content, orderIndex, referenceUrl } = req.body;

    if (!courseId || !title || !content) {
      return res.status(400).json({ error: 'Course ID, title, and content are required' });
    }

    const course = await db.getOne(
      'SELECT id FROM courses WHERE id = ? AND tutor_id = ?',
      [courseId, req.user.userId]
    );

    if (!course) {
      return res.status(403).json({ error: 'Course not found or access denied' });
    }

    const noteId = await db.insert('course_notes', {
      course_id: courseId,
      title,
      content,
      order_index: orderIndex || 0,
      reference_url: referenceUrl || null,
      created_at: new Date(),
      updated_at: new Date()
    });

    const note = await db.getOne('SELECT * FROM course_notes WHERE id = ?', [noteId]);

    res.status(201).json({ success: true, data: note, message: 'Note created successfully' });
  } catch (error) {
    console.error('Create note error:', error);
    res.status(500).json({ error: 'Failed to create note' });
  }
}

async function updateTutorNote(req, res) {
  try {
    const noteId = parseInt(req.params.id);

    if (isNaN(noteId)) {
      return res.status(400).json({ error: 'Invalid note ID' });
    }

    const { title, content, orderIndex, referenceUrl } = req.body;

    const note = await db.getOne(
      `SELECT n.* FROM course_notes n
       JOIN courses c ON n.course_id = c.id
       WHERE n.id = ? AND c.tutor_id = ?`,
      [noteId, req.user.userId]
    );

    if (!note) {
      return res.status(404).json({ error: 'Note not found or access denied' });
    }

    const updateData = { updated_at: new Date() };
    if (title) updateData.title = title;
    if (content !== undefined) updateData.content = content;
    if (orderIndex !== undefined) updateData.order_index = orderIndex;
    if (referenceUrl !== undefined) updateData.reference_url = referenceUrl;

    await db.update('course_notes', noteId, updateData);

    const updatedNote = await db.getOne('SELECT * FROM course_notes WHERE id = ?', [noteId]);

    res.json({ success: true, data: updatedNote, message: 'Note updated successfully' });
  } catch (error) {
    console.error('Update note error:', error);
    res.status(500).json({ error: 'Failed to update note' });
  }
}

async function deleteTutorNote(req, res) {
  try {
    const noteId = parseInt(req.params.id);

    if (isNaN(noteId)) {
      return res.status(400).json({ error: 'Invalid note ID' });
    }

    const note = await db.getOne(
      `SELECT n.* FROM course_notes n
       JOIN courses c ON n.course_id = c.id
       WHERE n.id = ? AND c.tutor_id = ?`,
      [noteId, req.user.userId]
    );

    if (!note) {
      return res.status(404).json({ error: 'Note not found or access denied' });
    }

    await db.query('DELETE FROM course_notes WHERE id = ?', [noteId]);

    res.json({ success: true, message: 'Note deleted successfully' });
  } catch (error) {
    console.error('Delete note error:', error);
    res.status(500).json({ error: 'Failed to delete note' });
  }
}

// ==================== TUTOR ENROLLMENT MANAGEMENT ====================

async function getTutorStudents(req, res) {
  try {
    const students = await db.query(`
      SELECT id, full_name, username, email, created_at
      FROM users
      WHERE role_id = (SELECT id FROM roles WHERE name = 'student')
      ORDER BY full_name ASC
    `);

    res.json({ success: true, data: students });
  } catch (error) {
    console.error('Get tutor students error:', error);
    res.status(500).json({ error: 'Failed to load students' });
  }
}

async function getTutorEnrollments(req, res) {
  try {
    const tutorCourses = await db.query(
      'SELECT id FROM courses WHERE tutor_id = ?',
      [req.user.userId]
    );
    const courseIds = tutorCourses.map(c => c.id);

    if (courseIds.length === 0) {
      return res.json({ success: true, data: [], pagination: { page:1, pages:1, total:0 } });
    }

    const placeholders = courseIds.map(() => '?').join(', ');
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    const courseId = req.query.courseId;

    let query = `SELECT e.*, u.full_name, u.email, u.username, c.title as course_title, c.id as course_id
                  FROM enrollments e
                  JOIN users u ON e.student_id = u.id
                  JOIN courses c ON e.course_id = c.id
                  WHERE e.course_id IN (${placeholders})`;
    const params = [...courseIds];

    if (courseId) {
      query += ' AND e.course_id = ?';
      params.push(courseId);
    }

    query += ' ORDER BY e.enrolled_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const enrollments = await db.query(query, params);

    // Transform to nested structure expected by frontend
    const transformedEnrollments = enrollments.map(e => ({
      id: e.id,
      student: {
        id: e.student_id,
        fullName: e.full_name,
        email: e.email,
        username: e.username
      },
      course: {
        id: e.course_id,
        title: e.course_title
      },
      enrolledAt: e.enrolled_at
    }));

    res.json({
      success: true,
      data: transformedEnrollments,
      pagination: {
        page,
        pages: 1, // Simplified
        total: enrollments.length
      }
    });
  } catch (error) {
    console.error('Get tutor enrollments error:', error);
    res.status(500).json({ error: 'Failed to load enrollments' });
  }
}

async function createTutorEnrollment(req, res) {
  try {
    const { studentId, courseId } = req.body;

    if (!studentId || !courseId) {
      return res.status(400).json({ error: 'Student ID and course ID are required' });
    }

    const course = await db.getOne(
      'SELECT id FROM courses WHERE id = ? AND tutor_id = ?',
      [courseId, req.user.userId]
    );

    if (!course) {
      return res.status(403).json({ error: 'Course not found or access denied' });
    }

    const existing = await db.getOne(
      'SELECT id FROM enrollments WHERE student_id = ? AND course_id = ?',
      [studentId, courseId]
    );

    if (existing) {
      return res.status(400).json({ error: 'Student already enrolled in this course' });
    }

    const enrollmentId = await db.insert('enrollments', {
      student_id: studentId,
      course_id: courseId,
      enrolled_at: new Date()
    });

    const enrollment = await db.getOne(
      `SELECT e.*, u.full_name, u.email, c.title as course_title
       FROM enrollments e
       JOIN users u ON e.student_id = u.id
       JOIN courses c ON e.course_id = c.id
       WHERE e.id = ?`,
      [enrollmentId]
    );

    res.status(201).json({ success: true, data: enrollment, message: 'Student enrolled successfully' });
  } catch (error) {
    console.error('Create enrollment error:', error);
    res.status(500).json({ error: 'Failed to enroll student' });
  }
}

async function deleteTutorEnrollment(req, res) {
  try {
    const enrollmentId = parseInt(req.params.id);

    if (isNaN(enrollmentId)) {
      return res.status(400).json({ error: 'Invalid enrollment ID' });
    }

    const enrollment = await db.getOne(
      `SELECT e.* FROM enrollments e
       JOIN courses c ON e.course_id = c.id
       WHERE e.id = ? AND c.tutor_id = ?`,
      [enrollmentId, req.user.userId]
    );

    if (!enrollment) {
      return res.status(404).json({ error: 'Enrollment not found or access denied' });
    }

    await db.query('DELETE FROM enrollments WHERE id = ?', [enrollmentId]);

    res.json({ success: true, message: 'Enrollment removed successfully' });
  } catch (error) {
    console.error('Delete enrollment error:', error);
    res.status(500).json({ error: 'Failed to remove enrollment' });
  }
}

async function reorderNotes(req, res) {
  try {
    const { items } = req.body;
    if (!items || !Array.isArray(items)) {
      return res.status(400).json({ error: 'items array is required' });
    }

    const tutorCourses = await db.query('SELECT id FROM courses WHERE tutor_id = ?', [req.user.userId]);
    const courseIds = tutorCourses.map(c => c.id);
    if (courseIds.length === 0) {
      return res.status(403).json({ error: 'No courses found' });
    }

    const placeholders = courseIds.map(() => '?').join(', ');

    for (const item of items) {
      const note = await db.getOne(
        `SELECT id FROM course_notes WHERE id = ? AND course_id IN (${placeholders})`,
        [item.id, ...courseIds]
      );
      if (note) {
        await db.query('UPDATE course_notes SET order_index = ? WHERE id = ?', [item.orderIndex, item.id]);
      }
    }

    res.json({ success: true, message: 'Notes reordered successfully' });
  } catch (error) {
    console.error('Reorder notes error:', error);
    res.status(500).json({ error: 'Failed to reorder notes' });
  }
}

async function reorderLessons(req, res) {
  try {
    const { items } = req.body;
    if (!items || !Array.isArray(items)) {
      return res.status(400).json({ error: 'items array is required' });
    }

    const tutorCourses = await db.query('SELECT id FROM courses WHERE tutor_id = ?', [req.user.userId]);
    const courseIds = tutorCourses.map(c => c.id);
    if (courseIds.length === 0) {
      return res.status(403).json({ error: 'No courses found' });
    }

    const placeholders = courseIds.map(() => '?').join(', ');

    for (const item of items) {
      const lesson = await db.getOne(
        `SELECT id FROM lessons WHERE id = ? AND course_id IN (${placeholders})`,
        [item.id, ...courseIds]
      );
      if (lesson) {
        await db.query('UPDATE lessons SET order_index = ? WHERE id = ?', [item.orderIndex, item.id]);
      }
    }

    res.json({ success: true, message: 'Lessons reordered successfully' });
  } catch (error) {
    console.error('Reorder lessons error:', error);
    res.status(500).json({ error: 'Failed to reorder lessons' });
  }
}

module.exports = {
  getTutorCourses,
  createCourse,
  updateCourse,
  getCourseLessons,
  getTransactions,
  getTutorLessons,
  createTutorLesson,
  updateTutorLesson,
  deleteTutorLesson,
  getTutorAssignments,
  createTutorAssignment,
  updateTutorAssignment,
  deleteTutorAssignment,
  getTutorSubmissions,
  gradeSubmission,
  getTutorNotes,
  createTutorNote,
  updateTutorNote,
  deleteTutorNote,
  getTutorStudents,
  getTutorEnrollments,
  createTutorEnrollment,
  deleteTutorEnrollment,
  reorderNotes,
  reorderLessons
};
