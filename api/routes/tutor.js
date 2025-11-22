const express = require('express');
const { PrismaClient } = require('@prisma/client');
const router = express.Router();
const prisma = new PrismaClient();

// Middleware to check if user is tutor
const requireTutor = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const token = authHeader.slice(7);
    const userId = token.split('_')[2];
    
    if (!userId) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    const user = await prisma.user.findUnique({
      where: { id: parseInt(userId) },
      include: { role: true }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if user is tutor
    const userRole = user.role?.name;
    if (userRole !== 'tutor') {
      return res.status(403).json({ error: 'Tutor access required' });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error('Auth error:', error);
    res.status(500).json({ error: 'Authentication failed' });
  }
};

// Get tutor's enrollments
router.get('/enrollments', requireTutor, async (req, res) => {
  try {
    const tutorId = req.user.id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const search = req.query.search || '';
    const courseId = req.query.courseId;
    const skip = (page - 1) * limit;

    console.log(`👥 Loading enrollments for tutor ${tutorId}, page ${page}`);

    // Build where clause - only enrollments from tutor's courses
    const where = {
      course: { tutorId }
    };
    
    // Add search filter
    if (search) {
      where.OR = [
        { student: { fullName: { contains: search, mode: 'insensitive' } } },
        { student: { email: { contains: search, mode: 'insensitive' } } },
        { course: { title: { contains: search, mode: 'insensitive' } } }
      ];
    }

    // Add course filter
    if (courseId) {
      where.courseId = parseInt(courseId);
    }

    // Get enrollments with related data
    const [enrollments, totalEnrollments] = await Promise.all([
      prisma.enrollment.findMany({
        where,
        include: {
          student: {
            select: {
              id: true,
              username: true,
              email: true,
              fullName: true
            }
          },
          course: {
            select: {
              id: true,
              title: true,
              description: true,
              tutorId: true
            }
          }
        },
        orderBy: { enrolledAt: 'desc' },
        skip,
        take: limit
      }),
      prisma.enrollment.count({ where })
    ]);

    const totalPages = Math.ceil(totalEnrollments / limit);

    res.json({
      success: true,
      data: enrollments,
      pagination: {
        page,
        pages: totalPages,
        total: totalEnrollments,
        limit
      }
    });

  } catch (error) {
    console.error('Get enrollments error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to load enrollments',
      details: error.message 
    });
  }
});

// Get single enrollment
router.get('/enrollments/:id', requireTutor, async (req, res) => {
  try {
    const tutorId = req.user.id;
    const enrollmentId = parseInt(req.params.id);

    const enrollment = await prisma.enrollment.findFirst({
      where: {
        id: enrollmentId,
        course: { tutorId } // Ensure enrollment belongs to tutor's course
      },
      include: {
        student: {
          select: {
            id: true,
            username: true,
            email: true,
            fullName: true,
            createdAt: true
          }
        },
        course: {
          select: {
            id: true,
            title: true,
            description: true,
            category: true,
            level: true
          }
        }
      }
    });

    if (!enrollment) {
      return res.status(404).json({ 
        success: false,
        error: 'Enrollment not found or access denied' 
      });
    }

    res.json({
      success: true,
      data: enrollment
    });

  } catch (error) {
    console.error('Get enrollment error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to load enrollment',
      details: error.message 
    });
  }
});

// Remove enrollment (unenroll student)
router.delete('/enrollments/:id', requireTutor, async (req, res) => {
  try {
    const tutorId = req.user.id;
    const enrollmentId = parseInt(req.params.id);

    console.log(`🗑️ Removing enrollment ${enrollmentId} for tutor ${tutorId}`);

    // Check if enrollment exists and belongs to tutor's course
    const existingEnrollment = await prisma.enrollment.findFirst({
      where: {
        id: enrollmentId,
        course: { tutorId }
      }
    });

    if (!existingEnrollment) {
      return res.status(404).json({ 
        success: false,
        error: 'Enrollment not found or access denied' 
      });
    }

    // Delete enrollment
    await prisma.enrollment.delete({
      where: { id: enrollmentId }
    });

    res.json({
      success: true,
      message: 'Student unenrolled successfully'
    });

  } catch (error) {
    console.error('Remove enrollment error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to remove enrollment',
      details: error.message 
    });
  }
});

// Get enrollment statistics
router.get('/enrollments/stats', requireTutor, async (req, res) => {
  try {
    const tutorId = req.user.id;

    const [totalEnrollments, uniqueStudents, enrollmentsByCourse] = await Promise.all([
      // Total enrollments count
      prisma.enrollment.count({
        where: { course: { tutorId } }
      }),
      // Unique students count
      prisma.enrollment.groupBy({
        by: ['studentId'],
        where: { course: { tutorId } },
        _count: true
      }).then(results => results.length),
      // Enrollments by course
      prisma.course.findMany({
        where: { tutorId },
        include: {
          _count: {
            select: { enrollments: true }
          }
        }
      })
    ]);

    res.json({
      success: true,
      data: {
        totalEnrollments,
        uniqueStudents,
        enrollmentsByCourse: enrollmentsByCourse.map(course => ({
          courseId: course.id,
          courseTitle: course.title,
          enrollmentCount: course._count.enrollments
        }))
      }
    });

  } catch (error) {
    console.error('Get enrollment stats error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to load enrollment statistics',
      details: error.message 
    });
  }
});

