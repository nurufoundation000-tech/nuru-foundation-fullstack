async function authFetch(url, options = {}) {
    const token = sessionStorage.getItem('token');
    if (!token) {
        window.location.href = '/login.html';
        return null;
    }
    const headers = { ...options.headers, 'Authorization': Bearer $\{token\} };
    const response = await fetch(url, { ...options, headers });
    if (response.status === 401) {
        sessionStorage.removeItem('token');
        sessionStorage.removeItem('user');
        window.location.href = '/login.html';
        return null;
    }
    return response;
}
// Progress API functions
const API_BASE = '/api';

async function updateProgress(enrollmentId, progress) {
    const token = sessionStorage.getItem('token');
    const response = await fetch(`${API_BASE}/student/courses/${enrollmentId}/progress`, {
        method: 'PUT',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ progress })
    });

    if (!response.ok) {
        throw new Error('Failed to update progress');
    }

    return await response.json();
}

async function getUserProgress() {
    const token = sessionStorage.getItem('token');
    const response = await fetch(`${API_BASE}/student/courses/progress`, {
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        }
    });

    if (!response.ok) {
        throw new Error('Failed to fetch progress');
    }

    return await response.json();
}

