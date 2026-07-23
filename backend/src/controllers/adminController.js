// controllers/adminController.js - Admin Dashboard Controller (CommonJS)
const bcrypt = require('bcryptjs');
const db = require('../config/database.js');
const { sendWelcomeEmail } = require('../lib/email.js');

function generateRandomPassword(length = 12) {
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
  let password = '';
  for (let i = 0; i < length; i++) {
    password += charset.charAt(Math.floor(Math.random() * charset.length));
  }
  return password;
}

async function getDashboardStats(req, res) {
  try {
    const [totalUsers, totalCourses, totalEnrollments] = await Promise.all([
      db.query('SELECT COUNT(*) as count FROM users'),
      db.query('SELECT COUNT(*) as count FROM courses'),
      db.query('SELECT COUNT(*) as count FROM enrollments')
    ]);

    const recentUsers = await db.query(`
      SELECT id, full_name, email, created_at FROM users ORDER BY created_at DESC LIMIT 5
    `);

    const recentCourses = await db.query(`
      SELECT c.id, c.title,
             (SELECT GROUP_CONCAT(u.full_name SEPARATOR ', ') FROM course_tutors ct JOIN users u ON ct.tutor_id = u.id WHERE ct.course_id = c.id) as tutor_name,
             c.created_at
      FROM courses c
      ORDER BY c.created_at DESC LIMIT 5
    `);

    const recentActivity = [
      ...recentUsers.map(user => ({
        description: `New user registered: ${user.full_name || user.email}`,
        timestamp: user.created_at
      })),
      ...recentCourses.map(course => ({
        description: `New course created: ${course.title} by ${course.tutor_name}`,
        timestamp: course.created_at
      }))
    ].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, 10);

    res.json({
      success: true,
      stats: {
        totalUsers: totalUsers[0]?.count || 0,
        totalCourses: totalCourses[0]?.count || 0,
        totalEnrollments: totalEnrollments[0]?.count || 0
      },
      recentActivity
    });

  } catch (error) {
    console.error('Dashboard stats error:', error);
    res.status(500).json({ error: 'Failed to load dashboard data' });
  }
}

async function getCourses(req, res) {
  try {
    const courses = await db.query(`
      SELECT c.id, c.tutor_id, c.title, c.description, c.category, c.level,
             c.thumbnail_url, c.is_published, c.created_at, c.updated_at, c.slug,
             cp.initial_payment, cp.monthly_amount, cp.billing_duration, cp.is_active,
             (SELECT COUNT(*) FROM enrollments WHERE course_id = c.id) as enrollments_count,
             (SELECT COUNT(*) FROM lessons WHERE course_id = c.id) as lessons_count,
             (SELECT COUNT(*) FROM course_tutors WHERE course_id = c.id) as tutors_count
      FROM courses c
      LEFT JOIN course_pricing cp ON c.id = cp.course_id
      ORDER BY c.created_at DESC
    `);

    // Fetch all tutor assignments in one query
    let tutorMap = {};
    if (courses.length > 0) {
      const courseIds = courses.map(c => c.id);
      const placeholders = courseIds.map(() => '?').join(',');
      const tutors = await db.query(`
        SELECT ct.course_id, u.id, u.full_name, u.email, u.username
        FROM course_tutors ct
        JOIN users u ON ct.tutor_id = u.id
        WHERE ct.course_id IN (${placeholders})
      `, courseIds);
      tutors.forEach(t => {
        if (!tutorMap[t.course_id]) tutorMap[t.course_id] = [];
        tutorMap[t.course_id].push({ id: t.id, fullName: t.full_name, email: t.email, username: t.username });
      });
    }

    const transformed = courses.map(c => ({
      id: c.id,
      title: c.title,
      description: c.description,
      category: c.category,
      level: c.level,
      isPublished: !!c.is_published,
      thumbnailUrl: c.thumbnail_url,
      tutorIds: (tutorMap[c.id] || []).map(t => t.id),
      tutors: tutorMap[c.id] || [],
      coursePricing: c.initial_payment != null ? {
        initialPayment: c.initial_payment,
        monthlyAmount: c.monthly_amount,
        billingDuration: c.billing_duration,
        isActive: !!c.is_active
      } : null,
      _count: { enrollments: c.enrollments_count || 0, lessons: c.lessons_count || 0 },
      createdAt: c.created_at,
      updatedAt: c.updated_at
    }));

    res.json({ success: true, data: transformed });
  } catch (error) {
    console.error('Get courses error:', error);
    res.status(500).json({ error: 'Failed to fetch courses' });
  }
}

