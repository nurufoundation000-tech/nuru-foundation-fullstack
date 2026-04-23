const config = {
  apiBaseUrl: window.location.hostname === 'localhost' 
    ? 'http://localhost:3000/api' 
    : '/api',
  
  appName: 'NURU Foundation',
  
  tokenKey: 'token',
  userKey: 'user',
  
  pagination: {
    defaultLimit: 20,
    maxLimit: 100
  },
  
  routes: {
    login: '/login.html',
    register: '/register.html',
    studentDashboard: '/student-dashboard/index.html',
    tutorDashboard: '/tutor-dashboard/index.html',
    adminDashboard: '/admin-dashboard/index.html'
  }
};

window.APP_CONFIG = config;
