const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // Create roles
  const studentRole = await prisma.role.upsert({
    where: { name: 'student' },
    update: {},
    create: { name: 'student' }
  });

  const tutorRole = await prisma.role.upsert({
    where: { name: 'tutor' },
    update: {},
    create: { name: 'tutor' }
  });

  const adminRole = await prisma.role.upsert({
    where: { name: 'admin' },
    update: {},
    create: { name: 'admin' }
  });

  console.log('Roles created:', { studentRole, tutorRole, adminRole });

  // Hash password for test users
  const saltRounds = 12;
  const hashedPassword = await bcrypt.hash('password123', saltRounds);

  // Create test users
  const testTutor = await prisma.user.upsert({
    where: { email: 'tutor@nurufoundation.com' },
    update: {},
    create: {
      username: 'testtutor',
      email: 'tutor@nurufoundation.com',
      passwordHash: hashedPassword,
      fullName: 'Test Tutor',
      roleId: tutorRole.id
    }
  });

  const testStudent = await prisma.user.upsert({
    where: { email: 'student@nurufoundation.com' },
    update: {},
    create: {
      username: 'teststudent',
      email: 'student@nurufoundation.com',
      passwordHash: hashedPassword,
      fullName: 'Test Student',
      roleId: studentRole.id
    }
  });

  const testAdmin = await prisma.user.upsert({
    where: { email: 'admin@nurufoundation.com' },
    update: {},
    create: {
      username: 'testadmin',
      email: 'admin@nurufoundation.com',
      passwordHash: hashedPassword,
      fullName: 'Test Admin',
      roleId: adminRole.id
    }
  });

  console.log('Users created:', { testTutor, testStudent, testAdmin });

  // Create a test course
  const testCourse = await prisma.course.upsert({
    where: { id: 1 },
    update: {},
    create: {
      tutorId: testTutor.id,
      title: 'Introduction to Programming',
      description: 'Learn the basics of programming with hands-on exercises',
      category: 'Programming',
      level: 'Beginner',
      thumbnailUrl: 'https://images.unsplash.com/photo-1542831371-29b0f74f9713?w=400',
      isPublished: true
    }
  });

  console.log('Course created:', testCourse);

  // Create lessons for the course
  const lesson1 = await prisma.lesson.upsert({
    where: { id: 1 },
    update: {},
    create: {
      courseId: testCourse.id,
      title: 'What is Programming?',
      content: 'Programming is the process of creating instructions for computers to follow. It involves writing code in programming languages to solve problems and automate tasks.',
      videoUrl: 'https://www.youtube.com/watch?v=example1',
      orderIndex: 1
    }
  });

  const lesson2 = await prisma.lesson.upsert({
    where: { id: 2 },
    update: {},
    create: {
      courseId: testCourse.id,
      title: 'Variables and Data Types',
      content: 'Variables are containers for storing data values. Learn about different data types like strings, numbers, and booleans.',
      videoUrl: 'https://www.youtube.com/watch?v=example2',
      orderIndex: 2
    }
  });

  console.log('Lessons created:', { lesson1, lesson2 });

  // Create assignments
  const assignment1 = await prisma.assignment.upsert({
    where: { id: 1 },
    update: {},
    create: {
      lessonId: lesson1.id,
      title: 'Hello World Program',
      description: 'Write your first program that prints "Hello, World!" to the console.',
      maxScore: 100
    }
  });

  const assignment2 = await prisma.assignment.upsert({
    where: { id: 2 },
    update: {},
    create: {
      lessonId: lesson2.id,
      title: 'Variable Practice',
      description: 'Create variables of different types and perform basic operations with them.',
      maxScore: 100
    }
  });

  console.log('Assignments created:', { assignment1, assignment2 });

  // Enroll student in course
  const enrollment = await prisma.enrollment.upsert({
    where: {
      studentId_courseId: {
        studentId: testStudent.id,
        courseId: testCourse.id
      }
    },
    update: {},
    create: {
      studentId: testStudent.id,
      courseId: testCourse.id,
      progress: 0.0
    }
  });

  console.log('Enrollment created:', enrollment);

  // Create course notes
  const courseNote1 = await prisma.courseNote.upsert({
    where: { id: 1 },
    update: {},
    create: {
      courseId: testCourse.id,
      tutorId: testTutor.id,
      title: 'Programming Fundamentals Notes',
      content: 'Key concepts: Variables store data, functions perform actions, loops repeat tasks. Remember to declare variables before use and handle errors gracefully.'
    }
  });

  const courseNote2 = await prisma.courseNote.upsert({
    where: { id: 2 },
    update: {},
    create: {
      courseId: testCourse.id,
      tutorId: testTutor.id,
      title: 'Data Types Reference',
      content: 'Common data types: String (text), Number (integers/floats), Boolean (true/false), Array (list of items), Object (key-value pairs).'
    }
  });

  console.log('Course notes created:', { courseNote1, courseNote2 });

  // Create OAuth accounts
  const oauthAccount1 = await prisma.oauthAccount.create({
    data: {
      userId: testStudent.id,
      provider: 'google',
      providerAccountId: 'google_123456789',
      accessToken: 'ya29.a0AfH6SMC...',
      refreshToken: '1//0g...',
      expiresAt: Math.floor((Date.now() + 3600000) / 1000), // 1 hour from now in seconds
      scope: 'openid email profile',
      tokenType: 'Bearer'
    }
  });

  const oauthAccount2 = await prisma.oauthAccount.create({
    data: {
      userId: testTutor.id,
      provider: 'github',
      providerAccountId: 'github_987654321',
      accessToken: 'gho_...',
      refreshToken: 'ghr_...',
      expiresAt: Math.floor((Date.now() + 7200000) / 1000), // 2 hours from now in seconds
      scope: 'user:email',
      tokenType: 'Bearer'
    }
  });

  console.log('OAuth accounts created:', { oauthAccount1, oauthAccount2 });

  console.log('Database seeded successfully!');
}

main()
  .catch((e) => {
    console.error('Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
