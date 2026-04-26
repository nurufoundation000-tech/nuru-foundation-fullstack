// controllers/adminController.js - Admin Dashboard Controller
import bcrypt from 'bcryptjs';
import db from '../config/database.js';

function generateRandomPassword(length = 12) {
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
  let password = '';
  for (let i = 0; i < length; i++) {
    password += charset.charAt(Math.floor(Math.random() * charset.length));
  }
  return password;
}

export async function getDashboardStats(req, res) {
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

export async function getCourses(req, res) {
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

export async function createCourse(req, res) {
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

export async function updateCourse(req, res) {
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

export async function deleteCourse(req, res) {
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

export async function getEnrollments(req, res) {
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

export async function createEnrollment(req, res) {
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

export async function getStudents(req, res) {
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

export async function getCoursesList(req, res) {
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

export async function getUsers(req, res) {
  try {
    const users = await db.query(`
      SELECT u.*, r.name as role_name,
             (SELECT COUNT(*) FROM courses WHERE tutor_id = u.id) as courses_count,
             (SELECT COUNT(*) FROM enrollments WHERE student_id = u.id) as enrollments_count
      FROM users u
      LEFT JOIN roles r ON u.role_id = r.id
      ORDER BY u.created_at DESC
    `);

    res.json({ success: true, data: users, total: users.length });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
}

export async function createUser(req, res) {
  try {
    const { username, email, fullName, role } = req.body;

    if (!username || !email || !fullName || !role) {
      return res.status(400).json({ error: 'Username, email, full name, and role are required' });
    }

    const existingUser = await db.getOne(`
      SELECT id FROM users WHERE email = ? OR username = ?
    `, [email.toLowerCase(), username]);

    if (existingUser) {
      return res.status(409).json({ error: 'User already exists' });
    }

    let roleRow = await db.getOne('SELECT id FROM roles WHERE name = ?', [role]);
    if (!roleRow) {
      roleRow = await db.insert('roles', { name: role });
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

    const user = await db.getOne('SELECT * FROM users WHERE id = ?', [userId]);
    const { password_hash, ...userWithoutPassword } = user;

    res.status(201).json({
      success: true,
      data: userWithoutPassword,
      message: `User created! Credentials - Username: ${username}, Password: ${generatedPassword}`
    });

  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({ error: 'Failed to create user: ' + error.message });
  }
}

export async function updateUser(req, res) {
  try {
    const { id } = req.params;
    const { username, email, fullName, role, isActive } = req.body;

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

    const updateData = { updated_at: new Date() };
    if (username) updateData.username = username;
    if (email) updateData.email = email.toLowerCase();
    if (fullName !== undefined) updateData.full_name = fullName;
    if (isActive !== undefined) updateData.is_active = isActive;

    if (role) {
      const roleRow = await db.getOne('SELECT id FROM roles WHERE name = ?', [role]);
      if (roleRow) {
        updateData.role_id = roleRow.id;
      }
    }

    await db.update('users', parseInt(id), updateData);

    const user = await db.getOne('SELECT * FROM users WHERE id = ?', [parseInt(id)]);
    const { password_hash, ...userWithoutPassword } = user;

    res.json({ success: true, data: userWithoutPassword });

  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ error: 'Failed to update user' });
  }
}

export default {
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
  updateUser
};