// Get tutor's course notes
router.get('/notes', requireTutor, async (req, res) => {
  try {
    const tutorId = req.user.id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 12;
    const search = req.query.search || '';
    const courseId = req.query.courseId;
    const skip = (page - 1) * limit;

    console.log(`📝 Loading notes for tutor ${tutorId}, page ${page}`);

    // Build where clause - only notes from tutor's courses
    const where = {
      course: { tutorId }
    };
    
    // Add search filter
    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { content: { contains: search, mode: 'insensitive' } }
      ];
    }

    // Add course filter
    if (courseId) {
      where.courseId = parseInt(courseId);
    }

    // Get notes with related data
    const [notes, totalNotes] = await Promise.all([
      prisma.note.findMany({
        where,
        include: {
          course: {
            select: {
              id: true,
              title: true,
              tutorId: true
            }
          }
        },
        orderBy: { updatedAt: 'desc' },
        skip,
        take: limit
      }),
      prisma.note.count({ where })
    ]);

    const totalPages = Math.ceil(totalNotes / limit);

    res.json({
      success: true,
      data: notes,
      pagination: {
        page,
        pages: totalPages,
        total: totalNotes,
        limit
      }
    });

  } catch (error) {
    console.error('Get notes error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to load notes',
      details: error.message 
    });
  }
});

// Get single note
router.get('/notes/:id', requireTutor, async (req, res) => {
  try {
    const tutorId = req.user.id;
    const noteId = parseInt(req.params.id);

    const note = await prisma.note.findFirst({
      where: {
        id: noteId,
        course: { tutorId } // Ensure note belongs to tutor's course
      },
      include: {
        course: {
          select: {
            id: true,
            title: true,
            description: true
          }
        }
      }
    });

    if (!note) {
      return res.status(404).json({ 
        success: false,
        error: 'Note not found or access denied' 
      });
    }

    res.json({
      success: true,
      data: note
    });

  } catch (error) {
    console.error('Get note error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to load note',
      details: error.message 
    });
  }
});

// Create new note
router.post('/notes', requireTutor, async (req, res) => {
  try {
    const tutorId = req.user.id;
    const { courseId, title, content } = req.body;

    console.log(`➕ Creating note for tutor ${tutorId}:`, title);

    if (!title || !content || !courseId) {
      return res.status(400).json({ 
        success: false,
        error: 'Note title, content, and course are required' 
      });
    }

    // Verify course belongs to tutor
    const course = await prisma.course.findFirst({
      where: {
        id: parseInt(courseId),
        tutorId
      }
    });

    if (!course) {
      return res.status(403).json({ 
        success: false,
        error: 'Course not found or access denied' 
      });
    }

    const note = await prisma.note.create({
      data: {
        title,
        content,
        courseId: parseInt(courseId)
      },
      include: {
        course: {
          select: {
            id: true,
            title: true
          }
        }
      }
    });

    res.status(201).json({
      success: true,
      data: note,
      message: 'Note created successfully'
    });

  } catch (error) {
    console.error('Create note error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to create note',
      details: error.message 
    });
  }
});

// Update note
router.put('/notes/:id', requireTutor, async (req, res) => {
  try {
    const tutorId = req.user.id;
    const noteId = parseInt(req.params.id);
    const { courseId, title, content } = req.body;

    console.log(`✏️ Updating note ${noteId} for tutor ${tutorId}`);

    // Check if note exists and belongs to tutor's course
    const existingNote = await prisma.note.findFirst({
      where: {
        id: noteId,
        course: { tutorId }
      }
    });

    if (!existingNote) {
      return res.status(404).json({ 
        success: false,
        error: 'Note not found or access denied' 
      });
    }

    // If changing course, verify new course belongs to tutor
    if (courseId && courseId !== existingNote.courseId) {
      const newCourse = await prisma.course.findFirst({
        where: {
          id: parseInt(courseId),
          tutorId
        }
      });

      if (!newCourse) {
        return res.status(403).json({ 
          success: false,
          error: 'Course not found or access denied' 
        });
      }
    }

    const note = await prisma.note.update({
      where: { id: noteId },
      data: {
        title,
        content,
        ...(courseId && { courseId: parseInt(courseId) }),
        updatedAt: new Date()
      },
      include: {
        course: {
          select: {
            id: true,
            title: true
          }
        }
      }
    });

    res.json({
      success: true,
      data: note,
      message: 'Note updated successfully'
    });

  } catch (error) {
    console.error('Update note error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to update note',
      details: error.message 
    });
  }
});

