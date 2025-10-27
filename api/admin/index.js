const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const jwt = require('jsonwebtoken');
const prisma = require('../../lib/prisma');

// Load environment variables
if (process.env.NODE_ENV !== 'production') {
  try {
    require('dotenv-flow').config();
  } catch (err) {
    console.warn('dotenv-flow not loaded (production environment):', err.message);
  }
}

const app = express();

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

// Auth middleware
const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'Access token required' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret');

    // Verify user still exists and get role info
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      include: { role: true }
    });

    if (!user || !user.isActive) {
      return res.status(403).json({ message: 'User not found or inactive' });
    }

    req.user = {
      userId: user.id,
      roleId: user.roleId,
      roleName: user.role?.name,
      username: user.username
    };

    next();
  } catch (error) {
    console.error('Token verification error:', error);
    return res.status(403).json({ message: 'Invalid or expired token' });
  }
};

// Middleware to check specific roles
const requireRole = (allowedRoles) => {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    if (!allowedRoles.includes(req.user.roleName)) {
      return res.status(403).json({
        message: `Access denied. Required roles: ${allowedRoles.join(', ')}`
      });
    }

    next();
  };
};

// Helper function to get pagination params
const getPaginationParams = (req) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 50;
  const offset = (page - 1) * limit;
  return { page, limit, offset };
};

// Helper function to apply search filters
const applySearchFilter = (search, searchFields) => {
  if (!search || !searchFields.length) return {};

  return {
    OR: searchFields.map(field => ({
      [field]: {
        contains: search,
        mode: 'insensitive'
      }
    }))
  };
};

// Admin action logging
app.post('/actions', authenticateToken, requireRole(['admin']), async (req, res) => {
  const { actionType, description } = req.body;

  try {
    const action = await prisma.adminAction.create({
      data: {
        adminId: req.user.userId,
        actionType,
        description
      }
    });

    res.status(201).json(action);
  } catch (error) {
    console.error('Create admin action error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// USERS CRUD
app.get('/users', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const { page, limit, offset } = getPaginationParams(req);
    const search = req.query.search;
    const searchFields = ['username', 'email', 'fullName'];

    const where = applySearchFilter(search, searchFields);

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        include: {
          role: true,
          _count: {
            select: {
              courses: true,
              enrollments: true,
              submissions: true
            }
          }
        },
        skip: offset,
        take: limit,
        orderBy: { createdAt: 'desc' }
      }),
      prisma.user.count({ where })
    ]);

    res.json({
      data: users,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ message: 'Failed to fetch users' });
  }
});

app.post('/users', authenticateToken, requireRole(['admin']), async (req, res) => {
  const { username, email, passwordHash, fullName, bio, roleId } = req.body;

  try {
    const user = await prisma.user.create({
      data: {
        username,
        email,
        passwordHash,
        fullName,
        bio,
        roleId
      },
      include: { role: true }
    });

    res.status(201).json(user);
  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({ message: 'Failed to create user' });
  }
});

app.put('/users/:id', authenticateToken, requireRole(['admin']), async (req, res) => {
  const { id } = req.params;
  const { username, email, fullName, bio, roleId, isActive } = req.body;

  try {
    const user = await prisma.user.update({
      where: { id: parseInt(id) },
      data: {
        username,
        email,
        fullName,
        bio,
        roleId,
        isActive
      },
      include: { role: true }
    });

    res.json(user);
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({ message: 'Failed to update user' });
  }
});

app.delete('/users/:id', authenticateToken, requireRole(['admin']), async (req, res) => {
  const { id } = req.params;

  try {
    await prisma.user.update({
      where: { id: parseInt(id) },
      data: { isActive: false }
    });

    res.json({ message: 'User deactivated successfully' });
  } catch (error) {
    console.error('Error deactivating user:', error);
    res.status(500).json({ message: 'Failed to deactivate user' });
  }
});

