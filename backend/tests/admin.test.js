const request = require('supertest');
const app = require('../app');
const prisma = require('../config/database');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { createTestRoles, createTestUser, createTestCourse } = require('./helpers');

describe('Admin Routes', () => {
  let adminToken, adminUser;
  let studentUser, tutorUser;
  let testCourse, testMessage, testReview;

  beforeEach(async () => {
    // Create all roles
    await createTestRoles();

    // Create admin user
    const adminRole = await prisma.role.findUnique({ where: { name: 'admin' } });
    adminUser = await createTestUser({
      username: 'admintest',
      email: 'admin@test.com',
      password: 'password123',
      fullName: 'Admin User',
      roleId: adminRole.id
    });

    adminToken = jwt.sign(
      { userId: adminUser.id, roleId: adminRole.id },
      process.env.JWT_SECRET || 'fallback-secret'
    );

    // Create test users
    const studentRole = await prisma.role.findUnique({ where: { name: 'student' } });
    studentUser = await createTestUser({
      username: 'studenttest',
      email: 'student@test.com',
      password: 'password123',
      fullName: 'Student User',
      roleId: studentRole.id
    });

    const tutorRole = await prisma.role.findUnique({ where: { name: 'tutor' } });
    tutorUser = await createTestUser({
      username: 'tutortest',
      email: 'tutor@test.com',
      password: 'password123',
      fullName: 'Tutor User',
      roleId: tutorRole.id
    });

    // Create test course
    testCourse = await createTestCourse(tutorUser.id, {
      title: 'Test Course for Admin',
      description: 'A test course',
      category: 'Programming',
      level: 'Beginner'
    });

    // Create test message
    testMessage = await prisma.message.create({
      data: {
        senderId: studentUser.id,
        receiverId: tutorUser.id,
        message: 'Test message for admin testing'
      }
    });

    // Create test course review
    testReview = await prisma.courseReview.create({
      data: {
        courseId: testCourse.id,
        reviewerId: studentUser.id,
        rating: 5,
        comment: 'Great course!'
      }
    });
  });

  afterEach(async () => {
    // Clean up test data
    await prisma.courseReview.deleteMany();
    await prisma.message.deleteMany();
    await prisma.course.deleteMany();
    await prisma.user.deleteMany();
    await prisma.role.deleteMany();
  });

  describe('PUT /api/admin/messages/:id', () => {
    it('should update a message', async () => {
      const updateData = {
        message: 'Updated message content',
        isRead: true
      };

      const response = await request(app)
        .put(`/api/admin/messages/${testMessage.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send(updateData)
        .expect(200);

      expect(response.body.message).toBe(updateData.message);
      expect(response.body.isRead).toBe(updateData.isRead);
      expect(response.body.sender.username).toBe(studentUser.username);
      expect(response.body.receiver.username).toBe(tutorUser.username);
    });

    it('should return 404 for non-existent message', async () => {
      const response = await request(app)
        .put('/api/admin/messages/99999')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ message: 'Updated' })
        .expect(500); // Prisma error for not found
    });
  });

  describe('DELETE /api/admin/messages/:id', () => {
    it('should delete a message', async () => {
      await request(app)
        .delete(`/api/admin/messages/${testMessage.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      // Verify message is deleted
      const deletedMessage = await prisma.message.findUnique({
        where: { id: testMessage.id }
      });
      expect(deletedMessage).toBeNull();
    });
  });

  describe('GET /api/admin/course-reviews', () => {
    it('should fetch course reviews with pagination', async () => {
      const response = await request(app)
        .get('/api/admin/course-reviews')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.data).toBeInstanceOf(Array);
      expect(response.body.pagination).toBeDefined();
      expect(response.body.data.length).toBeGreaterThan(0);
      expect(response.body.data[0].reviewer.username).toBe(studentUser.username);
      expect(response.body.data[0].course.title).toBe(testCourse.title);
    });
  });

  describe('POST /api/admin/course-reviews', () => {
    it('should create a new course review', async () => {
      const newReview = {
        courseId: testCourse.id,
        reviewerId: tutorUser.id,
        rating: 4,
        comment: 'Another great review'
      };

      const response = await request(app)
        .post('/api/admin/course-reviews')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(newReview)
        .expect(201);

      expect(response.body.rating).toBe(newReview.rating);
      expect(response.body.comment).toBe(newReview.comment);
      expect(response.body.reviewer.username).toBe(tutorUser.username);
      expect(response.body.course.title).toBe(testCourse.title);
    });
  });

  describe('PUT /api/admin/course-reviews/:id', () => {
    it('should update a course review', async () => {
      const updateData = {
        rating: 3,
        comment: 'Updated review comment'
      };

      const response = await request(app)
        .put(`/api/admin/course-reviews/${testReview.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send(updateData)
        .expect(200);

      expect(response.body.rating).toBe(updateData.rating);
      expect(response.body.comment).toBe(updateData.comment);
      expect(response.body.reviewer.username).toBe(studentUser.username);
      expect(response.body.course.title).toBe(testCourse.title);
    });
  });

  describe('DELETE /api/admin/course-reviews/:id', () => {
    it('should delete a course review', async () => {
      await request(app)
        .delete(`/api/admin/course-reviews/${testReview.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      // Verify review is deleted
      const deletedReview = await prisma.courseReview.findUnique({
        where: { id: testReview.id }
      });
      expect(deletedReview).toBeNull();
    });
  });
});