async function createCourse(req, res) {
  try {
    const { title, description, category, level, thumbnailUrl, isPublished, pricing, tutorIds } = req.body;

    if (!title || !description) {
      return res.status(400).json({ error: 'Title and description are required' });
    }

    if (!tutorIds || !Array.isArray(tutorIds) || tutorIds.length === 0) {
      return res.status(400).json({ error: 'At least one tutor must be assigned to the course' });
    }

    // Validate all tutors exist
    for (const tutorId of tutorIds) {
      const tutor = await db.getOne('SELECT id FROM users WHERE id = ? AND role_id = (SELECT id FROM roles WHERE name = \'tutor\')', [tutorId]);
      if (!tutor) {
        return res.status(400).json({ error: `Tutor with id ${tutorId} not found` });
      }
    }

    const courseId = await db.insert('courses', {
      title,
      description,
      category: category || 'General',
      level: level || 'Beginner',
      thumbnail_url: thumbnailUrl || '',
      is_published: isPublished || false,
      tutor_id: tutorIds[0],
      created_at: new Date()
    });

    // Assign all tutors to this course
    for (const tutorId of tutorIds) {
      await db.insert('course_tutors', {
        course_id: courseId,
        tutor_id: tutorId,
        assigned_at: new Date()
      });
    }

    if (pricing && (pricing.initialPayment > 0 || pricing.monthlyAmount > 0)) {
      await db.insert('course_pricing', {
        course_id: courseId,
        initial_payment: pricing.initialPayment,
        monthly_amount: pricing.monthlyAmount,
        billing_duration: pricing.billingDuration || 1,
        is_active: true
      });
    }

    const course = await db.getOne('SELECT * FROM courses WHERE id = ?', [courseId]);
    res.status(201).json({ success: true, data: course });

  } catch (error) {
    console.error('Create course error:', error);
    res.status(500).json({ error: 'Failed to create course' });
  }
}

async function updateCourse(req, res) {
  try {
    const courseId = parseInt(req.params.id);
    const { title, description, category, level, thumbnailUrl, isPublished, pricing, tutorIds } = req.body;

    const existingCourse = await db.getOne('SELECT id FROM courses WHERE id = ?', [courseId]);
    if (!existingCourse) {
      return res.status(404).json({ error: 'Course not found' });
    }

    if (tutorIds !== undefined) {
      if (!Array.isArray(tutorIds) || tutorIds.length === 0) {
        return res.status(400).json({ error: 'At least one tutor must be assigned to the course' });
      }
      for (const tutorId of tutorIds) {
        const tutor = await db.getOne('SELECT id FROM users WHERE id = ? AND role_id = (SELECT id FROM roles WHERE name = \'tutor\')', [tutorId]);
        if (!tutor) {
          return res.status(400).json({ error: `Tutor with id ${tutorId} not found` });
        }
      }
    }

    const updateData = { updated_at: new Date() };
    if (title) updateData.title = title;
    if (description) updateData.description = description;
    if (category) updateData.category = category;
    if (level) updateData.level = level;
    if (thumbnailUrl !== undefined) updateData.thumbnail_url = thumbnailUrl;
    if (isPublished !== undefined) updateData.is_published = isPublished;

    await db.update('courses', courseId, updateData);

    if (tutorIds !== undefined) {
      await db.query('DELETE FROM course_tutors WHERE course_id = ?', [courseId]);
      for (const tutorId of tutorIds) {
        await db.insert('course_tutors', {
          course_id: courseId,
          tutor_id: tutorId,
          assigned_at: new Date()
        });
      }
    }

    if (pricing) {
      const existingPricing = await db.getOne('SELECT id FROM course_pricing WHERE course_id = ?', [courseId]);
      if (existingPricing) {
        await db.update('course_pricing', existingPricing.id, {
          initial_payment: pricing.initialPayment || 0,
          monthly_amount: pricing.monthlyAmount || 0,
          billing_duration: pricing.billingDuration || 1,
          is_active: pricing.isActive !== undefined ? pricing.isActive : true
        });
      } else if (pricing.initialPayment > 0 || pricing.monthlyAmount > 0) {
        await db.insert('course_pricing', {
          course_id: courseId,
          initial_payment: pricing.initialPayment || 0,
          monthly_amount: pricing.monthlyAmount || 0,
          billing_duration: pricing.billingDuration || 1,
          is_active: pricing.isActive !== undefined ? pricing.isActive : true
        });
      }
    }

    const course = await db.getOne('SELECT * FROM courses WHERE id = ?', [courseId]);
    res.json({ success: true, data: course });

  } catch (error) {
    console.error('Update course error:', error);
    res.status(500).json({ error: 'Failed to update course' });
  }
}

async function deleteCourse(req, res) {
  try {
    const courseId = parseInt(req.params.id);

    const course = await db.getOne('SELECT id FROM courses WHERE id = ?', [courseId]);
    if (!course) {
      return res.status(404).json({ error: 'Course not found' });
    }

    await db.query('DELETE FROM courses WHERE id = ?', [courseId]);
    res.json({ success: true, message: 'Course deleted successfully' });

  } catch (error) {
    console.error('Delete course error:', error);
    res.status(500).json({ error: 'Failed to delete course' });
  }
}

async function getEnrollments(req, res) {
  try {
    const enrollments = await db.query(`
      SELECT e.*, u.full_name, u.username, u.email, c.title as course_title, c.category,
             (SELECT GROUP_CONCAT(tu.full_name SEPARATOR ', ') FROM course_tutors ct JOIN users tu ON ct.tutor_id = tu.id WHERE ct.course_id = c.id) as tutor_name
      FROM enrollments e
      JOIN users u ON e.student_id = u.id
      JOIN courses c ON e.course_id = c.id
      ORDER BY e.enrolled_at DESC
    `);

    const transformed = enrollments.map(e => ({
      id: e.id,
      student_id: e.student_id,
      course_id: e.course_id,
      student: { fullName: e.full_name, username: e.username, email: e.email },
      course: { title: e.course_title, category: e.category },
      courseId: e.course_id,
      enrolledAt: e.enrolled_at,
      status: e.completion_status || 'active',
      progress: e.progress || 0,
      expires_at: e.expires_at,
      last_accessed_at: e.last_accessed_at,
      created_at: e.created_at,
      tutor_name: e.tutor_name
    }));

    res.json({ success: true, data: transformed });
  } catch (error) {
    console.error('Get enrollments error:', error);
    res.status(500).json({ error: 'Failed to fetch enrollments' });
  }
}

