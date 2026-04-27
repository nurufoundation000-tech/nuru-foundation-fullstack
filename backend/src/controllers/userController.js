// controllers/userController.js - User Controller (CommonJS)
const bcrypt = require('bcryptjs');
const db = require('../config/database.js');

async function getCurrentUser(req, res) {
  try {
    const user = await db.getOne('SELECT * FROM users WHERE id = ?', [req.user.userId]);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    let role = null;
    if (user.role_id) {
      role = await db.getOne('SELECT name FROM roles WHERE id = ?', [user.role_id]);
    }

    const { password_hash, ...userWithoutPassword } = user;
    res.json({ success: true, user: { ...userWithoutPassword, role: role?.name } });

  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Failed to get user data' });
  }
}

async function updateProfile(req, res) {
  try {
    const { fullName, username, email } = req.body;

    const existingUser = await db.getOne('SELECT * FROM users WHERE id = ?', [req.user.userId]);

    if (!existingUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (email && email !== existingUser.email) {
      const emailExists = await db.getOne('SELECT id FROM users WHERE email = ? AND id != ?', [email.toLowerCase(), req.user.userId]);
      if (emailExists) {
        return res.status(409).json({ error: 'Email already exists' });
      }
    }

    if (username && username !== existingUser.username) {
      const usernameExists = await db.getOne('SELECT id FROM users WHERE username = ? AND id != ?', [username, req.user.userId]);
      if (usernameExists) {
        return res.status(409).json({ error: 'Username already exists' });
      }
    }

    const updateData = {};
    if (fullName) updateData.full_name = fullName;
    if (username) updateData.username = username;
    if (email) updateData.email = email.toLowerCase();
    updateData.updated_at = new Date();

    await db.update('users', req.user.userId, updateData);

    const user = await db.getOne('SELECT * FROM users WHERE id = ?', [req.user.userId]);
    const { password_hash, ...userWithoutPassword } = user;
    res.json({ success: true, user: userWithoutPassword });

  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
}

async function changePassword(req, res) {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current password and new password are required' });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters long' });
    }

    const user = await db.getOne('SELECT password_hash FROM users WHERE id = ?', [req.user.userId]);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const validPassword = await bcrypt.compare(currentPassword, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 12);
    await db.update('users', req.user.userId, { password_hash: hashedPassword });

    res.json({ success: true, message: 'Password changed successfully' });

  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ error: 'Failed to change password' });
  }
}

async function setPassword(req, res) {
  try {
    const { newPassword } = req.body;

    if (!newPassword) {
      return res.status(400).json({ error: 'New password is required' });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters long' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 12);
    await db.update('users', req.user.userId, {
      password_hash: hashedPassword,
      must_change_password: false
    });

    res.json({ success: true, message: 'Password set successfully' });

  } catch (error) {
    console.error('Set password error:', error);
    res.status(500).json({ error: 'Failed to set password' });
  }
}

async function skipPasswordChange(req, res) {
  try {
    await db.update('users', req.user.userId, { must_change_password: false });
    res.json({ success: true, message: 'Password change skipped' });
  } catch (error) {
    console.error('Skip password error:', error);
    res.status(500).json({ error: 'Failed to skip password change' });
  }
}

module.exports = {
  getCurrentUser,
  updateProfile,
  changePassword,
  setPassword,
  skipPasswordChange
};