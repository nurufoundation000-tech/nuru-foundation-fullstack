const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

// Load environment variables FIRST, before any other imports
// Only load dotenv-flow in development/local environments, not in production
if (process.env.NODE_ENV !== 'production') {
  try {
    require('dotenv-flow').config();
    console.log('✅ Loaded local .env files');
  } catch (err) {
    console.warn('⚠️ dotenv-flow not loaded (production environment)');
  }
}

const app = express();

// If running behind a proxy/load balancer (Vercel, Heroku, etc.)
app.set('trust proxy', 1);

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

// Health check route
app.get('/api/health', (req, res) => {
  res.json({ message: 'Server is running!' });
});

// Import routes
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const courseRoutes = require('./routes/courses');
const lessonRoutes = require('./routes/lessons');
const assignmentRoutes = require('./routes/assignments');
const submissionRoutes = require('./routes/submissions');
const moderationRoutes = require('./routes/moderation');
const adminRoutes = require('./routes/admin');

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/courses', courseRoutes);
app.use('/api/lessons', lessonRoutes);
app.use('/api/assignments', assignmentRoutes);
app.use('/api/submissions', submissionRoutes);
app.use('/api/moderation', moderationRoutes);
app.use('/api/admin', adminRoutes);

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
