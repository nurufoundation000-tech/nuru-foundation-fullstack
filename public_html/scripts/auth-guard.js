(function() {
    function checkAuth() {
        var token = sessionStorage.getItem('token');
        var user = sessionStorage.getItem('user');

        if (!token && !user) {
            var localToken = localStorage.getItem('token');
            var localUser = localStorage.getItem('user');
            if (localToken && localUser) {
                token = localToken;
                user = localUser;
                sessionStorage.setItem('token', token);
                sessionStorage.setItem('user', user);
            }
        }

        if (!token) {
            location.replace('/login.html');
            return;
        }

        try {
            var payload = JSON.parse(atob(token.split('.')[1]));
            if (payload.exp && Date.now() >= payload.exp * 1000) {
                sessionStorage.removeItem('token');
                sessionStorage.removeItem('user');
                location.replace('/login.html');
                return;
            }
        } catch (e) {
        }

        var x = new XMLHttpRequest();
        x.open('GET', '/api/auth/verify', false);
        x.setRequestHeader('Authorization', 'Bearer ' + token);
        try {
            x.send();
            if (x.status === 401 || x.status === 403) {
                sessionStorage.removeItem('token');
                sessionStorage.removeItem('user');
                location.replace('/login.html');
            }
        } catch (e) {
            sessionStorage.removeItem('token');
            sessionStorage.removeItem('user');
            location.replace('/login.html');
        }
    }

    checkAuth();

    window.addEventListener('pageshow', function (event) {
        if (event.persisted) {
            checkAuth();
        }
    });
})();