// ROLES CRUD
app.get('/roles', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const roles = await prisma.role.findMany({
      include: {
        _count: {
          select: { users: true }
        }
      }
    });

    res.json(roles);
  } catch (error) {
    console.error('Error fetching roles:', error);
    res.status(500).json({ message: 'Failed to fetch roles' });
  }
});

app.post('/roles', authenticateToken, requireRole(['admin']), async (req, res) => {
  const { name } = req.body;

  try {
    const role = await prisma.role.create({
      data: { name }
    });

    res.status(201).json(role);
  } catch (error) {
    console.error('Error creating role:', error);
    res.status(500).json({ message: 'Failed to create role' });
  }
});

app.put('/roles/:id', authenticateToken, requireRole(['admin']), async (req, res) => {
  const { id } = req.params;
  const { name } = req.body;

  try {
    const role = await prisma.role.update({
      where: { id: parseInt(id) },
      data: { name }
    });

    res.json(role);
  } catch (error) {
    console.error('Error updating role:', error);
    res.status(500).json({ message: 'Failed to update role' });
  }
});

app.delete('/roles/:id', authenticateToken, requireRole(['admin']), async (req, res) => {
  const { id } = req.params;

  try {
    await prisma.role.delete({
      where: { id: parseInt(id) }
    });

    res.json({ message: 'Role deleted successfully' });
  } catch (error) {
    console.error('Error deleting role:', error);
    res.status(500).json({ message: 'Failed to delete role' });
  }
});

// COURSES CRUD
app.get('/courses', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const { page, limit, offset } = getPaginationParams(req);
    const search = req.query.search;
    const searchFields = ['title', 'description'];

    const where = applySearchFilter(search, searchFields);

    const [courses, total] = await Promise.all([
      prisma.course.findMany({
        where,
        include: {
          tutor: {
            select: { id: true, username: true, fullName: true }
          },
          _count: {
            select: {
              enrollments: true,
              lessons: true,
              courseReviews: true
            }
          }
        },
        skip: offset,
        take: limit,
        orderBy: { createdAt: 'desc' }
      }),
      prisma.course.count({ where })
    ]);

    res.json({
      data: courses,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching courses:', error);
    res.status(500).json({ message: 'Failed to fetch courses' });
  }
});

app.post('/courses', authenticateToken, requireRole(['admin']), async (req, res) => {
  const { tutorId, title, description, category, level, thumbnailUrl, isPublished } = req.body;

  try {
    const course = await prisma.course.create({
      data: {
        tutorId,
        title,
        description,
        category,
        level,
        thumbnailUrl,
        isPublished
      },
      include: {
        tutor: {
          select: { id: true, username: true, fullName: true }
        }
      }
    });

    res.status(201).json(course);
  } catch (error) {
    console.error('Error creating course:', error);
    res.status(500).json({ message: 'Failed to create course' });
  }
});

app.put('/courses/:id', authenticateToken, requireRole(['admin']), async (req, res) => {
  const { id } = req.params;
  const { tutorId, title, description, category, level, thumbnailUrl, isPublished } = req.body;

  try {
    const course = await prisma.course.update({
      where: { id: parseInt(id) },
      data: {
        tutorId,
        title,
        description,
        category,
        level,
        thumbnailUrl,
        isPublished
      },
      include: {
        tutor: {
          select: { id: true, username: true, fullName: true }
        }
      }
    });

    res.json(course);
  } catch (error) {
    console.error('Error updating course:', error);
    res.status(500).json({ message: 'Failed to update course' });
  }
});

app.delete('/courses/:id', authenticateToken, requireRole(['admin']), async (req, res) => {
  const { id } = req.params;

  try {
    await prisma.course.delete({
      where: { id: parseInt(id) }
    });

    res.json({ message: 'Course deleted successfully' });
  } catch (error) {
    console.error('Error deleting course:', error);
    res.status(500).json({ message: 'Failed to delete course' });
  }
});

