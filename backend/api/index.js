const serverless = require('serverless-http');
const app = require('../app');

// Set NODE_ENV for production if not set
process.env.NODE_ENV = process.env.NODE_ENV || 'production';

module.exports = serverless(app);
