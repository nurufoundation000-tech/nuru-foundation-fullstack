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

    res.json(progressWithDetails);
  } catch (error) {
    console.error('Get progress error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Enroll student in course (tutors and admins)
router.post('/:id/enroll-student', authenticateToken, requireRole(['tutor', 'admin']), async (req, res) => {
  const { id } = req.params;
  const { studentId } = req.body;

  try {
    // Check if course exists
    const course = await prisma.course.findUnique({
      where: { id: parseInt(id) }
    });

    if (!course) {
      return res.status(404).json({ message: 'Course not found' });
    }

    // Check if user is admin or the course tutor
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      include: { role: true }
    });

    if (course.tutorId !== req.user.userId && user.role.name !== 'admin') {
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
          courseId: parseInt(id)
        }
      }
    });

    if (existingEnrollment) {
      return res.status(400).json({ message: 'Student already enrolled in this course' });
    }

    const enrollment = await prisma.enrollment.create({
      data: {
        studentId: parseInt(studentId),
        courseId: parseInt(id)
      }
    });

    res.status(201).json({ message: 'Student enrolled successfully', enrollment });
  } catch (error) {
    console.error('Enroll student error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get enrolled students for a course (tutors and admins)
router.get('/:id/enrollments', authenticateToken, requireRole(['tutor', 'admin']), async (req, res) => {
  const { id } = req.params;

  try {
    // Check if course exists
    const course = await prisma.course.findUnique({
      where: { id: parseInt(id) }
    });

    if (!course) {
      return res.status(404).json({ message: 'Course not found' });
    }

    // Check if user is admin or the course tutor
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      include: { role: true }
    });

    if (course.tutorId !== req.user.userId && user.role.name !== 'admin') {
      return res.status(403).json({ message: 'Not authorized to view enrollments for this course' });
    }

    const enrollments = await prisma.enrollment.findMany({
      where: { courseId: parseInt(id) },
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

    res.json(enrollments);
  } catch (error) {
    console.error('Get enrollments error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Remove student from course (tutors and admins)
router.delete('/:id/enroll-student/:studentId', authenticateToken, requireRole(['tutor', 'admin']), async (req, res) => {
  const { id, studentId } = req.params;

  try {
    // Check if course exists
    const course = await prisma.course.findUnique({
      where: { id: parseInt(id) }
    });

    if (!course) {
      return res.status(404).json({ message: 'Course not found' });
    }

    // Check if user is admin or the course tutor
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      include: { role: true }
    });

    if (course.tutorId !== req.user.userId && user.role.name !== 'admin') {
      return res.status(403).json({ message: 'Not authorized to remove students from this course' });
    }

    const enrollment = await prisma.enrollment.findUnique({
      where: {
        studentId_courseId: {
          studentId: parseInt(studentId),
          courseId: parseInt(id)
        }
      }
    });

    if (!enrollment) {
      return res.status(404).json({ message: 'Enrollment not found' });
    }

    await prisma.enrollment.delete({
      where: {
        studentId_courseId: {
          studentId: parseInt(studentId),
          courseId: parseInt(id)
        }
      }
    });

    res.json({ message: 'Student removed from course successfully' });
  } catch (error) {
    console.error('Remove student error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Create course note (tutors and admins)
router.post('/:id/notes', authenticateToken, requireRole(['tutor', 'admin']), async (req, res) => {
  const { id } = req.params;
  const { title, content } = req.body;

  try {
    // Check if course exists
    const course = await prisma.course.findUnique({
      where: { id: parseInt(id) }
    });

    if (!course) {
      return res.status(404).json({ message: 'Course not found' });
    }

    // Check if user is admin or the course tutor
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      include: { role: true }
    });

    if (course.tutorId !== req.user.userId && user.role.name !== 'admin') {
      return res.status(403).json({ message: 'Not authorized to add notes to this course' });
    }

    const note = await prisma.courseNote.create({
      data: {
        courseId: parseInt(id),
        tutorId: req.user.userId,
        title,
        content
      },
      include: {
        tutor: {
          select: { username: true, fullName: true }
        }
      }
    });

    res.status(201).json(note);
  } catch (error) {
    console.error('Create note error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get course notes (students enrolled, tutors)
router.get('/:id/notes', authenticateToken, async (req, res) => {
  const { id } = req.params;

  try {
    const course = await prisma.course.findUnique({
      where: { id: parseInt(id) },
      include: { enrollments: true }
    });

    if (!course) {
      return res.status(404).json({ message: 'Course not found' });
    }

    const isTutor = course.tutorId === req.user.userId;
    const isEnrolled = course.enrollments.some(e => e.studentId === req.user.userId);

    if (!isTutor && !isEnrolled) {
      return res.status(403).json({ message: 'Not authorized to view notes for this course' });
    }

    const notes = await prisma.courseNote.findMany({
      where: { courseId: parseInt(id) },
      include: {
        tutor: {
          select: { username: true, fullName: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json(notes);
  } catch (error) {
    console.error('Get notes error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update course note (tutors and admins)
router.put('/:id/notes/:noteId', authenticateToken, requireRole(['tutor', 'admin']), async (req, res) => {
  const { id, noteId } = req.params;
  const { title, content } = req.body;

  try {
    // Check if course exists
    const course = await prisma.course.findUnique({
      where: { id: parseInt(id) }
    });

    if (!course) {
      return res.status(404).json({ message: 'Course not found' });
    }

    // Check if user is admin or the course tutor
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      include: { role: true }
    });

    if (course.tutorId !== req.user.userId && user.role.name !== 'admin') {
      return res.status(403).json({ message: 'Not authorized to update notes for this course' });
    }

    const note = await prisma.courseNote.findUnique({
      where: { id: parseInt(noteId) }
    });

    if (!note || note.courseId !== parseInt(id)) {
      return res.status(404).json({ message: 'Note not found' });
    }

    const updatedNote = await prisma.courseNote.update({
      where: { id: parseInt(noteId) },
      data: { title, content },
      include: {
        tutor: {
          select: { username: true, fullName: true }
        }
      }
    });

    res.json(updatedNote);
  } catch (error) {
    console.error('Update note error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Delete course note (tutors and admins)
router.delete('/:id/notes/:noteId', authenticateToken, requireRole(['tutor', 'admin']), async (req, res) => {
  const { id, noteId } = req.params;

  try {
    // Check if course exists
    const course = await prisma.course.findUnique({
      where: { id: parseInt(id) }
    });

    if (!course) {
      return res.status(404).json({ message: 'Course not found' });
    }

    // Check if user is admin or the course tutor
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      include: { role: true }
    });

    if (course.tutorId !== req.user.userId && user.role.name !== 'admin') {
      return res.status(403).json({ message: 'Not authorized to delete notes for this course' });
    }

    const note = await prisma.courseNote.findUnique({
      where: { id: parseInt(noteId) }
    });

    if (!note || note.courseId !== parseInt(id)) {
      return res.status(404).json({ message: 'Note not found' });
    }

    await prisma.courseNote.delete({
      where: { id: parseInt(noteId) }
    });

    res.json({ message: 'Note deleted successfully' });
  } catch (error) {
    console.error('Delete note error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Unenroll from a course (students only)
router.delete('/:id/unenroll', authenticateToken, async (req, res) => {
  const { id } = req.params;

  try {
    // Check if user has student role
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      include: { role: true }
    });

    if (!user || user.role.name !== 'student') {
      return res.status(403).json({ message: 'Only students can unenroll from courses' });
    }

    // Check if enrollment exists
    const enrollment = await prisma.enrollment.findUnique({
      where: {
        studentId_courseId: {
          studentId: req.user.userId,
          courseId: parseInt(id)
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
          studentId: req.user.userId,
          courseId: parseInt(id)
        }
      }
    });

    res.json({ message: 'Successfully unenrolled from course' });
  } catch (error) {
    console.error('Unenroll error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
