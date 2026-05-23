
function initHeader() {
    
    const header = document.querySelector('.main-header');
    if (!header) return; 

    const navToggle = document.getElementById('navToggle');
    const mobileMenu = document.getElementById('mobileMenu');
    const closeMenu = document.getElementById('closeMenu');

    const mobileNavLinks = document.querySelectorAll('.mobile-nav-link');

    // Toggle mobile menu
    function toggleMobileMenu() {
        if (!mobileMenu) return; 
        mobileMenu.classList.toggle('active');
        document.body.style.overflow = mobileMenu.classList.contains('active') ? 'hidden' : '';
        
     
        if (navToggle) {
            const spans = navToggle.querySelectorAll('span');
            if (spans.length >= 3) {
                if (mobileMenu.classList.contains('active')) {
                    spans[0].style.transform = 'rotate(45deg) translate(6px, 6px)';
                    spans[1].style.opacity = '0';
                    spans[2].style.transform = 'rotate(-45deg) translate(6px, -6px)';
                } else {
                    spans[0].style.transform = 'none';
                    spans[1].style.opacity = '1';
                    spans[2].style.transform = 'none';
                }
            }
        }
    }

    if (navToggle) {
        navToggle.addEventListener('click', toggleMobileMenu);
    }
    
    if (closeMenu) {
        closeMenu.addEventListener('click', toggleMobileMenu);
    }

   
    mobileNavLinks.forEach(link => {
        link.addEventListener('click', toggleMobileMenu);
    });

 
    window.addEventListener('scroll', () => {
        if (window.scrollY > 100) {
            header.classList.add('scrolled');
        } else {
            header.classList.remove('scrolled');
        }
    });

   
    function updateActiveNavLink() {
        const currentPage = window.location.pathname.split('/').pop() || 'index.html';
        const allNavLinks = document.querySelectorAll('.nav-link, .mobile-nav-link');
        
        allNavLinks.forEach(link => {
            const linkHref = link.getAttribute('href');
            link.classList.remove('active');
            
            if (linkHref === currentPage) {
                link.classList.add('active');
            }
            if (currentPage === '' && linkHref === 'index.html') {
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
        window.location.href = '/login.html';
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

        if (typeof window.APP_CONFIG === 'undefined') {
            await loadScript('/scripts/config.js');
        }

        if (typeof authService === 'undefined') {
            await loadScript('/scripts/auth.js');
        }

        // Wait until authService is available
        const start = Date.now();
        while (typeof authService === 'undefined' && Date.now() - start < 3000) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }

    // Update header actions based on auth status
    async function updateHeaderActions() {
        const headerActions = document.getElementById('headerActions');
        const mobileActions = document.getElementById('mobileActions');

        try {
            await ensureAuthServiceLoaded();
        } catch (error) {
            console.warn('Auth service failed to load:', error);
        }

        const authReady = typeof authService !== 'undefined' && authService && typeof authService.isLoggedIn === 'function';

        if (authReady && authService.isLoggedIn()) {
            const user = authService.getUser ? authService.getUser() : null;
            const role = user?.role?.name || user?.role;
            let dashboardUrl = window.APP_CONFIG?.routes?.studentDashboard || '/student-dashboard/index.html';

            if (role === 'tutor') {
                dashboardUrl = window.APP_CONFIG?.routes?.tutorDashboard || '/tutor-dashboard/index.html';
            } else if (role === 'admin') {
                dashboardUrl = window.APP_CONFIG?.routes?.adminDashboard || '/admin-dashboard/index.html';
            }

            const userHtml = `
                <a href="${dashboardUrl}" class="btn btn-primary">Dashboard</a>
                <button class="btn btn-outline" onclick="logout()">Logout</button>
            `;
            const mobileUserHtml = `
                <a href="${dashboardUrl}" class="btn btn-primary">Dashboard</a>
                <button class="btn btn-outline" onclick="logout()">Logout</button>
            `;
            if (headerActions) headerActions.innerHTML = userHtml;
            if (mobileActions) mobileActions.innerHTML = mobileUserHtml;
        } else {
            const loginHtml = `
                <a href="/login.html" class="btn btn-outline">Login</a>
                <a href="/apply-now-bt.html" class="btn btn-primary">Get Started</a>
            `;
            if (headerActions) headerActions.innerHTML = loginHtml;
            if (mobileActions) mobileActions.innerHTML = loginHtml;
        }
    }

    // Initial update
    updateHeaderActions();

    document.addEventListener('click', (event) => {
        if (mobileMenu && navToggle && mobileMenu.classList.contains('active') && 
            !mobileMenu.contains(event.target) && 
            !navToggle.contains(event.target)) {
            toggleMobileMenu();
        }
    });


    if (mobileMenu) {
        mobileMenu.addEventListener('touchmove', (event) => {
            if (mobileMenu.classList.contains('active')) {
                event.preventDefault();
            }
        }, { passive: false });
    }
}
