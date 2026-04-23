
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
        authService.logout();
        updateHeaderActions();
        // Redirect to home page
        window.location.href = 'index.html';
    }

    // Make logout available globally
    window.logout = logout;

    // Update header actions based on auth status
    function updateHeaderActions() {
        const headerActions = document.getElementById('headerActions');
        const mobileActions = document.getElementById('mobileActions');

        if (authService.isLoggedIn()) {
            const user = authService.getUser();
            const userHtml = `
                <a href="/student-dashboard/index.html" class="btn btn-primary">Dashboard</a>
                <button class="btn btn-outline" onclick="logout()">Logout</button>
            `;
            const mobileUserHtml = `
                <a href="/student-dashboard/index.html" class="btn btn-primary">Dashboard</a>
                <button class="btn btn-outline" onclick="logout()">Logout</button>
            `;
            if (headerActions) headerActions.innerHTML = userHtml;
            if (mobileActions) mobileActions.innerHTML = mobileUserHtml;
        } else {
            const loginHtml = `
                <a href="/login.html" class="btn btn-outline">Login</a>
                <a href="/register.html" class="btn btn-primary">Get Started</a>
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