// LESSONS CRUD
app.get('/lessons', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const { page, limit, offset } = getPaginationParams(req);
    const search = req.query.search;
    const searchFields = ['title', 'content'];

    const where = applySearchFilter(search, searchFields);

    const [lessons, total] = await Promise.all([
      prisma.lesson.findMany({
        where,
        include: {
          course: {
            select: { id: true, title: true }
          },
          _count: {
            select: { assignments: true }
          }
        },
        skip: offset,
        take: limit,
        orderBy: { createdAt: 'desc' }
      }),
      prisma.lesson.count({ where })
    ]);

    res.json({
      data: lessons,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching lessons:', error);
    res.status(500).json({ message: 'Failed to fetch lessons' });
  }
});

app.post('/lessons', authenticateToken, requireRole(['admin']), async (req, res) => {
  const { courseId, title, content, videoUrl, orderIndex } = req.body;

  try {
    const lesson = await prisma.lesson.create({
      data: {
        courseId,
        title,
        content,
        videoUrl,
        orderIndex
      },
      include: {
        course: {
          select: { id: true, title: true }
        }
      }
    });

    res.status(201).json(lesson);
  } catch (error) {
    console.error('Error creating lesson:', error);
    res.status(500).json({ message: 'Failed to create lesson' });
  }
});

app.put('/lessons/:id', authenticateToken, requireRole(['admin']), async (req, res) => {
  const { id } = req.params;
  const { courseId, title, content, videoUrl, orderIndex } = req.body;

  try {
    const lesson = await prisma.lesson.update({
      where: { id: parseInt(id) },
      data: {
        courseId,
        title,
        content,
        videoUrl,
        orderIndex
      },
      include: {
        course: {
          select: { id: true, title: true }
        }
      }
    });

    res.json(lesson);
  } catch (error) {
    console.error('Error updating lesson:', error);
    res.status(500).json({ message: 'Failed to update lesson' });
  }
});

app.delete('/lessons/:id', authenticateToken, requireRole(['admin']), async (req, res) => {
  const { id } = req.params;

  try {
    await prisma.lesson.delete({
      where: { id: parseInt(id) }
    });

    res.json({ message: 'Lesson deleted successfully' });
  } catch (error) {
    console.error('Error deleting lesson:', error);
    res.status(500).json({ message: 'Failed to delete lesson' });
  }
});

// ENROLLMENTS CRUD
app.get('/enrollments', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const { page, limit, offset } = getPaginationParams(req);

    const [enrollments, total] = await Promise.all([
      prisma.enrollment.findMany({
        include: {
          student: {
            select: { id: true, username: true, fullName: true, email: true }
          },
          course: {
            select: { id: true, title: true }
          }
        },
        skip: offset,
        take: limit,
        orderBy: { enrolledAt: 'desc' }
      }),
      prisma.enrollment.count()
    ]);

    res.json({
      data: enrollments,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching enrollments:', error);
    res.status(500).json({ message: 'Failed to fetch enrollments' });
  }
});

app.post('/enrollments', authenticateToken, requireRole(['admin']), async (req, res) => {
  const { studentId, courseId, progress } = req.body;

  try {
    const enrollment = await prisma.enrollment.create({
      data: {
        studentId,
        courseId,
        progress: progress || 0.0
      },
      include: {
        student: {
          select: { id: true, username: true, fullName: true, email: true }
        },
        course: {
          select: { id: true, title: true }
        }
      }
    });

    res.status(201).json(enrollment);
  } catch (error) {
    console.error('Error creating enrollment:', error);
    res.status(500).json({ message: 'Failed to create enrollment' });
  }
});

app.put('/enrollments/:id', authenticateToken, requireRole(['admin']), async (req, res) => {
  const { id } = req.params;
  const { progress } = req.body;

  try {
    const enrollment = await prisma.enrollment.update({
      where: { id: parseInt(id) },
      data: { progress },
      include: {
        student: {
          select: { id: true, username: true, fullName: true, email: true }
        },
        course: {
          select: { id: true, title: true }
        }
      }
    });

    res.json(enrollment);
  } catch (error) {
    console.error('Error updating enrollment:', error);
    res.status(500).json({ message: 'Failed to update enrollment' });
  }
});

