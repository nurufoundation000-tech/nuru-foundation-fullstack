const jwt = require('jsonwebtoken');
const prisma = require('../lib/prisma');

// Helper functions
const authenticateToken = async (req) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    throw new Error('Access token required');
  }

  const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret');
  const user = await prisma.user.findUnique({
    where: { id: decoded.userId },
    include: { role: true }
  });

  if (!user || !user.isActive) {
    throw new Error('User not found or inactive');
  }

  return {
    userId: user.id,
    roleId: user.roleId,
    roleName: user.role?.name,
    username: user.username
  };
};

const requireRole = (allowedRoles) => {
  return async (req) => {
    const user = await authenticateToken(req);
    if (!allowedRoles.includes(user.roleName)) {
      throw new Error(`Access denied. Required roles: ${allowedRoles.join(', ')}`);
    }
    return user;
  };
};

// Helper function to parse JSON body
const parseJsonBody = (req) => {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(new Error('Invalid JSON body'));
      }
    });
  });
};

// Helper function to parse query parameters
const parseQueryParams = (url) => {
  const query = {};
  const urlParts = url.split('?');
  if (urlParts[1]) {
    const params = new URLSearchParams(urlParts[1]);
    for (const [key, value] of params) {
      query[key] = value;
    }
  }
  return query;
};

// Set CORS headers
const setCorsHeaders = (res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
};

