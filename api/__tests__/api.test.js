require('dotenv-flow').config();
const request = require('supertest');

const app = require('../app');

describe('NURU Foundation API Tests', () => {
  
  describe('Health Check', () => {
    it('GET /health should return OK', async () => {
      const res = await request(app)
        .get('/health')
        .expect(200);
      
      expect(res.body.status).toBe('OK');
    });
  });

  describe('Authentication', () => {
    it('POST /auth/login with invalid credentials should return 401', async () => {
      const res = await request(app)
        .post('/auth/login')
        .send({ email: 'invalid@test.com', password: 'wrong' })
        .expect(401);
      
      expect(res.body.error).toBeDefined();
    });

    it('POST /auth/login with missing fields should return 400', async () => {
      const res = await request(app)
        .post('/auth/login')
        .send({})
        .expect(400);
      
      expect(res.body.error).toBe('Email and password are required');
    });

    it('POST /auth/register with weak password should return 400', async () => {
      const res = await request(app)
        .post('/auth/register')
        .send({
          email: 'test@example.com',
          password: 'weak',
          username: 'testuser',
          fullName: 'Test User'
        })
        .expect(400);
      
      expect(res.body.error).toContain('Password must be');
    });

    it('POST /auth/register with invalid email should return 400', async () => {
      const res = await request(app)
        .post('/auth/register')
        .send({
          email: 'notanemail',
          password: 'Password123',
          username: 'testuser',
          fullName: 'Test User'
        })
        .expect(400);
      
      expect(res.body.error).toBe('Invalid email format');
    });
  });

  describe('Protected Routes', () => {
    it('GET /student/courses without auth should return 401', async () => {
      const res = await request(app)
        .get('/student/courses/progress')
        .expect(401);
      
      expect(res.body.error).toBe('Authentication required');
    });

    it('GET /tutor/enrollments without auth should return 401', async () => {
      const res = await request(app)
        .get('/tutor/enrollments')
        .expect(401);
      
      expect(res.body.error).toBe('Authentication required');
    });
  });

  describe('404 Handling', () => {
    it('should return 404 for unknown routes', async () => {
      const res = await request(app)
        .get('/unknown')
        .expect(404);
      
      expect(res.body.message).toBe('Route not found');
    });
  });
});