app.delete('/enrollments/:id', authenticateToken, requireRole(['admin']), async (req, res) => {
  const { id } = req.params;

  try {
    await prisma.enrollment.delete({
      where: { id: parseInt(id) }
    });

    res.json({ message: 'Enrollment deleted successfully' });
  } catch (error) {
    console.error('Error deleting enrollment:', error);
    res.status(500).json({ message: 'Failed to delete enrollment' });
  }
});

// ASSIGNMENTS CRUD
app.get('/assignments', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const { page, limit, offset } = getPaginationParams(req);
    const search = req.query.search;
    const searchFields = ['title', 'description'];

    const where = applySearchFilter(search, searchFields);

    const [assignments, total] = await Promise.all([
      prisma.assignment.findMany({
        where,
        include: {
          lesson: {
            select: { id: true, title: true, course: { select: { id: true, title: true } } }
          },
          _count: {
            select: { submissions: true }
          }
        },
        skip: offset,
        take: limit,
        orderBy: { id: 'desc' }
      }),
      prisma.assignment.count({ where })
    ]);

    res.json({
      data: assignments,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching assignments:', error);
    res.status(500).json({ message: 'Failed to fetch assignments' });
  }
});

app.post('/assignments', authenticateToken, requireRole(['admin']), async (req, res) => {
  const { lessonId, title, description, maxScore } = req.body;

  try {
    const assignment = await prisma.assignment.create({
      data: {
        lessonId,
        title,
        description,
        maxScore: maxScore || 100
      },
      include: {
        lesson: {
          select: { id: true, title: true, course: { select: { id: true, title: true } } }
        }
      }
    });

    res.status(201).json(assignment);
  } catch (error) {
    console.error('Error creating assignment:', error);
    res.status(500).json({ message: 'Failed to create assignment' });
  }
});

app.put('/assignments/:id', authenticateToken, requireRole(['admin']), async (req, res) => {
  const { id } = req.params;
  const { lessonId, title, description, maxScore } = req.body;

  try {
    const assignment = await prisma.assignment.update({
      where: { id: parseInt(id) },
      data: {
        lessonId,
        title,
        description,
        maxScore
      },
      include: {
        lesson: {
          select: { id: true, title: true, course: { select: { id: true, title: true } } }
        }
      }
    });

    res.json(assignment);
  } catch (error) {
    console.error('Error updating assignment:', error);
    res.status(500).json({ message: 'Failed to update assignment' });
  }
});

app.delete('/assignments/:id', authenticateToken, requireRole(['admin']), async (req, res) => {
  const { id } = req.params;

  try {
    await prisma.assignment.delete({
      where: { id: parseInt(id) }
    });

    res.json({ message: 'Assignment deleted successfully' });
  } catch (error) {
    console.error('Error deleting assignment:', error);
    res.status(500).json({ message: 'Failed to delete assignment' });
  }
});

// SUBMISSIONS CRUD
app.get('/submissions', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const { page, limit, offset } = getPaginationParams(req);

    const [submissions, total] = await Promise.all([
      prisma.submission.findMany({
        include: {
          student: {
            select: { id: true, username: true, fullName: true, email: true }
          },
          assignment: {
            select: { id: true, title: true, lesson: { select: { id: true, title: true, course: { select: { id: true, title: true } } } } }
          }
        },
        skip: offset,
        take: limit,
        orderBy: { submittedAt: 'desc' }
      }),
      prisma.submission.count()
    ]);

    res.json({
      data: submissions,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching submissions:', error);
    res.status(500).json({ message: 'Failed to fetch submissions' });
  }
});