// Main serverless function
module.exports = async (req, res) => {
  setCorsHeaders(res);
  
  // Handle preflight OPTIONS request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const body = await parseJsonBody(req);
    const path = req.url;
    const method = req.method;
    const query = parseQueryParams(path);
    const basePath = path.split('?')[0];

    // GET LESSONS FOR COURSE - GET /?courseId=:id
    if (basePath === '/' && method === 'GET' && query.courseId) {
      const user = await authenticateToken(req);
      const courseId = parseInt(query.courseId);

      // Check if user is enrolled in the course or is the tutor
      const course = await prisma.course.findUnique({
        where: { id: courseId },
        include: { enrollments: true }
      });

      if (!course) {
        return res.status(404).json({ message: 'Course not found' });
      }

      const isTutor = course.tutorId === user.userId;
      const isEnrolled = course.enrollments.some(e => e.studentId === user.userId);

      if (!isTutor && !isEnrolled) {
        return res.status(403).json({ message: 'Not authorized to view lessons for this course' });
      }

      const lessons = await prisma.lesson.findMany({
        where: { courseId: courseId },
        orderBy: { orderIndex: 'asc' },
        include: {
          assignments: {
            select: { id: true, title: true, maxScore: true }
          }
        }
      });

      // If user is a student, include progress information
      if (!isTutor && isEnrolled) {
        const enrollment = course.enrollments.find(e => e.studentId === user.userId);
        const lessonsWithProgress = await Promise.all(
          lessons.map(async (lesson) => {
            const progress = await prisma.lessonProgress.findUnique({
              where: {
                enrollmentId_lessonId: {
                  enrollmentId: enrollment.id,
                  lessonId: lesson.id
                }
              }
            });

            return {
              ...lesson,
              isCompleted: progress?.isCompleted || false,
              completedAt: progress?.completedAt
            };
          })
        );

        return res.json(lessonsWithProgress);
      } else {
        return res.json(lessons);
      }
    }

    // GET SINGLE LESSON - GET /:id
    if (basePath.match(/^\/(\d+)$/) && method === 'GET') {
      const user = await authenticateToken(req);
      const match = basePath.match(/^\/(\d+)$/);
      const lessonId = parseInt(match[1]);

      const lesson = await prisma.lesson.findUnique({
        where: { id: lessonId },
        include: {
          course: {
            select: { id: true, tutorId: true, enrollments: { select: { studentId: true } } }
          },
          assignments: true
        }
      });

      if (!lesson) {
        return res.status(404).json({ message: 'Lesson not found' });
      }

      const isTutor = lesson.course.tutorId === user.userId;
      const isEnrolled = lesson.course.enrollments.some(e => e.studentId === user.userId);

      if (!isTutor && !isEnrolled) {
        return res.status(403).json({ message: 'Not authorized to view this lesson' });
      }

      return res.json(lesson);
    }

    // CREATE LESSON - POST /
    if (basePath === '/' && method === 'POST') {
      const user = await requireRole(['tutor'])(req);
      const { title, content, videoUrl, orderIndex, courseId } = body;

      // Check if course belongs to tutor
      const course = await prisma.course.findUnique({
        where: { id: parseInt(courseId) }
      });

      if (!course || course.tutorId !== user.userId) {
        return res.status(403).json({ message: 'Not authorized to create lessons for this course' });
      }

      const lesson = await prisma.lesson.create({
        data: {
          title,
          content,
          videoUrl,
          orderIndex,
          courseId: parseInt(courseId)
        }
      });

      return res.status(201).json(lesson);
    }

    // UPDATE LESSON - PUT /:id
    if (basePath.match(/^\/(\d+)$/) && method === 'PUT') {
      const user = await requireRole(['tutor'])(req);
      const match = basePath.match(/^\/(\d+)$/);
      const lessonId = parseInt(match[1]);
      const { title, content, videoUrl, orderIndex } = body;

      const lesson = await prisma.lesson.findUnique({
        where: { id: lessonId },
        include: { course: true }
      });

      if (!lesson) {
        return res.status(404).json({ message: 'Lesson not found' });
      }

      if (lesson.course.tutorId !== user.userId) {
        return res.status(403).json({ message: 'Not authorized to update this lesson' });
      }

      const updatedLesson = await prisma.lesson.update({
        where: { id: lessonId },
        data: {
          title,
          content,
          videoUrl,
          orderIndex
        }
      });

      return res.json(updatedLesson);
    }

    // DELETE LESSON - DELETE /:id
    if (basePath.match(/^\/(\d+)$/) && method === 'DELETE') {
      const user = await requireRole(['tutor'])(req);
      const match = basePath.match(/^\/(\d+)$/);
      const lessonId = parseInt(match[1]);

      const lesson = await prisma.lesson.findUnique({
        where: { id: lessonId },
        include: { course: true }
      });

      if (!lesson) {
        return res.status(404).json({ message: 'Lesson not found' });
      }

      if (lesson.course.tutorId !== user.userId) {
        return res.status(403).json({ message: 'Not authorized to delete this lesson' });
      }

      await prisma.lesson.delete({
        where: { id: lessonId }
      });

      return res.json({ message: 'Lesson deleted successfully' });
    }

    // MARK LESSON AS COMPLETED - POST /:id/complete
    if (basePath.match(/^\/(\d+)\/complete$/) && method === 'POST') {
      const user = await authenticateToken(req);
      const match = basePath.match(/^\/(\d+)\/complete$/);
      const lessonId = parseInt(match[1]);

      const lesson = await prisma.lesson.findUnique({
        where: { id: lessonId },
        include: {
          course: {
            include: { enrollments: true }
          }
        }
      });

      if (!lesson) {
        return res.status(404).json({ message: 'Lesson not found' });
      }

      const enrollment = lesson.course.enrollments.find(e => e.studentId === user.userId);

      if (!enrollment) {
        return res.status(403).json({ message: 'Not enrolled in this course' });
      }

      // Upsert lesson progress
      const progress = await prisma.lessonProgress.upsert({
        where: {
          enrollmentId_lessonId: {
            enrollmentId: enrollment.id,
            lessonId: lessonId
          }
        },
        update: {
          isCompleted: true,
          completedAt: new Date()
        },
        create: {
          enrollmentId: enrollment.id,
          lessonId: lessonId,
          isCompleted: true,
          completedAt: new Date()
        }
      });

      // Update overall course progress
      const totalLessons = await prisma.lesson.count({
        where: { courseId: lesson.courseId }
      });

      const completedLessons = await prisma.lessonProgress.count({
        where: {
          enrollmentId: enrollment.id,
          isCompleted: true
        }
      });

      const courseProgress = (completedLessons / totalLessons) * 100;

      await prisma.enrollment.update({
        where: { id: enrollment.id },
        data: { progress: courseProgress }
      });

      return res.json({
        message: 'Lesson marked as completed',
        progress,
        courseProgress: Math.round(courseProgress)
      });
    }

    // Route not found
    return res.status(404).json({ message: 'Route not found' });

  } catch (error) {
    console.error('Lessons API Error:', error);
    
    // Handle specific errors
    if (error.message.includes('Access token required')) {
      return res.status(401).json({ message: error.message });
    }
    if (error.message.includes('Access denied') || error.message.includes('User not found')) {
      return res.status(403).json({ message: error.message });
    }
    if (error.message.includes('Invalid JSON')) {
      return res.status(400).json({ message: error.message });
    }
    if (error.message.includes('jwt')) {
      return res.status(403).json({ message: 'Invalid or expired token' });
    }
    
    // Generic server error
    return res.status(500).json({ message: 'Server error' });
  }
};