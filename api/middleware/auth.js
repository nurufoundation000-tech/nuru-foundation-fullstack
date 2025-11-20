const { prisma } = require('../lib/db');

module.exports = {
  async authenticate({ headers }) {
    try {
      const authHeader = headers.authorization;
      
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return { user: null, error: 'No token provided' };
      }

      const token = authHeader.slice(7);
      
      // Simple token validation - extract user ID from token
      // In production, use JWT verification
      const tokenParts = token.split('_');
      if (tokenParts.length !== 3 || tokenParts[0] !== 'nuru') {
        return { user: null, error: 'Invalid token format' };
      }

      const userId = tokenParts[2];
      if (!userId) {
        return { user: null, error: 'Invalid token' };
      }

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { 
          id: true, 
          email: true, 
          name: true, 
          role: true,
          createdAt: true,
          updatedAt: true
        }
      });

      if (!user) {
        return { user: null, error: 'User not found' };
      }

      return { user, error: null };

    } catch (error) {
      console.error('Auth middleware error:', error);
      return { user: null, error: 'Authentication failed' };
    }
  }
};