// Delete note
router.delete('/notes/:id', requireTutor, async (req, res) => {
  try {
    const tutorId = req.user.id;
    const noteId = parseInt(req.params.id);

    console.log(`🗑️ Deleting note ${noteId} for tutor ${tutorId}`);

    // Check if note exists and belongs to tutor's course
    const existingNote = await prisma.note.findFirst({
      where: {
        id: noteId,
        course: { tutorId }
      }
    });

    if (!existingNote) {
      return res.status(404).json({ 
        success: false,
        error: 'Note not found or access denied' 
      });
    }

    // Delete note
    await prisma.note.delete({
      where: { id: noteId }
    });

    res.json({
      success: true,
      message: 'Note deleted successfully'
    });

  } catch (error) {
    console.error('Delete note error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to delete note',
      details: error.message 
    });
  }
});

// Get all students (for tutor to enroll)
router.get('/students', requireTutor, async (req, res) => {
  try {
    const tutorId = req.user.id;
    
    console.log(`👥 Loading students for tutor ${tutorId}`);

    const students = await prisma.user.findMany({
      where: {
        role: {
          name: 'student'
        }
      },
      select: {
        id: true,
        username: true,
        email: true,
        fullName: true,
        createdAt: true
      },
      orderBy: { fullName: 'asc' }
    });

    res.json({
      success: true,
      data: students
    });

  } catch (error) {
    console.error('Get students error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to load students',
      details: error.message 
    });
  }
});

// Create new enrollment (tutor enrolls student)
router.post('/enrollments', requireTutor, async (req, res) => {
  try {
    const tutorId = req.user.id;
    const { studentId, courseId } = req.body;

    console.log(`➕ Tutor ${tutorId} enrolling student ${studentId} in course ${courseId}`);

    if (!studentId || !courseId) {
      return res.status(400).json({ 
        success: false,
        error: 'Student ID and Course ID are required' 
      });
    }

    // Verify course belongs to tutor
    const course = await prisma.course.findFirst({
      where: {
        id: parseInt(courseId),
        tutorId
      }
    });

    if (!course) {
      return res.status(404).json({ 
        success: false,
        error: 'Course not found or access denied' 
      });
    }

    // Verify student exists
    const student = await prisma.user.findFirst({
      where: {
        id: parseInt(studentId),
        role: {
          name: 'student'
        }
      }
    });

    if (!student) {
      return res.status(404).json({ 
        success: false,
        error: 'Student not found' 
      });
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
      return res.status(409).json({ 
        success: false,
        error: 'Student is already enrolled in this course' 
      });
    }

    // Create enrollment
    const enrollment = await prisma.enrollment.create({
      data: {
        studentId: parseInt(studentId),
        courseId: parseInt(courseId)
      },
      include: {
        student: {
          select: {
            id: true,
            username: true,
            email: true,
            fullName: true
          }
        },
        course: {
          select: {
            id: true,
            title: true
          }
        }
      }
    });

    res.status(201).json({
      success: true,
      data: enrollment,
      message: 'Student enrolled successfully'
    });

  } catch (error) {
    console.error('Create enrollment error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to enroll student',
      details: error.message 
    });
  }
});

// Get tutor's courses
router.get('/courses', requireTutor, async (req, res) => {
  try {
    const tutorId = req.user.id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 12;
    const search = req.query.search || '';
    const skip = (page - 1) * limit;

    console.log(`📚 Loading courses for tutor ${tutorId}, page ${page}`);

    // Build where clause
    const where = { tutorId };
    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
        { category: { contains: search, mode: 'insensitive' } }
      ];
    }

    // Get courses with counts
    const [courses, totalCourses] = await Promise.all([
      prisma.course.findMany({
        where,
        include: {
          _count: {
            select: {
              lessons: true,
              enrollments: true
            }
          },
          lessons: {
            take: 3,
            orderBy: { orderIndex: 'asc' }
          }
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit
      }),
      prisma.course.count({ where })
    ]);

    const totalPages = Math.ceil(totalCourses / limit);

    res.json({
      success: true,
      data: courses,
      pagination: {
        page,
        pages: totalPages,
        total: totalCourses,
        limit
      }
    });

  } catch (error) {
    console.error('Get courses error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to load courses',
      details: error.message 
    });
  }
});

// Get single course
router.get('/courses/:id', requireTutor, async (req, res) => {
  try {
    const tutorId = req.user.id;
    const courseId = parseInt(req.params.id);

    const course = await prisma.course.findFirst({
      where: {
        id: courseId,
        tutorId // Ensure tutor owns the course
      },
      include: {
        _count: {
          select: {
            lessons: true,
            enrollments: true
          }
        },
        lessons: {
          orderBy: { orderIndex: 'asc' }
        }
      }
    });

    if (!course) {
      return res.status(404).json({ 
        success: false,
        error: 'Course not found or access denied' 
      });
    }

    res.json({
      success: true,
      data: course
    });

  } catch (error) {
    console.error('Get course error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to load course',
      details: error.message 
    });
  }
});

