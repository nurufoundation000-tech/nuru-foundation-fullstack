(function() {
    document.addEventListener('DOMContentLoaded', function() {
        document.getElementById('current-year').textContent = new Date().getFullYear();

        var newsletterForm = document.getElementById('newsletterForm');
        if (newsletterForm) {
            newsletterForm.addEventListener('submit', async function(e) {
                e.preventDefault();
                var emailInput = document.getElementById('newsletterEmail');
                var statusDiv = document.getElementById('newsletterStatus');
                var btn = document.getElementById('newsletterBtn');
                var email = emailInput.value.trim();

                if (!email) return;

                btn.disabled = true;
                btn.textContent = 'Subscribing...';
                statusDiv.textContent = '';

                try {
                    var API_BASE = window.location.hostname === 'localhost' ? 'http://localhost:5000/api' : '/api';
                    var response = await fetch(API_BASE + '/newsletter/subscribe', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ email: email })
                    });
                    var data = await response.json();

                    if (response.ok && data.success) {
                        statusDiv.textContent = data.message;
                        statusDiv.style.color = '#27ae60';
                        emailInput.value = '';
                    } else {
                        statusDiv.textContent = data.error || 'Subscription failed.';
                        statusDiv.style.color = '#e74c3c';
                    }
                } catch (error) {
                    statusDiv.textContent = 'Network error. Please try again.';
                    statusDiv.style.color = '#e74c3c';
                }

                btn.disabled = false;
                btn.textContent = 'Subscribe';
            });
        }

        var badges = document.querySelectorAll('.badge');
        badges.forEach(function(badge) {
            badge.addEventListener('mouseenter', function() {
                badge.style.transform = 'translateY(-3px)';
                badge.style.background = 'rgba(255, 255, 255, 0.15)';
            });

            badge.addEventListener('mouseleave', function() {
                badge.style.transform = 'translateY(0)';
                badge.style.background = 'rgba(255, 255, 255, 0.1)';
            });
        });
    });
})();
