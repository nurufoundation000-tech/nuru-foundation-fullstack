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
