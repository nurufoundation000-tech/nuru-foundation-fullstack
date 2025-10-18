// Progress API functions
const API_BASE = 'http://localhost:5000/api';

async function updateProgress(enrollmentId, progress) {
    const token = localStorage.getItem('token');
    const response = await fetch(`${API_BASE}/courses/${enrollmentId}/progress`, {
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
    const token = localStorage.getItem('token');
    const response = await fetch(`${API_BASE}/courses/progress`, {
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