// Create new course
router.post('/courses', requireTutor, async (req, res) => {
  try {
    const tutorId = req.user.id;
    const { title, description, category, level, thumbnailUrl, isPublished } = req.body;

    console.log(`➕ Creating course for tutor ${tutorId}:`, title);

    if (!title) {
      return res.status(400).json({ 
        success: false,
        error: 'Course title is required' 
      });
    }

    const course = await prisma.course.create({
      data: {
        title,
        description,
        category,
        level,
        thumbnailUrl,
        isPublished: isPublished || false,
        tutorId
      },
      include: {
        _count: {
          select: {
            lessons: true,
            enrollments: true
          }
        }
      }
    });

    res.status(201).json({
      success: true,
      data: course,
      message: 'Course created successfully'
    });

  } catch (error) {
    console.error('Create course error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to create course',
      details: error.message 
    });
  }
});

// Update course
router.put('/courses/:id', requireTutor, async (req, res) => {
  try {
    const tutorId = req.user.id;
    const courseId = parseInt(req.params.id);
    const { title, description, category, level, thumbnailUrl, isPublished } = req.body;

    console.log(`✏️ Updating course ${courseId} for tutor ${tutorId}`);

    // Check if course exists and belongs to tutor
    const existingCourse = await prisma.course.findFirst({
      where: {
        id: courseId,
        tutorId
      }
    });

    if (!existingCourse) {
      return res.status(404).json({ 
        success: false,
        error: 'Course not found or access denied' 
      });
    }

    const course = await prisma.course.update({
      where: { id: courseId },
      data: {
        title,
        description,
        category,
        level,
        thumbnailUrl,
        isPublished
      },
      include: {
        _count: {
          select: {
            lessons: true,
            enrollments: true
          }
        }
      }
    });

    res.json({
      success: true,
      data: course,
      message: 'Course updated successfully'
    });

  } catch (error) {
    console.error('Update course error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to update course',
      details: error.message 
    });
  }
});

// Delete course
router.delete('/courses/:id', requireTutor, async (req, res) => {
  try {
    const tutorId = req.user.id;
    const courseId = parseInt(req.params.id);

    console.log(`🗑️ Deleting course ${courseId} for tutor ${tutorId}`);

    // Check if course exists and belongs to tutor
    const existingCourse = await prisma.course.findFirst({
      where: {
        id: courseId,
        tutorId
      }
    });

    if (!existingCourse) {
      return res.status(404).json({ 
        success: false,
        error: 'Course not found or access denied' 
      });
    }

    // Delete course (cascade will handle related records)
    await prisma.course.delete({
      where: { id: courseId }
    });

    res.json({
      success: true,
      message: 'Course deleted successfully'
    });

  } catch (error) {
    console.error('Delete course error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to delete course',
      details: error.message 
    });
  }
});

// Get tutor's lessons
router.get('/lessons', requireTutor, async (req, res) => {
  try {
    const tutorId = req.user.id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 12;
    const search = req.query.search || '';
    const skip = (page - 1) * limit;

    console.log(`📖 Loading lessons for tutor ${tutorId}, page ${page}`);

    // Build where clause - only lessons from tutor's courses
    const where = {
      course: { tutorId }
    };
    
    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { content: { contains: search, mode: 'insensitive' } }
      ];
    }

    // Get lessons with counts and course info
    const [lessons, totalLessons] = await Promise.all([
      prisma.lesson.findMany({
        where,
        include: {
          course: {
            select: {
              id: true,
              title: true,
              tutorId: true
            }
          },
          _count: {
            select: {
              assignments: true
            }
          }
        },
        orderBy: [
          { courseId: 'asc' },
          { orderIndex: 'asc' }
        ],
        skip,
        take: limit
      }),
      prisma.lesson.count({ where })
    ]);

    const totalPages = Math.ceil(totalLessons / limit);

    res.json({
      success: true,
      data: lessons,
      pagination: {
        page,
        pages: totalPages,
        total: totalLessons,
        limit
      }
    });

  } catch (error) {
    console.error('Get lessons error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to load lessons',
      details: error.message 
    });
  }
});

// Get single lesson
router.get('/lessons/:id', requireTutor, async (req, res) => {
  try {
    const tutorId = req.user.id;
    const lessonId = parseInt(req.params.id);

    const lesson = await prisma.lesson.findFirst({
      where: {
        id: lessonId,
        course: { tutorId } // Ensure lesson belongs to tutor's course
      },
      include: {
        course: {
          select: {
            id: true,
            title: true,
            tutorId: true
          }
        },
        assignments: {
          include: {
            _count: {
              select: {
                submissions: true
              }
            }
          },
          orderBy: { id: 'asc' }
        },
        _count: {
          select: {
            assignments: true
          }
        }
      }
    });

    if (!lesson) {
      return res.status(404).json({ 
        success: false,
        error: 'Lesson not found or access denied' 
      });
    }

    res.json({
      success: true,
      data: lesson
    });

  } catch (error) {
    console.error('Get lesson error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to load lesson',
      details: error.message 
    });
  }
});

