const express = require('express');
const router = express.Router();
const { authenticateToken, requireRole } = require('../middleware/auth');
const prisma = require('../config/database');

// Get all published courses
router.get('/', async (req, res) => {
  try {
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

    res.json(courses);
  } catch (error) {
    console.error('Error fetching courses:', error);
    res.status(500).json({ message: 'Failed to fetch courses' });
  }
});

// Create a new course (tutors only)
router.post('/', authenticateToken, async (req, res) => {
  try {
    // Check if user has tutor or admin role
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      include: { role: true }
    });

    if (!user || (user.role.name !== 'tutor' && user.role.name !== 'admin')) {
      return res.status(403).json({ message: 'Only tutors or admins can create courses' });
    }

    const { title, description, category, level, thumbnailUrl } = req.body;

    const course = await prisma.course.create({
      data: {
        title,
        description,
        category,
        level,
        thumbnailUrl,
        tutorId: req.user.userId
      }
    });

    res.status(201).json(course);
  } catch (error) {
    console.error('Error creating course:', error);
    res.status(500).json({ message: 'Failed to create course' });
  }
});

// Enroll in a course
router.post('/:id/enroll', authenticateToken, async (req, res) => {
  try {
    // Check if user has student role
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      include: { role: true }
    });

    if (!user || user.role.name !== 'student') {
      return res.status(403).json({ message: 'Only students can enroll in courses' });
    }

    const courseId = parseInt(req.params.id);

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
          studentId: req.user.userId,
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
        studentId: req.user.userId,
        courseId: courseId
      }
    });

    res.status(201).json({
      message: 'Successfully enrolled in course',
      enrollment
    });
  } catch (error) {
    console.error('Error enrolling in course:', error);
    res.status(500).json({ message: 'Failed to enroll in course' });
  }
});

// Update enrollment progress
router.put('/:id/progress', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { progress } = req.body;

  try {
    const enrollment = await prisma.enrollment.findUnique({
      where: { id: parseInt(id) }
    });

    if (!enrollment) {
      return res.status(404).json({ message: 'Enrollment not found' });
    }

    if (enrollment.studentId !== req.user.userId) {
      return res.status(403).json({ message: 'Not authorized to update this enrollment progress' });
    }

    const updatedEnrollment = await prisma.enrollment.update({
      where: { id: parseInt(id) },
      data: { progress: parseFloat(progress) }
    });

    res.json(updatedEnrollment);
  } catch (error) {
    console.error('Update progress error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get user progress across all enrolled courses
router.get('/progress', authenticateToken, async (req, res) => {
  try {
    const enrollments = await prisma.enrollment.findMany({
      where: { studentId: req.user.userId },
      include: {
        course: {
          select: {
            id: true,
            title: true,
            description: true,
            thumbnailUrl: true,
            tutor: { select: { username: true, fullName: true } }
          },
          include: {
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

    res.json(progressWithDetails);
  } catch (error) {
    console.error('Get progress error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
