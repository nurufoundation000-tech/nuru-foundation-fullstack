const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../lib/prisma');
const { URL } = require('url');

// Helper function to parse JSON body
const parseJsonBody = (req) => {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(new Error('Invalid JSON body'));
      }
    });
  });
};

// Set CORS headers
const setCorsHeaders = (res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
};

// Main serverless function
module.exports = async (req, res) => {
  setCorsHeaders(res);
  
  // Handle preflight OPTIONS request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const body = await parseJsonBody(req);
    const method = req.method;

    // Parse the URL properly to handle Vercel routing
    const baseUrl = `http://${req.headers.host || 'localhost'}`;
    const parsedUrl = new URL(req.url, baseUrl);
    const pathname = parsedUrl.pathname;

    // DEBUG: Log the request details
    console.log('🔍 Auth Request Debug:', {
      originalUrl: req.url,
      pathname: pathname,
      method: method,
      timestamp: new Date().toISOString()
    });

    // Extract the last path segment to determine the action
    const pathSegments = pathname.split('/').filter(segment => segment);
    const action = pathSegments[pathSegments.length - 1] || '';

    console.log('🔍 Path analysis:', {
      segments: pathSegments,
      action: action
    });

    // ROOT ENDPOINT - GET /api/auth or /backend/api/auth
    if ((pathname === '/' || pathname.endsWith('/auth')) && method === 'GET') {
      return res.json({ 
        message: 'Auth API is working',
        availableEndpoints: ['POST /register', 'POST /login'],
        timestamp: new Date().toISOString()
      });
    }

    // REGISTER ENDPOINT - POST /api/auth/register or /backend/api/auth/register
    if (action === 'register' && method === 'POST') {
      console.log('🔍 Handling REGISTER request');
      
      const { username, email, password, fullName, roleId } = body;

      // Check if user already exists
      const existingUser = await prisma.user.findFirst({
        where: {
          OR: [
            { email: email },
            { username: username }
          ]
        }
      });

      if (existingUser) {
        return res.status(400).json({ message: 'User already exists' });
      }

      // Hash password
      const saltRounds = 12;
      const passwordHash = await bcrypt.hash(password, saltRounds);

      // If no roleId provided, default to student role
      let finalRoleId = roleId;
      if (!finalRoleId) {
        const studentRole = await prisma.role.findFirst({
          where: { name: 'student' }
        });
        if (!studentRole) {
          return res.status(500).json({ message: 'Student role not found in database' });
        }
        finalRoleId = studentRole.id;
      }

      // Verify the role exists
      const roleExists = await prisma.role.findUnique({
        where: { id: finalRoleId }
      });

      if (!roleExists) {
        return res.status(400).json({ message: 'Invalid role ID' });
      }

      // Create user with roleId
      const newUser = await prisma.user.create({
        data: {
          username,
          email,
          passwordHash,
          fullName,
          roleId: finalRoleId
        },
        include: {
          role: true
        }
      });

      // Create JWT token
      const token = jwt.sign(
        { userId: newUser.id, roleId: newUser.roleId },
        process.env.JWT_SECRET || 'fallback-secret',
        { expiresIn: '7d' }
      );

      // Remove password from response
      const { passwordHash: _, ...userWithoutPassword } = newUser;

      console.log('✅ User registered successfully:', newUser.email);
      
      return res.status(201).json({
        message: 'User created successfully',
        token,
        user: userWithoutPassword
      });
    }

    // LOGIN ENDPOINT - POST /api/auth/login or /backend/api/auth/login
    if (action === 'login' && method === 'POST') {
      console.log('🔍 Handling LOGIN request');
      
      const { email, password } = body;

      // Find user with role included
      const user = await prisma.user.findUnique({
        where: { email },
        include: { role: true }
      });

      if (!user) {
        console.log('❌ Login failed: User not found for email:', email);
        return res.status(400).json({ message: 'Invalid credentials' });
      }

      // Check password
      const validPassword = await bcrypt.compare(password, user.passwordHash);
      if (!validPassword) {
        console.log('❌ Login failed: Invalid password for email:', email);
        return res.status(400).json({ message: 'Invalid credentials' });
      }

      // Create token
      const token = jwt.sign(
        { userId: user.id, roleId: user.roleId },
        process.env.JWT_SECRET || 'fallback-secret',
        { expiresIn: '7d' }
      );

      // Remove password from response
      const { passwordHash, ...userWithoutPassword } = user;

      console.log('✅ User logged in successfully:', user.email);
      console.log('User role:', user.role); // Debug log to see role structure
      
      return res.json({
        message: 'Login successful',
        token,
        user: userWithoutPassword
      });
    }

    console.log('❌ Route not found for pathname:', pathname, 'method:', method);
    
    // Route not found
    return res.status(404).json({ 
      message: 'Auth endpoint not found',
      requestedPath: pathname,
      method: method,
      availableEndpoints: ['GET /', 'POST /register', 'POST /login']
    });

  } catch (error) {
    console.error('❌ Auth API Error:', error);
    
    // Handle specific errors
    if (error.message.includes('Invalid JSON')) {
      return res.status(400).json({ message: error.message });
    }
    
    // Generic server error
    return res.status(500).json({ 
      message: 'Server error',
      error: process.env.NODE_ENV === 'production' ? undefined : error.message
    });
  }
};