async function createEnrollment(req, res) {
  try {
    const { studentId, courseId } = req.body;

    if (!studentId || !courseId) {
      return res.status(400).json({ error: 'Student ID and Course ID are required' });
    }

    const student = await db.getOne(`
      SELECT id FROM users WHERE id = ? AND role_id = (SELECT id FROM roles WHERE name = 'student')
    `, [studentId]);

    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }

    const course = await db.getOne('SELECT id FROM courses WHERE id = ?', [courseId]);
    if (!course) {
      return res.status(404).json({ error: 'Course not found' });
    }

    const existingEnrollment = await db.getOne(`
      SELECT id FROM enrollments WHERE student_id = ? AND course_id = ?
    `, [studentId, courseId]);

    if (existingEnrollment) {
      return res.status(409).json({ error: 'Student is already enrolled in this course' });
    }

    const enrollmentId = await db.insert('enrollments', {
      student_id: studentId,
      course_id: courseId,
      enrolled_at: new Date()
    });

    const enrollment = await db.getOne('SELECT * FROM enrollments WHERE id = ?', [enrollmentId]);

    res.status(201).json({ success: true, data: enrollment, message: 'Student enrolled successfully' });

  } catch (error) {
    console.error('Enroll student error:', error);
    res.status(500).json({ error: 'Failed to enroll student' });
  }
}

async function getStudents(req, res) {
  try {
    const students = await db.query(`
      SELECT id, full_name, email, username 
      FROM users 
      WHERE role_id = (SELECT id FROM roles WHERE name = 'student') AND is_active = 1
      ORDER BY full_name ASC
    `);

    res.json({ success: true, data: students });
  } catch (error) {
    console.error('Get students error:', error);
    res.status(500).json({ error: 'Failed to fetch students' });
  }
}

async function getCoursesList(req, res) {
  try {
    const courses = await db.query(`
      SELECT c.id, c.title, c.category,
             (SELECT GROUP_CONCAT(u.full_name SEPARATOR ', ') FROM course_tutors ct JOIN users u ON ct.tutor_id = u.id WHERE ct.course_id = c.id) as tutor_name
      FROM courses c
      ORDER BY c.title ASC
    `);

    res.json({ success: true, data: courses });
  } catch (error) {
    console.error('Get courses error:', error);
    res.status(500).json({ error: 'Failed to fetch courses' });
  }
}

async function getTutors(req, res) {
  try {
    const tutors = await db.query(`
      SELECT u.id, u.full_name, u.username, u.email
      FROM users u
      WHERE u.role_id = (SELECT id FROM roles WHERE name = 'tutor') AND u.is_active = 1
      ORDER BY u.full_name ASC
    `);

    res.json({ success: true, data: tutors });
  } catch (error) {
    console.error('Get tutors error:', error);
    res.status(500).json({ error: 'Failed to fetch tutors' });
  }
}

