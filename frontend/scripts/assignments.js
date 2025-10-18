// Assignments API functions
const API_BASE = 'http://localhost:5000/api';

async function fetchAssignment(id) {
    const token = localStorage.getItem('token');
    const response = await fetch(`${API_BASE}/assignments/${id}`, {
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        }
    });

    if (!response.ok) {
        throw new Error('Failed to fetch assignment');
    }

    return await response.json();
}

async function createAssignment(assignmentData) {
    const token = localStorage.getItem('token');
    const response = await fetch(`${API_BASE}/assignments`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(assignmentData)
    });

    if (!response.ok) {
        throw new Error('Failed to create assignment');
    }

    return await response.json();
}

async function submitAssignment(assignmentId, codeSubmission) {
    const token = localStorage.getItem('token');
    const response = await fetch(`${API_BASE}/assignments/${assignmentId}/submit`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ codeSubmission })
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to submit assignment');
    }

    return await response.json();
}
