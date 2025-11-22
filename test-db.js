require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

console.log('🔍 Testing Prisma setup...');
console.log('📊 DATABASE_URL:', process.env.DATABASE_URL);

async function test() {
  const prisma = new PrismaClient();
  
  try {
    console.log('🔗 Connecting to database...');
    await prisma.$connect();
    console.log('✅ Database connected successfully!');
    
    // Test a simple query
    const result = await prisma.$queryRaw`SELECT version()`;
    console.log('✅ Database version:', result[0].version);
    
  } catch (error) {
    console.error('❌ Database error:', error.message);
  } finally {
    await prisma.$disconnect();
    console.log('🔌 Connection closed');
  }
}

test();