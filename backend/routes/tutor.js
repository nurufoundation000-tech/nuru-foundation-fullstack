const express = require('express');
const router = express.Router();
const { authenticateToken, requireRole } = require('../middleware/auth');
const prisma = require('../config/database');

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

// COURSES CRUD (scoped to tutor's own courses)
router.get('/courses', authenticateToken, requireRole(['tutor']), async (req, res) => {
  try {
    const { page, limit, offset } = getPaginationParams(req);
    const search = req.query.search;
    const searchFields = ['title', 'description'];

    const where = {
      tutorId: req.user.userId,
      ...applySearchFilter(search, searchFields)
    };

    const [courses, total] = await Promise.all([
      prisma.course.findMany({
        where,
        include: {
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
    console.error('Error fetching tutor courses:', error);
    res.status(500).json({ message: 'Failed to fetch courses' });
  }
});

router.post('/courses', authenticateToken, requireRole(['tutor']), async (req, res) => {
  const { title, description, category, level, thumbnailUrl, isPublished } = req.body;

  try {
    const course = await prisma.course.create({
      data: {
        tutorId: req.user.userId,
        title,
        description,
        category,
        level,
        thumbnailUrl,
        isPublished
      }
    });

    res.status(201).json(course);
  } catch (error) {
    console.error('Error creating course:', error);
    res.status(500).json({ message: 'Failed to create course' });
  }
});

router.put('/courses/:id', authenticateToken, requireRole(['tutor']), async (req, res) => {
  const { id } = req.params;
  const { title, description, category, level, thumbnailUrl, isPublished } = req.body;

  try {
    // Verify ownership
    const course = await prisma.course.findFirst({
      where: { id: parseInt(id), tutorId: req.user.userId }
    });

    if (!course) {
      return res.status(404).json({ message: 'Course not found or not authorized' });
    }

    const updatedCourse = await prisma.course.update({
      where: { id: parseInt(id) },
      data: {
        title,
        description,
        category,
        level,
        thumbnailUrl,
        isPublished
      }
    });

    res.json(updatedCourse);
  } catch (error) {
    console.error('Error updating course:', error);
    res.status(500).json({ message: 'Failed to update course' });
  }
});

router.delete('/courses/:id', authenticateToken, requireRole(['tutor']), async (req, res) => {
  const { id } = req.params;

  try {
    // Verify ownership
    const course = await prisma.course.findFirst({
      where: { id: parseInt(id), tutorId: req.user.userId }
    });

    if (!course) {
      return res.status(404).json({ message: 'Course not found or not authorized' });
    }

    await prisma.course.delete({
      where: { id: parseInt(id) }
    });

    res.json({ message: 'Course deleted successfully' });
  } catch (error) {
    console.error('Error deleting course:', error);
    res.status(500).json({ message: 'Failed to delete course' });
  }
});

// LESSONS CRUD (scoped to tutor's courses)
router.get('/lessons', authenticateToken, requireRole(['tutor']), async (req, res) => {
  try {
    const { page, limit, offset } = getPaginationParams(req);
    const search = req.query.search;
    const searchFields = ['title', 'content'];

    const where = {
      course: {
        tutorId: req.user.userId
      },
      ...applySearchFilter(search, searchFields)
    };

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
    console.error('Error fetching tutor lessons:', error);
    res.status(500).json({ message: 'Failed to fetch lessons' });
  }
});

router.post('/lessons', authenticateToken, requireRole(['tutor']), async (req, res) => {
  const { courseId, title, content, videoUrl, orderIndex } = req.body;

  try {
    // Verify course ownership
    const course = await prisma.course.findFirst({
      where: { id: parseInt(courseId), tutorId: req.user.userId }
    });

    if (!course) {
      return res.status(404).json({ message: 'Course not found or not authorized' });
    }

    const lesson = await prisma.lesson.create({
      data: {
        courseId: parseInt(courseId),
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

router.put('/lessons/:id', authenticateToken, requireRole(['tutor']), async (req, res) => {
  const { id } = req.params;
  const { courseId, title, content, videoUrl, orderIndex } = req.body;

  try {
    // Verify lesson ownership through course
    const lesson = await prisma.lesson.findFirst({
      where: {
        id: parseInt(id),
        course: { tutorId: req.user.userId }
      }
    });

    if (!lesson) {
      return res.status(404).json({ message: 'Lesson not found or not authorized' });
    }

    const updatedLesson = await prisma.lesson.update({
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

    res.json(updatedLesson);
  } catch (error) {
    console.error('Error updating lesson:', error);
    res.status(500).json({ message: 'Failed to update lesson' });
  }
});

router.delete('/lessons/:id', authenticateToken, requireRole(['tutor']), async (req, res) => {
  const { id } = req.params;

  try {
    // Verify lesson ownership through course
    const lesson = await prisma.lesson.findFirst({
      where: {
        id: parseInt(id),
        course: { tutorId: req.user.userId }
      }
    });

    if (!lesson) {
      return res.status(404).json({ message: 'Lesson not found or not authorized' });
    }

    await prisma.lesson.delete({
      where: { id: parseInt(id) }
    });

    res.json({ message: 'Lesson deleted successfully' });
  } catch (error) {
    console.error('Error deleting lesson:', error);
    res.status(500).json({ message: 'Failed to delete lesson' });
  }
});

// ASSIGNMENTS CRUD (scoped to tutor's lessons)
router.get('/assignments', authenticateToken, requireRole(['tutor']), async (req, res) => {
  try {
    const { page, limit, offset } = getPaginationParams(req);
    const search = req.query.search;
    const searchFields = ['title', 'description'];

    const where = {
      lesson: {
        course: {
          tutorId: req.user.userId
        }
      },
      ...applySearchFilter(search, searchFields)
    };

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
    console.error('Error fetching tutor assignments:', error);
    res.status(500).json({ message: 'Failed to fetch assignments' });
  }
});

router.post('/assignments', authenticateToken, requireRole(['tutor']), async (req, res) => {
  const { lessonId, title, description, maxScore } = req.body;

  try {
    // Verify lesson ownership through course
    const lesson = await prisma.lesson.findFirst({
      where: {
        id: parseInt(lessonId),
        course: { tutorId: req.user.userId }
      }
    });

    if (!lesson) {
      return res.status(404).json({ message: 'Lesson not found or not authorized' });
    }

    const assignment = await prisma.assignment.create({
      data: {
        lessonId: parseInt(lessonId),
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

router.put('/assignments/:id', authenticateToken, requireRole(['tutor']), async (req, res) => {
  const { id } = req.params;
  const { lessonId, title, description, maxScore } = req.body;

  try {
    // Verify assignment ownership through lesson/course
    const assignment = await prisma.assignment.findFirst({
      where: {
        id: parseInt(id),
        lesson: {
          course: { tutorId: req.user.userId }
        }
      }
    });

    if (!assignment) {
      return res.status(404).json({ message: 'Assignment not found or not authorized' });
    }

    const updatedAssignment = await prisma.assignment.update({
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

    res.json(updatedAssignment);
  } catch (error) {
    console.error('Error updating assignment:', error);
    res.status(500).json({ message: 'Failed to update assignment' });
  }
});

router.delete('/assignments/:id', authenticateToken, requireRole(['tutor']), async (req, res) => {
  const { id } = req.params;

  try {
    // Verify assignment ownership through lesson/course
    const assignment = await prisma.assignment.findFirst({
      where: {
        id: parseInt(id),
        lesson: {
          course: { tutorId: req.user.userId }
        }
      }
    });

    if (!assignment) {
      return res.status(404).json({ message: 'Assignment not found or not authorized' });
    }

    await prisma.assignment.delete({
      where: { id: parseInt(id) }
    });

    res.json({ message: 'Assignment deleted successfully' });
  } catch (error) {
    console.error('Error deleting assignment:', error);
    res.status(500).json({ message: 'Failed to delete assignment' });
  }
});

// SUBMISSIONS CRUD (scoped to tutor's courses)
router.get('/submissions', authenticateToken, requireRole(['tutor']), async (req, res) => {
  try {
    const { page, limit, offset } = getPaginationParams(req);

    const [submissions, total] = await Promise.all([
      prisma.submission.findMany({
        where: {
          assignment: {
            lesson: {
              course: {
                tutorId: req.user.userId
              }
            }
          }
        },
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
      prisma.submission.count({
        where: {
          assignment: {
            lesson: {
              course: {
                tutorId: req.user.userId
              }
            }
          }
        }
      })
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
    console.error('Error fetching tutor submissions:', error);
    res.status(500).json({ message: 'Failed to fetch submissions' });
  }
});

router.put('/submissions/:id/grade', authenticateToken, requireRole(['tutor']), async (req, res) => {
  const { id } = req.params;
  const { grade, feedback } = req.body;

  try {
    // Verify submission ownership through assignment/lesson/course
    const submission = await prisma.submission.findFirst({
      where: {
        id: parseInt(id),
        assignment: {
          lesson: {
            course: { tutorId: req.user.userId }
          }
        }
      }
    });

    if (!submission) {
      return res.status(404).json({ message: 'Submission not found or not authorized' });
    }

    const updatedSubmission = await prisma.submission.update({
      where: { id: parseInt(id) },
      data: {
        grade: parseInt(grade),
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

    res.json(updatedSubmission);
  } catch (error) {
    console.error('Error grading submission:', error);
    res.status(500).json({ message: 'Failed to grade submission' });
  }
});

// ENROLLMENTS CRUD (scoped to tutor's courses)
router.get('/enrollments', authenticateToken, requireRole(['tutor']), async (req, res) => {
  try {
    const { page, limit, offset } = getPaginationParams(req);

    const [enrollments, total] = await Promise.all([
      prisma.enrollment.findMany({
        where: {
          course: { tutorId: req.user.userId }
        },
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
      prisma.enrollment.count({
        where: {
          course: { tutorId: req.user.userId }
        }
      })
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
    console.error('Error fetching tutor enrollments:', error);
    res.status(500).json({ message: 'Failed to fetch enrollments' });
  }
});

router.post('/enrollments', authenticateToken, requireRole(['tutor']), async (req, res) => {
  const { studentId, courseId } = req.body;

  try {
    // Verify course ownership
    const course = await prisma.course.findFirst({
      where: { id: parseInt(courseId), tutorId: req.user.userId }
    });

    if (!course) {
      return res.status(404).json({ message: 'Course not found or not authorized' });
    }

    // Check if student exists and has student role
    const student = await prisma.user.findUnique({
      where: { id: parseInt(studentId) },
      include: { role: true }
    });

    if (!student || student.role.name !== 'student') {
      return res.status(404).json({ message: 'Student not found' });
    }

    // Check if already enrolled
    const existingEnrollment = await prisma.enrollment.findUnique({
      where: {
        studentId_courseId: {
          studentId: parseInt(studentId),
          courseId: parseInt(courseId)
        }
      }
    });

    if (existingEnrollment) {
      return res.status(400).json({ message: 'Student already enrolled in this course' });
    }

    const enrollment = await prisma.enrollment.create({
      data: {
        studentId: parseInt(studentId),
        courseId: parseInt(courseId)
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

router.delete('/enrollments/:id', authenticateToken, requireRole(['tutor']), async (req, res) => {
  const { id } = req.params;

  try {
    // Verify enrollment ownership through course
    const enrollment = await prisma.enrollment.findFirst({
      where: {
        id: parseInt(id),
        course: { tutorId: req.user.userId }
      }
    });

    if (!enrollment) {
      return res.status(404).json({ message: 'Enrollment not found or not authorized' });
    }

    await prisma.enrollment.delete({
      where: { id: parseInt(id) }
    });

    res.json({ message: 'Enrollment deleted successfully' });
  } catch (error) {
    console.error('Error deleting enrollment:', error);
    res.status(500).json({ message: 'Failed to delete enrollment' });
  }
});

// COURSE NOTES CRUD (scoped to tutor's courses)
router.get('/course-notes', authenticateToken, requireRole(['tutor']), async (req, res) => {
  try {
    const { page, limit, offset } = getPaginationParams(req);
    const search = req.query.search;
    const searchFields = ['title', 'content'];

    const where = {
      course: { tutorId: req.user.userId },
      ...applySearchFilter(search, searchFields)
    };

    const [notes, total] = await Promise.all([
      prisma.courseNote.findMany({
        where,
        include: {
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
    console.error('Error fetching tutor course notes:', error);
    res.status(500).json({ message: 'Failed to fetch course notes' });
  }
});

router.post('/course-notes', authenticateToken, requireRole(['tutor']), async (req, res) => {
  const { courseId, title, content } = req.body;

  try {
    // Verify course ownership
    const course = await prisma.course.findFirst({
      where: { id: parseInt(courseId), tutorId: req.user.userId }
    });

    if (!course) {
      return res.status(404).json({ message: 'Course not found or not authorized' });
    }

    const note = await prisma.courseNote.create({
      data: {
        courseId: parseInt(courseId),
        tutorId: req.user.userId,
        title,
        content
      },
      include: {
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

router.put('/course-notes/:id', authenticateToken, requireRole(['tutor']), async (req, res) => {
  const { id } = req.params;
  const { title, content } = req.body;

  try {
    // Verify note ownership through course
    const note = await prisma.courseNote.findFirst({
      where: {
        id: parseInt(id),
        course: { tutorId: req.user.userId }
      }
    });

    if (!note) {
      return res.status(404).json({ message: 'Course note not found or not authorized' });
    }

    const updatedNote = await prisma.courseNote.update({
      where: { id: parseInt(id) },
      data: { title, content },
      include: {
        course: {
          select: { id: true, title: true }
        }
      }
    });

    res.json(updatedNote);
  } catch (error) {
    console.error('Error updating course note:', error);
    res.status(500).json({ message: 'Failed to update course note' });
  }
});

router.delete('/course-notes/:id', authenticateToken, requireRole(['tutor']), async (req, res) => {
  const { id } = req.params;

  try {
    // Verify note ownership through course
    const note = await prisma.courseNote.findFirst({
      where: {
        id: parseInt(id),
        course: { tutorId: req.user.userId }
      }
    });

    if (!note) {
      return res.status(404).json({ message: 'Course note not found or not authorized' });
    }

    await prisma.courseNote.delete({
      where: { id: parseInt(id) }
    });

    res.json({ message: 'Course note deleted successfully' });
  } catch (error) {
    console.error('Error deleting course note:', error);
    res.status(500).json({ message: 'Failed to delete course note' });
  }
});

module.exports = router;