async function getUsers(req, res) {
  try {
    const users = await db.query(`
      SELECT u.id, u.username, u.email, u.full_name, u.role_id, u.is_active, u.is_locked, 
             u.date_joined, u.created_at, u.updated_at, u.must_change_password,
             r.name as role_name,
             (SELECT COUNT(*) FROM course_tutors WHERE tutor_id = u.id) as courses_count,
             (SELECT COUNT(*) FROM enrollments WHERE student_id = u.id) as enrollments_count
      FROM users u
      LEFT JOIN roles r ON u.role_id = r.id
      ORDER BY u.created_at DESC
    `);

    // Remove any accidentally included password_hash (security) and transform
    const transformed = users.map(({ password_hash, ...user }) => ({
      id: user.id,
      username: user.username,
      email: user.email,
      fullName: user.full_name,
      full_name: user.full_name,
      roleId: user.role_id,
      role: { name: user.role_name },
      role_name: user.role_name,
      isActive: !!user.is_active,
      is_active: user.is_active,
      isLocked: !!user.is_locked,
      dateJoined: user.created_at,
      createdAt: user.created_at,
      updatedAt: user.updated_at,
      mustChangePassword: !!user.must_change_password,
      coursesCount: user.courses_count || 0,
      enrollmentsCount: user.enrollments_count || 0
    }));

    res.json({ success: true, data: transformed, total: transformed.length });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
}

async function createUser(req, res) {
  try {
    const { email, fullName, role } = req.body;

    if (!email || !fullName || !role) {
      return res.status(400).json({ error: 'Email, full name, and role are required' });
    }

    // Handle both string and object formats for role
    let roleName = role;
    if (typeof role === 'object' && role !== null) {
      roleName = role.name;
    }

    // Auto-generate username from email
    const emailPrefix = email.split('@')[0].toLowerCase().replace(/[^a-z0-9_]/g, '_');
    let username = emailPrefix;
    let counter = 0;
    while (true) {
      const existing = await db.getOne('SELECT id FROM users WHERE username = ?', [username]);
      if (!existing) break;
      counter++;
      username = `${emailPrefix}${counter}`;
    }

    const existingUser = await db.getOne('SELECT id FROM users WHERE email = ?', [email.toLowerCase()]);
    if (existingUser) {
      return res.status(409).json({ error: 'User already exists' });
    }

    let roleRow = await db.getOne('SELECT id FROM roles WHERE name = ?', [roleName]);
    if (!roleRow) {
      roleRow = await db.insert('roles', { name: roleName });
    }

    const generatedPassword = generateRandomPassword();
    const hashedPassword = await bcrypt.hash(generatedPassword, 12);

    const userId = await db.insert('users', {
      username,
      email: email.toLowerCase(),
      full_name: fullName.trim(),
      password_hash: hashedPassword,
      role_id: roleRow.id || roleRow,
      is_active: true,
      date_joined: new Date()
    });

    console.log('User created:', email);

    const user = await db.getOne(`
      SELECT u.*, r.name as role_name FROM users u
      LEFT JOIN roles r ON u.role_id = r.id WHERE u.id = ?
    `, [userId]);
    const { password_hash, ...userWithoutPassword } = user;
    userWithoutPassword.fullName = userWithoutPassword.full_name;
    userWithoutPassword.isActive = !!userWithoutPassword.is_active;
    userWithoutPassword.mustChangePassword = !!userWithoutPassword.must_change_password;
    userWithoutPassword.role = userWithoutPassword.role_name;

    // Send welcome email
    let emailStatus = { sent: false, error: null, generatedPassword: null };
    try {
      const emailResult = await sendWelcomeEmail(email, username, generatedPassword);
      emailStatus = {
        sent: emailResult.success,
        error: emailResult.error || null,
        generatedPassword: emailResult.success ? null : generatedPassword
      };
      console.log('[Admin] Welcome email sent to:', email, 'Success:', emailResult.success);
      if (!emailResult.success && emailResult.error) {
        console.error('[Admin] Email error details:', emailResult.error);
      }
    } catch (emailError) {
      console.error('[Admin] Failed to send welcome email:', emailError.message);
      console.error('[Admin] Full error:', emailError);
      emailStatus = { sent: false, error: emailError.message, generatedPassword: generatedPassword };
    }

    res.status(201).json({
      success: true,
      data: userWithoutPassword,
      emailStatus: emailStatus,
      message: `User created! Credentials - Username: ${username}, Password: ${generatedPassword}`
    });

  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({ error: 'Failed to create user: ' + error.message });
  }
}

async function updateUser(req, res) {
  try {
    const { id } = req.params;
    const { username, email, fullName, role, isActive } = req.body;

    // Handle both string and object formats for role
    let roleName = role;
    if (typeof role === 'object' && role !== null) {
      roleName = role.name;
    }

    const existingUser = await db.getOne('SELECT * FROM users WHERE id = ?', [parseInt(id)]);
    if (!existingUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (email && email !== existingUser.email) {
      const emailExists = await db.getOne('SELECT id FROM users WHERE email = ? AND id != ?', [email.toLowerCase(), parseInt(id)]);
      if (emailExists) {
        return res.status(409).json({ error: 'Email already exists' });
      }
    }

    if (username && username !== existingUser.username) {
      const usernameExists = await db.getOne('SELECT id FROM users WHERE username = ? AND id != ?', [username, parseInt(id)]);
      if (usernameExists) {
        return res.status(409).json({ error: 'Username already exists' });
      }
    }

    const updateData = {
      username: username || existingUser.username,
      email: email ? email.toLowerCase() : existingUser.email,
      full_name: fullName !== undefined ? fullName : existingUser.full_name,
      is_active: isActive !== undefined ? isActive : existingUser.is_active
    };

    if (roleName) {
      const roleRow = await db.getOne('SELECT id FROM roles WHERE name = ?', [roleName]);
      if (roleRow) {
        updateData.role_id = roleRow.id;
      }
    }

    updateData.updated_at = new Date();

    await db.update('users', parseInt(id), updateData);

    const user = await db.getOne(`
      SELECT u.*, r.name as role_name FROM users u
      LEFT JOIN roles r ON u.role_id = r.id WHERE u.id = ?
    `, [parseInt(id)]);
    const { password_hash, ...userWithoutPassword } = user;
    userWithoutPassword.fullName = userWithoutPassword.full_name;
    userWithoutPassword.isActive = !!userWithoutPassword.is_active;
    userWithoutPassword.mustChangePassword = !!userWithoutPassword.must_change_password;
    userWithoutPassword.role = userWithoutPassword.role_name;
    
    res.json({ success: true, data: userWithoutPassword });
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ error: 'Failed to update user: ' + error.message });
  }
}

async function deleteUser(req, res) {
  try {
    const userId = parseInt(req.params.id);

    if (!userId || isNaN(userId)) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }

    const user = await db.getOne('SELECT id, email, username FROM users WHERE id = ?', [userId]);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    await db.query('DELETE FROM users WHERE id = ?', [userId]);
    console.log('User deleted:', user.email);

    res.json({ success: true, message: 'User deleted successfully' });

  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
}

// ==================== ADMIN ANALYTICS ====================

