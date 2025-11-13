const prisma = require('../../lib/prisma');
const { authenticateToken, requireTutor } = require('../../lib/auth');

const setCorsHeaders = (res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
};

module.exports = async (req, res) => {
  setCorsHeaders(res);
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const user = await requireTutor(req);
    const { method } = req;
    const { query } = req;
    const courseId = parseInt(query.id, 10);

    switch (method) {
      case 'GET':
        if (courseId) {
          // Get a single course
          const course = await prisma.course.findFirst({
            where: { id: courseId, tutorId: user.id },
            include: { _count: { select: { lessons: true, enrollments: true } } },
          });
          if (!course) return res.status(404).json({ message: 'Course not found or you do not have access' });
          return res.status(200).json(course);
        } else {
          // Get all courses for the tutor
          const page = parseInt(query.page, 10) || 1;
          const limit = parseInt(query.limit, 10) || 12;
          const skip = (page - 1) * limit;

          const courses = await prisma.course.findMany({
            where: { tutorId: user.id },
            include: { _count: { select: { lessons: true, enrollments: true } } },
            orderBy: { createdAt: 'desc' },
            take: limit,
            skip: skip,
          });

          const totalCourses = await prisma.course.count({ where: { tutorId: user.id } });

          return res.status(200).json({
            data: courses,
            pagination: {
              page,
              limit,
              total: totalCourses,
              pages: Math.ceil(totalCourses / limit),
            },
          });
        }

      case 'POST':
        // Create a new course
        const { title, description, category, level, thumbnailUrl, isPublished } = req.body;
        if (!title) return res.status(400).json({ message: 'Title is required' });

        const newCourse = await prisma.course.create({
          data: {
            title,
            description,
            category,
            level,
            thumbnailUrl,
            isPublished,
            tutorId: user.id,
          },
        });
        return res.status(201).json(newCourse);

      case 'PUT':
        // Update a course
        if (!courseId) return res.status(400).json({ message: 'Course ID is required' });
        const courseToUpdate = await prisma.course.findFirst({
          where: { id: courseId, tutorId: user.id },
        });
        if (!courseToUpdate) return res.status(404).json({ message: 'Course not found or you do not have access' });

        const updatedCourse = await prisma.course.update({
          where: { id: courseId },
          data: req.body,
        });
        return res.status(200).json(updatedCourse);

      case 'DELETE':
        // Delete a course
        if (!courseId) return res.status(400).json({ message: 'Course ID is required' });
        const courseToDelete = await prisma.course.findFirst({
          where: { id: courseId, tutorId: user.id },
        });
        if (!courseToDelete) return res.status(404).json({ message: 'Course not found or you do not have access' });

        await prisma.course.delete({ where: { id: courseId } });
        return res.status(204).end();

      default:
        res.setHeader('Allow', ['GET', 'POST', 'PUT', 'DELETE']);
        res.status(405).end(`Method ${method} Not Allowed`);
    }
  } catch (error) {
    console.error('Tutor Courses API Error:', error);
    if (error.message.includes('access required')) return res.status(403).json({ message: error.message });
    return res.status(500).json({ message: 'Internal Server Error' });
  }
};