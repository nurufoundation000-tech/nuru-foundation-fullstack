const express = require('express');
const router = express.Router();
const { authenticateToken, requireRole } = require('../lib/auth');
const prisma = require('../lib/prisma');

// Admin action logging
router.post('/actions', authenticateToken, requireRole(['admin']), async (req, res) => {
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

// USERS CRUD
router.get('/users', authenticateToken, requireRole(['admin']), async (req, res) => {
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

router.post('/users', authenticateToken, requireRole(['admin']), async (req, res) => {
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

router.put('/users/:id', authenticateToken, requireRole(['admin']), async (req, res) => {
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

router.delete('/users/:id', authenticateToken, requireRole(['admin']), async (req, res) => {
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
router.get('/roles', authenticateToken, requireRole(['admin']), async (req, res) => {
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

router.post('/roles', authenticateToken, requireRole(['admin']), async (req, res) => {
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

router.put('/roles/:id', authenticateToken, requireRole(['admin']), async (req, res) => {
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

router.delete('/roles/:id', authenticateToken, requireRole(['admin']), async (req, res) => {
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
router.get('/courses', authenticateToken, requireRole(['admin']), async (req, res) => {
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

router.post('/courses', authenticateToken, requireRole(['admin']), async (req, res) => {
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

router.put('/courses/:id', authenticateToken, requireRole(['admin']), async (req, res) => {
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

router.delete('/courses/:id', authenticateToken, requireRole(['admin']), async (req, res) => {
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
router.get('/lessons', authenticateToken, requireRole(['admin']), async (req, res) => {
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

router.post('/lessons', authenticateToken, requireRole(['admin']), async (req, res) => {
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

router.put('/lessons/:id', authenticateToken, requireRole(['admin']), async (req, res) => {
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

router.delete('/lessons/:id', authenticateToken, requireRole(['admin']), async (req, res) => {
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
router.get('/enrollments', authenticateToken, requireRole(['admin']), async (req, res) => {
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

router.post('/enrollments', authenticateToken, requireRole(['admin']), async (req, res) => {
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

router.put('/enrollments/:id', authenticateToken, requireRole(['admin']), async (req, res) => {
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

router.delete('/enrollments/:id', authenticateToken, requireRole(['admin']), async (req, res) => {
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
router.get('/assignments', authenticateToken, requireRole(['admin']), async (req, res) => {
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

router.post('/assignments', authenticateToken, requireRole(['admin']), async (req, res) => {
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

router.put('/assignments/:id', authenticateToken, requireRole(['admin']), async (req, res) => {
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

router.delete('/assignments/:id', authenticateToken, requireRole(['admin']), async (req, res) => {
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
router.get('/submissions', authenticateToken, requireRole(['admin']), async (req, res) => {
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

router.post('/submissions', authenticateToken, requireRole(['admin']), async (req, res) => {
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

router.put('/submissions/:id', authenticateToken, requireRole(['admin']), async (req, res) => {
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

router.delete('/submissions/:id', authenticateToken, requireRole(['admin']), async (req, res) => {
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
router.get('/lesson-progress', authenticateToken, requireRole(['admin']), async (req, res) => {
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

router.post('/lesson-progress', authenticateToken, requireRole(['admin']), async (req, res) => {
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

router.put('/lesson-progress/:id', authenticateToken, requireRole(['admin']), async (req, res) => {
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

router.delete('/lesson-progress/:id', authenticateToken, requireRole(['admin']), async (req, res) => {
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
router.get('/moderation-logs', authenticateToken, requireRole(['admin']), async (req, res) => {
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

router.post('/moderation-logs', authenticateToken, requireRole(['admin']), async (req, res) => {
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

router.put('/moderation-logs/:id', authenticateToken, requireRole(['admin']), async (req, res) => {
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

router.delete('/moderation-logs/:id', authenticateToken, requireRole(['admin']), async (req, res) => {
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
router.get('/admin-actions', authenticateToken, requireRole(['admin']), async (req, res) => {
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

router.post('/admin-actions', authenticateToken, requireRole(['admin']), async (req, res) => {
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

router.put('/admin-actions/:id', authenticateToken, requireRole(['admin']), async (req, res) => {
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

router.delete('/admin-actions/:id', authenticateToken, requireRole(['admin']), async (req, res) => {
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
router.get('/payments', authenticateToken, requireRole(['admin']), async (req, res) => {
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

router.post('/payments', authenticateToken, requireRole(['admin']), async (req, res) => {
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

router.put('/payments/:id', authenticateToken, requireRole(['admin']), async (req, res) => {
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

router.delete('/payments/:id', authenticateToken, requireRole(['admin']), async (req, res) => {
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
router.get('/messages', authenticateToken, requireRole(['admin']), async (req, res) => {
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
          },
          receiver: {
            select: { id: true, username: true, fullName: true }
          }
        },
        skip: offset,
        take: limit,
        orderBy: { sentAt: 'desc' }
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

router.post('/messages', authenticateToken, requireRole(['admin']), async (req, res) => {
  const { senderId, receiverId, message } = req.body;

  try {
    const msg = await prisma.message.create({
      data: {
        senderId,
        receiverId,
        message
      },
      include: {
        sender: {
          select: { id: true, username: true, fullName: true }
        },
        receiver: {
          select: { id: true, username: true, fullName: true }
        }
      }
    });

    res.status(201).json(msg);
  } catch (error) {
    console.error('Error creating message:', error);
    res.status(500).json({ message: 'Failed to create message' });
  }
});

router.put('/messages/:id', authenticateToken, requireRole(['admin']), async (req, res) => {
  const { id } = req.params;
  const { message, isRead } = req.body;

  try {
    const msg = await prisma.message.update({
      where: { id: parseInt(id) },
      data: {
        message,
        isRead
      },
      include: {
        sender: {
          select: { id: true, username: true, fullName: true }
        },
        receiver: {
          select: { id: true, username: true, fullName: true }
        }
      }
    });

    res.json(msg);
  } catch (error) {
    console.error('Error updating message:', error);
    res.status(500).json({ message: 'Failed to update message' });
  }
});

router.delete('/messages/:id', authenticateToken, requireRole(['admin']), async (req, res) => {
  const { id } = req.params;

  try {
    await prisma.message.delete({
      where: { id: parseInt(id) }
    });

    res.json({ message: 'Message deleted successfully' });
  } catch (error) {
    console.error('Error deleting message:', error);
    res.status(500).json({ message: 'Failed to delete message' });
  }
});

// COURSE REVIEWS CRUD
router.get('/course-reviews', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const { page, limit, offset } = getPaginationParams(req);

    const [reviews, total] = await Promise.all([
      prisma.courseReview.findMany({
        include: {
          reviewer: {
            select: { id: true, username: true, fullName: true }
          },
          course: {
            select: { id: true, title: true }
          }
        },
        skip: offset,
        take: limit,
        orderBy: { createdAt: 'desc' }
      }),
      prisma.courseReview.count()
    ]);

    res.json({
      data: reviews,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching course reviews:', error);
    res.status(500).json({ message: 'Failed to fetch course reviews' });
  }
});

router.post('/course-reviews', authenticateToken, requireRole(['admin']), async (req, res) => {
  const { courseId, reviewerId, rating, comment } = req.body;

  try {
    const review = await prisma.courseReview.create({
      data: {
        courseId,
        reviewerId,
        rating,
        comment
      },
      include: {
        reviewer: {
          select: { id: true, username: true, fullName: true }
        },
        course: {
          select: { id: true, title: true }
        }
      }
    });

    res.status(201).json(review);
  } catch (error) {
    console.error('Error creating course review:', error);
    res.status(500).json({ message: 'Failed to create course review' });
  }
});

router.put('/course-reviews/:id', authenticateToken, requireRole(['admin']), async (req, res) => {
  const { id } = req.params;
  const { rating, comment } = req.body;

  try {
    const review = await prisma.courseReview.update({
      where: { id: parseInt(id) },
      data: {
        rating,
        comment
      },
      include: {
        reviewer: {
          select: { id: true, username: true, fullName: true }
        },
        course: {
          select: { id: true, title: true }
        }
      }
    });

    res.json(review);
  } catch (error) {
    console.error('Error updating course review:', error);
    res.status(500).json({ message: 'Failed to update course review' });
  }
});

router.delete('/course-reviews/:id', authenticateToken, requireRole(['admin']), async (req, res) => {
  const { id } = req.params;

  try {
    await prisma.courseReview.delete({
      where: { id: parseInt(id) }
    });

    res.json({ message: 'Course review deleted successfully' });
  } catch (error) {
    console.error('Error deleting course review:', error);
    res.status(500).json({ message: 'Failed to delete course review' });
  }
});

// COURSE NOTES CRUD
router.get('/course-notes', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const { page, limit, offset } = getPaginationParams(req);
    const search = req.query.search;
    const searchFields = ['title', 'content'];

    const where = applySearchFilter(search, searchFields);

    const [notes, total] = await Promise.all([
      prisma.courseNote.findMany({
        where,
        include: {
          tutor: {
            select: { id: true, username: true, fullName: true }
          },
          course: {
            select: { id: true, title: true }
          }
        },
        skip: offset,
        take: limit,
        orderBy: { createdAt: 'desc' }
      }),
      prisma.courseNote.count({ where })
    ]);

    res.json({
      data: notes,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching course notes:', error);
    res.status(500).json({ message: 'Failed to fetch course notes' });
  }
});

router.post('/course-notes', authenticateToken, requireRole(['admin']), async (req, res) => {
  const { courseId, tutorId, title, content } = req.body;

  try {
    const note = await prisma.courseNote.create({
      data: {
        courseId,
        tutorId,
        title,
        content
      },
      include: {
        tutor: {
          select: { id: true, username: true, fullName: true }
        },
        course: {
          select: { id: true, title: true }
        }
      }
    });

    res.status(201).json(note);
  } catch (error) {
    console.error('Error creating course note:', error);
    res.status(500).json({ message: 'Failed to create course note' });
  }
});

router.put('/course-notes/:id', authenticateToken, requireRole(['admin']), async (req, res) => {
  const { id } = req.params;
  const { title, content } = req.body;

  try {
    const note = await prisma.courseNote.update({
      where: { id: parseInt(id) },
      data: {
        title,
        content
      },
      include: {
        tutor: {
          select: { id: true, username: true, fullName: true }
        },
        course: {
          select: { id: true, title: true }
        }
      }
    });

    res.json(note);
  } catch (error) {
    console.error('Error updating course note:', error);
    res.status(500).json({ message: 'Failed to update course note' });
  }
});

router.delete('/course-notes/:id', authenticateToken, requireRole(['admin']), async (req, res) => {
  const { id } = req.params;

  try {
    await prisma.courseNote.delete({
      where: { id: parseInt(id) }
    });

    res.json({ message: 'Course note deleted successfully' });
  } catch (error) {
    console.error('Error deleting course note:', error);
    res.status(500).json({ message: 'Failed to delete course note' });
  }
});

// FORUM POSTS CRUD
router.get('/forum-posts', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const { page, limit, offset } = getPaginationParams(req);
    const search = req.query.search;
    const searchFields = ['title', 'content'];

    const where = applySearchFilter(search, searchFields);

    const [posts, total] = await Promise.all([
      prisma.forumPost.findMany({
        where,
        include: {
          author: {
            select: { id: true, username: true, fullName: true }
          },
          course: {
            select: { id: true, title: true }
          },
          _count: {
            select: { comments: true }
          }
        },
        skip: offset,
        take: limit,
        orderBy: { createdAt: 'desc' }
      }),
      prisma.forumPost.count({ where })
    ]);

    res.json({
      data: posts,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching forum posts:', error);
    res.status(500).json({ message: 'Failed to fetch forum posts' });
  }
});

router.post('/forum-posts', authenticateToken, requireRole(['admin']), async (req, res) => {
  const { authorId, courseId, title, content } = req.body;

  try {
    const post = await prisma.forumPost.create({
      data: {
        authorId,
        courseId,
        title,
        content
      },
      include: {
        author: {
          select: { id: true, username: true, fullName: true }
        },
        course: {
          select: { id: true, title: true }
        }
      }
    });

    res.status(201).json(post);
  } catch (error) {
    console.error('Error creating forum post:', error);
    res.status(500).json({ message: 'Failed to create forum post' });
  }
});

router.put('/forum-posts/:id', authenticateToken, requireRole(['admin']), async (req, res) => {
  const { id } = req.params;
  const { title, content } = req.body;

  try {
    const post = await prisma.forumPost.update({
      where: { id: parseInt(id) },
      data: {
        title,
        content
      },
      include: {
        author: {
          select: { id: true, username: true, fullName: true }
        },
        course: {
          select: { id: true, title: true }
        }
      }
    });

    res.json(post);
  } catch (error) {
    console.error('Error updating forum post:', error);
    res.status(500).json({ message: 'Failed to update forum post' });
  }
});

router.delete('/forum-posts/:id', authenticateToken, requireRole(['admin']), async (req, res) => {
  const { id } = req.params;

  try {
    await prisma.forumPost.delete({
      where: { id: parseInt(id) }
    });

    res.json({ message: 'Forum post deleted successfully' });
  } catch (error) {
    console.error('Error deleting forum post:', error);
    res.status(500).json({ message: 'Failed to delete forum post' });
  }
});

// FORUM COMMENTS CRUD
router.get('/forum-comments', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const { page, limit, offset } = getPaginationParams(req);
    const search = req.query.search;
    const searchFields = ['content'];

    const where = applySearchFilter(search, searchFields);

    const [comments, total] = await Promise.all([
      prisma.forumComment.findMany({
        where,
        include: {
          author: {
            select: { id: true, username: true, fullName: true }
          },
          post: {
            select: { id: true, title: true, author: { select: { id: true, username: true } } }
          }
        },
        skip: offset,
        take: limit,
        orderBy: { createdAt: 'desc' }
      }),
      prisma.forumComment.count({ where })
    ]);

    res.json({
      data: comments,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching forum comments:', error);
    res.status(500).json({ message: 'Failed to fetch forum comments' });
  }
});

router.post('/forum-comments', authenticateToken, requireRole(['admin']), async (req, res) => {
  const { postId, authorId, content } = req.body;

  try {
    const comment = await prisma.forumComment.create({
      data: {
        postId,
        authorId,
        content
      },
      include: {
        author: {
          select: { id: true, username: true, fullName: true }
        },
        post: {
          select: { id: true, title: true, author: { select: { id: true, username: true } } }
        }
      }
    });

    res.status(201).json(comment);
  } catch (error) {
    console.error('Error creating forum comment:', error);
    res.status(500).json({ message: 'Failed to create forum comment' });
  }
});

router.put('/forum-comments/:id', authenticateToken, requireRole(['admin']), async (req, res) => {
  const { id } = req.params;
  const { content } = req.body;

  try {
    const comment = await prisma.forumComment.update({
      where: { id: parseInt(id) },
      data: { content },
      include: {
        author: {
          select: { id: true, username: true, fullName: true }
        },
        post: {
          select: { id: true, title: true, author: { select: { id: true, username: true } } }
        }
      }
    });

    res.json(comment);
  } catch (error) {
    console.error('Error updating forum comment:', error);
    res.status(500).json({ message: 'Failed to update forum comment' });
  }
});

router.delete('/forum-comments/:id', authenticateToken, requireRole(['admin']), async (req, res) => {
  const { id } = req.params;

  try {
    await prisma.forumComment.delete({
      where: { id: parseInt(id) }
    });

    res.json({ message: 'Forum comment deleted successfully' });
  } catch (error) {
    console.error('Error deleting forum comment:', error);
    res.status(500).json({ message: 'Failed to delete forum comment' });
  }
});

// NOTIFICATIONS CRUD
router.get('/notifications', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const { page, limit, offset } = getPaginationParams(req);
    const search = req.query.search;
    const searchFields = ['title', 'body'];

    const where = applySearchFilter(search, searchFields);

    const [notifications, total] = await Promise.all([
      prisma.notification.findMany({
        where,
        include: {
          user: {
            select: { id: true, username: true, fullName: true }
          }
        },
        skip: offset,
        take: limit,
        orderBy: { createdAt: 'desc' }
      }),
      prisma.notification.count({ where })
    ]);

    res.json({
      data: notifications,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching notifications:', error);
    res.status(500).json({ message: 'Failed to fetch notifications' });
  }
});

router.post('/notifications', authenticateToken, requireRole(['admin']), async (req, res) => {
  const { userId, title, body } = req.body;

  try {
    const notification = await prisma.notification.create({
      data: {
        userId,
        title,
        body
      },
      include: {
        user: {
          select: { id: true, username: true, fullName: true }
        }
      }
    });

    res.status(201).json(notification);
  } catch (error) {
    console.error('Error creating notification:', error);
    res.status(500).json({ message: 'Failed to create notification' });
  }
});

router.put('/notifications/:id', authenticateToken, requireRole(['admin']), async (req, res) => {
  const { id } = req.params;
  const { title, body, isRead } = req.body;

  try {
    const notification = await prisma.notification.update({
      where: { id: parseInt(id) },
      data: {
        title,
        body,
        isRead
      },
      include: {
        user: {
          select: { id: true, username: true, fullName: true }
        }
      }
    });

    res.json(notification);
  } catch (error) {
    console.error('Error updating notification:', error);
    res.status(500).json({ message: 'Failed to update notification' });
  }
});

router.delete('/notifications/:id', authenticateToken, requireRole(['admin']), async (req, res) => {
  const { id } = req.params;

  try {
    await prisma.notification.delete({
      where: { id: parseInt(id) }
    });

    res.json({ message: 'Notification deleted successfully' });
  } catch (error) {
    console.error('Error deleting notification:', error);
    res.status(500).json({ message: 'Failed to delete notification' });
  }
});

// BADGES CRUD
router.get('/badges', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const badges = await prisma.badge.findMany({
      include: {
        _count: {
          select: { userBadges: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json(badges);
  } catch (error) {
    console.error('Error fetching badges:', error);
    res.status(500).json({ message: 'Failed to fetch badges' });
  }
});

router.post('/badges', authenticateToken, requireRole(['admin']), async (req, res) => {
  const { key, title, description } = req.body;

  try {
    const badge = await prisma.badge.create({
      data: {
        key,
        title,
        description
      }
    });

    res.status(201).json(badge);
  } catch (error) {
    console.error('Error creating badge:', error);
    res.status(500).json({ message: 'Failed to create badge' });
  }
});

router.put('/badges/:id', authenticateToken, requireRole(['admin']), async (req, res) => {
  const { id } = req.params;
  const { key, title, description } = req.body;

  try {
    const badge = await prisma.badge.update({
      where: { id: parseInt(id) },
      data: {
        key,
        title,
        description
      }
    });

    res.json(badge);
  } catch (error) {
    console.error('Error updating badge:', error);
    res.status(500).json({ message: 'Failed to update badge' });
  }
});

router.delete('/badges/:id', authenticateToken, requireRole(['admin']), async (req, res) => {
  const { id } = req.params;

  try {
    await prisma.badge.delete({
      where: { id: parseInt(id) }
    });

    res.json({ message: 'Badge deleted successfully' });
  } catch (error) {
    console.error('Error deleting badge:', error);
    res.status(500).json({ message: 'Failed to delete badge' });
  }
});

// USER BADGES CRUD
router.get('/user-badges', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const { page, limit, offset } = getPaginationParams(req);

    const [userBadges, total] = await Promise.all([
      prisma.userBadge.findMany({
        include: {
          user: {
            select: { id: true, username: true, fullName: true }
          },
          badge: {
            select: { id: true, key: true, title: true }
          }
        },
        skip: offset,
        take: limit,
        orderBy: { awardedAt: 'desc' }
      }),
      prisma.userBadge.count()
    ]);

    res.json({
      data: userBadges,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching user badges:', error);
    res.status(500).json({ message: 'Failed to fetch user badges' });
  }
});

router.post('/user-badges', authenticateToken, requireRole(['admin']), async (req, res) => {
  const { userId, badgeId } = req.body;

  try {
    const userBadge = await prisma.userBadge.create({
      data: {
        userId,
        badgeId
      },
      include: {
        user: {
          select: { id: true, username: true, fullName: true }
        },
        badge: {
          select: { id: true, key: true, title: true }
        }
      }
    });

    res.status(201).json(userBadge);
  } catch (error) {
    console.error('Error creating user badge:', error);
    res.status(500).json({ message: 'Failed to create user badge' });
  }
});

router.delete('/user-badges/:id', authenticateToken, requireRole(['admin']), async (req, res) => {
  const { id } = req.params;

  try {
    await prisma.userBadge.delete({
      where: { id: parseInt(id) }
    });

    res.json({ message: 'User badge deleted successfully' });
  } catch (error) {
    console.error('Error deleting user badge:', error);
    res.status(500).json({ message: 'Failed to delete user badge' });
  }
});

// TAGS CRUD
router.get('/tags', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const tags = await prisma.tag.findMany({
      include: {
        _count: {
          select: { courses: true }
        }
      },
      orderBy: { name: 'asc' }
    });

    res.json(tags);
  } catch (error) {
    console.error('Error fetching tags:', error);
    res.status(500).json({ message: 'Failed to fetch tags' });
  }
});

router.post('/tags', authenticateToken, requireRole(['admin']), async (req, res) => {
  const { name } = req.body;

  try {
    const tag = await prisma.tag.create({
      data: { name }
    });

    res.status(201).json(tag);
  } catch (error) {
    console.error('Error creating tag:', error);
    res.status(500).json({ message: 'Failed to create tag' });
  }
});

router.put('/tags/:id', authenticateToken, requireRole(['admin']), async (req, res) => {
  const { id } = req.params;
  const { name } = req.body;

  try {
    const tag = await prisma.tag.update({
      where: { id: parseInt(id) },
      data: { name }
    });

    res.json(tag);
  } catch (error) {
    console.error('Error updating tag:', error);
    res.status(500).json({ message: 'Failed to update tag' });
  }
});

router.delete('/tags/:id', authenticateToken, requireRole(['admin']), async (req, res) => {
  const { id } = req.params;

  try {
    await prisma.tag.delete({
      where: { id: parseInt(id) }
    });

    res.json({ message: 'Tag deleted successfully' });
  } catch (error) {
    console.error('Error deleting tag:', error);
    res.status(500).json({ message: 'Failed to delete tag' });
  }
});

// COURSE TAGS CRUD
router.get('/course-tags', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const { page, limit, offset } = getPaginationParams(req);

    const [courseTags, total] = await Promise.all([
      prisma.courseTag.findMany({
        include: {
          course: {
            select: { id: true, title: true }
          },
          tag: {
            select: { id: true, name: true }
          }
        },
        skip: offset,
        take: limit,
        orderBy: { id: 'desc' }
      }),
      prisma.courseTag.count()
    ]);

    res.json({
      data: courseTags,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching course tags:', error);
    res.status(500).json({ message: 'Failed to fetch course tags' });
  }
});

router.post('/course-tags', authenticateToken, requireRole(['admin']), async (req, res) => {
  const { courseId, tagId } = req.body;

  try {
    const courseTag = await prisma.courseTag.create({
      data: {
        courseId,
        tagId
      },
      include: {
        course: {
          select: { id: true, title: true }
        },
        tag: {
          select: { id: true, name: true }
        }
      }
    });

    res.status(201).json(courseTag);
  } catch (error) {
    console.error('Error creating course tag:', error);
    res.status(500).json({ message: 'Failed to create course tag' });
  }
});

router.delete('/course-tags/:id', authenticateToken, requireRole(['admin']), async (req, res) => {
  const { id } = req.params;

  try {
    await prisma.courseTag.delete({
      where: { id: parseInt(id) }
    });

    res.json({ message: 'Course tag deleted successfully' });
  } catch (error) {
    console.error('Error deleting course tag:', error);
    res.status(500).json({ message: 'Failed to delete course tag' });
  }
});

// OAUTH ACCOUNTS CRUD
router.get('/oauth-accounts', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const { page, limit, offset } = getPaginationParams(req);

    const [accounts, total] = await Promise.all([
      prisma.oauthAccount.findMany({
        include: {
          user: {
            select: { id: true, username: true, fullName: true, email: true }
          }
        },
        skip: offset,
        take: limit,
        orderBy: { id: 'desc' }
      }),
      prisma.oauthAccount.count()
    ]);

    res.json({
      data: accounts,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching OAuth accounts:', error);
    res.status(500).json({ message: 'Failed to fetch OAuth accounts' });
  }
});

router.post('/oauth-accounts', authenticateToken, requireRole(['admin']), async (req, res) => {
  const { userId, provider, providerAccountId, accessToken, refreshToken, expiresAt, scope, tokenType } = req.body;

  try {
    const account = await prisma.oauthAccount.create({
      data: {
        userId,
        provider,
        providerAccountId,
        accessToken,
        refreshToken,
        expiresAt,
        scope,
        tokenType
      },
      include: {
        user: {
          select: { id: true, username: true, fullName: true, email: true }
        }
      }
    });

    res.status(201).json(account);
  } catch (error) {
    console.error('Error creating OAuth account:', error);
    res.status(500).json({ message: 'Failed to create OAuth account' });
  }
});

router.put('/oauth-accounts/:id', authenticateToken, requireRole(['admin']), async (req, res) => {
  const { id } = req.params;
  const { provider, providerAccountId, accessToken, refreshToken, expiresAt, scope, tokenType } = req.body;

  try {
    const account = await prisma.oauthAccount.update({
      where: { id: parseInt(id) },
      data: {
        provider,
        providerAccountId,
        accessToken,
        refreshToken,
        expiresAt,
        scope,
        tokenType
      },
      include: {
        user: {
          select: { id: true, username: true, fullName: true, email: true }
        }
      }
    });

    res.json(account);
  } catch (error) {
    console.error('Error updating OAuth account:', error);
    res.status(500).json({ message: 'Failed to update OAuth account' });
  }
});

router.delete('/oauth-accounts/:id', authenticateToken, requireRole(['admin']), async (req, res) => {
  const { id } = req.params;

  try {
    await prisma.oauthAccount.delete({
      where: { id: parseInt(id) }
    });

    res.json({ message: 'OAuth account deleted successfully' });
  } catch (error) {
    console.error('Error deleting OAuth account:', error);
    res.status(500).json({ message: 'Failed to delete OAuth account' });
  }
});

module.exports = router;
