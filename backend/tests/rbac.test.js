const request = require('supertest');
const app = require('../app');
const prisma = require('../config/database');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { createTestRoles } = require('./helpers');

describe('Role-Based Access Control', () => {
  let studentToken, tutorToken, moderatorToken, adminToken;
  let studentUser, tutorUser, moderatorUser, adminUser;

  beforeEach(async () => {
    // Create all roles
    await createTestRoles();

    // Create users for each role
    const createUser = async (username, email, roleName) => {
      const role = await prisma.role.findUnique({ where: { name: roleName } });
      const passwordHash = await bcrypt.hash('password123', 12);

      const user = await prisma.user.create({
        data: {
          username,
          email,
          passwordHash,
          roleId: role.id
        }
      });

      const token = jwt.sign(
        { userId: user.id, roleId: role.id },
        process.env.JWT_SECRET || 'fallback-secret'
      );

      return { user, token };
    };

    const student = await createUser('rbacstudent', 'rbacstudent@test.com', 'student');
    const tutor = await createUser('rbactutor', 'rbactutor@test.com', 'tutor');
    const moderator = await createUser('rbacmoderator', 'rbacmoderator@test.com', 'moderator');
    const admin = await createUser('rbacadmin', 'rbacadmin@test.com', 'admin');

    studentUser = student.user;
    studentToken = student.token;
    tutorUser = tutor.user;
    tutorToken = tutor.token;
    moderatorUser = moderator.user;
    moderatorToken = moderator.token;
    adminUser = admin.user;
    adminToken = admin.token;
  });

  describe('Moderation endpoints', () => {
    it('should allow moderators and admins to access moderation logs', async () => {
      // Test moderator access
      await request(app)
        .get('/api/moderation/logs')
        .set('Authorization', `Bearer ${moderatorToken}`)
        .expect(200);

      // Test admin access
      await request(app)
        .get('/api/moderation/logs')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      // Test student access (should be denied)
      await request(app)
        .get('/api/moderation/logs')
        .set('Authorization', `Bearer ${studentToken}`)
        .expect(403);
    });
  });

  describe('Admin endpoints', () => {
    it('should only allow admins to perform admin actions', async () => {
      const adminAction = {
        actionType: 'SYSTEM_MAINTENANCE',
        description: 'Performing system updates'
      };

      // Admin should succeed
      await request(app)
        .post('/api/admin/actions')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(adminAction)
        .expect(201);

      // Moderator should be denied
      await request(app)
        .post('/api/admin/actions')
        .set('Authorization', `Bearer ${moderatorToken}`)
        .send(adminAction)
        .expect(403);
    });
  });
});