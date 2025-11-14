// const API_BASE_URL = 'localhost' ? 'http://localhost:5000/api'  : 'https://nuru-foundation-fullstack.vercel.app/api';
const API_BASE_URL = '/api';

class AuthService {
    constructor() {
        this.token = localStorage.getItem('token');
    }

    async login(email, password) {
        console.log('🔥 FRONTEND: Starting login attempt', { email, API_BASE_URL });
        try {
            console.log('🔥 FRONTEND: Making fetch request to:', `${API_BASE_URL}/auth/login`);
            const response = await fetch(`${API_BASE_URL}/auth/login`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ email, password }),
            });

            console.log('🔥 FRONTEND: Response received', {
                status: response.status,
                statusText: response.statusText,
                headers: Object.fromEntries(response.headers.entries())
            });

            const data = await response.json();
            console.log('🔥 FRONTEND: Parsed JSON data:', data);

            if (response.ok) {
                this.token = data.token;
                localStorage.setItem('token', this.token);
                localStorage.setItem('user', JSON.stringify(data.user));
                return { success: true, user: data.user };
            } else {
                return { success: false, message: data.message };
            }
        } catch (error) {
            console.error('🔥 FRONTEND: Login error:', error);
            return { success: false, message: 'Network error' };
        }
    }

    async register(userData) {
        try {
            const response = await fetch(`${API_BASE_URL}/auth/register`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(userData),
            });

            const data = await response.json();

            if (response.ok) {
                return { success: true, message: data.message };
            } else {
                return { success: false, message: data.message };
            }
        } catch (error) {
            console.error('Register error:', error);
            return { success: false, message: 'Network error' };
        }
    }

    logout() {
        this.token = null;
        localStorage.removeItem('token');
        localStorage.removeItem('user');
    }

    isLoggedIn() {
        return !!this.token;
    }

    getUser() {
        const user = localStorage.getItem('user');
        return user ? JSON.parse(user) : null;
    }

    getToken() {
        return this.token;
    }
}

const authService = new AuthService();
