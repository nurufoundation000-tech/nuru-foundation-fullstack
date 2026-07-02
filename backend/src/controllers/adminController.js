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
      SELECT c.id, c.title, u.full_name as tutor_name, c.created_at 
      FROM courses c
      JOIN users u ON c.tutor_id = u.id
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
      SELECT c.*, u.full_name as tutor_name, u.email as tutor_email, cp.*
      FROM courses c
      JOIN users u ON c.tutor_id = u.id
      LEFT JOIN course_pricing cp ON c.id = cp.course_id
      ORDER BY c.created_at DESC
    `);

    res.json({ success: true, data: courses });
  } catch (error) {
    console.error('Get courses error:', error);
    res.status(500).json({ error: 'Failed to fetch courses' });
  }
}

async function createCourse(req, res) {
  try {
    const { title, description, category, level, thumbnailUrl, isPublished, pricing } = req.body;

    if (!title || !description) {
      return res.status(400).json({ error: 'Title and description are required' });
    }

    const adminUser = await db.getOne(`
      SELECT id FROM users WHERE role_id = (SELECT id FROM roles WHERE name = 'admin')
    `);

    const courseId = await db.insert('courses', {
      title,
      description,
      category: category || 'General',
      level: level || 'Beginner',
      thumbnail_url: thumbnailUrl || '',
      is_published: isPublished || false,
      tutor_id: adminUser?.id,
      created_at: new Date()
    });

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
    const { title, description, category, level, thumbnailUrl, isPublished, pricing } = req.body;

    const existingCourse = await db.getOne('SELECT id FROM courses WHERE id = ?', [courseId]);
    if (!existingCourse) {
      return res.status(404).json({ error: 'Course not found' });
    }

    const updateData = { updated_at: new Date() };
    if (title) updateData.title = title;
    if (description) updateData.description = description;
    if (category) updateData.category = category;
    if (level) updateData.level = level;
    if (thumbnailUrl !== undefined) updateData.thumbnail_url = thumbnailUrl;
    if (isPublished !== undefined) updateData.is_published = isPublished;

    await db.update('courses', courseId, updateData);

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
      SELECT e.*, u.full_name, u.email, c.title as course_title, t.full_name as tutor_name
      FROM enrollments e
      JOIN users u ON e.student_id = u.id
      JOIN courses c ON e.course_id = c.id
      JOIN users t ON c.tutor_id = t.id
      ORDER BY e.enrolled_at DESC
    `);

    res.json({ success: true, data: enrollments });
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
      SELECT c.id, c.title, c.category, u.full_name as tutor_name
      FROM courses c
      JOIN users u ON c.tutor_id = u.id
      ORDER BY c.title ASC
    `);

    res.json({ success: true, data: courses });
  } catch (error) {
    console.error('Get courses error:', error);
    res.status(500).json({ error: 'Failed to fetch courses' });
  }
}

async function getUsers(req, res) {
  try {
    const users = await db.query(`
      SELECT u.id, u.username, u.email, u.full_name, u.role_id, u.is_active, u.is_locked, 
             u.date_joined, u.created_at, u.updated_at, u.must_change_password,
             r.name as role_name,
             (SELECT COUNT(*) FROM courses WHERE tutor_id = u.id) as courses_count,
             (SELECT COUNT(*) FROM enrollments WHERE student_id = u.id) as enrollments_count
      FROM users u
      LEFT JOIN roles r ON u.role_id = r.id
      ORDER BY u.created_at DESC
    `);

    // Remove any accidentally included password_hash (security)
    const usersWithoutPassword = users.map(({ password_hash, ...user }) => user);

    res.json({ success: true, data: usersWithoutPassword, total: usersWithoutPassword.length });
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

    const paidInvoices = await db.query('SELECT COUNT(*) as count FROM invoices WHERE status = \'paid\'');
    const pendingInvoices = await db.query('SELECT COUNT(*) as count FROM invoices WHERE status = \'pending\'');
    const lockedInvoices = await db.query('SELECT COUNT(*) as count FROM invoices WHERE status = \'locked\'');

    res.json({
      success: true,
      userGrowth: { labels: userGrowth.map(r => r.date), data: userGrowth.map(r => r.count) },
      coursePopularity: { labels: coursePopularity.map(r => r.title), data: coursePopularity.map(r => r.count) },
      enrollmentTrends: { labels: enrollmentTrends.map(r => r.date), data: enrollmentTrends.map(r => r.count) },
      revenue: { labels: revenue.map(r => r.date), data: revenue.map(r => r.total) },
      completionRates: [
        Math.round((paidInvoices[0]?.count || 0) / Math.max((pendingInvoices[0]?.count || 0) + (paidInvoices[0]?.count || 0), 1) * 100),
        Math.round((pendingInvoices[0]?.count || 0) / Math.max((pendingInvoices[0]?.count || 0) + (lockedInvoices[0]?.count || 0), 1) * 100),
        Math.round((lockedInvoices[0]?.count || 0) / Math.max((pendingInvoices[0]?.count || 0) + (lockedInvoices[0]?.count || 0), 1) * 100)
      ],
      geographic: { labels: ['Nairobi', 'Mombasa', 'Kisumu', 'Other'], data: [45, 20, 15, 20] },
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
      : { billingDay: 1, gracePeriodDays: 2 };

    if (req.body.billingDay !== undefined) existing.billingDay = req.body.billingDay;
    if (req.body.gracePeriodDays !== undefined) existing.gracePeriodDays = req.body.gracePeriodDays;

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
      SELECT id, type, amount, status, due_date, month_number, paid_at, mpesa_receipt
      FROM invoices
      WHERE student_id = ? AND course_id = ?
      ORDER BY created_at ASC
    `, [req.user.userId, courseId]);

    const pricing = await db.getOne(
      'SELECT initial_payment, monthly_amount, billing_duration FROM course_pricing WHERE course_id = ?',
      [courseId]
    );

    res.json({
      success: true,
      data: {
        deposit: invoices.find(i => i.type === 'initial' || i.type === 'deposit'),
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
  getInstallmentSchedule
};