// Create new lesson
router.post('/lessons', requireTutor, async (req, res) => {
  try {
    const tutorId = req.user.id;
    const { courseId, title, content, videoUrl, orderIndex } = req.body;

    console.log(`➕ Creating lesson for tutor ${tutorId}:`, title);

    if (!title || !courseId) {
      return res.status(400).json({ 
        success: false,
        error: 'Lesson title and course are required' 
      });
    }

    // Verify course belongs to tutor
    const course = await prisma.course.findFirst({
      where: {
        id: parseInt(courseId),
        tutorId
      }
    });

    if (!course) {
      return res.status(403).json({ 
        success: false,
        error: 'Course not found or access denied' 
      });
    }

    const lesson = await prisma.lesson.create({
      data: {
        title,
        content,
        videoUrl,
        orderIndex: orderIndex || 0,
        courseId: parseInt(courseId)
      },
      include: {
        course: {
          select: {
            id: true,
            title: true
          }
        },
        _count: {
          select: {
            assignments: true
          }
        }
      }
    });

    res.status(201).json({
      success: true,
      data: lesson,
      message: 'Lesson created successfully'
    });

  } catch (error) {
    console.error('Create lesson error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to create lesson',
      details: error.message 
    });
  }
});

// Update lesson
router.put('/lessons/:id', requireTutor, async (req, res) => {
  try {
    const tutorId = req.user.id;
    const lessonId = parseInt(req.params.id);
    const { courseId, title, content, videoUrl, orderIndex } = req.body;

    console.log(`✏️ Updating lesson ${lessonId} for tutor ${tutorId}`);

    // Check if lesson exists and belongs to tutor's course
    const existingLesson = await prisma.lesson.findFirst({
      where: {
        id: lessonId,
        course: { tutorId }
      }
    });

    if (!existingLesson) {
      return res.status(404).json({ 
        success: false,
        error: 'Lesson not found or access denied' 
      });
    }

    // If changing course, verify new course belongs to tutor
    if (courseId && courseId !== existingLesson.courseId) {
      const newCourse = await prisma.course.findFirst({
        where: {
          id: parseInt(courseId),
          tutorId
        }
      });

      if (!newCourse) {
        return res.status(403).json({ 
          success: false,
          error: 'Course not found or access denied' 
        });
      }
    }

    const lesson = await prisma.lesson.update({
      where: { id: lessonId },
      data: {
        title,
        content,
        videoUrl,
        orderIndex,
        ...(courseId && { courseId: parseInt(courseId) })
      },
      include: {
        course: {
          select: {
            id: true,
            title: true
          }
        },
        _count: {
          select: {
            assignments: true
          }
        }
      }
    });

    res.json({
      success: true,
      data: lesson,
      message: 'Lesson updated successfully'
    });

  } catch (error) {
    console.error('Update lesson error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to update lesson',
      details: error.message 
    });
  }
});

// Delete lesson
router.delete('/lessons/:id', requireTutor, async (req, res) => {
  try {
    const tutorId = req.user.id;
    const lessonId = parseInt(req.params.id);

    console.log(`🗑️ Deleting lesson ${lessonId} for tutor ${tutorId}`);

    // Check if lesson exists and belongs to tutor's course
    const existingLesson = await prisma.lesson.findFirst({
      where: {
        id: lessonId,
        course: { tutorId }
      }
    });

    if (!existingLesson) {
      return res.status(404).json({ 
        success: false,
        error: 'Lesson not found or access denied' 
      });
    }

    // Delete lesson (cascade will handle related assignments)
    await prisma.lesson.delete({
      where: { id: lessonId }
    });

    res.json({
      success: true,
      message: 'Lesson deleted successfully'
    });

  } catch (error) {
    console.error('Delete lesson error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to delete lesson',
      details: error.message 
    });
  }
});

// Get tutor's assignments
router.get('/assignments', requireTutor, async (req, res) => {
  try {
    const tutorId = req.user.id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 15;
    const search = req.query.search || '';
    const skip = (page - 1) * limit;

    console.log(`📝 Loading assignments for tutor ${tutorId}, page ${page}`);

    // Build where clause - only assignments from tutor's courses
    const where = {
      lesson: {
        course: { tutorId }
      }
    };
    
    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } }
      ];
    }

    // Get assignments with counts and related info
    const [assignments, totalAssignments] = await Promise.all([
      prisma.assignment.findMany({
        where,
        include: {
          lesson: {
            include: {
              course: {
                select: {
                  id: true,
                  title: true,
                  tutorId: true
                }
              }
            }
          },
          _count: {
            select: {
              submissions: true
            }
          }
        },
        orderBy: [
          { lesson: { courseId: 'asc' } },
          { lessonId: 'asc' },
          { id: 'asc' }
        ],
        skip,
        take: limit
      }),
      prisma.assignment.count({ where })
    ]);

    const totalPages = Math.ceil(totalAssignments / limit);

    res.json({
      success: true,
      data: assignments,
      pagination: {
        page,
        pages: totalPages,
        total: totalAssignments,
        limit
      }
    });

  } catch (error) {
    console.error('Get assignments error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to load assignments',
      details: error.message 
    });
  }
});