app.post('/submissions', authenticateToken, requireRole(['admin']), async (req, res) => {
  const { assignmentId, studentId, codeSubmission, grade, feedback } = req.body;

  try {
    const submission = await prisma.submission.create({
      data: {
        assignmentId,
        studentId,
        codeSubmission,
        grade,
        feedback
      },
      include: {
        student: {
          select: { id: true, username: true, fullName: true, email: true }
        },
        assignment: {
          select: { id: true, title: true, lesson: { select: { id: true, title: true, course: { select: { id: true, title: true } } } } }
        }
      }
    });

    res.status(201).json(submission);
  } catch (error) {
    console.error('Error creating submission:', error);
    res.status(500).json({ message: 'Failed to create submission' });
  }
});

app.put('/submissions/:id', authenticateToken, requireRole(['admin']), async (req, res) => {
  const { id } = req.params;
  const { codeSubmission, grade, feedback } = req.body;

  try {
    const submission = await prisma.submission.update({
      where: { id: parseInt(id) },
      data: {
        codeSubmission,
        grade,
        feedback
      },
      include: {
        student: {
          select: { id: true, username: true, fullName: true, email: true }
        },
        assignment: {
          select: { id: true, title: true, lesson: { select: { id: true, title: true, course: { select: { id: true, title: true } } } } }
        }
      }
    });

    res.json(submission);
  } catch (error) {
    console.error('Error updating submission:', error);
    res.status(500).json({ message: 'Failed to update submission' });
  }
});

app.delete('/submissions/:id', authenticateToken, requireRole(['admin']), async (req, res) => {
  const { id } = req.params;

  try {
    await prisma.submission.delete({
      where: { id: parseInt(id) }
    });

    res.json({ message: 'Submission deleted successfully' });
  } catch (error) {
    console.error('Error deleting submission:', error);
    res.status(500).json({ message: 'Failed to delete submission' });
  }
});

// LESSON PROGRESS CRUD
app.get('/lesson-progress', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const { page, limit, offset } = getPaginationParams(req);

    const [progress, total] = await Promise.all([
      prisma.lessonProgress.findMany({
        include: {
          enrollment: {
            select: {
              id: true,
              student: { select: { id: true, username: true, fullName: true } },
              course: { select: { id: true, title: true } }
            }
          },
          lesson: {
            select: { id: true, title: true }
          }
        },
        skip: offset,
        take: limit,
        orderBy: { id: 'desc' }
      }),
      prisma.lessonProgress.count()
    ]);

    res.json({
      data: progress,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching lesson progress:', error);
    res.status(500).json({ message: 'Failed to fetch lesson progress' });
  }
});

app.post('/lesson-progress', authenticateToken, requireRole(['admin']), async (req, res) => {
  const { enrollmentId, lessonId, isCompleted } = req.body;

  try {
    const progress = await prisma.lessonProgress.create({
      data: {
        enrollmentId,
        lessonId,
        isCompleted: isCompleted || false
      },
      include: {
        enrollment: {
          select: {
            id: true,
            student: { select: { id: true, username: true, fullName: true } },
            course: { select: { id: true, title: true } }
          }
        },
        lesson: {
          select: { id: true, title: true }
        }
      }
    });

    res.status(201).json(progress);
  } catch (error) {
    console.error('Error creating lesson progress:', error);
    res.status(500).json({ message: 'Failed to create lesson progress' });
  }
});

app.put('/lesson-progress/:id', authenticateToken, requireRole(['admin']), async (req, res) => {
  const { id } = req.params;
  const { isCompleted } = req.body;

  try {
    const progress = await prisma.lessonProgress.update({
      where: { id: parseInt(id) },
      data: { isCompleted },
      include: {
        enrollment: {
          select: {
            id: true,
            student: { select: { id: true, username: true, fullName: true } },
            course: { select: { id: true, title: true } }
          }
        },
        lesson: {
          select: { id: true, title: true }
        }
      }
    });

    res.json(progress);
  } catch (error) {
    console.error('Error updating lesson progress:', error);
    res.status(500).json({ message: 'Failed to update lesson progress' });
  }
});

