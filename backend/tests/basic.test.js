const request = require('supertest');
const app = require('../app');

describe('Basic Server Tests', () => {
  it('should return health check', async () => {
    const response = await request(app)
      .get('/api/health')
      .expect(200);
    
    expect(response.body.message).toBe('Server is running!');
  });

  it('should return 404 for unknown routes', async () => {
    const response = await request(app)
      .get('/api/unknown-route')
      .expect(404);
    
    expect(response.body.message).toBe('Route not found');
  });
});