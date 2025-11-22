// routes/student.js
const express = require('express');
const { PrismaClient } = require('@prisma/client');
const router = express.Router();
const prisma = new PrismaClient();

// Student middleware
const requireStudent = async (req, res, next) => {
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

    // Check if user is student
    const userRole = user.role?.name;
    if (userRole !== 'student') {
      return res.status(403).json({ error: 'Student access required' });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error('Student auth error:', error);
    res.status(500).json({ error: 'Authentication failed' });
  }
};

// Get student's enrolled courses with progress
router.get('/courses/progress', requireStudent, async (req, res) => {
  try {
    const studentId = req.user.id;

    console.log(`📚 Loading courses with progress for student ${studentId}`);

    // Get student's enrollments with course details
    const enrollments = await prisma.enrollment.findMany({
      where: { studentId },
      include: {
        course: {
          include: {
            tutor: {
              select: {
                id: true,
                username: true,
                fullName: true,
                email: true
              }
            },
            lessons: {
              include: {
                assignments: true
              },
              orderBy: { orderIndex: 'asc' }
            },
            _count: {
              select: {
                lessons: true
              }
            }
          }
        }
      },
      orderBy: { enrolledAt: 'desc' }
    });

    // Calculate progress for each course
    const coursesWithProgress = await Promise.all(
      enrollments.map(async (enrollment) => {
        const course = enrollment.course;
        const totalLessons = course._count.lessons;
        
        // Get completed lessons count (submissions with grades)
        const completedLessons = await prisma.submission.count({
          where: {
            studentId,
            assignment: {
              lesson: {
                courseId: course.id
              }
            },
            grade: { not: null }
          }
        });

        // Progress calculation
        const progress = totalLessons > 0 ? Math.min(100, Math.round((completedLessons / totalLessons) * 100)) : 0;

        return {
          id: enrollment.id, // enrollment ID for unenrollment
          enrolledAt: enrollment.enrolledAt,
          progress: progress,
          completedLessons: completedLessons,
          totalLessons: totalLessons,
          course: {
            id: course.id,
            title: course.title,
            description: course.description,
            category: course.category,
            level: course.level,
            thumbnailUrl: course.thumbnailUrl,
            tutor: course.tutor,
            createdAt: course.createdAt
          }
        };
      })
    );

    res.json({
      success: true,
      data: coursesWithProgress
    });

  } catch (error) {
    console.error('Get student courses error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to load courses',
      details: error.message 
    });
  }
});

// Unenroll from course
router.delete('/courses/:enrollmentId/unenroll', requireStudent, async (req, res) => {
  try {
    const studentId = req.user.id;
    const enrollmentId = parseInt(req.params.enrollmentId);

    console.log(`🗑️ Student ${studentId} unenrolling from enrollment ${enrollmentId}`);

    // Verify enrollment belongs to student
    const enrollment = await prisma.enrollment.findFirst({
      where: {
        id: enrollmentId,
        studentId
      }
    });

    if (!enrollment) {
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
      message: 'Successfully unenrolled from course'
    });

  } catch (error) {
    console.error('Unenroll error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to unenroll from course',
      details: error.message 
    });
  }
});

// Get student dashboard stats
router.get('/dashboard/stats', requireStudent, async (req, res) => {
  try {
    const studentId = req.user.id;

    const [totalEnrollments, completedCourses, pendingSubmissions, totalAssignments] = await Promise.all([
      prisma.enrollment.count({ where: { studentId } }),
      prisma.enrollment.count({
        where: {
          studentId,
          course: {
            lessons: {
              every: {
                assignments: {
                  some: {
                    submissions: {
                      some: {
                        studentId,
                        grade: { not: null }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }),
      prisma.submission.count({
        where: {
          studentId,
          grade: null
        }
      }),
      prisma.assignment.count({
        where: {
          lesson: {
            course: {
              enrollments: {
                some: { studentId }
              }
            }
          }
        }
      })
    ]);

    res.json({
      success: true,
      data: {
        totalEnrollments,
        completedCourses,
        pendingSubmissions,
        totalAssignments
      }
    });

  } catch (error) {
    console.error('Student stats error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to load dashboard stats',
      details: error.message 
    });
  }
});

module.exports = router;