// Get single assignment
router.get('/assignments/:id', requireTutor, async (req, res) => {
  try {
    const tutorId = req.user.id;
    const assignmentId = parseInt(req.params.id);

    const assignment = await prisma.assignment.findFirst({
      where: {
        id: assignmentId,
        lesson: {
          course: { tutorId } // Ensure assignment belongs to tutor's course
        }
      },
      include: {
        lesson: {
          include: {
            course: {
              select: {
                id: true,
                title: true,
                tutorId: true
              }
            }
          }
        },
        submissions: {
          include: {
            student: {
              select: {
                id: true,
                username: true,
                fullName: true,
                email: true
              }
            }
          },
          orderBy: { submittedAt: 'desc' }
        },
        _count: {
          select: {
            submissions: true
          }
        }
      }
    });

    if (!assignment) {
      return res.status(404).json({ 
        success: false,
        error: 'Assignment not found or access denied' 
      });
    }

    res.json({
      success: true,
      data: assignment
    });

  } catch (error) {
    console.error('Get assignment error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to load assignment',
      details: error.message 
    });
  }
});

// Create new assignment
router.post('/assignments', requireTutor, async (req, res) => {
  try {
    const tutorId = req.user.id;
    const { lessonId, title, description, maxScore } = req.body;

    console.log(`➕ Creating assignment for tutor ${tutorId}:`, title);

    if (!title || !lessonId) {
      return res.status(400).json({ 
        success: false,
        error: 'Assignment title and lesson are required' 
      });
    }

    // Verify lesson belongs to tutor's course
    const lesson = await prisma.lesson.findFirst({
      where: {
        id: parseInt(lessonId),
        course: { tutorId }
      }
    });

    if (!lesson) {
      return res.status(403).json({ 
        success: false,
        error: 'Lesson not found or access denied' 
      });
    }

    const assignment = await prisma.assignment.create({
      data: {
        title,
        description,
        maxScore: maxScore || 100,
        lessonId: parseInt(lessonId)
      },
      include: {
        lesson: {
          include: {
            course: {
              select: {
                id: true,
                title: true
              }
            }
          }
        },
        _count: {
          select: {
            submissions: true
          }
        }
      }
    });

    res.status(201).json({
      success: true,
      data: assignment,
      message: 'Assignment created successfully'
    });

  } catch (error) {
    console.error('Create assignment error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to create assignment',
      details: error.message 
    });
  }
});

// Update assignment
router.put('/assignments/:id', requireTutor, async (req, res) => {
  try {
    const tutorId = req.user.id;
    const assignmentId = parseInt(req.params.id);
    const { lessonId, title, description, maxScore } = req.body;

    console.log(`✏️ Updating assignment ${assignmentId} for tutor ${tutorId}`);

    // Check if assignment exists and belongs to tutor's course
    const existingAssignment = await prisma.assignment.findFirst({
      where: {
        id: assignmentId,
        lesson: {
          course: { tutorId }
        }
      }
    });

    if (!existingAssignment) {
      return res.status(404).json({ 
        success: false,
        error: 'Assignment not found or access denied' 
      });
    }

    // If changing lesson, verify new lesson belongs to tutor
    if (lessonId && lessonId !== existingAssignment.lessonId) {
      const newLesson = await prisma.lesson.findFirst({
        where: {
          id: parseInt(lessonId),
          course: { tutorId }
        }
      });

      if (!newLesson) {
        return res.status(403).json({ 
          success: false,
          error: 'Lesson not found or access denied' 
        });
      }
    }

    const assignment = await prisma.assignment.update({
      where: { id: assignmentId },
      data: {
        title,
        description,
        maxScore,
        ...(lessonId && { lessonId: parseInt(lessonId) })
      },
      include: {
        lesson: {
          include: {
            course: {
              select: {
                id: true,
                title: true
              }
            }
          }
        },
        _count: {
          select: {
            submissions: true
          }
        }
      }
    });

    res.json({
      success: true,
      data: assignment,
      message: 'Assignment updated successfully'
    });

  } catch (error) {
    console.error('Update assignment error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to update assignment',
      details: error.message 
    });
  }
});

// Delete assignment
router.delete('/assignments/:id', requireTutor, async (req, res) => {
  try {
    const tutorId = req.user.id;
    const assignmentId = parseInt(req.params.id);

    console.log(`🗑️ Deleting assignment ${assignmentId} for tutor ${tutorId}`);

    // Check if assignment exists and belongs to tutor's course
    const existingAssignment = await prisma.assignment.findFirst({
      where: {
        id: assignmentId,
        lesson: {
          course: { tutorId }
        }
      }
    });

    if (!existingAssignment) {
      return res.status(404).json({ 
        success: false,
        error: 'Assignment not found or access denied' 
      });
    }

    // Delete assignment (cascade will handle related submissions)
    await prisma.assignment.delete({
      where: { id: assignmentId }
    });

    res.json({
      success: true,
      message: 'Assignment deleted successfully'
    });

  } catch (error) {
    console.error('Delete assignment error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to delete assignment',
      details: error.message 
    });
  }
});