async function getAnalytics(req, res) {
  try {
    const period = req.query.period || '30d';
    const days = period === '7d' ? 7 : period === '90d' ? 90 : period === '1y' ? 365 : 30;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const [totalUsers, totalCourses, totalEnrollments, totalRevenue] = await Promise.all([
      db.query('SELECT COUNT(*) as count FROM users'),
      db.query('SELECT COUNT(*) as count FROM courses'),
      db.query('SELECT COUNT(*) as count FROM enrollments'),
      db.query('SELECT COALESCE(SUM(amount), 0) as total FROM invoices WHERE status = \'paid\'')
    ]);

    const userGrowth = await db.query(`
      SELECT DATE(created_at) as date, COUNT(*) as count
      FROM users WHERE created_at >= ?
      GROUP BY DATE(created_at) ORDER BY date
    `, [since]);

    const enrollmentTrends = await db.query(`
      SELECT DATE(enrolled_at) as date, COUNT(*) as count
      FROM enrollments WHERE enrolled_at >= ?
      GROUP BY DATE(enrolled_at) ORDER BY date
    `, [since]);

    const revenue = await db.query(`
      SELECT DATE(paid_at) as date, SUM(amount) as total
      FROM invoices WHERE status = 'paid' AND paid_at >= ?
      GROUP BY DATE(paid_at) ORDER BY date
    `, [since]);

    const coursePopularity = await db.query(`
      SELECT c.title, COUNT(e.id) as count
      FROM courses c
      LEFT JOIN enrollments e ON c.id = e.course_id
      GROUP BY c.id ORDER BY count DESC LIMIT 10
    `);

    // Course completion rates (real progress data)
    const progressData = await db.query(`
      SELECT e.id,
        COALESCE(lp.completed, 0) as completed_lessons,
        COALESCE(lc.total, 0) as total_lessons,
        COALESCE(np.read_count, 0) as read_notes,
        COALESCE(nc.total, 0) as total_notes
      FROM enrollments e
      LEFT JOIN (SELECT course_id, COUNT(*) as total FROM lessons GROUP BY course_id) lc ON e.course_id = lc.course_id
      LEFT JOIN (SELECT enrollment_id, SUM(is_completed) as completed FROM lesson_progress GROUP BY enrollment_id) lp ON e.id = lp.enrollment_id
      LEFT JOIN (SELECT course_id, COUNT(*) as total FROM course_notes GROUP BY course_id) nc ON e.course_id = nc.course_id
      LEFT JOIN (SELECT np.student_id, cn.course_id, COUNT(*) as read_count FROM note_progress np JOIN course_notes cn ON np.note_id = cn.id GROUP BY np.student_id, cn.course_id) np ON e.student_id = np.student_id AND e.course_id = np.course_id
    `);

    let completed = 0, inProgress = 0, notStarted = 0;
    for (const p of progressData) {
      const totalItems = (p.total_lessons || 0) + (p.total_notes || 0);
      const completedItems = (p.completed_lessons || 0) + (p.read_notes || 0);
      if (totalItems === 0 || completedItems === 0) {
        notStarted++;
      } else if (completedItems >= totalItems) {
        completed++;
      } else {
        inProgress++;
      }
    }
    const totalEnrolledProgress = completed + inProgress + notStarted;
    const completionRates = totalEnrolledProgress > 0 ? [
      Math.round(completed / totalEnrolledProgress * 100),
      Math.round(inProgress / totalEnrolledProgress * 100),
      Math.round(notStarted / totalEnrolledProgress * 100)
    ] : [0, 0, 100];

    // Invoice/payment status distribution
    const invoiceStatus = await db.getOne(`
      SELECT
        SUM(CASE WHEN status = 'paid' THEN 1 ELSE 0 END) as paid,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'locked' THEN 1 ELSE 0 END) as locked
      FROM invoices
    `);

    res.json({
      success: true,
      userGrowth: { labels: userGrowth.map(r => r.date), data: userGrowth.map(r => r.count) },
      coursePopularity: { labels: coursePopularity.map(r => r.title), data: coursePopularity.map(r => r.count) },
      enrollmentTrends: { labels: enrollmentTrends.map(r => r.date), data: enrollmentTrends.map(r => r.count) },
      revenue: { labels: revenue.map(r => r.date), data: revenue.map(r => r.total) },
      completionRates,
      paymentStatus: {
        labels: ['Paid', 'Pending', 'Overdue'],
        data: [invoiceStatus?.paid || 0, invoiceStatus?.pending || 0, invoiceStatus?.locked || 0]
      },
      stats: { totalUsers: totalUsers[0]?.count || 0, totalCourses: totalCourses[0]?.count || 0, totalEnrollments: totalEnrollments[0]?.count || 0, totalRevenue: totalRevenue[0]?.total || 0 }
    });
  } catch (error) {
    console.error('Get analytics error:', error);
    res.status(500).json({ error: 'Failed to load analytics' });
  }
}

// ==================== ADMIN SETTINGS ====================

async function getSettings(req, res) {
  try {
    const rows = await db.query('SELECT setting_key, setting_value FROM settings');
    const settings = {};
    rows.forEach(r => { settings[r.setting_key] = r.setting_value; });

    res.json({
      success: true,
      platformName: settings.platformName || 'Nuru Foundation',
      contactEmail: settings.contactEmail || '',
      defaultLanguage: settings.defaultLanguage || 'en',
      timezone: settings.timezone || 'Africa/Nairobi',
      allowRegistration: settings.allowRegistration !== 'false',
      emailVerification: settings.emailVerification === 'true',
      twoFactorAuth: settings.twoFactorAuth === 'true',
      sessionTimeout: parseInt(settings.sessionTimeout) || 60,
      autoApproveCourses: settings.autoApproveCourses === 'true',
      maxFileSize: parseInt(settings.maxFileSize) || 100,
      allowedFileTypes: settings.allowedFileTypes || 'jpg,png,pdf,doc,docx',
      courseCategories: settings.courseCategories || 'Technology, Business, Creative',
      welcomeEmail: settings.welcomeEmail !== 'false',
      completionEmail: settings.completionEmail !== 'false',
      weeklyDigest: settings.weeklyDigest === 'true',
      smtpServer: settings.smtpServer || '',
      passwordPolicy: settings.passwordPolicy || 'default',
      maxLoginAttempts: parseInt(settings.maxLoginAttempts) || 5,
      dataRetention: parseInt(settings.dataRetention) || 365,
      ipWhitelist: settings.ipWhitelist || '',
      paymentGateway: settings.paymentGateway || 'mpesa',
      currency: settings.currency || 'KES',
      freeTrialDays: parseInt(settings.freeTrialDays) || 7,
      subscriptionPlans: settings.subscriptionPlans === 'true'
    });
  } catch (error) {
    console.error('Get settings error:', error);
    res.status(500).json({ error: 'Failed to load settings' });
  }
}

