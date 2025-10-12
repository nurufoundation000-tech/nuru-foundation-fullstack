// Load environment variables first
require('dotenv').config();

const { PrismaClient } = require('@prisma/client');
const { createTestRoles } = require('./helpers');
const prisma = new PrismaClient();

beforeAll(async () => {
  console.log('🔗 Connecting to database for testing...');
  
  // Check if DATABASE_URL is set
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set. Please check your .env file');
  }
  
  await prisma.$connect();
  console.log('✅ Connected to database');

  // Create test roles
  await createTestRoles();
});

beforeEach(async () => {
  try {
    console.log('🧹 Cleaning test data...');
    
    // Clean database in correct order - only tables that exist
    const tables = [
      'courseReview', 'userBadge', 'courseTag', 'forumComment',
      'forumPost', 'submission', 'assignment', 'lesson',
      'enrollment', 'payment', 'message', 'notification',
      'moderationLog', 'adminAction', 'oauthAccount',
      'course', 'badge', 'tag', 'user'
    ];

    for (const table of tables) {
      try {
        await prisma[table].deleteMany();
      } catch (error) {
        // Table might not exist or have dependencies, continue
      }
    }
    
    console.log('✅ Database cleaned successfully');
  } catch (error) {
    console.log('⚠️ Cleanup warning:', error.message);
  }
});

afterAll(async () => {
  await prisma.$disconnect();
  console.log('🔌 Disconnected from database');
});

module.exports = prisma;