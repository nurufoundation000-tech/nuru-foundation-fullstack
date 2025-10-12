const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const bcrypt = require('bcryptjs');

// Helper to check if database is ready
const checkDatabaseReady = async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch (error) {
    console.log('❌ Database not ready:', error.message);
    return false;
  }
};

// Helper to create test roles
const createTestRoles = async () => {
  const roles = ['student', 'tutor', 'moderator', 'admin'];
  
  for (const roleName of roles) {
    const existingRole = await prisma.role.findUnique({
      where: { name: roleName }
    });
    
    if (!existingRole) {
      await prisma.role.create({
        data: { name: roleName }
      });
      console.log(`✅ Created role: ${roleName}`);
    }
  }
  
  return await prisma.role.findMany();
};

// Helper to create a test user
const createTestUser = async (userData) => {
  const passwordHash = await bcrypt.hash(userData.password, 12);
  
  const user = await prisma.user.create({
    data: {
      username: userData.username,
      email: userData.email,
      passwordHash,
      fullName: userData.fullName,
      roleId: userData.roleId
    },
    include: { role: true }
  });
  
  return user;
};

// Helper to create a test course
const createTestCourse = async (tutorId, courseData = {}) => {
  // Verify the tutor exists
  const tutor = await prisma.user.findUnique({
    where: { id: tutorId }
  });
  
  if (!tutor) {
    throw new Error(`Tutor with id ${tutorId} not found`);
  }

  const course = await prisma.course.create({
    data: {
      tutorId,
      title: courseData.title || 'Test Course',
      description: courseData.description || 'Test course description',
      category: courseData.category || 'Programming',
      level: courseData.level || 'Beginner',
      isPublished: courseData.isPublished !== undefined ? courseData.isPublished : true
    }
  });
  
  return course;
};

module.exports = {
  createTestRoles,
  createTestUser,
  createTestCourse,
  prisma,
  checkDatabaseReady
};