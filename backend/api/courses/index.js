const jwt = require('jsonwebtoken');
const prisma = require('../../lib/prisma');

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

    // GET ALL PUBLISHED COURSES - GET /
    if (path === '/' && method === 'GET') {
      const courses = await prisma.course.findMany({
        where: { isPublished: true },
        include: {
          tutor: {
            select: { username: true, fullName: true, profilePicUrl: true }
          },
          _count: {
            select: { enrollments: true, lessons: true }
          }
        }
      });

      return res.json(courses);
    }

    // CREATE COURSE - POST /
    if (path === '/' && method === 'POST') {
      const user = await authenticateToken(req);
      
      // Check if user has tutor or admin role
      const userWithRole = await prisma.user.findUnique({
        where: { id: user.userId },
        include: { role: true }
      });

      if (!userWithRole || (userWithRole.role.name !== 'tutor' && userWithRole.role.name !== 'admin')) {
        return res.status(403).json({ message: 'Only tutors or admins can create courses' });
      }

      const { title, description, category, level, thumbnailUrl } = body;

      const course = await prisma.course.create({
        data: {
          title,
          description,
          category,
          level,
          thumbnailUrl,
          tutorId: user.userId
        }
      });

      return res.status(201).json(course);
    }

    // ENROLL IN COURSE - POST /:id/enroll
    if (path.match(/^\/(\d+)\/enroll$/) && method === 'POST') {
      const user = await authenticateToken(req);
      
      // Check if user has student role
      const userWithRole = await prisma.user.findUnique({
        where: { id: user.userId },
        include: { role: true }
      });

      if (!userWithRole || userWithRole.role.name !== 'student') {
        return res.status(403).json({ message: 'Only students can enroll in courses' });
      }

      const match = path.match(/^\/(\d+)\/enroll$/);
      const courseId = parseInt(match[1]);

      // Check if course exists and is published
      const course = await prisma.course.findFirst({
        where: { id: courseId, isPublished: true }
      });

      if (!course) {
        return res.status(404).json({ message: 'Course not found' });
      }

      // Check if already enrolled
      const existingEnrollment = await prisma.enrollment.findUnique({
        where: {
          studentId_courseId: {
            studentId: user.userId,
            courseId: courseId
          }
        }
      });

      if (existingEnrollment) {
        return res.status(400).json({ message: 'Already enrolled in this course' });
      }

      // Create enrollment
      const enrollment = await prisma.enrollment.create({
        data: {
          studentId: user.userId,
          courseId: courseId
        }
      });

      return res.status(201).json({
        message: 'Successfully enrolled in course',
        enrollment
      });
    }

    // UPDATE PROGRESS - PUT /:id/progress
    if (path.match(/^\/(\d+)\/progress$/) && method === 'PUT') {
      const user = await authenticateToken(req);
      const match = path.match(/^\/(\d+)\/progress$/);
      const enrollmentId = parseInt(match[1]);
      const { progress } = body;

      const enrollment = await prisma.enrollment.findUnique({
        where: { id: enrollmentId }
      });

      if (!enrollment) {
        return res.status(404).json({ message: 'Enrollment not found' });
      }

      if (enrollment.studentId !== user.userId) {
        return res.status(403).json({ message: 'Not authorized to update this enrollment progress' });
      }

      const updatedEnrollment = await prisma.enrollment.update({
        where: { id: enrollmentId },
        data: { progress: parseFloat(progress) }
      });

      return res.json(updatedEnrollment);
    }

    // GET USER PROGRESS - GET /progress
    if (path === '/progress' && method === 'GET') {
      const user = await authenticateToken(req);

      const enrollments = await prisma.enrollment.findMany({
        where: { studentId: user.userId },
        include: {
          course: {
            select: {
              id: true,
              title: true,
              description: true,
              thumbnailUrl: true,
              tutor: { select: { username: true, fullName: true } },
              _count: {
                select: { lessons: true }
              }
            }
          }
        }
      });

      // Calculate completed lessons for each enrollment
      const progressWithDetails = await Promise.all(
        enrollments.map(async (enrollment) => {
          const completedLessons = await prisma.lessonProgress.count({
            where: {
              enrollmentId: enrollment.id,
              isCompleted: true
            }
          });

          return {
            ...enrollment,
            completedLessons,
            totalLessons: enrollment.course._count.lessons
          };
        })
      );

      return res.json(progressWithDetails);
    }

    // ENROLL STUDENT - POST /:id/enroll-student
    if (path.match(/^\/(\d+)\/enroll-student$/) && method === 'POST') {
      const user = await requireRole(['tutor', 'admin'])(req);
      const match = path.match(/^\/(\d+)\/enroll-student$/);
      const courseId = parseInt(match[1]);
      const { studentId } = body;

      // Check if course exists
      const course = await prisma.course.findUnique({
        where: { id: courseId }
      });

      if (!course) {
        return res.status(404).json({ message: 'Course not found' });
      }

      // Check if user is admin or the course tutor
      const userWithRole = await prisma.user.findUnique({
        where: { id: user.userId },
        include: { role: true }
      });

      if (course.tutorId !== user.userId && userWithRole.role.name !== 'admin') {
        return res.status(403).json({ message: 'Not authorized to enroll students in this course' });
      }

      // Check if student exists
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
            courseId: courseId
          }
        }
      });

      if (existingEnrollment) {
        return res.status(400).json({ message: 'Student already enrolled in this course' });
      }

      const enrollment = await prisma.enrollment.create({
        data: {
          studentId: parseInt(studentId),
          courseId: courseId
        }
      });

      return res.status(201).json({ message: 'Student enrolled successfully', enrollment });
    }

    // GET ENROLLMENTS - GET /:id/enrollments
    if (path.match(/^\/(\d+)\/enrollments$/) && method === 'GET') {
      const user = await requireRole(['tutor', 'admin'])(req);
      const match = path.match(/^\/(\d+)\/enrollments$/);
      const courseId = parseInt(match[1]);

      // Check if course exists
      const course = await prisma.course.findUnique({
        where: { id: courseId }
      });

      if (!course) {
        return res.status(404).json({ message: 'Course not found' });
      }

      // Check if user is admin or the course tutor
      const userWithRole = await prisma.user.findUnique({
        where: { id: user.userId },
        include: { role: true }
      });

      if (course.tutorId !== user.userId && userWithRole.role.name !== 'admin') {
        return res.status(403).json({ message: 'Not authorized to view enrollments for this course' });
      }

      const enrollments = await prisma.enrollment.findMany({
        where: { courseId: courseId },
        include: {
          student: {
            select: {
              id: true,
              username: true,
              fullName: true,
              email: true,
              profilePicUrl: true
            }
          }
        }
      });

      return res.json(enrollments);
    }

    // UNENROLL - DELETE /:id/unenroll
    if (path.match(/^\/(\d+)\/unenroll$/) && method === 'DELETE') {
      const user = await authenticateToken(req);
      const match = path.match(/^\/(\d+)\/unenroll$/);
      const courseId = parseInt(match[1]);

      // Check if user has student role
      const userWithRole = await prisma.user.findUnique({
        where: { id: user.userId },
        include: { role: true }
      });

      if (!userWithRole || userWithRole.role.name !== 'student') {
        return res.status(403).json({ message: 'Only students can unenroll from courses' });
      }

      // Check if enrollment exists
      const enrollment = await prisma.enrollment.findUnique({
        where: {
          studentId_courseId: {
            studentId: user.userId,
            courseId: courseId
          }
        }
      });

      if (!enrollment) {
        return res.status(404).json({ message: 'Enrollment not found' });
      }

      // Delete enrollment and related lesson progress
      await prisma.lessonProgress.deleteMany({
        where: { enrollmentId: enrollment.id }
      });

      await prisma.enrollment.delete({
        where: {
          studentId_courseId: {
            studentId: user.userId,
            courseId: courseId
          }
        }
      });

      return res.json({ message: 'Successfully unenrolled from course' });
    }

    // Route not found
    return res.status(404).json({ message: 'Route not found' });

  } catch (error) {
    console.error('Courses API Error:', error);
    
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