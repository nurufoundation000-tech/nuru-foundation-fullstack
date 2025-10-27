const { PrismaClient } = require('@prisma/client');

// Create Prisma client with serverless-compatible configuration
const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'test' ? [] : ['query'],
  // Disable connection pooling in serverless environments to prevent connection leaks
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
});

// Only attempt connection in non-serverless environments (development/local)
// In serverless (Vercel), connections are managed automatically
if (process.env.NODE_ENV !== 'test' && !process.env.VERCEL) {
  prisma.$connect()
    .then(() => {
      console.log('✅ Connected to database');
    })
    .catch((error) => {
      console.error('❌ Database connection error:', error);
    });
}

module.exports = prisma;
