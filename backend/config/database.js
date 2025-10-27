const { PrismaClient } = require('@prisma/client');

console.log('🗄️ Initializing Prisma client...');
console.log('📊 NODE_ENV:', process.env.NODE_ENV);
console.log('🌐 VERCEL env:', !!process.env.VERCEL);
console.log('🔗 DATABASE_URL present:', !!process.env.DATABASE_URL);

// Create Prisma client with serverless-compatible configuration
const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'test' ? [] : ['query'],
  // Serverless-specific configuration
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
});

console.log('✅ Prisma client created');

// Add connection timeout for serverless environments
if (process.env.VERCEL) {
  console.log('⚡ Configuring for Vercel serverless environment...');
  // Set a shorter connection timeout to avoid Vercel timeouts
  prisma.$on('beforeExit', async () => {
    console.log('🔌 Disconnecting Prisma client...');
    await prisma.$disconnect();
  });
}

// Only attempt connection in non-serverless environments (development/local)
// In serverless (Vercel), connections are managed automatically
if (process.env.NODE_ENV !== 'test' && !process.env.VERCEL) {
  console.log('🔌 Attempting database connection (non-serverless environment)...');
  prisma.$connect()
    .then(() => {
      console.log('✅ Connected to database');
    })
    .catch((error) => {
      console.error('❌ Database connection error:', error);
    });
} else {
  console.log('⏭️ Skipping manual database connection (serverless/test environment)');
}

module.exports = prisma;
