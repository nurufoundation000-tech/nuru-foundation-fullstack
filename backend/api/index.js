const serverless = require('serverless-http');
const app = require('../app');

// Only wrap with serverless when running on Vercel
if (process.env.VERCEL) {
  module.exports = serverless(app);
} else {
  // For local development, export the app directly
  module.exports = app;
}
