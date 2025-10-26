const request = require('supertest');
const app = require('../app');
const { createTestRoles, createTestUser, createTestCourse, prisma } = require('./helpers');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs'); // Add missing import

describe('Courses API (Main Database)', () => {
  let studentToken, tutorToken, adminToken;
  let studentUser, tutorUser, adminUser;
  let studentRole, tutorRole, adminRole;

  beforeEach(async () => {
    // Create roles and users
    await createTestRoles();

    studentRole = await prisma.role.findUnique({ where: { name: 'student' } });
    tutorRole = await prisma.role.findUnique({ where: { name: 'tutor' } });
    adminRole = await prisma.role.findUnique({ where: { name: 'admin' } });

    if (!studentRole || !tutorRole || !adminRole) {
      throw new Error('Required roles not found');
    }

    // Create test users
    const studentPasswordHash = await bcrypt.hash('student123', 12);
    const tutorPasswordHash = await bcrypt.hash('tutor123', 12);
    const adminPasswordHash = await bcrypt.hash('admin123', 12);

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

    adminUser = await prisma.user.create({
      data: {
        username: 'courseadmin',
        email: 'courseadmin@example.com',
        passwordHash: adminPasswordHash,
        fullName: 'Course Admin',
        roleId: adminRole.id
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

    adminToken = jwt.sign(
      { userId: adminUser.id, roleId: adminRole.id },
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

  describe('GET /api/courses/:id/enrollments', () => {
    it('should allow tutors to view enrollments', async () => {
      const testCourse = await createTestCourse(tutorUser.id);

      const response = await request(app)
        .get(`/api/courses/${testCourse.id}/enrollments`)
        .set('Authorization', `Bearer ${tutorToken}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });

    it('should allow admins to view enrollments', async () => {
      const testCourse = await createTestCourse(tutorUser.id);

      const response = await request(app)
        .get(`/api/courses/${testCourse.id}/enrollments`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });

    it('should deny students access to view enrollments', async () => {
      const testCourse = await createTestCourse(tutorUser.id);

      await request(app)
        .get(`/api/courses/${testCourse.id}/enrollments`)
        .set('Authorization', `Bearer ${studentToken}`)
        .expect(403);
    });
  });

  describe('DELETE /api/courses/:id/enroll-student/:studentId', () => {
    it('should allow tutors to remove students', async () => {
      const testCourse = await createTestCourse(tutorUser.id);
      await prisma.enrollment.create({
        data: { studentId: studentUser.id, courseId: testCourse.id }
      });

      const response = await request(app)
        .delete(`/api/courses/${testCourse.id}/enroll-student/${studentUser.id}`)
        .set('Authorization', `Bearer ${tutorToken}`)
        .expect(200);

      expect(response.body.message).toContain('removed');
    });

    it('should allow admins to remove students', async () => {
      const testCourse = await createTestCourse(tutorUser.id);
      await prisma.enrollment.create({
        data: { studentId: studentUser.id, courseId: testCourse.id }
      });

      const response = await request(app)
        .delete(`/api/courses/${testCourse.id}/enroll-student/${studentUser.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.message).toContain('removed');
    });

    it('should deny students access to remove students', async () => {
      const testCourse = await createTestCourse(tutorUser.id);
      await prisma.enrollment.create({
        data: { studentId: studentUser.id, courseId: testCourse.id }
      });

      await request(app)
        .delete(`/api/courses/${testCourse.id}/enroll-student/${studentUser.id}`)
        .set('Authorization', `Bearer ${studentToken}`)
        .expect(403);
    });
  });

  describe('POST /api/courses/:id/notes', () => {
    it('should allow tutors to create notes', async () => {
      const testCourse = await createTestCourse(tutorUser.id);

      const response = await request(app)
        .post(`/api/courses/${testCourse.id}/notes`)
        .set('Authorization', `Bearer ${tutorToken}`)
        .send({ title: 'Test Note', content: 'Test content' })
        .expect(201);

      expect(response.body.title).toBe('Test Note');
    });

    it('should allow admins to create notes', async () => {
      const testCourse = await createTestCourse(tutorUser.id);

      const response = await request(app)
        .post(`/api/courses/${testCourse.id}/notes`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: 'Admin Note', content: 'Admin content' })
        .expect(201);

      expect(response.body.title).toBe('Admin Note');
    });

    it('should deny students access to create notes', async () => {
      const testCourse = await createTestCourse(tutorUser.id);

      await request(app)
        .post(`/api/courses/${testCourse.id}/notes`)
        .set('Authorization', `Bearer ${studentToken}`)
        .send({ title: 'Student Note', content: 'Student content' })
        .expect(403);
    });
  });

  describe('PUT /api/courses/:id/notes/:noteId', () => {
    it('should allow tutors to update notes', async () => {
      const testCourse = await createTestCourse(tutorUser.id);
      const note = await prisma.courseNote.create({
        data: {
          courseId: testCourse.id,
          tutorId: tutorUser.id,
          title: 'Original Title',
          content: 'Original content'
        }
      });

      const response = await request(app)
        .put(`/api/courses/${testCourse.id}/notes/${note.id}`)
        .set('Authorization', `Bearer ${tutorToken}`)
        .send({ title: 'Updated Title', content: 'Updated content' })
        .expect(200);

      expect(response.body.title).toBe('Updated Title');
    });

    it('should allow admins to update notes', async () => {
      const testCourse = await createTestCourse(tutorUser.id);
      const note = await prisma.courseNote.create({
        data: {
          courseId: testCourse.id,
          tutorId: tutorUser.id,
          title: 'Original Title',
          content: 'Original content'
        }
      });

      const response = await request(app)
        .put(`/api/courses/${testCourse.id}/notes/${note.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: 'Admin Updated Title', content: 'Admin updated content' })
        .expect(200);

      expect(response.body.title).toBe('Admin Updated Title');
    });

    it('should deny students access to update notes', async () => {
      const testCourse = await createTestCourse(tutorUser.id);
      const note = await prisma.courseNote.create({
        data: {
          courseId: testCourse.id,
          tutorId: tutorUser.id,
          title: 'Original Title',
          content: 'Original content'
        }
      });

      await request(app)
        .put(`/api/courses/${testCourse.id}/notes/${note.id}`)
        .set('Authorization', `Bearer ${studentToken}`)
        .send({ title: 'Student Update', content: 'Student content' })
        .expect(403);
    });
  });

  describe('GET /api/courses/progress', () => {
    it('should return user progress across enrolled courses', async () => {
      // Create a published course
      const testCourse = await createTestCourse(tutorUser.id, {
        title: 'Progress Test Course',
        isPublished: true
      });

      // Enroll the student
      await prisma.enrollment.create({
        data: { studentId: studentUser.id, courseId: testCourse.id }
      });

      const response = await request(app)
        .get('/api/courses/progress')
        .set('Authorization', `Bearer ${studentToken}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThan(0);

      const progressItem = response.body[0];
      expect(progressItem).toHaveProperty('course');
      expect(progressItem.course).toHaveProperty('id', testCourse.id);
      expect(progressItem.course).toHaveProperty('title', 'Progress Test Course');
      expect(progressItem.course).toHaveProperty('tutor');
      expect(progressItem.course.tutor).toHaveProperty('username');
      expect(progressItem.course).toHaveProperty('_count');
      expect(progressItem.course._count).toHaveProperty('lessons');
      expect(progressItem).toHaveProperty('completedLessons');
      expect(progressItem).toHaveProperty('totalLessons');
    });
  });

  describe('DELETE /api/courses/:id/notes/:noteId', () => {
    it('should allow tutors to delete notes', async () => {
      const testCourse = await createTestCourse(tutorUser.id);
      const note = await prisma.courseNote.create({
        data: {
          courseId: testCourse.id,
          tutorId: tutorUser.id,
          title: 'Note to Delete',
          content: 'Content'
        }
      });

      const response = await request(app)
        .delete(`/api/courses/${testCourse.id}/notes/${note.id}`)
        .set('Authorization', `Bearer ${tutorToken}`)
        .expect(200);

      expect(response.body.message).toContain('deleted');
    });

    it('should allow admins to delete notes', async () => {
      const testCourse = await createTestCourse(tutorUser.id);
      const note = await prisma.courseNote.create({
        data: {
          courseId: testCourse.id,
          tutorId: tutorUser.id,
          title: 'Note to Delete',
          content: 'Content'
        }
      });

      const response = await request(app)
        .delete(`/api/courses/${testCourse.id}/notes/${note.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.message).toContain('deleted');
    });

    it('should deny students access to delete notes', async () => {
      const testCourse = await createTestCourse(tutorUser.id);
      const note = await prisma.courseNote.create({
        data: {
          courseId: testCourse.id,
          tutorId: tutorUser.id,
          title: 'Note to Delete',
          content: 'Content'
        }
      });

      await request(app)
        .delete(`/api/courses/${testCourse.id}/notes/${note.id}`)
        .set('Authorization', `Bearer ${studentToken}`)
        .expect(403);
    });
  });
});
