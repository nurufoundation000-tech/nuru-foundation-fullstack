const jwt = require('jsonwebtoken');
const prisma = require('../lib/prisma');

// Helper functions
const authenticateToken = async (req) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) throw new Error('Access token required');
  
  const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret');
  const user = await prisma.user.findUnique({
    where: { id: decoded.userId },
    include: { role: true }
  });
  
  if (!user || !user.isActive) throw new Error('User not found or inactive');
  return user;
};

const requireTutor = async (req) => {
  const user = await authenticateToken(req);
  if (user.role.name !== 'tutor') throw new Error('Tutor access required');
  return user;
};

const parseJsonBody = (req) => {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk.toString());
    req.on('end', () => {
      try { resolve(body ? JSON.parse(body) : {}); } 
      catch (error) { reject(new Error('Invalid JSON body')); }
    });
  });
};

const setCorsHeaders = (res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
};

// Router
const router = {
  handlers: {},
  add(method, path, handler) {
    this.handlers[`${method}:${path}`] = handler;
  },
  async handle(req, res) {
    const path = req.url.split('?')[0];
    console.log(`[Tutor Router] Handling ${req.method} ${path}`);
    console.log(`[Tutor Router] Available routes:`, Object.keys(this.handlers));

    const handler = this.handlers[`${req.method}:${path}`];

    if (handler) {
      console.log(`[Tutor Router] Handler found for ${req.method}:${path}`);
      try {
        const body = await parseJsonBody(req);
        await handler(req, res, body);
      } catch (error) {
        console.error(`❌ Error in handler for ${req.method} ${path}:`, error);
        if (error.message.includes('Access token required')) return res.status(401).json({ message: error.message });
        if (error.message.includes('Tutor access required')) return res.status(403).json({ message: error.message });
        if (error.message.includes('Invalid JSON')) return res.status(400).json({ message: error.message });
        if (error.message.includes('jwt')) return res.status(403).json({ message: 'Invalid token' });
        return res.status(500).json({ message: 'Server error' });
      }
    } else {
      console.log(`[Tutor Router] No handler found for ${req.method}:${path}`);
      res.status(404).json({ message: `Tutor endpoint not found: ${req.method} ${path}` });
    }
  }
};

// COURSES - GET /courses (scoped to tutor)
router.add('GET', '/courses', async (req, res) => {
  const tutor = await requireTutor(req);
  
  const courses = await prisma.course.findMany({
    where: { tutorId: tutor.id },
    include: { 
      _count: { select: { enrollments: true, lessons: true, courseReviews: true } }
    },
    orderBy: { createdAt: 'desc' }
  });
  
  res.json({ data: courses });
});

// COURSES - POST /courses (scoped to tutor)
router.add('POST', '/courses', async (req, res, body) => {
    const tutor = await requireTutor(req);
    const { title, description, category, level, thumbnailUrl, isPublished } = body;

    const course = await prisma.course.create({
        data: {
            tutorId: tutor.id,
            title,
            description,
            category,
            level,
            thumbnailUrl,
            isPublished
        }
    });

    res.status(201).json(course);
});

