// Lessons API functions
const API_BASE = 'http://localhost:5000/api';

async function fetchLessons(courseId) {
    const token = localStorage.getItem('token');
    const response = await fetch(`${API_BASE}/lessons?courseId=${courseId}`, {
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        }
    });

    if (!response.ok) {
        throw new Error('Failed to fetch lessons');
    }

    return await response.json();
}

async function createLesson(lessonData) {
    const token = localStorage.getItem('token');
    const response = await fetch(`${API_BASE}/lessons`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(lessonData)
    });

    if (!response.ok) {
        throw new Error('Failed to create lesson');
    }

    return await response.json();
}

async function updateLesson(id, lessonData) {
    const token = localStorage.getItem('token');
    const response = await fetch(`${API_BASE}/lessons/${id}`, {
        method: 'PUT',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(lessonData)
    });

    if (!response.ok) {
        throw new Error('Failed to update lesson');
    }

    return await response.json();
}

async function deleteLesson(id) {
    const token = localStorage.getItem('token');
    const response = await fetch(`${API_BASE}/lessons/${id}`, {
        method: 'DELETE',
        headers: {
            'Authorization': `Bearer ${token}`
        }
    });

    if (!response.ok) {
        throw new Error('Failed to delete lesson');
    }

    return await response.json();
}

async function fetchLesson(id) {
    const token = localStorage.getItem('token');
    const response = await fetch(`${API_BASE}/lessons/${id}`, {
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        }
    });

    if (!response.ok) {
        throw new Error('Failed to fetch lesson');
    }

    return await response.json();
}

// Mark lesson as completed
async function markLessonCompleted(lessonId) {
    const token = localStorage.getItem('token');
    const response = await fetch(`${API_BASE}/lessons/${lessonId}/complete`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        }
    });

    if (!response.ok) {
        throw new Error('Failed to mark lesson as completed');
    }

    return await response.json();
}
