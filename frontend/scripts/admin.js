// Admin panel functionality for tutors
class AdminPanel {
    constructor() {
        this.selectedCourseId = null;
        this.courses = [];
        this.students = [];
        this.enrolledStudents = [];
        this.notes = [];
        this.init();
    }

    init() {
        this.checkAuth();
        this.loadCourses();
        this.setupEventListeners();
    }

    checkAuth() {
        const token = localStorage.getItem('token');
        if (!token) {
            window.location.href = 'login.html';
            return;
        }

        // Decode token to check role
        try {
            const payload = JSON.parse(atob(token.split('.')[1]));
            if (payload.role !== 'tutor') {
                this.showMessage('Access denied. Only tutors can access this page.', 'error');
                setTimeout(() => {
                    window.location.href = 'dashboard.html';
                }, 2000);
            }
        } catch (error) {
            console.error('Error decoding token:', error);
            window.location.href = 'login.html';
        }
    }

    setupEventListeners() {
        // Student search
        document.getElementById('student-search').addEventListener('input', (e) => {
            this.filterStudents(e.target.value);
        });

        // Note form submission
        document.getElementById('note-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.addNote();
        });

        // Edit note modal
        document.getElementById('close-edit-modal').addEventListener('click', () => {
            document.getElementById('edit-note-modal').style.display = 'none';
        });