// COURSES - PUT /courses/:id (scoped to tutor)
router.add('PUT', '/courses/:id', async (req, res, body) => {
    const tutor = await requireTutor(req);
    const { id } = req.query;
    const { title, description, category, level, thumbnailUrl, isPublished } = body;

    const course = await prisma.course.findFirst({
        where: { id: parseInt(id), tutorId: tutor.id }
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
});

// COURSES - DELETE /courses/:id (scoped to tutor)
router.add('DELETE', '/courses/:id', async (req, res) => {
    const tutor = await requireTutor(req);
    const { id } = req.query;

    const course = await prisma.course.findFirst({
        where: { id: parseInt(id), tutorId: tutor.id }
    });

    if (!course) {
        return res.status(404).json({ message: 'Course not found or not authorized' });
    }

    await prisma.course.delete({
        where: { id: parseInt(id) }
    });

    res.json({ message: 'Course deleted successfully' });
});

// LESSONS - GET /lessons (scoped to tutor)
router.add('GET', '/lessons', async (req, res) => {
    const tutor = await requireTutor(req);

    const lessons = await prisma.lesson.findMany({
        where: {
            course: {
                tutorId: tutor.id
            }
        },
        include: {
            course: {
                select: { id: true, title: true }
            },
            _count: {
                select: { assignments: true }
            }
        },
        orderBy: { createdAt: 'desc' }
    });

    res.json({ data: lessons });
});

// LESSONS - POST /lessons (scoped to tutor)
router.add('POST', '/lessons', async (req, res, body) => {
    const tutor = await requireTutor(req);
    const { courseId, title, content, videoUrl, orderIndex } = body;

    const course = await prisma.course.findFirst({
        where: { id: parseInt(courseId), tutorId: tutor.id }
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
});

// LESSONS - PUT /lessons/:id (scoped to tutor)
router.add('PUT', '/lessons/:id', async (req, res, body) => {
    const tutor = await requireTutor(req);
    const { id } = req.query;
    const { courseId, title, content, videoUrl, orderIndex } = body;

    const lesson = await prisma.lesson.findFirst({
        where: {
            id: parseInt(id),
            course: { tutorId: tutor.id }
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
});

// LESSONS - DELETE /lessons/:id (scoped to tutor)
router.add('DELETE', '/lessons/:id', async (req, res) => {
    const tutor = await requireTutor(req);
    const { id } = req.query;

    const lesson = await prisma.lesson.findFirst({
        where: {
            id: parseInt(id),
            course: { tutorId: tutor.id }
        }
    });

    if (!lesson) {
        return res.status(404).json({ message: 'Lesson not found or not authorized' });
    }

    await prisma.lesson.delete({
        where: { id: parseInt(id) }
    });

    res.json({ message: 'Lesson deleted successfully' });
});

// ASSIGNMENTS - GET /assignments (scoped to tutor)
router.add('GET', '/assignments', async (req, res) => {
    const tutor = await requireTutor(req);

    const assignments = await prisma.assignment.findMany({
        where: {
            lesson: {
                course: {
                    tutorId: tutor.id
                }
            }
        },
        include: {
            lesson: {
                select: { id: true, title: true, course: { select: { id: true, title: true } } }
            },
            _count: {
                select: { submissions: true }
            }
        },
        orderBy: { id: 'desc' }
    });

    res.json({ data: assignments });
});

// ASSIGNMENTS - POST /assignments (scoped to tutor)
router.add('POST', '/assignments', async (req, res, body) => {
    const tutor = await requireTutor(req);
    const { lessonId, title, description, maxScore } = body;

    const lesson = await prisma.lesson.findFirst({
        where: {
            id: parseInt(lessonId),
            course: { tutorId: tutor.id }
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
});

// ASSIGNMENTS - PUT /assignments/:id (scoped to tutor)
router.add('PUT', '/assignments/:id', async (req, res, body) => {
    const tutor = await requireTutor(req);
    const { id } = req.query;
    const { lessonId, title, description, maxScore } = body;

    const assignment = await prisma.assignment.findFirst({
        where: {
            id: parseInt(id),
            lesson: {
                course: { tutorId: tutor.id }
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
});

// ASSIGNMENTS - DELETE /assignments/:id (scoped to tutor)
router.add('DELETE', '/assignments/:id', async (req, res) => {
    const tutor = await requireTutor(req);
    const { id } = req.query;

    const assignment = await prisma.assignment.findFirst({
        where: {
            id: parseInt(id),
            lesson: {
                course: { tutorId: tutor.id }
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
});

// SUBMISSIONS - GET /submissions (scoped to tutor)
router.add('GET', '/submissions', async (req, res) => {
    const tutor = await requireTutor(req);

    const submissions = await prisma.submission.findMany({
        where: {
            assignment: {
                lesson: {
                    course: {
                        tutorId: tutor.id
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
        orderBy: { submittedAt: 'desc' }
    });

    res.json({ data: submissions });
});

// SUBMISSIONS - PUT /submissions/:id/grade (scoped to tutor)
router.add('PUT', '/submissions/:id/grade', async (req, res, body) => {
    const tutor = await requireTutor(req);
    const { id } = req.query;
    const { grade, feedback } = body;

    const submission = await prisma.submission.findFirst({
        where: {
            id: parseInt(id),
            assignment: {
                lesson: {
                    course: { tutorId: tutor.id }
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
});


// Main serverless function
module.exports = async (req, res) => {
  setCorsHeaders(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  
  console.log('🔍 Tutor API Request:', req.url, req.method);
  await router.handle(req, res);
};