// Get assignments for specific lesson
router.get('/lessons/:lessonId/assignments', requireTutor, async (req, res) => {
  try {
    const tutorId = req.user.id;
    const lessonId = parseInt(req.params.lessonId);

    // Verify lesson belongs to tutor
    const lesson = await prisma.lesson.findFirst({
      where: {
        id: lessonId,
        course: { tutorId }
      }
    });

    if (!lesson) {
      return res.status(404).json({ 
        success: false,
        error: 'Lesson not found or access denied' 
      });
    }

    const assignments = await prisma.assignment.findMany({
      where: {
        lessonId
      },
      include: {
        _count: {
          select: {
            submissions: true
          }
        }
      },
      orderBy: { id: 'asc' }
    });

    res.json({
      success: true,
      data: assignments
    });

  } catch (error) {
    console.error('Get lesson assignments error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to load lesson assignments',
      details: error.message 
    });
  }
});

// Get lessons for specific course
router.get('/courses/:courseId/lessons', requireTutor, async (req, res) => {
  try {
    const tutorId = req.user.id;
    const courseId = parseInt(req.params.courseId);

    // Verify course belongs to tutor
    const course = await prisma.course.findFirst({
      where: {
        id: courseId,
        tutorId
      }
    });

    if (!course) {
      return res.status(404).json({ 
        success: false,
        error: 'Course not found or access denied' 
      });
    }

    const lessons = await prisma.lesson.findMany({
      where: {
        courseId
      },
      include: {
        _count: {
          select: {
            assignments: true
          }
        }
      },
      orderBy: { orderIndex: 'asc' }
    });

    res.json({
      success: true,
      data: lessons
    });

  } catch (error) {
    console.error('Get course lessons error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to load course lessons',
      details: error.message 
    });
  }
});

// Get tutor's submissions
router.get('/submissions', requireTutor, async (req, res) => {
  try {
    const tutorId = req.user.id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 15;
    const search = req.query.search || '';
    const assignmentId = req.query.assignmentId;
    const skip = (page - 1) * limit;

    console.log(`📄 Loading submissions for tutor ${tutorId}, page ${page}`);

    // Build where clause - only submissions from tutor's assignments
    const where = {
      assignment: {
        lesson: {
          course: { tutorId }
        }
      }
    };
    
    // Add search filter
    if (search) {
      where.OR = [
        { student: { fullName: { contains: search, mode: 'insensitive' } } },
        { student: { email: { contains: search, mode: 'insensitive' } } },
        { assignment: { title: { contains: search, mode: 'insensitive' } } }
      ];
    }

    // Add assignment filter
    if (assignmentId) {
      where.assignmentId = parseInt(assignmentId);
    }

    // Get submissions with related data
    const [submissions, totalSubmissions] = await Promise.all([
      prisma.submission.findMany({
        where,
        include: {
          student: {
            select: {
              id: true,
              username: true,
              email: true,
              fullName: true
            }
          },
          assignment: {
            include: {
              lesson: {
                include: {
                  course: {
                    select: {
                      id: true,
                      title: true,
                      tutorId: true
                    }
                  }
                }
              }
            }
          }
        },
        orderBy: { submittedAt: 'desc' },
        skip,
        take: limit
      }),
      prisma.submission.count({ where })
    ]);

    const totalPages = Math.ceil(totalSubmissions / limit);

    res.json({
      success: true,
      data: submissions,
      pagination: {
        page,
        pages: totalPages,
        total: totalSubmissions,
        limit
      }
    });

  } catch (error) {
    console.error('Get submissions error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to load submissions',
      details: error.message 
    });
  }
});

// Get single submission
router.get('/submissions/:id', requireTutor, async (req, res) => {
  try {
    const tutorId = req.user.id;
    const submissionId = parseInt(req.params.id);

    const submission = await prisma.submission.findFirst({
      where: {
        id: submissionId,
        assignment: {
          lesson: {
            course: { tutorId } // Ensure submission belongs to tutor's course
          }
        }
      },
      include: {
        student: {
          select: {
            id: true,
            username: true,
            email: true,
            fullName: true
          }
        },
        assignment: {
          include: {
            lesson: {
              include: {
                course: {
                  select: {
                    id: true,
                    title: true,
                    tutorId: true
                  }
                }
              }
            }
          }
        }
      }
    });

    if (!submission) {
      return res.status(404).json({ 
        success: false,
        error: 'Submission not found or access denied' 
      });
    }

    res.json({
      success: true,
      data: submission
    });

  } catch (error) {
    console.error('Get submission error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to load submission',
      details: error.message 
    });
  }
});

