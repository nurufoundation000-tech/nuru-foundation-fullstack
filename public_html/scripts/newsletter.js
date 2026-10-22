(function () {
    if (window.__nuruNewsletterInitialized) return;
    window.__nuruNewsletterInitialized = true;

    function setStatus(statusDiv, message, color) {
        if (!statusDiv) return;
        statusDiv.textContent = message;
        statusDiv.style.color = color;
    }

    document.addEventListener('submit', async function (event) {
        var target = event.target;
        if (!target || !target.closest) return;

        var form = target.closest('#newsletterForm, .newsletter-form');
        if (!form) return;

        event.preventDefault();

        var emailInput = form.querySelector('#newsletterEmail, input[type="email"]');
        var btn = form.querySelector('#newsletterBtn, button[type="submit"]');
        var statusDiv = form.parentElement
            ? form.parentElement.querySelector('#newsletterStatus')
            : null;

        if (!emailInput) return;

        var email = emailInput.value.trim();
        if (!email) {
            setStatus(statusDiv, 'Please enter your email address.', '#e74c3c');
            return;
        }

        if (btn) {
            btn.disabled = true;
            btn.textContent = 'Subscribing...';
        }
        setStatus(statusDiv, '', '');

        try {
            var API_BASE = window.location.hostname === 'localhost' ? 'http://localhost:5000/api' : '/api';
            var response = await fetch(API_BASE + '/newsletter/subscribe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: email })
            });
            var data = await response.json();

            if (response.ok && data.success) {
                setStatus(statusDiv, data.message, '#27ae60');
                emailInput.value = '';
            } else {
                setStatus(statusDiv, data.error || 'Subscription failed.', '#e74c3c');
            }
        } catch (error) {
            setStatus(statusDiv, 'Network error. Please try again.', '#e74c3c');
        }

        if (btn) {
            btn.disabled = false;
            btn.textContent = 'Subscribe';
        }
    });

    document.addEventListener('mouseover', function (event) {
        var target = event.target;
        if (!target || !target.closest) return;
        var badge = target.closest('.badge');
        if (badge && !badge.contains(event.relatedTarget)) {
            badge.style.transform = 'translateY(-3px)';
            badge.style.background = 'rgba(255, 255, 255, 0.15)';
        }
    });

    document.addEventListener('mouseout', function (event) {
        var target = event.target;
        if (!target || !target.closest) return;
        var badge = target.closest('.badge');
        if (badge && !badge.contains(event.relatedTarget)) {
            badge.style.transform = 'translateY(0)';
            badge.style.background = 'rgba(255, 255, 255, 0.1)';
        }
    });

    var yearElement = document.getElementById('current-year');
    if (yearElement) {
        yearElement.textContent = new Date().getFullYear();
    }
})();
