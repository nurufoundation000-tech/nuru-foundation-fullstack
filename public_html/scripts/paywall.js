(function () {
    'use strict';

    var PAYMENT_PAGE = '/student-dashboard/payment.html';

    function isPaymentPage() {
        return window.location.pathname.indexOf('/student-dashboard/payment') === 0;
    }

    function redirectToPayment() {
        if (!isPaymentPage()) {
            window.location.replace(PAYMENT_PAGE);
        }
    }

    function handleLockedPayload(data) {
        if (data && (data.locked === true || data.isLocked === true)) {
            redirectToPayment();
            return true;
        }
        return false;
    }

    // Page-level lock check: locked students may only access the payment tab.
    function checkLock() {
        var token = sessionStorage.getItem('token');
        if (!token || isPaymentPage()) return;

        fetch('/api/student/is-locked', {
            headers: { 'Authorization': 'Bearer ' + token }
        }).then(function (res) {
            return res.json().catch(function () { return {}; });
        }).then(function (data) {
            if (data && data.isLocked === true) {
                redirectToPayment();
            }
        }).catch(function () {});
    }

    // Patch the shared fetchAPI helper (dashboard.js) so any 403 {locked:true}
    // response bounces the student to the payment tab instead of failing silently.
    function patchFetchAPI() {
        if (typeof window.fetchAPI !== 'function') return;
        var original = window.fetchAPI;
        window.fetchAPI = function (endpoint, options) {
            return original(endpoint, options).then(function (data) {
                handleLockedPayload(data);
                return data;
            });
        };
        if (window.DashboardUtils && typeof window.DashboardUtils.fetchAPI === 'function') {
            window.DashboardUtils.fetchAPI = window.fetchAPI;
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () {
            patchFetchAPI();
            checkLock();
        });
    } else {
        patchFetchAPI();
        checkLock();
    }
})();
