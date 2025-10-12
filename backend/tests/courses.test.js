const request = require('supertest');
const app = require('../app');
const { createTestRoles, createTestUser, createTestCourse, prisma } = require('./helpers');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs'); // Add missing import

describe('Courses API (Main Database)', () => {
  let studentToken, tutorToken;
  let studentUser, tutorUser;
  let studentRole, tutorRole;

  beforeEach(async () => {
    // Create roles and users
    await createTestRoles();

    studentRole = await prisma.role.findUnique({ where: { name: 'student' } });
    tutorRole = await prisma.role.findUnique({ where: { name: 'tutor' } });

    if (!studentRole || !tutorRole) {
      throw new Error('Required roles not found');
    }

    // Create test users
    const studentPasswordHash = await bcrypt.hash('student123', 12);
    const tutorPasswordHash = await bcrypt.hash('tutor123', 12);

    studentUser = await prisma.user.create({
      data: {
        username: 'coursestudent',
        email: 'coursestudent@example.com',
        passwordHash: studentPasswordHash,
        fullName: 'Course Student',
        roleId: studentRole.id
      }
    });

    tutorUser = await prisma.user.create({
      data: {
        username: 'coursetutor',
        email: 'coursetutor@example.com',
        passwordHash: tutorPasswordHash,
        fullName: 'Course Tutor',
        roleId: tutorRole.id
      }
    });

    // Create tokens
    studentToken = jwt.sign(
      { userId: studentUser.id, roleId: studentRole.id },
      process.env.JWT_SECRET || 'fallback-secret'
    );

    tutorToken = jwt.sign(
      { userId: tutorUser.id, roleId: tutorRole.id },
      process.env.JWT_SECRET || 'fallback-secret'
    );
  });

  describe('GET /api/courses', () => {
    it('should get all published courses from main database', async () => {
      // Create a test course first
      await createTestCourse(tutorUser.id, {
        title: 'JavaScript Basics - Main DB',
        description: 'Learn JavaScript fundamentals in main database',
        isPublished: true
      });

      const response = await request(app)
        .get('/api/courses')
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      // Should find our test course
      const foundCourse = response.body.find(course => 
        course.title.includes('JavaScript Basics - Main DB')
      );
      expect(foundCourse).toBeDefined();
      expect(foundCourse.tutor).toHaveProperty('username');
    });
  });

  describe('POST /api/courses', () => {
    it('should allow tutors to create courses in main database', async () => {
      const courseData = {
        title: 'Advanced Node.js - Main DB',
        description: 'Deep dive into Node.js using main database',
        category: 'Backend',
        level: 'Advanced'
      };

      const response = await request(app)
        .post('/api/courses')
        .set('Authorization', `Bearer ${tutorToken}`)
        .send(courseData)
        .expect(201);

      expect(response.body.title).toBe(courseData.title);
      expect(response.body.tutorId).toBe(tutorUser.id);
    });
  });

  describe('POST /api/courses/:id/enroll', () => {
    it('should allow students to enroll in courses in main database', async () => {
      // First create a course
      const testCourse = await createTestCourse(tutorUser.id, {
        title: 'Course for Enrollment Test',
        isPublished: true
      });

      const response = await request(app)
        .post(`/api/courses/${testCourse.id}/enroll`)
        .set('Authorization', `Bearer ${studentToken}`)
        .expect(201);

      expect(response.body.message).toContain('enrolled');
    });
  });
});