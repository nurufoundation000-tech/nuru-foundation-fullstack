const { prisma } = require('../db');
const bcrypt = require('bcryptjs');
const { validateEmail, validatePassword, validateName } = require('../validation');

module.exports = {
  async login({ body }, res) {
    try {
      const { email, password } = body;

      if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required' });
      }

      if (!validateEmail(email)) {
        return res.status(400).json({ error: 'Invalid email format' });
      }

      // Find user with role information
      const user = await prisma.user.findUnique({
        where: { email: email.toLowerCase() },
        include: {
          role: true
        }
      });

      if (!user) {
        return res.status(401).json({ error: 'Invalid email or password' });
      }

      if (!user.isActive) {
        return res.status(401).json({ error: 'Account is deactivated' });
      }

      // Verify password
      const validPassword = await bcrypt.compare(password, user.passwordHash);
      if (!validPassword) {
        return res.status(401).json({ error: 'Invalid email or password' });
      }

      // Generate token
      const token = `nuru_${Date.now()}_${user.id}`;

      // Remove sensitive data from response
      const { passwordHash, ...userWithoutPassword } = user;

      res.json({
        success: true,
        user: userWithoutPassword,
        token,
        message: 'Login successful'
      });

    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({ error: 'Login failed. Please try again.' });
    }
  },

  async register({ body }, res) {
    try {
      const { email, password, username, fullName, roleId } = body;

      // Validation
      if (!email || !password || !username || !fullName) {
        return res.status(400).json({ 
          error: 'Email, password, username, and full name are required' 
        });
      }

      if (!validateEmail(email)) {
        return res.status(400).json({ error: 'Invalid email format' });
      }

      if (!validatePassword(password)) {
        return res.status(400).json({ error: 'Password must be at least 6 characters' });
      }

      if (!validateName(fullName)) {
        return res.status(400).json({ error: 'Full name must be at least 2 characters' });
      }

      if (username.length < 3) {
        return res.status(400).json({ error: 'Username must be at least 3 characters' });
      }

      // Check if user exists
      const existingUser = await prisma.user.findFirst({
        where: {
          OR: [
            { email: email.toLowerCase() },
            { username: username }
          ]
        }
      });

      if (existingUser) {
        if (existingUser.email === email.toLowerCase()) {
          return res.status(409).json({ error: 'User already exists with this email' });
        } else {
          return res.status(409).json({ error: 'Username is already taken' });
        }
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(password, 12);

      // Create user
      const user = await prisma.user.create({
        data: {
          email: email.toLowerCase(),
          passwordHash: hashedPassword,
          username: username,
          fullName: fullName.trim(),
          roleId: roleId || null, // Default to student role if not specified
          isActive: true
        },
        include: {
          role: true
        }
      });

      // Generate token
      const token = `nuru_${Date.now()}_${user.id}`;
      const { passwordHash: _, ...userWithoutPassword } = user;

      res.status(201).json({
        success: true,
        user: userWithoutPassword,
        token,
        message: 'Registration successful'
      });

    } catch (error) {
      console.error('Registration error:', error);
      res.status(500).json({ error: 'Registration failed. Please try again.' });
    }
  }
};