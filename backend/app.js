const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

// Load environment variables FIRST, before any other imports
// Only load dotenv-flow in development/local environments, not in production
console.log('🔍 Starting application initialization...');
console.log('📊 Current NODE_ENV:', process.env.NODE_ENV);
console.log('🌐 Running in Vercel environment:', !!process.env.VERCEL);

if (process.env.NODE_ENV !== 'production') {
  try {
    console.log('📁 Attempting to load dotenv-flow...');
    require('dotenv-flow').config();
    console.log('✅ Loaded local .env files successfully');
  } catch (err) {
    console.warn('⚠️ dotenv-flow not loaded (production environment):', err.message);
  }
} else {
  console.log('⏭️ Skipping dotenv-flow loading (production environment)');
}

const app = express();

// If running behind a proxy/load balancer (Vercel, Heroku, etc.)
app.set('trust proxy', 1);

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

// Health check route
app.get('/api/health', async (req, res) => {
  try {
    // Test database connectivity
    const prisma = require('./lib/prisma');
    await prisma.$queryRaw`SELECT 1`;

    res.json({
      message: 'Server is running!',
      database: 'connected',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Health check failed:', error);
    res.status(500).json({
      message: 'Server error',
      database: 'disconnected',
      timestamp: new Date().toISOString()
    });
  }
});

// Import routes with lazy loading to avoid initialization timeouts
console.log('📦 Importing routes...');
let authRoutes, userRoutes, courseRoutes, lessonRoutes, assignmentRoutes, submissionRoutes, moderationRoutes, adminRoutes;

try {
  authRoutes = require('./routes/auth');
  console.log('✅ Auth routes loaded');
} catch (error) {
  console.error('❌ Failed to load auth routes:', error.message);
}

try {
  userRoutes = require('./routes/users');
  console.log('✅ User routes loaded');
} catch (error) {
  console.error('❌ Failed to load user routes:', error.message);
}

try {
  courseRoutes = require('./routes/courses');
  console.log('✅ Course routes loaded');
} catch (error) {
  console.error('❌ Failed to load course routes:', error.message);
}

try {
  lessonRoutes = require('./routes/lessons');
  console.log('✅ Lesson routes loaded');
} catch (error) {
  console.error('❌ Failed to load lesson routes:', error.message);
}

try {
  assignmentRoutes = require('./routes/assignments');
  console.log('✅ Assignment routes loaded');
} catch (error) {
  console.error('❌ Failed to load assignment routes:', error.message);
}

try {
  submissionRoutes = require('./routes/submissions');
  console.log('✅ Submission routes loaded');
} catch (error) {
  console.error('❌ Failed to load submission routes:', error.message);
}

try {
  moderationRoutes = require('./routes/moderation');
  console.log('✅ Moderation routes loaded');
} catch (error) {
  console.error('❌ Failed to load moderation routes:', error.message);
}

try {
  adminRoutes = require('./routes/admin');
  console.log('✅ Admin routes loaded');
} catch (error) {
  console.error('❌ Failed to load admin routes:', error.message);
}

console.log('🔗 Setting up route handlers...');
if (authRoutes) app.use('/api/auth', authRoutes);
if (userRoutes) app.use('/api/users', userRoutes);
if (courseRoutes) app.use('/api/courses', courseRoutes);
if (lessonRoutes) app.use('/api/lessons', lessonRoutes);
if (assignmentRoutes) app.use('/api/assignments', assignmentRoutes);
if (submissionRoutes) app.use('/api/submissions', submissionRoutes);
if (moderationRoutes) app.use('/api/moderation', moderationRoutes);
if (adminRoutes) app.use('/api/admin', adminRoutes);
console.log('✅ Route handlers configured');

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Error:', error);
  res.status(500).json({ message: 'Something went wrong!' });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

// Export for serverless deployment
module.exports = app;

// Only start server if not in test environment and not in serverless environment
if (require.main === module && !process.env.VERCEL) {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
}
