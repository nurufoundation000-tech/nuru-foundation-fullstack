/**
 * SHARED DASHBOARD FUNCTIONS
 * NURU FOUNDATION
 */

// API Base URL
const API_BASE = window.location.hostname === 'localhost' 
    ? 'http://localhost:3000/api' 
    : '/api';

// ==========================================
// UTILITY FUNCTIONS
// ==========================================

function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    const div = document.createElement('div');
    div.textContent = String(str);
    return div.innerHTML;
}

// ==========================================
// API FUNCTIONS
// ==========================================

async function fetchAPI(endpoint, options = {}) {
    const token = sessionStorage.getItem('token');
    const defaultOptions = {
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            ...options.headers
        },
        ...options
    };
    
    const response = await fetch(`${API_BASE}${endpoint}`, defaultOptions);
    
    if (!response.ok) {
        if (response.status === 401) {
            logout();
            throw new Error('Session expired. Please log in again.');
        }
        const error = await response.json().catch(() => ({}));
        throw new Error(error.message || `Request failed: ${response.status}`);
    }
    
    return response.json();
}

// ==========================================
// AUTH FUNCTIONS
// ==========================================

function checkAuth(requiredRole = null) {
    const token = sessionStorage.getItem('token');
    const userData = sessionStorage.getItem('user');
    
    if (!token || !userData) {
        window.location.href = '/login.html';
        return false;
    }
    
    try {
        const user = JSON.parse(userData);
        const userRole = user.role?.name || user.role;
        
        if (requiredRole && userRole !== requiredRole) {
            showError('Access denied. You do not have permission to view this page.');
            setTimeout(() => {
                window.location.href = '/dashboard.html';
            }, 2000);
            return false;
        }
        
        return true;
    } catch (error) {
        console.error('Auth check error:', error);
        window.location.href = '/login.html';
        return false;
    }
}

function logout() {
    sessionStorage.removeItem('token');
    sessionStorage.removeItem('user');
    window.location.href = '/login.html';
}

// ==========================================
// UI FUNCTIONS
// ==========================================

function showToast(message, type = 'info') {
    let container = document.querySelector('.toast-container');
    if (!container) {
        container = document.createElement('div');
        container.className = 'toast-container';
        document.body.appendChild(container);
    }
    
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `<i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i> ${message}`;
    
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.remove();
    }, 4000);
}

function showError(message) {
    showToast(message, 'error');
}

function showSuccess(message) {
    showToast(message, 'success');
}

// ==========================================
// LOADER
// ==========================================

function showLoading(element) {
    if (typeof element === 'string') {
        element = document.getElementById(element);
    }
    if (element) {
        element.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i><p>Loading...</p></div>';
    }
}

function showEmptyState(element, message = 'No data found', icon = 'fa-folder-open') {
    if (typeof element === 'string') {
        element = document.getElementById(element);
    }
    if (element) {
        element.innerHTML = `
            <div class="empty-state">
                <i class="fas ${icon}"></i>
                <h3>${message}</h3>
            </div>
        `;
    }
}

// ==========================================
// HEADER & FOOTER
// ==========================================

async function loadHeader() {
    const headerContainer = document.getElementById('headerContainer');
    if (!headerContainer) return;
    
    try {
        const response = await fetch('/header.html');
        headerContainer.innerHTML = await response.text();
        
        // Load config and auth scripts (only if not already loaded)
        if (!window.APP_CONFIG) {
            loadScript('/scripts/config.js');
        }
        loadScript('/scripts/auth.js', () => {
            loadScript('/scripts/header.js', () => {
                if (typeof initHeader === 'function') {
                    initHeader();
                }
            });
        });
    } catch (error) {
        console.error('Error loading header:', error);
    }
}

async function loadFooter() {
    const footerContainer = document.getElementById('footerContainer');
    if (!footerContainer) return;
    
    try {
        const response = await fetch('/footer.html');
        footerContainer.innerHTML = await response.text();
        
        if (typeof startCourseRotation === 'function') {
            startCourseRotation();
        }
    } catch (error) {
        console.error('Error loading footer:', error);
    }
}

function loadScript(src, callback) {
    return new Promise((resolve) => {
        const script = document.createElement('script');
        script.src = src;
        script.onload = () => {
            if (callback) callback();
            resolve();
        };
        document.head.appendChild(script);
    });
}

// ==========================================
// SIDEBAR - Custom Element
// ==========================================

class DashboardSidebar extends HTMLElement {
    connectedCallback() {
        this.render();
    }
    
