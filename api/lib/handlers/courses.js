const { prisma } = require('../db');
const { validateCourseTitle } = require('../validation');

module.exports = {
  async list({ query }, res, user) {
    try {
      const { category, level, tutorId, publishedOnly = 'true' } = query;
      
      const where = {
        ...(publishedOnly === 'true' && { isPublished: true }),
        ...(category && { category }),
        ...(level && { level }),
        ...(tutorId && { tutorId: parseInt(tutorId) })
      };

      const courses = await prisma.course.findMany({
        where,
        include: {
          tutor: {
            select: { id: true, username: true, fullName: true, profilePicUrl: true }
          },
          courseTags: {
            include: {
              tag: true
            }
          },
          _count: {
            select: {
              enrollments: true,
              lessons: true,
              courseReviews: true
            }
          },
          courseReviews: {
            take: 5,
            include: {
              reviewer: {
                select: { username: true, fullName: true, profilePicUrl: true }
              }
            }
          }
        },
        orderBy: { createdAt: 'desc' }
      });

      res.json({
        success: true,
        courses,
        total: courses.length
      });

    } catch (error) {
      console.error('List courses error:', error);
      res.status(500).json({ error: 'Failed to fetch courses' });
    }
  },

  async getById({ path }, res, user) {
    try {
      const courseId = parseInt(path.split('/').pop());
      
      const course = await prisma.course.findUnique({
        where: { id: courseId },
        include: {
          tutor: {
            select: { id: true, username: true, fullName: true, bio: true, profilePicUrl: true }
          },
          lessons: {
            orderBy: { orderIndex: 'asc' },
            include: {
              assignments: {
                select: { id: true, title: true, maxScore: true }
              },
              _count: {
                select: { assignments: true }
              }
            }
          },
          courseTags: {
            include: {
              tag: true
            }
          },
          courseReviews: {
            include: {
              reviewer: {
                select: { username: true, fullName: true, profilePicUrl: true }
              }
            },
            orderBy: { createdAt: 'desc' }
          },
          _count: {
            select: {
              enrollments: true,
              lessons: true
            }
          }
        }
      });

      if (!course) {
        return res.status(404).json({ error: 'Course not found' });
      }

      // Check if user is enrolled (for students)
      let userEnrollment = null;
      if (user.role?.name === 'student') {
        userEnrollment = await prisma.enrollment.findUnique({
          where: {
            studentId_courseId: {
              studentId: user.id,
              courseId: course.id
            }
          },
          include: {
            lessonProgress: {
              include: {
                lesson: {
                  select: { id: true, title: true }
                }
              }
            }
          }
        });
      }

      res.json({
        success: true,
        course: {
          ...course,
          userEnrollment
        }
      });

    } catch (error) {
      console.error('Get course error:', error);
      res.status(500).json({ error: 'Failed to fetch course' });
    }
  },

  async create({ body }, res, user) {
    try {
      // Only tutors and admins can create courses
      if (!['tutor', 'admin'].includes(user.role?.name)) {
        return res.status(403).json({ error: 'Only tutors and admins can create courses' });
      }

      const { title, description, category, level, thumbnailUrl, tags } = body;

      if (!validateCourseTitle(title)) {
        return res.status(400).json({ error: 'Valid course title is required' });
      }

      const course = await prisma.course.create({
        data: {
          title: title.trim(),
          description,
          category,
          level,
          thumbnailUrl,
          tutorId: user.id,
          isPublished: false // Default to draft
        },
        include: {
          tutor: {
            select: { id: true, username: true, fullName: true }
          }
        }
      });

      // Add tags if provided
      if (tags && Array.isArray(tags)) {
        for (const tagName of tags) {
          let tag = await prisma.tag.findUnique({ where: { name: tagName } });
          if (!tag) {
            tag = await prisma.tag.create({ data: { name: tagName } });
          }
          await prisma.courseTag.create({
            data: {
              courseId: course.id,
              tagId: tag.id
            }
          });
        }
      }

      res.status(201).json({
        success: true,
        course,
        message: 'Course created successfully'
      });

    } catch (error) {
      console.error('Create course error:', error);
      res.status(500).json({ error: 'Failed to create course' });
    }
  },

  async enroll({ path }, res, user) {
    try {
      const courseId = parseInt(path.split('/').pop());

      // Check if course exists and is published
      const course = await prisma.course.findUnique({
        where: { id: courseId, isPublished: true }
      });

      if (!course) {
        return res.status(404).json({ error: 'Course not found or not published' });
      }

      // Check if already enrolled
      const existingEnrollment = await prisma.enrollment.findUnique({
        where: {
          studentId_courseId: {
            studentId: user.id,
            courseId: course.id
          }
        }
      });

      if (existingEnrollment) {
        return res.status(409).json({ error: 'Already enrolled in this course' });
      }

      // Create enrollment
      const enrollment = await prisma.enrollment.create({
        data: {
          studentId: user.id,
          courseId: course.id,
          progress: 0.0
        },
        include: {
          course: {
            include: {
              tutor: {
                select: { id: true, username: true, fullName: true }
              },
              lessons: {
                orderBy: { orderIndex: 'asc' },
                select: { id: true, title: true }
              }
            }
          }
        }
      });

      // Create initial lesson progress records
      const lessons = await prisma.lesson.findMany({
        where: { courseId: course.id },
        select: { id: true }
      });

      const lessonProgressData = lessons.map(lesson => ({
        enrollmentId: enrollment.id,
        lessonId: lesson.id,
        isCompleted: false
      }));

      await prisma.lessonProgress.createMany({
        data: lessonProgressData
      });

      res.status(201).json({
        success: true,
        enrollment,
        message: 'Successfully enrolled in course'
      });

    } catch (error) {
      console.error('Enroll error:', error);
      res.status(500).json({ error: 'Failed to enroll in course' });
    }
  }
};