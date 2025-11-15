const serverless = require('serverless-http');
const path = require('path');

console.log('🚀 Initializing serverless deployment...');
console.log('📊 NODE_ENV:', process.env.NODE_ENV);
console.log('📁 Current directory:', __dirname);
console.log('📁 Files in API directory:');

// Try multiple paths to find the app
let app;

try {
  // Try relative path first
  app = require('./app.js');
  console.log('✅ Loaded app from ./app.js');
} catch (error) {
  console.error('❌ Failed to load from ./app.js:', error.message);
  
  try {
    // Try absolute path
    app = require(path.join(__dirname, 'app.js'));
    console.log('✅ Loaded app from absolute path');
  } catch (error2) {
    console.error('❌ Failed to load from absolute path:', error2.message);
    
    // Final fallback
    try {
      app = require('./app');
      console.log('✅ Loaded app from ./app');
    } catch (error3) {
      console.error('❌ All attempts failed:', error3.message);
      throw new Error('Could not load Express app');
    }
  }
}

// Add timeout handling for Vercel
const serverlessApp = serverless(app, {
  timeout: 20 * 1000, // 20 seconds
  binary: ['image/*', 'font/*', 'application/pdf'],
  request: function(request, event, context) {
    // Log incoming requests for debugging
    console.log('📨 Incoming request:', request.method, request.url);
    return request;
  }
});

console.log('✅ Serverless app configured successfully');

// Export the serverless-wrapped app for Vercel
module.exports = serverlessApp;