async function updateSettings(req, res) {
  try {
    const allowed = [
      'platformName', 'contactEmail', 'defaultLanguage', 'timezone',
      'allowRegistration', 'emailVerification', 'twoFactorAuth', 'sessionTimeout',
      'autoApproveCourses', 'maxFileSize', 'allowedFileTypes', 'courseCategories',
      'welcomeEmail', 'completionEmail', 'weeklyDigest', 'smtpServer',
      'passwordPolicy', 'maxLoginAttempts', 'dataRetention', 'ipWhitelist',
      'paymentGateway', 'currency', 'freeTrialDays', 'subscriptionPlans'
    ];

    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        const value = String(req.body[key]);
        const existing = await db.getOne('SELECT setting_key FROM settings WHERE setting_key = ?', [key]);
        if (existing) {
          await db.query('UPDATE settings SET setting_value = ?, updated_at = NOW() WHERE setting_key = ?', [value, key]);
        } else {
          await db.insert('settings', { setting_key: key, setting_value: value });
        }
      }
    }

    res.json({ success: true, message: 'Settings saved' });
  } catch (error) {
    console.error('Update settings error:', error);
    res.status(500).json({ error: 'Failed to save settings' });
  }
}

// ==================== COURSE PRICING ====================

async function getCoursePricing(req, res) {
  try {
    const pricing = await db.query(`
      SELECT c.id as courseId, c.title as courseTitle,
             cp.initial_payment as initialPayment, cp.monthly_amount as monthlyAmount,
             cp.billing_duration as billingDuration, cp.is_active as isActive
      FROM courses c
      LEFT JOIN course_pricing cp ON c.id = cp.course_id
      ORDER BY c.title
    `);
    res.json({ success: true, data: pricing });
  } catch (error) {
    console.error('Get course pricing error:', error);
    res.status(500).json({ error: 'Failed to load pricing' });
  }
}

async function createOrUpdatePricing(req, res) {
  try {
    const { courseId, initialPayment, monthlyAmount, billingDuration } = req.body;

    if (!courseId) {
      return res.status(400).json({ error: 'Course ID is required' });
    }

    const course = await db.getOne('SELECT id FROM courses WHERE id = ?', [courseId]);
    if (!course) {
      return res.status(404).json({ error: 'Course not found' });
    }

    const existing = await db.getOne('SELECT id FROM course_pricing WHERE course_id = ?', [courseId]);
    if (existing) {
      await db.update('course_pricing', existing.id, {
        initial_payment: initialPayment || 0,
        monthly_amount: monthlyAmount || 0,
        billing_duration: billingDuration || 1,
        is_active: 1
      });
    } else {
      await db.insert('course_pricing', {
        course_id: courseId,
        initial_payment: initialPayment || 0,
        monthly_amount: monthlyAmount || 0,
        billing_duration: billingDuration || 1,
        is_active: 1
      });
    }

    res.json({ success: true, message: 'Pricing saved' });
  } catch (error) {
    console.error('Update pricing error:', error);
    res.status(500).json({ error: 'Failed to save pricing' });
  }
}

// ==================== GLOBAL BILLING SETTINGS ====================

async function getGlobalSettings(req, res) {
  try {
    const { getGlobalSettings: loadSettings } = require('../lib/invoices.js');
    const settings = await loadSettings();
    res.json({ success: true, data: settings });
  } catch (error) {
    console.error('Get global settings error:', error);
    res.status(500).json({ error: 'Failed to load global settings' });
  }
}

async function updateGlobalSettings(req, res) {
  try {
    const fs = require('fs');
    const settingsPath = './global-billing.json';
    const existing = fs.existsSync(settingsPath)
      ? JSON.parse(fs.readFileSync(settingsPath, 'utf8'))
      : { billingDay: 1, gracePeriodDays: 2, mpesa_paybill: '', mpesa_till_number: '' };

    if (req.body.billingDay !== undefined) existing.billingDay = req.body.billingDay;
    if (req.body.gracePeriodDays !== undefined) existing.gracePeriodDays = req.body.gracePeriodDays;
    if (req.body.mpesa_paybill !== undefined) existing.mpesa_paybill = req.body.mpesa_paybill;
    if (req.body.mpesa_till_number !== undefined) existing.mpesa_till_number = req.body.mpesa_till_number;

    fs.writeFileSync(settingsPath, JSON.stringify(existing, null, 2));
    res.json({ success: true, data: existing, message: 'Global billing settings saved' });
  } catch (error) {
    console.error('Update global settings error:', error);
    res.status(500).json({ error: 'Failed to save global settings' });
  }
}

// ==================== ADMIN TRANSACTIONS ====================