app.delete('/lesson-progress/:id', authenticateToken, requireRole(['admin']), async (req, res) => {
  const { id } = req.params;

  try {
    await prisma.lessonProgress.delete({
      where: { id: parseInt(id) }
    });

    res.json({ message: 'Lesson progress deleted successfully' });
  } catch (error) {
    console.error('Error deleting lesson progress:', error);
    res.status(500).json({ message: 'Failed to delete lesson progress' });
  }
});

// MODERATION LOGS CRUD
app.get('/moderation-logs', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const { page, limit, offset } = getPaginationParams(req);

    const [logs, total] = await Promise.all([
      prisma.moderationLog.findMany({
        include: {
          moderator: {
            select: { id: true, username: true, fullName: true }
          },
          targetUser: {
            select: { id: true, username: true, fullName: true }
          },
          targetCourse: {
            select: { id: true, title: true }
          }
        },
        skip: offset,
        take: limit,
        orderBy: { createdAt: 'desc' }
      }),
      prisma.moderationLog.count()
    ]);

    res.json({
      data: logs,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching moderation logs:', error);
    res.status(500).json({ message: 'Failed to fetch moderation logs' });
  }
});

app.post('/moderation-logs', authenticateToken, requireRole(['admin']), async (req, res) => {
  const { moderatorId, action, targetUserId, targetCourseId, details } = req.body;

  try {
    const log = await prisma.moderationLog.create({
      data: {
        moderatorId,
        action,
        targetUserId,
        targetCourseId,
        details
      },
      include: {
        moderator: {
          select: { id: true, username: true, fullName: true }
        },
        targetUser: {
          select: { id: true, username: true, fullName: true }
        },
        targetCourse: {
          select: { id: true, title: true }
        }
      }
    });

    res.status(201).json(log);
  } catch (error) {
    console.error('Error creating moderation log:', error);
    res.status(500).json({ message: 'Failed to create moderation log' });
  }
});

app.put('/moderation-logs/:id', authenticateToken, requireRole(['admin']), async (req, res) => {
  const { id } = req.params;
  const { action, details } = req.body;

  try {
    const log = await prisma.moderationLog.update({
      where: { id: parseInt(id) },
      data: {
        action,
        details
      },
      include: {
        moderator: {
          select: { id: true, username: true, fullName: true }
        },
        targetUser: {
          select: { id: true, username: true, fullName: true }
        },
        targetCourse: {
          select: { id: true, title: true }
        }
      }
    });

    res.json(log);
  } catch (error) {
    console.error('Error updating moderation log:', error);
    res.status(500).json({ message: 'Failed to update moderation log' });
  }
});

app.delete('/moderation-logs/:id', authenticateToken, requireRole(['admin']), async (req, res) => {
  const { id } = req.params;

  try {
    await prisma.moderationLog.delete({
      where: { id: parseInt(id) }
    });

    res.json({ message: 'Moderation log deleted successfully' });
  } catch (error) {
    console.error('Error deleting moderation log:', error);
    res.status(500).json({ message: 'Failed to delete moderation log' });
  }
});

// ADMIN ACTIONS CRUD
app.get('/admin-actions', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const { page, limit, offset } = getPaginationParams(req);

    const [actions, total] = await Promise.all([
      prisma.adminAction.findMany({
        include: {
          admin: {
            select: { id: true, username: true, fullName: true }
          }
        },
        skip: offset,
        take: limit,
        orderBy: { createdAt: 'desc' }
      }),
      prisma.adminAction.count()
    ]);

    res.json({
      data: actions,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching admin actions:', error);
    res.status(500).json({ message: 'Failed to fetch admin actions' });
  }
});

app.post('/admin-actions', authenticateToken, requireRole(['admin']), async (req, res) => {
  const { adminId, actionType, description } = req.body;

  try {
    const action = await prisma.adminAction.create({
      data: {
        adminId,
        actionType,
        description
      },
      include: {
        admin: {
          select: { id: true, username: true, fullName: true }
        }
      }
    });

    res.status(201).json(action);
  } catch (error) {
    console.error('Error creating admin action:', error);
    res.status(500).json({ message: 'Failed to create admin action' });
  }
});

