module.exports = {
  validateEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return email && emailRegex.test(email);
  },

  validatePassword(password) {
    if (!password || password.length < 8) {
      return { valid: false, message: 'Password must be at least 8 characters' };
    }
    if (!/[A-Z]/.test(password)) {
      return { valid: false, message: 'Password must contain at least one uppercase letter' };
    }
    if (!/[a-z]/.test(password)) {
      return { valid: false, message: 'Password must contain at least one lowercase letter' };
    }
    if (!/[0-9]/.test(password)) {
      return { valid: false, message: 'Password must contain at least one number' };
    }
    return { valid: true };
  },

  validateName(name) {
    return name && name.trim().length >= 2 && name.trim().length <= 100;
  },

  validateCourseTitle(title) {
    return title && title.trim().length >= 3 && title.trim().length <= 200;
  },

  validateAssignmentTitle(title) {
    return title && title.trim().length >= 3 && title.trim().length <= 200;
  },

  sanitizeInput(str) {
    if (typeof str !== 'string') return str;
    return str.trim().slice(0, 10000);
  }
};