async function getAdminTransactions(req, res) {
  try {
    const transactions = await db.query(`
      SELECT i.*, u.full_name, u.username, u.email, c.title as course_title
      FROM invoices i
      JOIN users u ON i.student_id = u.id
      JOIN courses c ON i.course_id = c.id
      WHERE i.status = 'paid'
      ORDER BY i.paid_at DESC
    `);

    const transformed = transactions.map(t => ({
      id: t.id,
      student: { fullName: t.full_name, username: t.username, email: t.email },
      course: { title: t.course_title },
      type: t.type || 'initial',
      amount: t.amount,
      status: t.status,
      mpesaReceipt: t.mpesa_receipt,
      transactionId: t.transaction_id,
      paidAt: t.paid_at,
      createdAt: t.created_at
    }));

    res.json({ success: true, data: transformed });
  } catch (error) {
    console.error('Get transactions error:', error);
    res.status(500).json({ error: 'Failed to load transactions' });
  }
}

// ==================== ADMIN INVOICES ====================

async function getAdminInvoices(req, res) {
  try {
    const invoices = await db.query(`
      SELECT i.*, u.full_name, u.username, u.email, c.title as course_title
      FROM invoices i
      JOIN users u ON i.student_id = u.id
      JOIN courses c ON i.course_id = c.id
      ORDER BY i.created_at DESC
    `);

    const transformed = invoices.map(inv => ({
      id: inv.id,
      student: { fullName: inv.full_name, username: inv.username, email: inv.email },
      course: { title: inv.course_title },
      type: inv.type || 'initial',
      amount: inv.amount,
      status: inv.status,
      monthNumber: inv.month_number,
      dueDate: inv.due_date,
      paidAt: inv.paid_at,
      mpesaReceipt: inv.mpesa_receipt,
      createdAt: inv.created_at
    }));

    res.json({ success: true, data: transformed });
  } catch (error) {
    console.error('Get admin invoices error:', error);
    res.status(500).json({ error: 'Failed to load invoices' });
  }
}

async function unlockInvoice(req, res) {
  try {
    const invoiceId = parseInt(req.params.id);

    if (isNaN(invoiceId)) {
      return res.status(400).json({ error: 'Invalid invoice ID' });
    }

    const invoice = await db.getOne('SELECT * FROM invoices WHERE id = ?', [invoiceId]);
    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    await db.update('invoices', invoiceId, {
      status: 'paid',
      paid_at: new Date()
    });

    const hasUnpaid = await db.getOne(`
      SELECT id FROM invoices
      WHERE student_id = ? AND status IN ('pending', 'locked') AND id != ?
    `, [invoice.student_id, invoiceId]);

    if (!hasUnpaid) {
      await db.query('UPDATE users SET is_locked = 0 WHERE id = ?', [invoice.student_id]);
    }

    res.json({ success: true, message: 'Invoice unlocked and student access restored' });
  } catch (error) {
    console.error('Unlock invoice error:', error);
    res.status(500).json({ error: 'Failed to unlock invoice' });
  }
}

// ==================== ADMIN ENROLLMENT UPDATE/DELETE ====================

async function updateEnrollment(req, res) {
  try {
    const enrollmentId = parseInt(req.params.id);

    if (isNaN(enrollmentId)) {
      return res.status(400).json({ error: 'Invalid enrollment ID' });
    }

    const { status, progress } = req.body;
    const updateData = {};

    if (status) updateData.completion_status = status;
    if (progress !== undefined) {
      await db.query(
        'UPDATE lesson_progress SET is_completed = ? WHERE enrollment_id = ?',
        [progress > 50 ? 1 : 0, enrollmentId]
      );
    }

    await db.update('enrollments', enrollmentId, updateData);
    const enrollment = await db.getOne('SELECT * FROM enrollments WHERE id = ?', [enrollmentId]);
    res.json({ success: true, data: enrollment, message: 'Enrollment updated' });
  } catch (error) {
    console.error('Update enrollment error:', error);
    res.status(500).json({ error: 'Failed to update enrollment' });
  }
}

async function adminDeleteEnrollment(req, res) {
  try {
    const enrollmentId = parseInt(req.params.id);

    if (isNaN(enrollmentId)) {
      return res.status(400).json({ error: 'Invalid enrollment ID' });
    }

    await db.query('DELETE FROM lesson_progress WHERE enrollment_id = ?', [enrollmentId]);
    await db.query('DELETE FROM invoices WHERE student_id IN (SELECT student_id FROM enrollments WHERE id = ?) AND course_id IN (SELECT course_id FROM enrollments WHERE id = ?)', [enrollmentId, enrollmentId]);
    await db.query('DELETE FROM enrollments WHERE id = ?', [enrollmentId]);

    res.json({ success: true, message: 'Enrollment removed' });
  } catch (error) {
    console.error('Delete enrollment error:', error);
    res.status(500).json({ error: 'Failed to delete enrollment' });
  }
}

// ==================== STUDENT INSTALLMENT SCHEDULE ====================