// Grade submission
router.put('/submissions/:id/grade', requireTutor, async (req, res) => {
  try {
    const tutorId = req.user.id;
    const submissionId = parseInt(req.params.id);
    const { grade, feedback } = req.body;

    console.log(`📝 Grading submission ${submissionId} for tutor ${tutorId}`);

    // Check if submission exists and belongs to tutor's course
    const existingSubmission = await prisma.submission.findFirst({
      where: {
        id: submissionId,
        assignment: {
          lesson: {
            course: { tutorId }
          }
        }
      },
      include: {
        assignment: true
      }
    });

    if (!existingSubmission) {
      return res.status(404).json({ 
        success: false,
        error: 'Submission not found or access denied' 
      });
    }

    // Validate grade
    if (grade < 0 || grade > existingSubmission.assignment.maxScore) {
      return res.status(400).json({ 
        success: false,
        error: `Grade must be between 0 and ${existingSubmission.assignment.maxScore}` 
      });
    }

    const submission = await prisma.submission.update({
      where: { id: submissionId },
      data: {
        grade: parseInt(grade),
        feedback: feedback || null,
        updatedAt: new Date()
      },
      include: {
        student: {
          select: {
            id: true,
            username: true,
            email: true,
            fullName: true
          }
        },
        assignment: {
          include: {
            lesson: {
              include: {
                course: {
                  select: {
                    id: true,
                    title: true
                  }
                }
              }
            }
          }
        }
      }
    });

    res.json({
      success: true,
      data: submission,
      message: 'Submission graded successfully'
    });

  } catch (error) {
    console.error('Grade submission error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to grade submission',
      details: error.message 
    });
  }
});

// Get submissions for specific assignment
router.get('/assignments/:assignmentId/submissions', requireTutor, async (req, res) => {
  try {
    const tutorId = req.user.id;
    const assignmentId = parseInt(req.params.assignmentId);

    // Verify assignment belongs to tutor
    const assignment = await prisma.assignment.findFirst({
      where: {
        id: assignmentId,
        lesson: {
          course: { tutorId }
        }
      }
    });

    if (!assignment) {
      return res.status(404).json({ 
        success: false,
        error: 'Assignment not found or access denied' 
      });
    }

    const submissions = await prisma.submission.findMany({
      where: {
        assignmentId
      },
      include: {
        student: {
          select: {
            id: true,
            username: true,
            email: true,
            fullName: true
          }
        }
      },
      orderBy: { submittedAt: 'desc' }
    });

    res.json({
      success: true,
      data: submissions
    });

  } catch (error) {
    console.error('Get assignment submissions error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to load assignment submissions',
      details: error.message 
    });
  }
});

// Get pending submissions count
router.get('/submissions/pending/count', requireTutor, async (req, res) => {
  try {
    const tutorId = req.user.id;

    const pendingCount = await prisma.submission.count({
      where: {
        grade: null,
        assignment: {
          lesson: {
            course: { tutorId }
          }
        }
      }
    });

    res.json({
      success: true,
      data: { pendingCount }
    });

  } catch (error) {
    console.error('Get pending submissions count error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to load pending submissions count',
      details: error.message 
    });
  }
});


// Tutor dashboard stats (keep existing)
router.get('/dashboard/stats', requireTutor, async (req, res) => {
  try {
    const tutorId = req.user.id;

    console.log(`📊 Loading dashboard stats for tutor ${tutorId}`);

    // Get counts from database
    const [totalCourses, totalLessons, totalAssignments, pendingSubmissions] = await Promise.all([
      prisma.course.count({ where: { tutorId } }),
      prisma.lesson.count({ 
        where: { course: { tutorId } } 
      }),
      prisma.assignment.count({
        where: { lesson: { course: { tutorId } } }
      }),
      prisma.submission.count({
        where: { 
          assignment: { 
            lesson: { course: { tutorId } } 
          },
          grade: null 
        }
      })
    ]);

    // Get recent activity
    const recentSubmissions = await prisma.submission.findMany({
      where: {
        assignment: {
          lesson: { course: { tutorId } }
        }
      },
      include: {
        assignment: {
          include: {
            lesson: {
              include: {
                course: true
              }
            }
          }
        },
        student: true
      },
      orderBy: { submittedAt: 'desc' },
      take: 5
    });

    const activities = recentSubmissions.map(submission => ({
      description: `New submission from ${submission.student.fullName || submission.student.username} for "${submission.assignment.title}"`,
      timestamp: submission.submittedAt
    }));

    if (activities.length === 0) {
      activities.push(
        {
          description: 'Welcome to your tutor dashboard!',
          timestamp: new Date()
        },
        {
          description: 'Create your first course to get started',
          timestamp: new Date(Date.now() - 300000)
        }
      );
    }

    res.json({
      success: true,
      stats: {
        totalCourses,
        totalLessons,
        totalAssignments,
        pendingSubmissions
      },
      recentActivity: activities
    });

  } catch (error) {
    console.error('Dashboard stats error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to load dashboard data',
      details: error.message 
    });
  }
});

module.exports = router;