(function() {
    function initCollapsibleSidebar() {
        var sidebar = document.querySelector('.admin-sidebar, .tutor-sidebar, .dashboard-sidebar');
        if (!sidebar) return;

        var isAdminOrTutor = sidebar.classList.contains('admin-sidebar') || sidebar.classList.contains('tutor-sidebar');
        var main = isAdminOrTutor
            ? document.querySelector('.admin-main, .tutor-main')
            : document.querySelector('.dashboard-main');
        if (!main) return;

        var brandEl = sidebar.querySelector('.admin-brand, .tutor-brand, .sidebar-brand');
        var navEl = sidebar.querySelector('.admin-nav, .tutor-nav, .sidebar-menu');
        if (!navEl) return;

        var style = document.createElement('style');
        style.textContent = [
            '.admin-sidebar, .tutor-sidebar, .dashboard-sidebar {',
            '  transition: width 0.3s ease !important;',
            '}',
            '.admin-sidebar.collapsed, .tutor-sidebar.collapsed {',
            '  width: 60px !important;',
            '  min-width: 60px !important;',
            '}',
            '.dashboard-sidebar.collapsed {',
            '  width: 60px !important;',
            '  min-width: 60px !important;',
            '  padding: 15px 8px !important;',
            '}',
            '.admin-sidebar.collapsed .admin-brand h1,',
            '.admin-sidebar.collapsed .admin-brand p,',
            '.tutor-sidebar.collapsed .tutor-brand h1,',
            '.tutor-sidebar.collapsed .tutor-brand p,',
            '.admin-sidebar.collapsed .admin-nav a span,',
            '.tutor-sidebar.collapsed .tutor-nav a span,',
            '.dashboard-sidebar.collapsed .sidebar-brand h2,',
            '.dashboard-sidebar.collapsed .sidebar-brand span,',
            '.dashboard-sidebar.collapsed .sidebar-menu a span {',
            '  display: none !important;',
            '}',
            '.admin-sidebar.collapsed .admin-brand,',
            '.tutor-sidebar.collapsed .tutor-brand {',
            '  padding: 10px 0 !important;',
            '  text-align: center !important;',
            '  border-bottom: 1px solid rgba(255,255,255,0.1) !important;',
            '}',
            '.admin-sidebar.collapsed .admin-nav a,',
            '.tutor-sidebar.collapsed .tutor-nav a,',
            '.dashboard-sidebar.collapsed .sidebar-menu a {',
            '  justify-content: center !important;',
            '  padding: 12px 8px !important;',
            '}',
            '.admin-sidebar.collapsed .admin-nav i,',
            '.tutor-sidebar.collapsed .tutor-nav i,',
            '.dashboard-sidebar.collapsed .sidebar-menu i {',
            '  margin-right: 0 !important;',
            '  font-size: 1.3rem !important;',
            '  width: auto !important;',
            '}',
            '.admin-sidebar.collapsed ~ .admin-main,',
            '.tutor-sidebar.collapsed ~ .tutor-main,',
            '.admin-main.sidebar-collapsed,',
            '.tutor-main.sidebar-collapsed {',
            '  margin-left: 60px !important;',
            '  transition: margin-left 0.3s ease;',
            '}',
            '.sidebar-collapse-btn {',
            '  background: none;',
            '  border: none;',
            '  color: rgba(255,255,255,0.6);',
            '  font-size: 0.9rem;',
            '  cursor: pointer;',
            '  padding: 10px;',
            '  width: 100%;',
            '  display: flex;',
            '  align-items: center;',
            '  justify-content: center;',
            '  transition: color 0.2s, background 0.2s;',
            '  margin-top: auto;',
            '}',
            '.sidebar-collapse-btn:hover {',
            '  color: rgba(255,255,255,1);',
            '  background: rgba(255,255,255,0.1);',
            '}',
            '.admin-sidebar, .tutor-sidebar {',
            '  display: flex !important;',
            '  flex-direction: column !important;',
            '}',
            '@media (max-width: 768px) {',
            '  .admin-sidebar.collapsed, .tutor-sidebar.collapsed, .dashboard-sidebar.collapsed {',
            '    width: 100% !important;',
            '    min-width: unset !important;',
            '    padding: 20px 0 !important;',
            '  }',
            '  .admin-sidebar.collapsed .admin-nav a span,',
            '  .tutor-sidebar.collapsed .tutor-nav a span {',
            '    display: inline !important;',
            '  }',
            '  .admin-sidebar.collapsed .admin-nav a,',
            '  .tutor-sidebar.collapsed .tutor-nav a {',
            '    justify-content: flex-start !important;',
            '    padding: 12px 15px !important;',
            '  }',
            '  .admin-sidebar.collapsed .admin-nav i,',
            '  .tutor-sidebar.collapsed .tutor-nav i {',
            '    margin-right: 10px !important;',
            '    font-size: 1rem !important;',
            '  }',
            '  .admin-sidebar.collapsed .admin-brand h1,',
            '  .admin-sidebar.collapsed .admin-brand p,',
            '  .tutor-sidebar.collapsed .tutor-brand h1,',
            '  .tutor-sidebar.collapsed .tutor-brand p,',
            '  .dashboard-sidebar.collapsed .sidebar-brand h2,',
            '  .dashboard-sidebar.collapsed .sidebar-brand span {',
            '    display: block !important;',
            '  }',
            '  .admin-sidebar.collapsed ~ .admin-main,',
            '  .tutor-sidebar.collapsed ~ .tutor-main,',
            '  .admin-main.sidebar-collapsed,',
            '  .tutor-main.sidebar-collapsed {',
            '    margin-left: 0 !important;',
            '  }',
            '}'
        ].join('\n');
        document.head.appendChild(style);

        var collapseBtn = document.createElement('button');
        collapseBtn.className = 'sidebar-collapse-btn';
        collapseBtn.setAttribute('aria-label', 'Toggle sidebar');

        var saved = localStorage.getItem('sidebarCollapsed') === 'true';
        if (saved) {
            sidebar.classList.add('collapsed');
            main.classList.add('sidebar-collapsed');
            collapseBtn.innerHTML = '<i class="fas fa-chevron-right"></i>';
        } else {
            collapseBtn.innerHTML = '<i class="fas fa-chevron-left"></i>';
        }

        navEl.parentNode.insertBefore(collapseBtn, navEl.nextSibling);

        collapseBtn.addEventListener('click', function() {
            var isCollapsed = sidebar.classList.toggle('collapsed');
            main.classList.toggle('sidebar-collapsed', isCollapsed);
            collapseBtn.innerHTML = isCollapsed
                ? '<i class="fas fa-chevron-right"></i>'
                : '<i class="fas fa-chevron-left"></i>';
            localStorage.setItem('sidebarCollapsed', isCollapsed);
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initCollapsibleSidebar);
    } else {
        initCollapsibleSidebar();
    }
})();
