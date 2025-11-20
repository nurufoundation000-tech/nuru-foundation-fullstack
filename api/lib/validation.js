module.exports = {
  validateEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return email && emailRegex.test(email);
  },

  validatePassword(password) {
    return password && password.length >= 6;
  },

  validateName(name) {
    return name && name.trim().length >= 2;
  },

  validateCourseTitle(title) {
    return title && title.trim().length >= 3;
  },

  validateAssignmentTitle(title) {
    return title && title.trim().length >= 3;
  }
};