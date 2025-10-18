const express = require('express');
const router = express.Router();
const { authenticateToken, requireRole } = require('../middleware/auth');
const prisma = require('../config/database');

// Get lessons for a course
router.get('/', authenticateToken, async (req, res) => {
  const { courseId } = req.query;

  try {
    // Check if user is enrolled in the course or is the tutor
    const course = await prisma.course.findUnique({
      where: { id: parseInt(courseId) },
      include: { enrollments: true }
    });

    if (!course) {
      return res.status(404).json({ message: 'Course not found' });
    }

    const isTutor = course.tutorId === req.user.userId;
    const isEnrolled = course.enrollments.some(e => e.studentId === req.user.userId);

    if (!isTutor && !isEnrolled) {
      return res.status(403).json({ message: 'Not authorized to view lessons for this course' });
    }

    const lessons = await prisma.lesson.findMany({
      where: { courseId: parseInt(courseId) },
      orderBy: { orderIndex: 'asc' },
      include: {
        assignments: {
          select: { id: true, title: true, maxScore: true }
        }
      }
    });

    // If user is a student, include progress information
    if (!isTutor && isEnrolled) {
      const enrollment = course.enrollments.find(e => e.studentId === req.user.userId);
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

      res.json(lessonsWithProgress);
    } else {
      res.json(lessons);
    }
  } catch (error) {
    console.error('Get lessons error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get single lesson
router.get('/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;

  try {
    const lesson = await prisma.lesson.findUnique({
      where: { id: parseInt(id) },
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

    const isTutor = lesson.course.tutorId === req.user.userId;
    const isEnrolled = lesson.course.enrollments.some(e => e.studentId === req.user.userId);

    if (!isTutor && !isEnrolled) {
      return res.status(403).json({ message: 'Not authorized to view this lesson' });
    }

    res.json(lesson);
  } catch (error) {
    console.error('Get lesson error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Create lesson
router.post('/', authenticateToken, requireRole(['tutor']), async (req, res) => {
  const { title, content, videoUrl, orderIndex, courseId } = req.body;

  try {
    // Check if course belongs to tutor
    const course = await prisma.course.findUnique({
      where: { id: parseInt(courseId) }
    });

    if (!course || course.tutorId !== req.user.userId) {
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

    res.status(201).json(lesson);
  } catch (error) {
    console.error('Create lesson error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update lesson
router.put('/:id', authenticateToken, requireRole(['tutor']), async (req, res) => {
  const { id } = req.params;
  const { title, content, videoUrl, orderIndex } = req.body;

  try {
    const lesson = await prisma.lesson.findUnique({
      where: { id: parseInt(id) },
      include: { course: true }
    });

    if (!lesson) {
      return res.status(404).json({ message: 'Lesson not found' });
    }

    if (lesson.course.tutorId !== req.user.userId) {
      return res.status(403).json({ message: 'Not authorized to update this lesson' });
    }

    const updatedLesson = await prisma.lesson.update({
      where: { id: parseInt(id) },
      data: {
        title,
        content,
        videoUrl,
        orderIndex
      }
    });

    res.json(updatedLesson);
  } catch (error) {
    console.error('Update lesson error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Delete lesson
router.delete('/:id', authenticateToken, requireRole(['tutor']), async (req, res) => {
  const { id } = req.params;

  try {
    const lesson = await prisma.lesson.findUnique({
      where: { id: parseInt(id) },
      include: { course: true }
    });

    if (!lesson) {
      return res.status(404).json({ message: 'Lesson not found' });
    }

    if (lesson.course.tutorId !== req.user.userId) {
      return res.status(403).json({ message: 'Not authorized to delete this lesson' });
    }

    await prisma.lesson.delete({
      where: { id: parseInt(id) }
    });

    res.json({ message: 'Lesson deleted successfully' });
  } catch (error) {
    console.error('Delete lesson error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Mark lesson as completed
router.post('/:id/complete', authenticateToken, async (req, res) => {
  const { id } = req.params;

  try {
    const lesson = await prisma.lesson.findUnique({
      where: { id: parseInt(id) },
      include: {
        course: {
          include: { enrollments: true }
        }
      }
    });

    if (!lesson) {
      return res.status(404).json({ message: 'Lesson not found' });
    }

    const enrollment = lesson.course.enrollments.find(e => e.studentId === req.user.userId);

    if (!enrollment) {
      return res.status(403).json({ message: 'Not enrolled in this course' });
    }

    // Upsert lesson progress
    const progress = await prisma.lessonProgress.upsert({
      where: {
        enrollmentId_lessonId: {
          enrollmentId: enrollment.id,
          lessonId: parseInt(id)
        }
      },
      update: {
        isCompleted: true,
        completedAt: new Date()
      },
      create: {
        enrollmentId: enrollment.id,
        lessonId: parseInt(id),
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

    res.json({
      message: 'Lesson marked as completed',
      progress,
      courseProgress: Math.round(courseProgress)
    });
  } catch (error) {
    console.error('Complete lesson error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
