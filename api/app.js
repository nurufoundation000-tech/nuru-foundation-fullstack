const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const fs =require('fs');
const path = require('path');
const errorHandler = require('./middleware/errorHandler');

// Load environment variables
if (process.env.NODE_ENV !== 'production') {
  require('dotenv-flow').config();
}

const app = express();

app.set('trust proxy', 1);

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

// Dynamically load routes
const routesDir = path.join(__dirname, 'routes');
fs.readdirSync(routesDir).forEach(file => {
  if (file.endsWith('.js')) {
    const route = require(path.join(routesDir, file));
    const routeName = path.parse(file).name;
    app.use(`/${routeName}`, route);
    console.log(`✅ Loaded route /${routeName} from ${file}`);
  }
});

// Error handling middleware
app.use(errorHandler);

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

