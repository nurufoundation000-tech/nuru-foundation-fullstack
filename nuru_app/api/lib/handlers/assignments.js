const { prisma } = require('../prisma');

module.exports = {
  async list({ query }, res, user) {
    try {
      const { lessonId, studentId } = query;
      
      const where = {
        ...(lessonId && { lessonId: parseInt(lessonId) })
      };

      const assignments = await prisma.assignment.findMany({
        where,
        include: {
          lesson: {
            select: { id: true, title: true, courseId: true }
          },
          _count: {
            select: { submissions: true }
          }
        },
        orderBy: { id: 'desc' }
      });

      res.json({
        success: true,
        assignments,
        total: assignments.length
      });

    } catch (error) {
      console.error('List assignments error:', error);
      res.status(500).json({ error: 'Failed to fetch assignments' });
    }
  },

  async getById({ path }, res, user) {
    try {
      const assignmentId = parseInt(path.split('/').pop());
      
      const assignment = await prisma.assignment.findUnique({
        where: { id: assignmentId },
        include: {
          lesson: {
            select: { id: true, title: true, courseId: true }
          }
        }
      });

      if (!assignment) {
        return res.status(404).json({ error: 'Assignment not found' });
      }

      res.json({
        success: true,
        assignment
      });

    } catch (error) {
      console.error('Get assignment error:', error);
      res.status(500).json({ error: 'Failed to fetch assignment' });
    }
  },

  async create({ body }, res, user) {
    try {
      if (!['tutor', 'admin'].includes(user.role?.name)) {
        return res.status(403).json({ error: 'Only tutors and admins can create assignments' });
      }

      const { lessonId, title, description, maxScore } = body;

      if (!lessonId) {
        return res.status(400).json({ error: 'Lesson ID is required' });
      }

      const assignment = await prisma.assignment.create({
        data: {
          lessonId: parseInt(lessonId),
          title: title?.trim(),
          description,
          maxScore: maxScore || 100
        }
      });

      res.status(201).json({
        success: true,
        assignment,
        message: 'Assignment created successfully'
      });

    } catch (error) {
      console.error('Create assignment error:', error);
      res.status(500).json({ error: 'Failed to create assignment' });
    }
  },

  async update({ path, body }, res, user) {
    try {
      const assignmentId = parseInt(path.split('/').pop());
      
      const existing = await prisma.assignment.findUnique({
        where: { id: assignmentId },
        include: {
          lesson: {
            include: {
              course: { select: { tutorId: true } }
            }
          }
        }
      });

      if (!existing) {
        return res.status(404).json({ error: 'Assignment not found' });
      }

      if (existing.lesson.course.tutorId !== user.id && user.role?.name !== 'admin') {
        return res.status(403).json({ error: 'Not authorized to update this assignment' });
      }

      const { title, description, maxScore } = body;

      const assignment = await prisma.assignment.update({
        where: { id: assignmentId },
        data: {
          ...(title !== undefined && { title: title.trim() }),
          ...(description !== undefined && { description }),
          ...(maxScore !== undefined && { maxScore })
        }
      });

      res.json({
        success: true,
        assignment,
        message: 'Assignment updated successfully'
      });

    } catch (error) {
      console.error('Update assignment error:', error);
      res.status(500).json({ error: 'Failed to update assignment' });
    }
  },

  async delete({ path }, res, user) {
    try {
      const assignmentId = parseInt(path.split('/').pop());
      
      const existing = await prisma.assignment.findUnique({
        where: { id: assignmentId },
        include: {
          lesson: {
            include: {
              course: { select: { tutorId: true } }
            }
          }
        }
      });

      if (!existing) {
        return res.status(404).json({ error: 'Assignment not found' });
      }

      if (existing.lesson.course.tutorId !== user.id && user.role?.name !== 'admin') {
        return res.status(403).json({ error: 'Not authorized to delete this assignment' });
      }

      await prisma.assignment.delete({
        where: { id: assignmentId }
      });

      res.json({
        success: true,
        message: 'Assignment deleted successfully'
      });

    } catch (error) {
      console.error('Delete assignment error:', error);
      res.status(500).json({ error: 'Failed to delete assignment' });
    }
  }
};
