const jwt = require('jsonwebtoken');

module.exports = {
  async authenticate({ headers }) {
    try {
      const authHeader = headers.authorization;
      
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return { user: null, error: 'No token provided' };
      }

      const token = authHeader.slice(7);
      
      if (!process.env.JWT_SECRET) {
        console.error('JWT_SECRET environment variable is not set');
        return { user: null, error: 'Server configuration error' };
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      if (!decoded || !decoded.userId) {
        return { user: null, error: 'Invalid token payload' };
      }

      return {
        user: {
          id: decoded.userId,
          email: decoded.email,
          role: decoded.role,
          userId: decoded.userId
        },
        error: null
      };

    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        return { user: null, error: 'Token expired' };
      }
      if (error.name === 'JsonWebTokenError') {
        return { user: null, error: 'Invalid token' };
      }
      console.error('Auth middleware error:', error);
      return { user: null, error: 'Authentication failed' };
    }
  }
};
