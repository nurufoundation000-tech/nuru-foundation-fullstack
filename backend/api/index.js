const serverless = require('serverless-http');
const app = require('../app');

// Ensure we're in production mode for Vercel deployment
process.env.NODE_ENV = process.env.NODE_ENV || 'production';

// Export the serverless-wrapped app for Vercel
module.exports = serverless(app);
