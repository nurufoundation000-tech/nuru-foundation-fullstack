const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'test' ? [] : ['query'],
});

// Only log connection in non-test environments
if (process.env.NODE_ENV !== 'test') {
  prisma.$connect()
    .then(() => {
      console.log('✅ Connected to database');
    })
    .catch((error) => {
      console.error('❌ Database connection error:', error);
    });
}

module.exports = prisma;