app.put('/admin-actions/:id', authenticateToken, requireRole(['admin']), async (req, res) => {
  const { id } = req.params;
  const { actionType, description } = req.body;

  try {
    const action = await prisma.adminAction.update({
      where: { id: parseInt(id) },
      data: {
        actionType,
        description
      },
      include: {
        admin: {
          select: { id: true, username: true, fullName: true }
        }
      }
    });

    res.json(action);
  } catch (error) {
    console.error('Error updating admin action:', error);
    res.status(500).json({ message: 'Failed to update admin action' });
  }
});

app.delete('/admin-actions/:id', authenticateToken, requireRole(['admin']), async (req, res) => {
  const { id } = req.params;

  try {
    await prisma.adminAction.delete({
      where: { id: parseInt(id) }
    });

    res.json({ message: 'Admin action deleted successfully' });
  } catch (error) {
    console.error('Error deleting admin action:', error);
    res.status(500).json({ message: 'Failed to delete admin action' });
  }
});

// PAYMENTS CRUD
app.get('/payments', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const { page, limit, offset } = getPaginationParams(req);

    const [payments, total] = await Promise.all([
      prisma.payment.findMany({
        include: {
          student: {
            select: { id: true, username: true, fullName: true, email: true }
          },
          course: {
            select: { id: true, title: true }
          }
        },
        skip: offset,
        take: limit,
        orderBy: { paymentDate: 'desc' }
      }),
      prisma.payment.count()
    ]);

    res.json({
      data: payments,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching payments:', error);
    res.status(500).json({ message: 'Failed to fetch payments' });
  }
});

app.post('/payments', authenticateToken, requireRole(['admin']), async (req, res) => {
  const { studentId, courseId, amount, status, providerRef } = req.body;

  try {
    const payment = await prisma.payment.create({
      data: {
        studentId,
        courseId,
        amount,
        status,
        providerRef
      },
      include: {
        student: {
          select: { id: true, username: true, fullName: true, email: true }
        },
        course: {
          select: { id: true, title: true }
        }
      }
    });

    res.status(201).json(payment);
  } catch (error) {
    console.error('Error creating payment:', error);
    res.status(500).json({ message: 'Failed to create payment' });
  }
});

app.put('/payments/:id', authenticateToken, requireRole(['admin']), async (req, res) => {
  const { id } = req.params;
  const { amount, status, providerRef } = req.body;

  try {
    const payment = await prisma.payment.update({
      where: { id: parseInt(id) },
      data: {
        amount,
        status,
        providerRef
      },
      include: {
        student: {
          select: { id: true, username: true, fullName: true, email: true }
        },
        course: {
          select: { id: true, title: true }
        }
      }
    });

    res.json(payment);
  } catch (error) {
    console.error('Error updating payment:', error);
    res.status(500).json({ message: 'Failed to update payment' });
  }
});

app.delete('/payments/:id', authenticateToken, requireRole(['admin']), async (req, res) => {
  const { id } = req.params;

  try {
    await prisma.payment.delete({
      where: { id: parseInt(id) }
    });

    res.json({ message: 'Payment deleted successfully' });
  } catch (error) {
    console.error('Error deleting payment:', error);
    res.status(500).json({ message: 'Failed to delete payment' });
  }
});

// MESSAGES CRUD
app.get('/messages', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const { page, limit, offset } = getPaginationParams(req);
    const search = req.query.search;
    const searchFields = ['message'];

    const where = applySearchFilter(search, searchFields);

    const [messages, total] = await Promise.all([
      prisma.message.findMany({
        where,
        include: {
          sender: {
            select: { id: true, username: true, fullName: true }
          }
        },
        skip: offset,
        take: limit,
        orderBy: { createdAt: 'desc' }
      }),
      prisma.message.count({ where })
    ]);

    res.json({
      data: messages,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({ message: 'Failed to fetch messages' });
  }
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Error:', error);
  res.status(500).json({ message: 'Something went wrong!' });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

module.exports = app;
