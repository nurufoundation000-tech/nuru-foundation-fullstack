const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const router = express.Router();
const prisma = require('../lib/prisma');

router.post('/register', async (req, res) => {
  try {
    const { username, email, password, fullName, roleId } = req.body;

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
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Remove password from response
    const { passwordHash: _, ...userWithoutPassword } = newUser;

    res.status(201).json({
      message: 'User created successfully',
      token,
      user: userWithoutPassword
    });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ message: 'Server error during registration' });
  }
});


router.post('/login', async (req, res) => {
  console.log('🔥 AUTH ROUTE: Login attempt', { email: req.body.email, method: req.method, url: req.url });
  try {
    const { email, password } = req.body;

    // Find user with role included
    const user = await prisma.user.findUnique({
      where: { email },
      include: { role: true }
    });

    if (!user) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    // Check password
    const validPassword = await bcrypt.compare(password, user.passwordHash);
    if (!validPassword) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    // Create token
    const token = jwt.sign(
      { userId: user.id, roleId: user.roleId },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Remove password from response
    const { passwordHash, ...userWithoutPassword } = user;

    res.json({
      message: 'Login successful',
      token,
      user: userWithoutPassword
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error during login' });
  }
});

module.exports = router;