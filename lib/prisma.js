const { PrismaClient } = require('@prisma/client');

console.log('🗄️ Creating shared Prisma client instance...');
console.log('📊 NODE_ENV:', process.env.NODE_ENV);
console.log('🌐 VERCEL env:', !!process.env.VERCEL);
console.log('🔗 DATABASE_URL present:', !!process.env.DATABASE_URL);

// Create a single shared Prisma client instance
const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'production' ? ['error'] : ['query', 'error', 'warn'],
  errorFormat: 'minimal',
  // Serverless-compatible configuration
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
});

console.log('✅ Shared Prisma client created');

module.exports = prisma;
