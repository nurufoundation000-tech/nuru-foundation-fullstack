const { prisma } = require('../db');

module.exports = {
  async getCurrentUser({}, res, user) {
    try {
      // Get fresh user data with role
      const userData = await prisma.user.findUnique({
        where: { id: user.id },
        include: {
          role: true,
          enrollments: {
            include: {
              course: {
                include: {
                  tutor: {
                    select: { id: true, username: true, fullName: true }
                  }
                }
              }
            }
          },
          courses: {
            include: {
              enrollments: {
                include: {
                  student: {
                    select: { id: true, username: true, fullName: true }
                  }
                }
              }
            }
          }
        }
      });

      if (!userData) {
        return res.status(404).json({ error: 'User not found' });
      }

      const { passwordHash, ...userWithoutPassword } = userData;

      res.json({
        success: true,
        user: userWithoutPassword
      });

    } catch (error) {
      console.error('Get current user error:', error);
      res.status(500).json({ error: 'Failed to get user data' });
    }
  },

  async updateProfile({ body }, res, user) {
    try {
      const { fullName, bio, profilePicUrl } = body;
      
      if (fullName && fullName.trim().length < 2) {
        return res.status(400).json({ error: 'Full name must be at least 2 characters' });
      }

      const updatedUser = await prisma.user.update({
        where: { id: user.id },
        data: { 
          fullName: fullName ? fullName.trim() : undefined,
          bio: bio !== undefined ? bio : undefined,
          profilePicUrl: profilePicUrl !== undefined ? profilePicUrl : undefined
        },
        include: {
          role: true
        }
      });

      const { passwordHash, ...userWithoutPassword } = updatedUser;

      res.json({
        success: true,
        user: userWithoutPassword,
        message: 'Profile updated successfully'
      });

    } catch (error) {
      console.error('Update profile error:', error);
      res.status(500).json({ error: 'Failed to update profile' });
    }
  },

  async getUserEnrollments({ query }, res, user) {
    try {
      const enrollments = await prisma.enrollment.findMany({
        where: { studentId: user.id },
        include: {
          course: {
            include: {
              tutor: {
                select: { id: true, username: true, fullName: true, profilePicUrl: true }
              },
              lessons: {
                select: { id: true, title: true, orderIndex: true }
              },
              _count: {
                select: { enrollments: true }
              }
            }
          },
          lessonProgress: {
            include: {
              lesson: {
                select: { id: true, title: true }
              }
            }
          }
        },
        orderBy: { enrolledAt: 'desc' }
      });

      res.json({
        success: true,
        enrollments
      });

    } catch (error) {
      console.error('Get enrollments error:', error);
      res.status(500).json({ error: 'Failed to get enrollments' });
    }
  }
};