        // Edit note form submission
        document.getElementById('edit-note-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.updateNote();
        });

        // Close modal when clicking outside
        window.addEventListener('click', (e) => {
            const modal = document.getElementById('edit-note-modal');
            if (e.target === modal) {
                modal.style.display = 'none';
            }
        });
    }

    async loadCourses() {
        try {
            const token = localStorage.getItem('token');
            const response = await fetch('/api/courses', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) {
                throw new Error('Failed to load courses');
            }

            // Filter to only show tutor's own courses
            const allCourses = await response.json();
            this.courses = allCourses.filter(course => course.tutorId === this.getCurrentUserId());

            this.renderCourses();
        } catch (error) {
            console.error('Error loading courses:', error);
            this.showMessage('Failed to load courses', 'error');
        }
    }

    renderCourses() {
        const container = document.getElementById('courses-container');

        if (this.courses.length === 0) {
            container.innerHTML = '<p>No courses found. Create a course first.</p>';
            return;
        }

        container.innerHTML = this.courses.map(course => `
            <div class="course-item ${this.selectedCourseId === course.id ? 'selected' : ''}"
                 data-course-id="${course.id}">
                <h3>${course.title}</h3>
                <p>${course.description || 'No description'}</p>
                <small>${course._count.enrollments} enrolled students</small>
            </div>
        `).join('');

        // Add click listeners
        container.querySelectorAll('.course-item').forEach(item => {
            item.addEventListener('click', () => {
                this.selectCourse(parseInt(item.dataset.courseId));
            });
        });
    }

    async selectCourse(courseId) {
        this.selectedCourseId = courseId;
        this.renderCourses();

        // Show management sections
        document.getElementById('enrollment-section').style.display = 'block';
        document.getElementById('notes-section').style.display = 'block';

        // Update course title
        const course = this.courses.find(c => c.id === courseId);
        document.getElementById('selected-course-title').textContent = `Managing: ${course.title}`;

        // Load enrolled students and notes
        await Promise.all([
            this.loadEnrolledStudents(),
            this.loadNotes(),
            this.loadAvailableStudents()
        ]);
    }

    async loadAvailableStudents() {
        try {
            const token = localStorage.getItem('token');
            const response = await fetch('/api/users/students', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) {
                throw new Error('Failed to load students');
            }

            this.students = await response.json();
            this.renderAvailableStudents();
        } catch (error) {
            console.error('Error loading students:', error);
            this.showMessage('Failed to load available students', 'error');
        }
    }

    renderAvailableStudents() {
        const container = document.getElementById('students-list');
        const enrolledIds = this.enrolledStudents.map(s => s.student.id);

        const availableStudents = this.students.filter(student => !enrolledIds.includes(student.id));

        if (availableStudents.length === 0) {
            container.innerHTML = '<p>No available students to enroll</p>';
            return;
        }

        container.innerHTML = availableStudents.map(student => `
            <div class="student-item">
                <div class="student-info">
                    <div class="student-avatar">
                        ${student.fullName.charAt(0).toUpperCase()}
                    </div>
                    <div>
                        <div><strong>${student.fullName}</strong></div>
                        <div>${student.email}</div>
                    </div>
                </div>
                <button class="btn btn-success" onclick="adminPanel.enrollStudent(${student.id})">
                    Enroll
                </button>
            </div>
        `).join('');
    }

    async loadEnrolledStudents() {
        if (!this.selectedCourseId) return;

        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`/api/courses/${this.selectedCourseId}/enrollments`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) {
                throw new Error('Failed to load enrolled students');
            }

            this.enrolledStudents = await response.json();
            this.renderEnrolledStudents();
        } catch (error) {
            console.error('Error loading enrolled students:', error);
            this.showMessage('Failed to load enrolled students', 'error');
        }
    }

    renderEnrolledStudents() {
        const container = document.getElementById('enrolled-list');

        if (this.enrolledStudents.length === 0) {
            container.innerHTML = '<p>No students enrolled yet</p>';
            return;
        }

        container.innerHTML = this.enrolledStudents.map(enrollment => `
            <div class="student-item">
                <div class="student-info">
                    <div class="student-avatar">
                        ${enrollment.student.fullName.charAt(0).toUpperCase()}
                    </div>
                    <div>
                        <div><strong>${enrollment.student.fullName}</strong></div>
                        <div>${enrollment.student.email}</div>
                        <div>Enrolled: ${new Date(enrollment.enrolledAt).toLocaleDateString()}</div>
                    </div>
                </div>
                <button class="btn btn-danger" onclick="adminPanel.removeStudent(${enrollment.student.id})">
                    Remove
                </button>
            </div>
        `).join('');
    }

    filterStudents(searchTerm) {
        const filtered = this.students.filter(student =>
            student.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
            student.email.toLowerCase().includes(searchTerm.toLowerCase())
        );

        const container = document.getElementById('students-list');
        const enrolledIds = this.enrolledStudents.map(s => s.student.id);
        const availableStudents = filtered.filter(student => !enrolledIds.includes(student.id));

        if (availableStudents.length === 0) {
            container.innerHTML = '<p>No matching students found</p>';
            return;
        }

        container.innerHTML = availableStudents.map(student => `
            <div class="student-item">
                <div class="student-info">
                    <div class="student-avatar">
                        ${student.fullName.charAt(0).toUpperCase()}
                    </div>
                    <div>
                        <div><strong>${student.fullName}</strong></div>
                        <div>${student.email}</div>
                    </div>
                </div>
                <button class="btn btn-success" onclick="adminPanel.enrollStudent(${student.id})">
                    Enroll
                </button>
            </div>
        `).join('');
    }

    async enrollStudent(studentId) {
        if (!this.selectedCourseId) return;

        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`/api/courses/${this.selectedCourseId}/enroll-student`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ studentId })
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || 'Failed to enroll student');
            }

            this.showMessage('Student enrolled successfully', 'success');
            await this.loadEnrolledStudents();
            this.renderAvailableStudents();
        } catch (error) {
            console.error('Error enrolling student:', error);
            this.showMessage(error.message, 'error');
        }
    }

    async removeStudent(studentId) {
        if (!this.selectedCourseId) return;

        if (!confirm('Are you sure you want to remove this student from the course?')) {
            return;
        }

        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`/api/courses/${this.selectedCourseId}/enroll-student/${studentId}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || 'Failed to remove student');
            }

            this.showMessage('Student removed successfully', 'success');
            await this.loadEnrolledStudents();
            this.renderAvailableStudents();
        } catch (error) {
            console.error('Error removing student:', error);
            this.showMessage(error.message, 'error');
        }
    }

    async loadNotes() {
        if (!this.selectedCourseId) return;

        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`/api/courses/${this.selectedCourseId}/notes`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) {
                throw new Error('Failed to load notes');
            }

            this.notes = await response.json();
            this.renderNotes();
        } catch (error) {
            console.error('Error loading notes:', error);
            this.showMessage('Failed to load notes', 'error');
        }
    }

    renderNotes() {
        const container = document.getElementById('notes-container');

        if (this.notes.length === 0) {
            container.innerHTML = '<p>No notes or announcements yet</p>';
            return;
        }

        container.innerHTML = this.notes.map(note => `
            <div class="note-item">
                <div class="note-header">
                    <div class="note-title">${note.title}</div>
                    <div class="note-date">${new Date(note.createdAt).toLocaleDateString()}</div>
                </div>
                <div class="note-content">${note.content}</div>
                <div style="margin-top: 10px;">
                    <button class="btn btn-primary" onclick="adminPanel.editNote(${note.id}, '${note.title}', '${note.content.replace(/'/g, "\\'")}')">
                        Edit
                    </button>
                    <button class="btn btn-danger" onclick="adminPanel.deleteNote(${note.id})">
                        Delete
                    </button>
                </div>
            </div>
        `).join('');
    }

    async addNote() {
        if (!this.selectedCourseId) return;

        const title = document.getElementById('note-title').value.trim();
        const content = document.getElementById('note-content').value.trim();

        if (!title || !content) {
            this.showMessage('Please fill in all fields', 'error');
            return;
        }

        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`/api/courses/${this.selectedCourseId}/notes`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ title, content })
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || 'Failed to add note');
            }

            this.showMessage('Note added successfully', 'success');
            document.getElementById('note-form').reset();
            await this.loadNotes();
        } catch (error) {
            console.error('Error adding note:', error);
            this.showMessage(error.message, 'error');
        }
    }

    editNote(noteId, title, content) {
        document.getElementById('edit-note-id').value = noteId;
        document.getElementById('edit-note-title').value = title;
        document.getElementById('edit-note-content').value = content;
        document.getElementById('edit-note-modal').style.display = 'block';
    }

    async updateNote() {
        const noteId = document.getElementById('edit-note-id').value;
        const title = document.getElementById('edit-note-title').value.trim();
        const content = document.getElementById('edit-note-content').value.trim();

        if (!title || !content) {
            this.showMessage('Please fill in all fields', 'error');
            return;
        }

        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`/api/courses/${this.selectedCourseId}/notes/${noteId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ title, content })
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || 'Failed to update note');
            }

            this.showMessage('Note updated successfully', 'success');
            document.getElementById('edit-note-modal').style.display = 'none';
            await this.loadNotes();
        } catch (error) {
            console.error('Error updating note:', error);
            this.showMessage(error.message, 'error');
        }
    }

    async deleteNote(noteId) {
        if (!confirm('Are you sure you want to delete this note?')) {
            return;
        }

        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`/api/courses/${this.selectedCourseId}/notes/${noteId}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || 'Failed to delete note');
            }

            this.showMessage('Note deleted successfully', 'success');
            await this.loadNotes();
        } catch (error) {
            console.error('Error deleting note:', error);
            this.showMessage(error.message, 'error');
        }
    }

    getCurrentUserId() {
        const token = localStorage.getItem('token');
        if (!token) return null;

        try {
            const payload = JSON.parse(atob(token.split('.')[1]));
            return payload.userId;
        } catch (error) {
            console.error('Error decoding token:', error);
            return null;
        }
    }

    showMessage(message, type = 'info') {
        const container = document.getElementById('message-container');
        container.innerHTML = `<div class="${type}">${message}</div>`;

        // Auto-hide after 5 seconds
        setTimeout(() => {
            container.innerHTML = '';
        }, 5000);
    }
}

// Initialize admin panel when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.adminPanel = new AdminPanel();
});
