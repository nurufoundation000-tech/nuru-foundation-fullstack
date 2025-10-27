const serverless = require('serverless-http');
const app = require('../app');

console.log('🚀 Initializing serverless deployment...');
console.log('📊 NODE_ENV before setting:', process.env.NODE_ENV);

// Ensure we're in production mode for Vercel deployment
process.env.NODE_ENV = process.env.NODE_ENV || 'production';
console.log('📊 NODE_ENV after setting:', process.env.NODE_ENV);

// Add timeout handling for Vercel - reduce to 20 seconds to be safe
const serverlessApp = serverless(app, {
  // Set a reasonable timeout to avoid Vercel 300s limit
  timeout: 20 * 1000, // 20 seconds
});

console.log('🔧 Wrapping app with serverless-http...');
// Export the serverless-wrapped app for Vercel
module.exports = serverlessApp;
console.log('✅ Serverless app exported successfully');