async function getInstallmentSchedule(req, res) {
  try {
    const courseId = parseInt(req.params.courseId);

    if (isNaN(courseId)) {
      return res.status(400).json({ error: 'Invalid course ID' });
    }

    const enrollment = await db.getOne(
      'SELECT id, enrolled_at FROM enrollments WHERE student_id = ? AND course_id = ?',
      [req.user.userId, courseId]
    );

    if (!enrollment) {
      return res.status(403).json({ error: 'Not enrolled' });
    }

    const invoices = await db.query(`
      SELECT i.id, i.type, i.amount, i.status, i.due_date, i.month_number, i.paid_at, i.mpesa_receipt, c.title as course_title
      FROM invoices i
      JOIN courses c ON i.course_id = c.id
      WHERE i.student_id = ? AND i.course_id = ?
      ORDER BY i.created_at ASC
    `, [req.user.userId, courseId]);

    const pricing = await db.getOne(
      'SELECT initial_payment, monthly_amount, billing_duration FROM course_pricing WHERE course_id = ?',
      [courseId]
    );

    const deposit = invoices.find(i => i.type === 'initial' || i.type === 'deposit');
    const depositData = deposit ? { ...deposit, courseTitle: deposit.course_title } : null;

    res.json({
      success: true,
      data: {
        deposit: depositData,
        monthlyInvoices: invoices.filter(i => i.type === 'monthly'),
        pricing: pricing ? {
          initialPayment: pricing.initial_payment,
          monthlyAmount: pricing.monthly_amount,
          billingDuration: pricing.billing_duration
        } : null
      }
    });
  } catch (error) {
    console.error('Get installment schedule error:', error);
    res.status(500).json({ error: 'Failed to load installment schedule' });
  }
}

async function getStudentPaymentSummary(req, res) {
  try {
    const studentId = parseInt(req.params.id);

    if (isNaN(studentId)) {
      return res.status(400).json({ error: 'Invalid student ID' });
    }

    const student = await db.getOne('SELECT id, full_name, email, username FROM users WHERE id = ?', [studentId]);

    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }

    const invoices = await db.query(`
      SELECT i.*, c.title as course_title
      FROM invoices i
      JOIN courses c ON i.course_id = c.id
      WHERE i.student_id = ?
      ORDER BY i.course_id, i.created_at ASC
    `, [studentId]);

    const totalPaid = invoices
      .filter(i => i.status === 'paid')
      .reduce((sum, i) => sum + (i.amount || 0), 0);

    const totalPending = invoices
      .filter(i => i.status === 'pending')
      .reduce((sum, i) => sum + (i.amount || 0), 0);

    const totalOverdue = invoices
      .filter(i => i.status === 'locked')
      .reduce((sum, i) => sum + (i.amount || 0), 0);

    const enrolledCourses = await db.query(`
      SELECT c.id, c.title, cp.initial_payment, cp.monthly_amount, cp.billing_duration
      FROM enrollments e
      JOIN courses c ON e.course_id = c.id
      LEFT JOIN course_pricing cp ON cp.course_id = c.id
      WHERE e.student_id = ?
      ORDER BY c.title
    `, [studentId]);

    const courseMap = {};
    for (const inv of invoices) {
      if (!courseMap[inv.course_id]) {
        courseMap[inv.course_id] = [];
      }
      courseMap[inv.course_id].push(inv);
    }

    const courses = enrolledCourses.map(ec => {
      const courseInvoices = courseMap[ec.id] || [];
      const deposit = courseInvoices.find(i => i.type === 'initial' || i.type === 'deposit');
      const monthly = courseInvoices.filter(i => i.type === 'monthly');
      const paidMonthly = monthly.filter(i => i.status === 'paid');
      const monthlyPaidAmount = paidMonthly.reduce((sum, i) => sum + (i.amount || 0), 0);
      const monthlyTotalAmount = monthly.reduce((sum, i) => sum + (i.amount || 0), 0);

      return {
        courseId: ec.id,
        courseTitle: ec.title,
        initialPayment: ec.initial_payment || 0,
        monthlyAmount: ec.monthly_amount || 0,
        billingDuration: ec.billing_duration || 0,
        deposit: deposit ? {
          id: deposit.id,
          amount: deposit.amount,
          status: deposit.status,
          paidAt: deposit.paid_at
        } : null,
        monthlyInvoices: {
          total: monthly.length,
          paid: paidMonthly.length,
          pending: monthly.filter(i => i.status === 'pending').length,
          overdue: monthly.filter(i => i.status === 'locked').length,
          paidAmount: monthlyPaidAmount,
          totalAmount: monthlyTotalAmount
        },
        balanceRemaining: monthly.filter(i => i.status !== 'paid').reduce((sum, i) => sum + (i.amount || 0), 0) + 
          (deposit && deposit.status !== 'paid' ? (deposit.amount || 0) : 0)
      };
    });

    res.json({
      success: true,
      data: {
        student: {
          id: student.id,
          fullName: student.full_name,
          email: student.email,
          username: student.username
        },
        summary: {
          totalPaid,
          totalPending,
          totalOverdue,
          totalOwed: totalPending + totalOverdue,
          invoiceCount: invoices.length,
          paidCount: invoices.filter(i => i.status === 'paid').length,
          pendingCount: invoices.filter(i => i.status === 'pending').length,
          overdueCount: invoices.filter(i => i.status === 'locked').length
        },
        invoices,
        courses
      }
    });
  } catch (error) {
    console.error('Get student payment summary error:', error);
    res.status(500).json({ error: 'Failed to load payment summary' });
  }
}

module.exports = {
  getDashboardStats,
  getCourses,
  createCourse,
  updateCourse,
  deleteCourse,
  getEnrollments,
  createEnrollment,
  getStudents,
  getCoursesList,
  getTutors,
  getUsers,
  createUser,
  updateUser,
  deleteUser,
  getAnalytics,
  getSettings,
  updateSettings,
  getCoursePricing,
  createOrUpdatePricing,
  getGlobalSettings,
  updateGlobalSettings,
  getAdminTransactions,
  getAdminInvoices,
  unlockInvoice,
  updateEnrollment,
  adminDeleteEnrollment,
  getInstallmentSchedule,
  getStudentPaymentSummary
};
