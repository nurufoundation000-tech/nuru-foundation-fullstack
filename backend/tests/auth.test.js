const request = require('supertest');
const app = require('../app');
const { createTestRoles, createTestUser, prisma } = require('./helpers');

describe('Authentication API (Main Database)', () => {
  let studentRole;

  beforeAll(async () => {
    // Create necessary roles and store them
    const roles = await createTestRoles();
    studentRole = roles.find(role => role.name === 'student');
    
    if (!studentRole) {
      throw new Error('Student role not found after creation');
    }
  });

  describe('POST /api/auth/register', () => {
    it('should register a new student', async () => {
      const userData = {
        username: 'teststudent1',
        email: 'test1@example.com',
        password: 'test123',
        fullName: 'Test Student One',
        roleId: studentRole.id
      };

      const response = await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(201);

      expect(response.body.message).toBe('User created successfully');
      expect(response.body.user.email).toBe(userData.email);
      expect(response.body.user).not.toHaveProperty('passwordHash');
      expect(response.body.token).toBeDefined();
    });

    it('should not register user with duplicate email', async () => {
      const userData = {
        username: 'teststudent2',
        email: 'test2@example.com',
        password: 'test123',
        fullName: 'Test Student Two',
        roleId: studentRole.id
      };

      // Create first user
      await request(app)
        .post('/api/auth/register')
        .send(userData);

      // Try to create second user with same email
      const response = await request(app)
        .post('/api/auth/register')
        .send({ 
          ...userData, 
          username: 'differentusername' 
        })
        .expect(400);

      expect(response.body.message).toBe('User already exists');
    });

    it('should register without roleId (default to student)', async () => {
      const userData = {
        username: 'teststudent3',
        email: 'test3@example.com',
        password: 'test123',
        fullName: 'Test Student Three'
        // No roleId provided - should default to student
      };

      const response = await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(201);

      expect(response.body.message).toBe('User created successfully');
      expect(response.body.user.role.name).toBe('student');
    });
  });

  describe('POST /api/auth/login', () => {
    beforeEach(async () => {
      // Clean up and create fresh test user
      await prisma.user.deleteMany({
        where: {
          email: 'logintest@example.com'
        }
      });

      await createTestUser({
        username: 'logintest',
        email: 'logintest@example.com',
        password: 'test123',
        fullName: 'Login Test User',
        roleId: studentRole.id
      });
    });

    it('should login with valid credentials', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'logintest@example.com',
          password: 'test123'
        })
        .expect(200);

      expect(response.body.message).toBe('Login successful');
      expect(response.body.token).toBeDefined();
      expect(response.body.user.email).toBe('logintest@example.com');
    });

    it('should not login with invalid password', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'logintest@example.com',
          password: 'wrongpassword'
        })
        .expect(400);

      expect(response.body.message).toBe('Invalid credentials');
    });
  });
});