    render() {
        const userData = sessionStorage.getItem('user');
        let userRole = 'guest';
        
        try {
            const user = JSON.parse(userData);
            userRole = user.role?.name || user.role;
        } catch (e) {
            console.error('Error parsing user:', e);
        }
        
        const menuItems = this.getMenuForRole(userRole);
        const activePage = this.getAttribute('active') || '';
        
        this.innerHTML = `
            <div class="dashboard-sidebar">
                <div class="sidebar-brand">
                    <h2>${this.getBrandTitle(userRole)}</h2>
                    <span>${this.getBrandSubtitle(userRole)}</span>
                </div>
                <ul class="sidebar-menu">
                    ${menuItems.map(item => `
                        <li class="sidebar-item ${item.href === activePage || activePage.includes(item.href) ? 'active' : ''}">
                            <a href="${item.href}">
                                <i class="fas ${item.icon}"></i>
                                <span>${item.label}</span>
                            </a>
                        </li>
                    `).join('')}
                </ul>
            </div>
        `;
    }
    
    getMenuForRole(role) {
        const menus = {
            student: [
                { href: '/student-dashboard/index.html', icon: 'fa-tachometer-alt', label: 'Overview' },
                { href: '/student-dashboard/my-courses.html', icon: 'fa-book', label: 'My Courses' },
                { href: '/student-dashboard/progress.html', icon: 'fa-chart-line', label: 'Progress' },
                { href: '/student-dashboard/notes.html', icon: 'fa-sticky-note', label: 'My Notes' },
                { href: '/student-dashboard/profile.html', icon: 'fa-user', label: 'Profile' }
            ],
            tutor: [
                { href: '/tutor-dashboard/index.html', icon: 'fa-tachometer-alt', label: 'Dashboard' },
                { href: '/tutor-dashboard/courses.html', icon: 'fa-book', label: 'My Courses' },
                { href: '/tutor-dashboard/lessons.html', icon: 'fa-chalkboard-teacher', label: 'Lessons' },
                { href: '/tutor-dashboard/assignments.html', icon: 'fa-tasks', label: 'Assignments' },
                { href: '/tutor-dashboard/enrollments.html', icon: 'fa-clipboard-list', label: 'Enrollments' },
                { href: '/tutor-dashboard/submissions.html', icon: 'fa-file-alt', label: 'Submissions' },
                { href: '/tutor-dashboard/notes.html', icon: 'fa-sticky-note', label: 'Course Notes' }
            ],
            admin: [
                { href: '/admin-dashboard/index.html', icon: 'fa-tachometer-alt', label: 'Dashboard' },
                { href: '/admin-dashboard/users.html', icon: 'fa-users', label: 'Users' },
                { href: '/admin-dashboard/courses.html', icon: 'fa-book', label: 'Courses' },
                { href: '/admin-dashboard/enrollments.html', icon: 'fa-clipboard-list', label: 'Enrollments' },
                { href: '/admin-dashboard/analytics.html', icon: 'fa-chart-bar', label: 'Analytics' },
                { href: '/admin-dashboard/settings.html', icon: 'fa-cog', label: 'Settings' }
            ]
        };
        
        return menus[role] || menus.student;
    }
    
    getBrandTitle(role) {
        const titles = {
            student: 'My Dashboard',
            tutor: 'Tutor Portal',
            admin: 'Admin Panel'
        };
        return titles[role] || 'Dashboard';
    }
    
    getBrandSubtitle(role) {
        const subtitles = {
            student: 'Student Area',
            tutor: 'Teaching Hub',
            admin: 'Management'
        };
        return subtitles[role] || '';
    }
}

// Register custom element
customElements.define('dashboard-sidebar', DashboardSidebar);

// ==========================================
// PAGE HEADER COMPONENT
// ==========================================

class PageHeader extends HTMLElement {
    static get observedAttributes() {
        return ['title', 'subtitle', 'icon'];
    }
    
    connectedCallback() {
        this.render();
    }
    
    attributeChangedCallback() {
        this.render();
    }
    
    render() {
        const title = this.getAttribute('title') || 'Dashboard';
        const subtitle = this.getAttribute('subtitle') || '';
        const icon = this.getAttribute('icon') || 'fa-tachometer-alt';
        
        this.innerHTML = `
            <div class="page-header">
                <h1><i class="fas ${icon}"></i> ${title}</h1>
                ${subtitle ? `<p>${subtitle}</p>` : ''}
            </div>
        `;
    }
}

customElements.define('page-header', PageHeader);

// ==========================================
// STATS CARD COMPONENT
// ==========================================

class StatsGrid extends HTMLElement {
    connectedCallback() {
        this.render();
    }
    
    render() {
        const stats = JSON.parse(this.getAttribute('stats') || '[]');
        
        this.innerHTML = `
            <div class="stats-grid">
                ${stats.map(stat => `
                    <div class="stat-card">
                        <div class="stat-number">${stat.value}</div>
                        <div class="stat-label">${stat.label}</div>
                    </div>
                `).join('')}
            </div>
        `;
    }
}

customElements.define('stats-grid', StatsGrid);

// Export for use
window.DashboardUtils = {
    fetchAPI,
    checkAuth,
    logout,
    showToast,
    showError,
    showSuccess,
    showLoading,
    showEmptyState,
    loadHeader,
    loadFooter,
    loadScript,
    escapeHtml
};