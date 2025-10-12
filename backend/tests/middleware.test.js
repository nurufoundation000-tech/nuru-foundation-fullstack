const jwt = require('jsonwebtoken');
const { authenticateToken } = require('../middleware/auth'); // Destructure the import

// Mock Prisma
jest.mock('../config/database', () => {
  return {
    user: {
      findUnique: jest.fn()
    }
  };
});

const prisma = require('../config/database');

describe('Authentication Middleware', () => {
  let mockReq;
  let mockRes;
  let nextFn;

  beforeEach(() => {
    mockReq = {
      headers: {}
    };
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    nextFn = jest.fn();
    
    // Reset mocks
    jest.clearAllMocks();
  });

  it('should call next() with valid token', async () => {
    const validToken = jwt.sign(
      { userId: 1, roleId: 1 },
      process.env.JWT_SECRET || 'test-secret'
    );

    mockReq.headers['authorization'] = `Bearer ${validToken}`;
    
    // Mock user found in database
    prisma.user.findUnique.mockResolvedValue({
      id: 1,
      roleId: 1,
      isActive: true,
      role: { name: 'student' }
    });

    await authenticateToken(mockReq, mockRes, nextFn);

    expect(nextFn).toHaveBeenCalled();
    expect(mockReq.user).toHaveProperty('userId');
    expect(mockReq.user).toHaveProperty('roleName');
  });

  it('should return 401 without token', async () => {
    await authenticateToken(mockReq, mockRes, nextFn);

    expect(mockRes.status).toHaveBeenCalledWith(401);
    expect(mockRes.json).toHaveBeenCalledWith({
      message: 'Access token required'
    });
    expect(nextFn).not.toHaveBeenCalled();
  });

  it('should return 403 with invalid token', async () => {
    mockReq.headers['authorization'] = 'Bearer invalidtoken';

    await authenticateToken(mockReq, mockRes, nextFn);

    expect(mockRes.status).toHaveBeenCalledWith(403);
    expect(mockRes.json).toHaveBeenCalledWith({
      message: 'Invalid or expired token'
    });
  });

  it('should return 403 if user not found', async () => {
    const validToken = jwt.sign(
      { userId: 999, roleId: 1 },
      process.env.JWT_SECRET || 'test-secret'
    );

    mockReq.headers['authorization'] = `Bearer ${validToken}`;
    
    // Mock user not found
    prisma.user.findUnique.mockResolvedValue(null);

    await authenticateToken(mockReq, mockRes, nextFn);

    expect(mockRes.status).toHaveBeenCalledWith(403);
    expect(mockRes.json).toHaveBeenCalledWith({
      message: 'User not found or inactive'
    });
  });
});