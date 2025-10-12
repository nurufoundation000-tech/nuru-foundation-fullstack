const request = require('supertest');
const app = require('../app');
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs'); // Add this import
const jwt = require('jsonwebtoken');

const prisma = new PrismaClient();

describe('Lessons and Assignments API', () => {
  let tutorToken, studentToken;
  let tutorUser, studentUser;
  let testCourse, testLesson;

  beforeEach(async () => {
    // Setup roles and users (similar to previous example)
    const tutorRole = await prisma.role.findUnique({ where: { name: 'tutor' } }) ||
      await prisma.role.create({ data: { name: 'tutor' } });
    const studentRole = await prisma.role.findUnique({ where: { name: 'student' } }) ||
      await prisma.role.create({ data: { name: 'student' } });

    const tutorPasswordHash = await bcrypt.hash('tutor123', 12);
    const studentPasswordHash = await bcrypt.hash('student123', 12);

    tutorUser = await prisma.user.create({
      data: {
        username: 'lessontutor',
        email: 'lessontutor@test.com',
        passwordHash: tutorPasswordHash,
        roleId: tutorRole.id
      }
    });

    studentUser = await prisma.user.create({
      data: {
        username: 'lessonstudent',
        email: 'lessonstudent@test.com',
        passwordHash: studentPasswordHash,
        roleId: studentRole.id
      }
    });

    tutorToken = jwt.sign(
      { userId: tutorUser.id, roleId: tutorRole.id },
      process.env.JWT_SECRET
    );

    studentToken = jwt.sign(
      { userId: studentUser.id, roleId: studentRole.id },
      process.env.JWT_SECRET
    );

    // Create course and lesson
    testCourse = await prisma.course.create({
      data: {
        tutorId: tutorUser.id,
        title: 'Test Course for Lessons',
        description: 'Course for testing lessons',
        isPublished: true
      }
    });

    testLesson = await prisma.lesson.create({
      data: {
        courseId: testCourse.id,
        title: 'Introduction Lesson',
        content: 'This is the lesson content',
        orderIndex: 1
      }
    });
  });

  describe('POST /api/lessons', () => {
    it('should allow tutors to create lessons for their courses', async () => {
      const lessonData = {
        title: 'New Lesson',
        content: 'Lesson content here',
        orderIndex: 2,
        courseId: testCourse.id
      };

      const response = await request(app)
        .post('/api/lessons')
        .set('Authorization', `Bearer ${tutorToken}`)
        .send(lessonData)
        .expect(201);

      expect(response.body.title).toBe(lessonData.title);
      expect(response.body.courseId).toBe(testCourse.id);
    });

    it('should not allow creating lessons for other tutors courses', async () => {
      // Create another tutor and course
      const otherTutor = await prisma.user.create({
        data: {
          username: 'othertutor',
          email: 'othertutor@test.com',
          passwordHash: await bcrypt.hash('password', 12),
          roleId: (await prisma.role.findFirst({ where: { name: 'tutor' } })).id
        }
      });

      const otherCourse = await prisma.course.create({
        data: {
          tutorId: otherTutor.id,
          title: 'Other Tutor Course',
          isPublished: true
        }
      });

      const lessonData = {
        title: 'Unauthorized Lesson',
        content: 'Should fail',
        courseId: otherCourse.id
      };

      const response = await request(app)
        .post('/api/lessons')
        .set('Authorization', `Bearer ${tutorToken}`)
        .send(lessonData)
        .expect(403);

      expect(response.body.message).toBe('Not authorized to create lessons for this course');
    });
  });

  describe('POST /api/assignments/:id/submit', () => {
    let testAssignment;

    beforeEach(async () => {
      testAssignment = await prisma.assignment.create({
        data: {
          lessonId: testLesson.id,
          title: 'Test Assignment',
          description: 'Submit your code here',
          maxScore: 100
        }
      });
    });

    it('should allow students to submit assignments', async () => {
      const submissionData = {
        codeSubmission: 'console.log("Hello World");'
      };

      const response = await request(app)
        .post(`/api/assignments/${testAssignment.id}/submit`)
        .set('Authorization', `Bearer ${studentToken}`)
        .send(submissionData)
        .expect(201);

      expect(response.body.submission).toHaveProperty('id');
      expect(response.body.submission.codeSubmission).toBe(submissionData.codeSubmission);

      // Verify submission in database
      const dbSubmission = await prisma.submission.findFirst({
        where: {
          assignmentId: testAssignment.id,
          studentId: studentUser.id
        }
      });
      expect(dbSubmission).not.toBeNull();
    });
  });
});