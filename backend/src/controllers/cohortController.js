const db = require('../config/database.js');

async function getCohorts(req, res) {
  try {
    const cohorts = await db.query(`
      SELECT co.*, c.title as course_title,
             (SELECT COUNT(*) FROM cohort_students cs WHERE cs.cohort_id = co.id) as enrolled_count
      FROM cohorts co
      JOIN courses c ON co.course_id = c.id
      ORDER BY co.created_at DESC
    `);

    res.json({ success: true, data: cohorts });
  } catch (error) {
    console.error('Get cohorts error:', error);
    res.status(500).json({ error: 'Failed to load cohorts' });
  }
}

async function getCohort(req, res) {
  try {
    const cohortId = parseInt(req.params.id);
    if (isNaN(cohortId)) {
      return res.status(400).json({ error: 'Invalid cohort ID' });
    }

    const cohort = await db.getOne(`
      SELECT co.*, c.title as course_title
      FROM cohorts co
      JOIN courses c ON co.course_id = c.id
      WHERE co.id = ?
    `, [cohortId]);

    if (!cohort) {
      return res.status(404).json({ error: 'Cohort not found' });
    }

    const students = await db.query(`
      SELECT cs.*, u.full_name, u.email, u.username
      FROM cohort_students cs
      JOIN users u ON cs.student_id = u.id
      WHERE cs.cohort_id = ?
      ORDER BY u.full_name ASC
    `, [cohortId]);

    res.json({ success: true, data: { ...cohort, students } });
  } catch (error) {
    console.error('Get cohort error:', error);
    res.status(500).json({ error: 'Failed to load cohort' });
  }
}

async function createCohort(req, res) {
  try {
    const { courseId, name, startDate, endDate, maxStudents } = req.body;

    if (!courseId || !name) {
      return res.status(400).json({ error: 'Course ID and name are required' });
    }

    const course = await db.getOne('SELECT id FROM courses WHERE id = ?', [courseId]);
    if (!course) {
      return res.status(404).json({ error: 'Course not found' });
    }

    const cohortId = await db.insert('cohorts', {
      course_id: courseId,
      name,
      start_date: startDate || null,
      end_date: endDate || null,
      max_students: maxStudents || 0,
      is_active: 1,
      created_at: new Date()
    });

    const cohort = await db.getOne('SELECT * FROM cohorts WHERE id = ?', [cohortId]);
    res.status(201).json({ success: true, data: cohort, message: 'Cohort created successfully' });
  } catch (error) {
    console.error('Create cohort error:', error);
    res.status(500).json({ error: 'Failed to create cohort' });
  }
}

async function updateCohort(req, res) {
  try {
    const cohortId = parseInt(req.params.id);
    if (isNaN(cohortId)) {
      return res.status(400).json({ error: 'Invalid cohort ID' });
    }

    const existing = await db.getOne('SELECT id FROM cohorts WHERE id = ?', [cohortId]);
    if (!existing) {
      return res.status(404).json({ error: 'Cohort not found' });
    }

    const { name, startDate, endDate, maxStudents, isActive } = req.body;
    const updateData = {};
    if (name) updateData.name = name;
    if (startDate !== undefined) updateData.start_date = startDate;
    if (endDate !== undefined) updateData.end_date = endDate;
    if (maxStudents !== undefined) updateData.max_students = maxStudents;
    if (isActive !== undefined) updateData.is_active = isActive ? 1 : 0;

    await db.update('cohorts', cohortId, updateData);
    const cohort = await db.getOne('SELECT * FROM cohorts WHERE id = ?', [cohortId]);
    res.json({ success: true, data: cohort, message: 'Cohort updated successfully' });
  } catch (error) {
    console.error('Update cohort error:', error);
    res.status(500).json({ error: 'Failed to update cohort' });
  }
}

async function deleteCohort(req, res) {
  try {
    const cohortId = parseInt(req.params.id);
    if (isNaN(cohortId)) {
      return res.status(400).json({ error: 'Invalid cohort ID' });
    }

    await db.query('DELETE FROM cohort_students WHERE cohort_id = ?', [cohortId]);
    await db.query('DELETE FROM cohorts WHERE id = ?', [cohortId]);
    res.json({ success: true, message: 'Cohort deleted successfully' });
  } catch (error) {
    console.error('Delete cohort error:', error);
    res.status(500).json({ error: 'Failed to delete cohort' });
  }
}

async function addStudentToCohort(req, res) {
  try {
    const cohortId = parseInt(req.params.id);
    const { studentId } = req.body;

    if (isNaN(cohortId) || !studentId) {
      return res.status(400).json({ error: 'Cohort ID and student ID are required' });
    }

    const cohort = await db.getOne('SELECT * FROM cohorts WHERE id = ?', [cohortId]);
    if (!cohort) {
      return res.status(404).json({ error: 'Cohort not found' });
    }

    if (cohort.max_students > 0) {
      const count = await db.getOne('SELECT COUNT(*) as cnt FROM cohort_students WHERE cohort_id = ?', [cohortId]);
      if (count.cnt >= cohort.max_students) {
        return res.status(400).json({ error: 'Cohort is full' });
      }
    }

    const existing = await db.getOne(
      'SELECT id FROM cohort_students WHERE cohort_id = ? AND student_id = ?',
      [cohortId, studentId]
    );
    if (existing) {
      return res.status(409).json({ error: 'Student already in this cohort' });
    }

    const id = await db.insert('cohort_students', {
      cohort_id: cohortId,
      student_id: studentId,
      enrolled_at: new Date()
    });

    res.status(201).json({ success: true, message: 'Student added to cohort' });
  } catch (error) {
    console.error('Add student to cohort error:', error);
    res.status(500).json({ error: 'Failed to add student' });
  }
}

async function removeStudentFromCohort(req, res) {
  try {
    const cohortId = parseInt(req.params.id);
    const studentId = parseInt(req.params.studentId);

    if (isNaN(cohortId) || isNaN(studentId)) {
      return res.status(400).json({ error: 'Invalid parameters' });
    }

    await db.query(
      'DELETE FROM cohort_students WHERE cohort_id = ? AND student_id = ?',
      [cohortId, studentId]
    );

    res.json({ success: true, message: 'Student removed from cohort' });
  } catch (error) {
    console.error('Remove student error:', error);
    res.status(500).json({ error: 'Failed to remove student' });
  }
}

async function getAvailableStudents(req, res) {
  try {
    const cohortId = parseInt(req.params.id);

    const enrolledIds = await db.query(
      'SELECT student_id FROM cohort_students WHERE cohort_id = ?',
      [cohortId]
    );
    const excludeIds = enrolledIds.map(r => r.student_id);

    let query;
    const params = [];
    if (excludeIds.length > 0) {
      const placeholders = excludeIds.map(() => '?').join(',');
      query = `SELECT id, full_name, email, username FROM users WHERE role_id = (SELECT id FROM roles WHERE name = 'student') AND id NOT IN (${placeholders}) ORDER BY full_name`;
      params.push(...excludeIds);
    } else {
      query = `SELECT id, full_name, email, username FROM users WHERE role_id = (SELECT id FROM roles WHERE name = 'student') ORDER BY full_name`;
    }

    const students = await db.query(query, params);
    res.json({ success: true, data: students });
  } catch (error) {
    console.error('Get available students error:', error);
    res.status(500).json({ error: 'Failed to load students' });
  }
}

module.exports = {
  getCohorts,
  getCohort,
  createCohort,
  updateCohort,
  deleteCohort,
  addStudentToCohort,
  removeStudentFromCohort,
  getAvailableStudents
};
