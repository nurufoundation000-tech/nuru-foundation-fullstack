/**
 * SHARED DASHBOARD FUNCTIONS
 * NURU FOUNDATION
 */

// API Base URL
const API_BASE = window.location.hostname === 'localhost' 
    ? 'http://localhost:5000/api' 
    : '/api';

// ==========================================
// REAL-TIME NOTIFICATIONS (Socket.IO)
// ==========================================

let socket = null;

function connectSocket() {
    if (socket && socket.connected) return;
    const token = sessionStorage.getItem('token');
    if (!token) return;

    // Dynamically load socket.io client library
    const script = document.createElement('script');
    script.src = 'https://cdn.socket.io/4.8.1/socket.io.min.js';
    script.onload = () => {
        if (typeof io !== 'undefined') {
            socket = io(API_BASE.replace('/api', ''), {
                auth: { token },
                path: '/socket.io',
                transports: ['websocket', 'polling']
            });

            socket.on('connect', () => {
                console.log('[Socket] Connected');
            });

            socket.on('new-notification', (data) => {
                console.log('[Socket] New notification:', data);
                // Update badge if it exists
                const badge = document.getElementById('notifBadge');
                if (badge) {
                    const current = parseInt(badge.textContent) || 0;
                    badge.textContent = current + 1;
                    badge.style.display = 'inline';
                }
                // Show a toast
                if (typeof showToast === 'function') {
                    showToast(data.title || 'New notification', 'info');
                }
            });

            socket.on('disconnect', () => {
                console.log('[Socket] Disconnected');
            });

            socket.on('connect_error', (err) => {
                console.warn('[Socket] Connection error:', err.message);
            });
        }
    };
    document.head.appendChild(script);
}

function disconnectSocket() {
    if (socket) {
        socket.disconnect();
        socket = null;
    }
}

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
    localStorage.removeItem('token');
    localStorage.removeItem('user');
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
        
        loadScript('/scripts/newsletter.js');

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

let notifPollInterval = null;

function startNotificationPolling() {
    if (notifPollInterval) return;
    const poll = async () => {
        try {
            const data = await fetchAPI('/notifications/unread-count');
            const badge = document.getElementById('notifBadge');
            if (badge) {
                if (data.count > 0) {
                    badge.textContent = data.count;
                    badge.style.display = 'inline';
                } else {
                    badge.style.display = 'none';
                }
            }
        } catch (e) {
            // silent — user may not be authenticated on some pages
        }
    };
    poll();
    notifPollInterval = setInterval(poll, 30000);
}

class DashboardSidebar extends HTMLElement {
    connectedCallback() {
        this.render();
        startNotificationPolling();
        connectSocket();
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
                                ${item.href.includes('notifications') ? '<span class="notif-badge" id="notifBadge" style="display:none;background:var(--primary-color);color:white;font-size:0.7rem;padding:1px 7px;border-radius:10px;margin-left:auto;"></span>' : ''}
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
                { href: '/student-dashboard/live-sessions.html', icon: 'fa-video', label: 'Live Sessions' },
                { href: '/student-dashboard/progress.html', icon: 'fa-chart-line', label: 'Progress' },
                { href: '/student-dashboard/assignments.html', icon: 'fa-tasks', label: 'Assignments' },
                { href: '/student-dashboard/payment.html', icon: 'fa-credit-card', label: 'Payments' },
                { href: '/student-dashboard/certificates.html', icon: 'fa-certificate', label: 'Certificates' },
                { href: '/student-dashboard/notifications.html', icon: 'fa-bell', label: 'Notifications' },
                { href: '/student-dashboard/profile.html', icon: 'fa-user', label: 'Profile' }
            ],
            tutor: [
                { href: '/tutor-dashboard/index.html', icon: 'fa-tachometer-alt', label: 'Dashboard' },
                { href: '/tutor-dashboard/courses.html', icon: 'fa-book', label: 'My Courses' },
                { href: '/tutor-dashboard/lessons.html', icon: 'fa-chalkboard-teacher', label: 'Lessons' },
                { href: '/tutor-dashboard/sessions.html', icon: 'fa-video', label: 'Live Sessions' },
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
                { href: '/admin-dashboard/transactions.html', icon: 'fa-credit-card', label: 'Transactions' },
                { href: '/admin-dashboard/invoices.html', icon: 'fa-file-invoice', label: 'Invoices' },
                { href: '/admin-dashboard/student-payments.html', icon: 'fa-money-check', label: 'Student Payments' },
                { href: '/admin-dashboard/payment-confirmations.html', icon: 'fa-check-double', label: 'Payment Confirmations' },
                { href: '/admin-dashboard/cohorts.html', icon: 'fa-users', label: 'Cohorts' },
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
        this.attachShadow({ mode: 'open' });
        this.render();
    }

    attributeChangedCallback() {
        if (this.shadowRoot) {
            this.render();
        }
    }

    render() {
        const title = this.getAttribute('title') || 'Dashboard';
        const subtitle = this.getAttribute('subtitle') || '';
        const icon = this.getAttribute('icon') || 'fa-tachometer-alt';

        this.shadowRoot.innerHTML = `
            <style>
                :host { display: block; }
                .page-header {
                    background: linear-gradient(135deg, var(--primary-color) 0%, var(--accent-color-1) 100%);
                    color: white;
                    padding: 40px 25px;
                    border-radius: var(--border-radius-lg);
                    margin-bottom: 30px;
                    text-align: center;
                    position: relative;
                }
                .page-header h1 {
                    margin: 0 0 10px 0;
                    font-size: 2.2rem;
                    font-weight: 700;
                }
                .page-header p {
                    margin: 0;
                    opacity: 0.9;
                    font-size: 1rem;
                }
                ::slotted(*) {
                    margin-top: 15px;
                }
            </style>
            <div class="page-header">
                <h1><i class="fas ${icon}"></i> ${title}</h1>
                ${subtitle ? `<p>${subtitle}</p>` : ''}
                <slot></slot>
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
    escapeHtml,
    startNotificationPolling,
    connectSocket,
    disconnectSocket
};