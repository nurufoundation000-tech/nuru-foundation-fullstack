class AuthService {
    constructor() {
        this.token = sessionStorage.getItem('token');
        this.config = window.APP_CONFIG || { apiBaseUrl: '/api' };
    }

    getApiUrl() {
        return this.config.apiBaseUrl || '/api';
    }

    async login(email, password) {
        try {
            const response = await fetch(`${this.getApiUrl()}/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password }),
            });

            const data = await response.json();

            if (response.ok) {
                this.token = data.token;
                sessionStorage.setItem(this.config.tokenKey, this.token);
                sessionStorage.setItem(this.config.userKey, JSON.stringify(data.user));
                return { 
                    success: true, 
                    user: data.user, 
                    token: data.token,
                    mustChangePassword: data.user?.mustChangePassword || false 
                };
            } else {
                return { success: false, message: data.message || data.error || 'Login failed' };
            }
        } catch (error) {
            return { success: false, message: error.message || 'Network error during login' };
        }
    }

    async register(userData) {
        try {
            const response = await fetch(`${this.getApiUrl()}/auth/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(userData),
            });

            const data = await response.json();

            if (response.ok) {
                return { success: true, message: data.message };
            } else {
                return { success: false, message: data.message || data.error };
            }
        } catch (error) {
            return { success: false, message: error.message || 'Network error during registration' };
        }
    }

    logout() {
        this.token = null;
        sessionStorage.removeItem(this.config.tokenKey);
        sessionStorage.removeItem(this.config.userKey);
        window.location.href = this.config.routes?.login || '/login.html';
    }

    isLoggedIn() {
        return !!this.token;
    }

    getUser() {
        const userStr = sessionStorage.getItem(this.config.userKey);
        return userStr ? JSON.parse(userStr) : null;
    }

    getToken() {
        return this.token;
    }

    hasRole(role) {
        const user = this.getUser();
        return user && (user.role === role || user.role?.name === role);
    }

    redirectToDashboard() {
        const user = this.getUser();
        if (!user) {
            window.location.href = this.config.routes?.login || '/login.html';
            return;
        }
        
        const role = user.role?.name || user.role;
        const routes = this.config.routes || {};
        const dashboard = routes[role] || routes.studentDashboard || '/login.html';
        window.location.href = dashboard;
    }

    validateAuth() {
        const token = this.getToken();
        const user = this.getUser();
        return !!(token && user);
    }
}

const authService = new AuthService();
window.authService = authService;