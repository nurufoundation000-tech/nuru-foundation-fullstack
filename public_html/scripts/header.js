function initHeader() {
    const header = document.querySelector('.main-header');
    if (!header) return;

    if (header.dataset.headerInitialized === 'true') {
        updateActiveNavLink();
        return;
    }
    header.dataset.headerInitialized = 'true';

    // Auto-fix logo image paths for subfolders or root
    const logoImgs = document.querySelectorAll('.logo-img, .mobile-logo-img');
    logoImgs.forEach(img => {
        img.onerror = function() {
            if (!this.dataset.retried) {
                this.dataset.retried = '1';
                const isSubdir = window.location.pathname.includes('/courses/') || 
                                 window.location.pathname.includes('/student-dashboard/') || 
                                 window.location.pathname.includes('/tutor-dashboard/');
                this.src = isSubdir ? '../NewLogo.png' : 'NewLogo.png';
            }
        };
    });

    const navToggle = document.getElementById('navToggle');
    const mobileMenu = document.getElementById('mobileMenu');
    const closeMenu = document.getElementById('closeMenu');
    const mobileNavLinks = document.querySelectorAll('.mobile-nav-link');

    // Toggle mobile menu
    function toggleMobileMenu(forceClose) {
        if (!mobileMenu) return;

        let shouldOpen;
        if (typeof forceClose === 'boolean') {
            shouldOpen = !forceClose;
            mobileMenu.classList.toggle('active', shouldOpen);
        } else {
            shouldOpen = mobileMenu.classList.toggle('active');
        }

        document.body.style.overflow = shouldOpen ? 'hidden' : '';

        if (navToggle) {
            navToggle.classList.toggle('active', shouldOpen);
            const spans = navToggle.querySelectorAll('span');
            if (spans.length >= 3) {
                if (shouldOpen) {
                    spans[0].style.transform = 'rotate(45deg) translate(5px, 5px)';
                    spans[1].style.opacity = '0';
                    spans[2].style.transform = 'rotate(-45deg) translate(5px, -5px)';
                } else {
                    spans[0].style.transform = 'none';
                    spans[1].style.opacity = '1';
                    spans[2].style.transform = 'none';
                }
            }
        }
    }

    if (navToggle) {
        navToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleMobileMenu();
        });
    }

    if (closeMenu) {
        closeMenu.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleMobileMenu(true);
        });
    }

    mobileNavLinks.forEach(link => {
        link.addEventListener('click', () => toggleMobileMenu(true));
    });

    // Close when clicking outside menu
    document.addEventListener('click', (event) => {
        if (mobileMenu && navToggle && mobileMenu.classList.contains('active')) {
            if (!mobileMenu.contains(event.target) && !navToggle.contains(event.target)) {
                toggleMobileMenu(true);
            }
        }
    });

    // Close on Escape key
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && mobileMenu && mobileMenu.classList.contains('active')) {
            toggleMobileMenu(true);
        }
    });

    // Header scroll state
    function handleScroll() {
        if (window.scrollY > 40) {
            header.classList.add('scrolled');
        } else {
            header.classList.remove('scrolled');
        }
    }

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();

    // Active nav link highlight
    function updateActiveNavLink() {
        let currentPath = window.location.pathname.toLowerCase();
        if (currentPath.endsWith('/') && currentPath.length > 1) {
            currentPath = currentPath.slice(0, -1);
        }
        const fileName = currentPath.split('/').pop() || 'index.html';
        const isRoot = currentPath === '' || currentPath === '/' || fileName === 'index.html';
        const allNavLinks = document.querySelectorAll('.nav-link, .mobile-nav-link');

        allNavLinks.forEach(link => {
            const linkHref = (link.getAttribute('href') || '').toLowerCase();
            const linkFile = linkHref.split('/').pop();

            link.classList.remove('active');

            let isActive = false;
            if (isRoot && (linkFile === 'index.html' || linkHref === 'index.html' || linkHref === '/')) {
                isActive = true;
            } else if (!isRoot && linkFile && linkFile === fileName) {
                isActive = true;
            } else if (currentPath.includes('/courses/') && linkFile === 'courses.html') {
                isActive = true;
            }

            if (isActive) {
                link.classList.add('active');
            }
        });
    }

    updateActiveNavLink();

    // Logout function
    function logout() {
        if (typeof authService !== 'undefined' && authService && typeof authService.logout === 'function') {
            authService.logout();
            return;
        }
        updateHeaderActions();
        window.location.href = 'login.html';
    }

    // Make logout available globally
    window.logout = logout;

    function loadScript(src) {
        return new Promise((resolve, reject) => {
            if (document.querySelector(`script[src="${src}"]`)) {
                resolve();
                return;
            }

            const script = document.createElement('script');
            script.src = src;
            script.async = false;
            script.onload = () => resolve();
            script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
            document.head.appendChild(script);
        });
    }

    async function ensureAuthServiceLoaded() {
        if (typeof authService !== 'undefined' && authService) {
            return;
        }

        const isSubdir = window.location.pathname.includes('/courses/') || 
                         window.location.pathname.includes('/student-dashboard/') || 
                         window.location.pathname.includes('/tutor-dashboard/');
        const prefix = isSubdir ? '../' : '';

        if (typeof window.APP_CONFIG === 'undefined') {
            try {
                await loadScript(`${prefix}scripts/config.js`);
            } catch (e) {}
        }

        if (typeof authService === 'undefined') {
            try {
                await loadScript(`${prefix}scripts/auth.js`);
            } catch (e) {}
        }

        const start = Date.now();
        while (typeof authService === 'undefined' && Date.now() - start < 2000) {
            await new Promise(resolve => setTimeout(resolve, 80));
        }
    }

    // Update header actions based on auth status
    async function updateHeaderActions() {
        const headerActions = document.getElementById('headerActions');
        const mobileActions = document.getElementById('mobileActions');

        try {
            await ensureAuthServiceLoaded();
        } catch (error) {
            console.warn('Auth service check:', error);
        }

        const authReady = typeof authService !== 'undefined' && authService && typeof authService.isLoggedIn === 'function';

        if (authReady && authService.isLoggedIn()) {
            const user = authService.getUser ? authService.getUser() : null;
            const role = user?.role?.name || user?.role;
            let dashboardUrl = window.APP_CONFIG?.routes?.studentDashboard || 'student-dashboard/index.html';

            if (role === 'tutor') {
                dashboardUrl = window.APP_CONFIG?.routes?.tutorDashboard || 'tutor-dashboard/index.html';
            } else if (role === 'admin') {
                dashboardUrl = window.APP_CONFIG?.routes?.adminDashboard || 'admin-dashboard/index.html';
            }

            const userHtml = `
                <a href="${dashboardUrl}" class="btn btn-primary">Dashboard</a>
                <button type="button" class="btn btn-outline" onclick="logout()">Logout</button>
            `;
            if (headerActions) headerActions.innerHTML = userHtml;
            if (mobileActions) mobileActions.innerHTML = userHtml;
        } else {
            const loginHtml = `
                <a href="login.html" class="btn btn-outline">Login</a>
                <a href="apply-now-bt.html" class="btn btn-primary">Get Started</a>
            `;
            if (headerActions) headerActions.innerHTML = loginHtml;
            if (mobileActions) mobileActions.innerHTML = loginHtml;
        }
    }

    // Initial update
    updateHeaderActions();

    if (mobileMenu) {
        mobileMenu.addEventListener('touchmove', (event) => {
            if (mobileMenu.classList.contains('active')) {
                if (!mobileMenu.contains(event.target)) {
                    event.preventDefault();
                }
            }
        }, { passive: false });
    }
}

// Auto-run if main-header already in DOM
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        if (document.querySelector('.main-header')) {
            initHeader();
        }
    });
} else {
    if (document.querySelector('.main-header')) {
        initHeader();
    }
}
