const API_BASE_URL = 'http://localhost:3000/api';;

class AuthService {
    constructor() {
        this.token = localStorage.getItem('token');
    }

    async login(email, password) {
        console.log('🔐 FRONTEND: Starting login attempt', { email, API_BASE_URL });
        
        try {
            console.log('🌐 FRONTEND: Making API request to:', `${API_BASE_URL}/auth/login`);
            
            const response = await fetch(`${API_BASE_URL}/auth/login`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ email, password }),
            });

            console.log('📡 FRONTEND: Response received', {
                status: response.status,
                statusText: response.statusText,
                url: response.url
            });

            // Check if response is JSON before parsing
            const contentType = response.headers.get('content-type');
            if (!contentType || !contentType.includes('application/json')) {
                const text = await response.text();
                console.error('❌ FRONTEND: Server returned non-JSON response:', text.substring(0, 200));
                
                if (response.status === 404) {
                    throw new Error('Authentication service not found (404). The backend API may not be deployed correctly.');
                } else if (response.status >= 500) {
                    throw new Error('Server error. Please try again later.');
                } else {
                    throw new Error(`Server returned unexpected response (${response.status}). Please contact support.`);
                }
            }

            // Parse JSON response
            const data = await response.json();
            console.log('✅ FRONTEND: Parsed response data:', data);

            if (response.ok) {
                // Successful login
                this.token = data.token;
                localStorage.setItem('token', this.token);
                localStorage.setItem('user', JSON.stringify(data.user));
                console.log('🎉 FRONTEND: Login successful');
                return { success: true, user: data.user };
            } else {
                // API returned error message
                console.warn('⚠️ FRONTEND: Login failed with message:', data.message);
                return { 
                    success: false, 
                    message: data.message || `Login failed (${response.status})` 
                };
            }

        } catch (error) {
            console.error('💥 FRONTEND: Login error:', error);
            
            // Provide user-friendly error messages
            let userMessage = error.message;
            
            if (error.name === 'TypeError' && error.message.includes('Failed to fetch')) {
                userMessage = 'Cannot connect to the server. Please check your internet connection and try again.';
            } else if (error.message.includes('404')) {
                userMessage = 'Authentication service is currently unavailable. Please try again later or contact support.';
            } else if (error.message.includes('CORS')) {
                userMessage = 'Network security error. Please ensure you are accessing the site from the correct domain.';
            }
            
            return { 
                success: false, 
                message: userMessage,
                originalError: error.message
            };
        }
    }

    async register(userData) {
        console.log('📝 FRONTEND: Starting registration');
        
        try {
            const response = await fetch(`${API_BASE_URL}/auth/register`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(userData),
            });

            console.log('📡 FRONTEND: Registration response status:', response.status);

            // Check content type before parsing
            const contentType = response.headers.get('content-type');
            if (!contentType || !contentType.includes('application/json')) {
                const text = await response.text();
                throw new Error(`Server returned non-JSON response. Status: ${response.status}`);
            }

            const data = await response.json();

            if (response.ok) {
                console.log('✅ FRONTEND: Registration successful');
                return { success: true, message: data.message };
            } else {
                console.warn('⚠️ FRONTEND: Registration failed:', data.message);
                return { success: false, message: data.message };
            }
        } catch (error) {
            console.error('💥 FRONTEND: Registration error:', error);
            return { 
                success: false, 
                message: error.message || 'Network error during registration' 
            };
        }
    }

    logout() {
        console.log('🚪 FRONTEND: Logging out user');
        this.token = null;
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        // Optional: Redirect to login page
        // window.location.href = '/login.html';
    }

    isLoggedIn() {
        const hasToken = !!this.token;
        console.log('🔍 FRONTEND: Login status check:', hasToken);
        return hasToken;
    }

    getUser() {
        const userStr = localStorage.getItem('user');
        const user = userStr ? JSON.parse(userStr) : null;
        console.log('👤 FRONTEND: Retrieved user:', user);
        return user;
    }

    getToken() {
        return this.token;
    }

    // Helper to check if user has specific role
    hasRole(role) {
        const user = this.getUser();
        const hasRole = user && user.role === role;
        console.log(`🔍 FRONTEND: Role check for '${role}':`, hasRole);
        return hasRole;
    }

    // Redirect to appropriate dashboard based on role
    redirectToDashboard() {
        const user = this.getUser();
        if (!user) {
            console.warn('⚠️ FRONTEND: No user found for dashboard redirect');
            window.location.href = '/login.html';
            return;
        }

        console.log(`🔄 FRONTEND: Redirecting ${user.role} to dashboard`);
        
        const dashboards = {
            'admin': '/admin-dashboard.html',
            'tutor': '/tutor-dashboard.html',
            'teacher': '/tutor-dashboard.html',
            'student': '/student-dashboard.html'
        };

        const dashboard = dashboards[user.role] || '/dashboard.html';
        window.location.href = dashboard;
    }

    // Validate token and user data
    validateAuth() {
        const token = this.getToken();
        const user = this.getUser();
        
        if (!token || !user) {
            console.warn('❌ FRONTEND: Auth validation failed - missing token or user');
            return false;
        }

        // Optional: Add token expiration check here
        console.log('✅ FRONTEND: Auth validation passed');
        return true;
    }
}

// Create global instance
const authService = new AuthService();

// For backward compatibility
window.authService = authService;

console.log('✅ FRONTEND: Auth service initialized - Ready for real API connections');