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

    // An unpaid deposit is a TOTAL block - the student may only use the payment tab.
    // A monthly-locked student still has free courses, so they are NOT redirected.
    function handleLockedPayload(data) {
        if (data && (data.lockLevel === 'deposit' || data.level === 'deposit')) {
            redirectToPayment();
            return true;
        }
        return false;
    }

    // Page-level lock check: only deposit-locked students are forced to the payment tab.
    function checkLock() {
        var token = sessionStorage.getItem('token') || localStorage.getItem('token');
        if (!token || isPaymentPage()) return;

        fetch('/api/student/is-locked', {
            headers: { 'Authorization': 'Bearer ' + token }
        }).then(function (res) {
            return res.json().catch(function () { return {}; });
        }).then(function (data) {
            if (data && (data.level === 'deposit' || data.depositUnpaid === true)) {
                redirectToPayment();
            }
        }).catch(function () {});
    }

    // Patch the shared fetchAPI helper (dashboard.js) so any 403 from a locked
    // paid course (or a deposit-blocked endpoint) bounces the student to payment.
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