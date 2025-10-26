// Admin Dashboard functionality for full database management
class AdminDashboard {
    constructor() {
        this.currentTable = null;
        this.currentPage = 1;
        this.searchQuery = '';
        this.tables = [
            'users', 'courses', 'lessons', 'enrollments',
            'assignments', 'submissions', 'lesson-progress'
        ];
        this.tableConfigs = this.getTableConfigs();
        this.init();
    }

    init() {
        this.checkAuth();
        this.setupEventListeners();
        this.loadDashboardStats();
        this.renderTableButtons();
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
            if (payload.role !== 'admin') {
                this.showMessage('Access denied. Only admins can access this page.', 'error');
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
        // Table selection
        document.getElementById('table-buttons').addEventListener('click', (e) => {
            if (e.target.classList.contains('table-btn')) {
                this.selectTable(e.target.dataset.table);
            }
        });

        // Search
        document.getElementById('search-input').addEventListener('input', (e) => {
            this.searchQuery = e.target.value;
            this.loadTableData();
        });

        // Add record
        document.getElementById('add-record-btn').addEventListener('click', () => {
            this.openModal(null);
        });

        // Refresh
        document.getElementById('refresh-btn').addEventListener('click', () => {
            this.loadTableData();
        });

        // Modal
        document.getElementById('close-modal').addEventListener('click', () => {
            document.getElementById('record-modal').style.display = 'none';
        });

        document.getElementById('record-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveRecord();
        });

        // Close modal when clicking outside
        window.addEventListener('click', (e) => {
            const modal = document.getElementById('record-modal');
            if (e.target === modal) {
                modal.style.display = 'none';
            }
        });
    }

    getTableConfigs() {
        return {
            users: {
                displayName: 'Users',
                columns: [
                    { key: 'id', label: 'ID', type: 'number' },
                    { key: 'username', label: 'Username', type: 'text' },
                    { key: 'email', label: 'Email', type: 'email' },
                    { key: 'fullName', label: 'Full Name', type: 'text' },
                    { key: 'role.name', label: 'Role', type: 'text' },
                    { key: 'isActive', label: 'Active', type: 'boolean' },
                    { key: 'dateJoined', label: 'Joined', type: 'date' }
                ],
                formFields: [
                    { key: 'username', label: 'Username', type: 'text', required: true },
                    { key: 'email', label: 'Email', type: 'email', required: true },
                    { key: 'passwordHash', label: 'Password Hash', type: 'password', required: true },
                    { key: 'fullName', label: 'Full Name', type: 'text' },
                    { key: 'bio', label: 'Bio', type: 'textarea' },
                    { key: 'roleId', label: 'Role ID', type: 'number', required: true },
                    { key: 'isActive', label: 'Active', type: 'checkbox' }
                ]
            },
            roles: {
                displayName: 'Roles',
                columns: [
                    { key: 'id', label: 'ID', type: 'number' },
                    { key: 'name', label: 'Name', type: 'text' },
                    { key: '_count.users', label: 'Users Count', type: 'number' }
                ],
                formFields: [
                    { key: 'name', label: 'Name', type: 'text', required: true }
                ]
            },
            courses: {
                displayName: 'Courses',
                columns: [
                    { key: 'id', label: 'ID', type: 'number' },
                    { key: 'title', label: 'Title', type: 'text' },
                    { key: 'tutor.username', label: 'Tutor', type: 'text' },
                    { key: 'category', label: 'Category', type: 'text' },
                    { key: 'level', label: 'Level', type: 'text' },
                    { key: 'isPublished', label: 'Published', type: 'boolean' },
                    { key: '_count.enrollments', label: 'Enrollments', type: 'number' }
                ],
                formFields: [
                    { key: 'tutorId', label: 'Tutor ID', type: 'number', required: true },
                    { key: 'title', label: 'Title', type: 'text', required: true },
                    { key: 'description', label: 'Description', type: 'textarea' },
                    { key: 'category', label: 'Category', type: 'text' },
                    { key: 'level', label: 'Level', type: 'text' },
                    { key: 'thumbnailUrl', label: 'Thumbnail URL', type: 'url' },
                    { key: 'isPublished', label: 'Published', type: 'checkbox' }
                ]
            },
            lessons: {
                displayName: 'Lessons',
                columns: [
                    { key: 'id', label: 'ID', type: 'number' },
                    { key: 'title', label: 'Title', type: 'text' },
                    { key: 'course.title', label: 'Course', type: 'text' },
                    { key: 'orderIndex', label: 'Order', type: 'number' },
                    { key: 'videoUrl', label: 'Video URL', type: 'url' }
                ],
                formFields: [
                    { key: 'courseId', label: 'Course ID', type: 'number', required: true },
                    { key: 'title', label: 'Title', type: 'text', required: true },
                    { key: 'content', label: 'Content', type: 'textarea' },
                    { key: 'videoUrl', label: 'Video URL', type: 'url' },
                    { key: 'orderIndex', label: 'Order Index', type: 'number' }
                ]
            },
            enrollments: {
                displayName: 'Enrollments',
                columns: [
                    { key: 'id', label: 'ID', type: 'number' },
                    { key: 'student.username', label: 'Student', type: 'text' },
                    { key: 'course.title', label: 'Course', type: 'text' },
                    { key: 'progress', label: 'Progress', type: 'number' },
                    { key: 'enrolledAt', label: 'Enrolled At', type: 'date' }
                ],
                formFields: [
                    { key: 'studentId', label: 'Student ID', type: 'number', required: true },
                    { key: 'courseId', label: 'Course ID', type: 'number', required: true },
                    { key: 'progress', label: 'Progress', type: 'number' }
                ]
            },
            assignments: {
                displayName: 'Assignments',
                columns: [
                    { key: 'id', label: 'ID', type: 'number' },
                    { key: 'title', label: 'Title', type: 'text' },
                    { key: 'lesson.title', label: 'Lesson', type: 'text' },
                    { key: 'maxScore', label: 'Max Score', type: 'number' },
                    { key: '_count.submissions', label: 'Submissions', type: 'number' }
                ],
                formFields: [
                    { key: 'lessonId', label: 'Lesson ID', type: 'number', required: true },
                    { key: 'title', label: 'Title', type: 'text', required: true },
                    { key: 'description', label: 'Description', type: 'textarea' },
                    { key: 'maxScore', label: 'Max Score', type: 'number' }
                ]
            },
            submissions: {
                displayName: 'Submissions',
                columns: [
                    { key: 'id', label: 'ID', type: 'number' },
                    { key: 'student.username', label: 'Student', type: 'text' },
                    { key: 'assignment.title', label: 'Assignment', type: 'text' },
                    { key: 'grade', label: 'Grade', type: 'number' },
                    { key: 'submittedAt', label: 'Submitted At', type: 'date' }
                ],
                formFields: [
                    { key: 'assignmentId', label: 'Assignment ID', type: 'number', required: true },
                    { key: 'studentId', label: 'Student ID', type: 'number', required: true },
                    { key: 'codeSubmission', label: 'Code Submission', type: 'textarea' },
                    { key: 'grade', label: 'Grade', type: 'number' },
                    { key: 'feedback', label: 'Feedback', type: 'textarea' }
                ]
            },
            'lesson-progress': {
                displayName: 'Lesson Progress',
                columns: [
                    { key: 'id', label: 'ID', type: 'number' },
                    { key: 'enrollment.student.username', label: 'Student', type: 'text' },
                    { key: 'lesson.title', label: 'Lesson', type: 'text' },
                    { key: 'isCompleted', label: 'Completed', type: 'boolean' }
                ],
                formFields: [
                    { key: 'enrollmentId', label: 'Enrollment ID', type: 'number', required: true },
                    { key: 'lessonId', label: 'Lesson ID', type: 'number', required: true },
                    { key: 'isCompleted', label: 'Completed', type: 'checkbox' }
                ]
            },
            'moderation-logs': {
                displayName: 'Moderation Logs',
                columns: [
                    { key: 'id', label: 'ID', type: 'number' },
                    { key: 'moderator.username', label: 'Moderator', type: 'text' },
                    { key: 'action', label: 'Action', type: 'text' },
                    { key: 'targetUser.username', label: 'Target User', type: 'text' },
                    { key: 'createdAt', label: 'Created At', type: 'date' }
                ],
                formFields: [
                    { key: 'moderatorId', label: 'Moderator ID', type: 'number', required: true },
                    { key: 'action', label: 'Action', type: 'text', required: true },
                    { key: 'targetUserId', label: 'Target User ID', type: 'number' },
                    { key: 'targetCourseId', label: 'Target Course ID', type: 'number' },
                    { key: 'details', label: 'Details', type: 'textarea' }
                ]
            },
            'admin-actions': {
                displayName: 'Admin Actions',
                columns: [
                    { key: 'id', label: 'ID', type: 'number' },
                    { key: 'admin.username', label: 'Admin', type: 'text' },
                    { key: 'actionType', label: 'Action Type', type: 'text' },
                    { key: 'description', label: 'Description', type: 'text' },
                    { key: 'createdAt', label: 'Created At', type: 'date' }
                ],
                formFields: [
                    { key: 'adminId', label: 'Admin ID', type: 'number', required: true },
                    { key: 'actionType', label: 'Action Type', type: 'text', required: true },
                    { key: 'description', label: 'Description', type: 'textarea' }
                ]
            },
            payments: {
                displayName: 'Payments',
                columns: [
                    { key: 'id', label: 'ID', type: 'number' },
                    { key: 'student.username', label: 'Student', type: 'text' },
                    { key: 'course.title', label: 'Course', type: 'text' },
                    { key: 'amount', label: 'Amount', type: 'number' },
                    { key: 'status', label: 'Status', type: 'text' },
                    { key: 'paymentDate', label: 'Payment Date', type: 'date' }
                ],
                formFields: [
                    { key: 'studentId', label: 'Student ID', type: 'number', required: true },
                    { key: 'courseId', label: 'Course ID', type: 'number' },
                    { key: 'amount', label: 'Amount', type: 'number', required: true },
                    { key: 'status', label: 'Status', type: 'text', required: true },
                    { key: 'providerRef', label: 'Provider Reference', type: 'text' }
                ]
            },
            messages: {
                displayName: 'Messages',
                columns: [
                    { key: 'id', label: 'ID', type: 'number' },
                    { key: 'sender.username', label: 'Sender', type: 'text' },
                    { key: 'receiver.username', label: 'Receiver', type: 'text' },
                    { key: 'message', label: 'Message', type: 'text' },
                    { key: 'isRead', label: 'Read', type: 'boolean' },
                    { key: 'sentAt', label: 'Sent At', type: 'date' }
                ],
                formFields: [
                    { key: 'senderId', label: 'Sender ID', type: 'number', required: true },
                    { key: 'receiverId', label: 'Receiver ID', type: 'number', required: true },
                    { key: 'message', label: 'Message', type: 'textarea', required: true }
                ]
            },
            'forum-posts': {
                displayName: 'Forum Posts',
                columns: [
                    { key: 'id', label: 'ID', type: 'number' },
                    { key: 'author.username', label: 'Author', type: 'text' },
                    { key: 'title', label: 'Title', type: 'text' },
                    { key: 'course.title', label: 'Course', type: 'text' },
                    { key: '_count.comments', label: 'Comments', type: 'number' },
                    { key: 'createdAt', label: 'Created At', type: 'date' }
                ],
                formFields: [
                    { key: 'authorId', label: 'Author ID', type: 'number', required: true },
                    { key: 'courseId', label: 'Course ID', type: 'number' },
                    { key: 'title', label: 'Title', type: 'text', required: true },
                    { key: 'content', label: 'Content', type: 'textarea', required: true }
                ]
            },
            'forum-comments': {
                displayName: 'Forum Comments',
                columns: [
                    { key: 'id', label: 'ID', type: 'number' },
                    { key: 'author.username', label: 'Author', type: 'text' },
                    { key: 'post.title', label: 'Post', type: 'text' },
                    { key: 'content', label: 'Content', type: 'text' },
                    { key: 'createdAt', label: 'Created At', type: 'date' }
                ],
                formFields: [
                    { key: 'postId', label: 'Post ID', type: 'number', required: true },
                    { key: 'authorId', label: 'Author ID', type: 'number', required: true },
                    { key: 'content', label: 'Content', type: 'textarea', required: true }
                ]
            },
            notifications: {
                displayName: 'Notifications',
                columns: [
                    { key: 'id', label: 'ID', type: 'number' },
                    { key: 'user.username', label: 'User', type: 'text' },
                    { key: 'title', label: 'Title', type: 'text' },
                    { key: 'body', label: 'Body', type: 'text' },
                    { key: 'isRead', label: 'Read', type: 'boolean' },
                    { key: 'createdAt', label: 'Created At', type: 'date' }
                ],
                formFields: [
                    { key: 'userId', label: 'User ID', type: 'number', required: true },
                    { key: 'title', label: 'Title', type: 'text', required: true },
                    { key: 'body', label: 'Body', type: 'textarea' }
                ]
            },
            badges: {
                displayName: 'Badges',
                columns: [
                    { key: 'id', label: 'ID', type: 'number' },
                    { key: 'key', label: 'Key', type: 'text' },
                    { key: 'title', label: 'Title', type: 'text' },
                    { key: 'description', label: 'Description', type: 'text' },
                    { key: '_count.userBadges', label: 'Users Count', type: 'number' }
                ],
                formFields: [
                    { key: 'key', label: 'Key', type: 'text', required: true },
                    { key: 'title', label: 'Title', type: 'text', required: true },
                    { key: 'description', label: 'Description', type: 'textarea' }
                ]
            },
            'user-badges': {
                displayName: 'User Badges',
                columns: [
                    { key: 'id', label: 'ID', type: 'number' },
                    { key: 'user.username', label: 'User', type: 'text' },
                    { key: 'badge.title', label: 'Badge', type: 'text' },
                    { key: 'awardedAt', label: 'Awarded At', type: 'date' }
                ],
                formFields: [
                    { key: 'userId', label: 'User ID', type: 'number', required: true },
                    { key: 'badgeId', label: 'Badge ID', type: 'number', required: true }
                ]
            },
            'course-reviews': {
                displayName: 'Course Reviews',
                columns: [
                    { key: 'id', label: 'ID', type: 'number' },
                    { key: 'reviewer.username', label: 'Reviewer', type: 'text' },
                    { key: 'course.title', label: 'Course', type: 'text' },
                    { key: 'rating', label: 'Rating', type: 'number' },
                    { key: 'comment', label: 'Comment', type: 'text' },
                    { key: 'createdAt', label: 'Created At', type: 'date' }
                ],
                formFields: [
                    { key: 'courseId', label: 'Course ID', type: 'number', required: true },
                    { key: 'reviewerId', label: 'Reviewer ID', type: 'number', required: true },
                    { key: 'rating', label: 'Rating', type: 'number', required: true },
                    { key: 'comment', label: 'Comment', type: 'textarea' }
                ]
            },
            tags: {
                displayName: 'Tags',
                columns: [
                    { key: 'id', label: 'ID', type: 'number' },
                    { key: 'name', label: 'Name', type: 'text' },
                    { key: '_count.courses', label: 'Courses Count', type: 'number' }
                ],
                formFields: [
                    { key: 'name', label: 'Name', type: 'text', required: true }
                ]
            },
            'course-tags': {
                displayName: 'Course Tags',
                columns: [
                    { key: 'id', label: 'ID', type: 'number' },
                    { key: 'course.title', label: 'Course', type: 'text' },
                    { key: 'tag.name', label: 'Tag', type: 'text' }
                ],
                formFields: [
                    { key: 'courseId', label: 'Course ID', type: 'number', required: true },
                    { key: 'tagId', label: 'Tag ID', type: 'number', required: true }
                ]
            },
            'course-notes': {
                displayName: 'Course Notes',
                columns: [
                    { key: 'id', label: 'ID', type: 'number' },
                    { key: 'tutor.username', label: 'Tutor', type: 'text' },
                    { key: 'course.title', label: 'Course', type: 'text' },
                    { key: 'title', label: 'Title', type: 'text' },
                    { key: 'createdAt', label: 'Created At', type: 'date' }
                ],
                formFields: [
                    { key: 'courseId', label: 'Course ID', type: 'number', required: true },
                    { key: 'tutorId', label: 'Tutor ID', type: 'number', required: true },
                    { key: 'title', label: 'Title', type: 'text', required: true },
                    { key: 'content', label: 'Content', type: 'textarea', required: true }
                ]
            },
            'oauth-accounts': {
                displayName: 'OAuth Accounts',
                columns: [
                    { key: 'id', label: 'ID', type: 'number' },
                    { key: 'user.username', label: 'User', type: 'text' },
                    { key: 'provider', label: 'Provider', type: 'text' },
                    { key: 'providerAccountId', label: 'Provider Account ID', type: 'text' },
                    { key: 'scope', label: 'Scope', type: 'text' }
                ],
                formFields: [
                    { key: 'userId', label: 'User ID', type: 'number', required: true },
                    { key: 'provider', label: 'Provider', type: 'text', required: true },
                    { key: 'providerAccountId', label: 'Provider Account ID', type: 'text', required: true },
                    { key: 'accessToken', label: 'Access Token', type: 'text' },
                    { key: 'refreshToken', label: 'Refresh Token', type: 'text' },
                    { key: 'expiresAt', label: 'Expires At', type: 'number' },
                    { key: 'scope', label: 'Scope', type: 'text' },
                    { key: 'tokenType', label: 'Token Type', type: 'text' }
                ]
            }
        };
    }

    renderTableButtons() {
        const container = document.getElementById('table-buttons');
        container.innerHTML = '';

        this.tables.forEach(table => {
            const config = this.tableConfigs[table];
            const button = document.createElement('button');
            button.className = 'table-btn';
            button.dataset.table = table;
            button.textContent = config.displayName;
            container.appendChild(button);
        });
    }

    selectTable(tableName) {
        this.currentTable = tableName;
        this.currentPage = 1;
        this.searchQuery = '';

        // Update button states
        document.querySelectorAll('.table-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.table === tableName);
        });

        // Show table section
        document.getElementById('table-section').style.display = 'block';
        document.getElementById('search-input').value = '';

        this.loadTableData();
    }

    async loadDashboardStats() {
        try {
            const token = localStorage.getItem('token');
            const endpoints = [
                { key: 'users', endpoint: '/api/admin/users?limit=1' },
                { key: 'courses', endpoint: '/api/admin/courses?limit=1' },
                { key: 'enrollments', endpoint: '/api/admin/enrollments?limit=1' },
                { key: 'submissions', endpoint: '/api/admin/submissions?limit=1' }
            ];

            for (const { key, endpoint } of endpoints) {
                try {
                    const response = await fetch(endpoint, {
                        headers: { 'Authorization': `Bearer ${token}` }
                    });
                    if (response.ok) {
                        const data = await response.json();
                        document.getElementById(`${key}-count`).textContent = data.pagination?.total || data.length || 0;
                    }
                } catch (error) {
                    console.error(`Error loading ${key} count:`, error);
                }
            }
        } catch (error) {
            console.error('Error loading dashboard stats:', error);
        }
    }

    async loadTableData() {
        if (!this.currentTable) return;

        try {
            const token = localStorage.getItem('token');
            let url = `/api/admin/${this.currentTable}?page=${this.currentPage}&limit=50`;

            if (this.searchQuery) {
                url += `&search=${encodeURIComponent(this.searchQuery)}`;
            }

            const response = await fetch(url, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            this.renderTable(data.data || data);
            this.renderPagination(data.pagination);
        } catch (error) {
            console.error('Error loading table data:', error);
            this.showMessage(`Error loading data: ${error.message}`, 'error');
        }
    }

    renderTable(data) {
        const config = this.tableConfigs[this.currentTable];
        const thead = document.getElementById('table-head');
        const tbody = document.getElementById('table-body');

        // Render headers
        thead.innerHTML = '<tr>' +
            config.columns.map(col => `<th>${col.label}</th>`).join('') +
            '<th class="actions-column">Actions</th>' +
            '</tr>';

        // Render rows
        tbody.innerHTML = data.map(row => {
            const cells = config.columns.map(col => {
                let value = this.getNestedValue(row, col.key);
                if (col.type === 'boolean') {
                    value = value ? 'Yes' : 'No';
                } else if (col.type === 'date' && value) {
                    value = new Date(value).toLocaleDateString();
                } else if (value === null || value === undefined) {
                    value = '-';
                }
                return `<td>${value}</td>`;
            }).join('');

            return `<tr>${cells}<td class="actions-column">
                <button class="btn btn-secondary btn-sm" onclick="window.adminDashboard.editRecord(${row.id})">Edit</button>
                <button class="btn btn-danger btn-sm" onclick="window.adminDashboard.deleteRecord(${row.id})">Delete</button>
            </td></tr>`;
        }).join('');
    }

    renderPagination(pagination) {
        if (!pagination || pagination.pages <= 1) {
            document.getElementById('pagination').innerHTML = '';
            return;
        }

        const container = document.getElementById('pagination');
        let html = '';

        // Previous button
        if (pagination.page > 1) {
            html += `<button class="pagination-btn" onclick="window.adminDashboard.changePage(${pagination.page - 1})">Previous</button>`;
        }

        // Page numbers
        const startPage = Math.max(1, pagination.page - 2);
        const endPage = Math.min(pagination.pages, pagination.page + 2);

        for (let i = startPage; i <= endPage; i++) {
            html += `<button class="pagination-btn ${i === pagination.page ? 'active' : ''}" onclick="window.adminDashboard.changePage(${i})">${i}</button>`;
        }

        // Next button
        if (pagination.page < pagination.pages) {
            html += `<button class="pagination-btn" onclick="window.adminDashboard.changePage(${pagination.page + 1})">Next</button>`;
        }

        container.innerHTML = html;
    }

    changePage(page) {
        this.currentPage = page;
        this.loadTableData();
    }

    openModal(recordId) {
        const modal = document.getElementById('record-modal');
        const form = document.getElementById('record-form');
        const title = document.getElementById('modal-title');
        const message = document.getElementById('modal-message');

        message.innerHTML = '';
        title.textContent = recordId ? 'Edit Record' : 'Add New Record';

        const config = this.tableConfigs[this.currentTable];
        form.innerHTML = '';

        if (recordId) {
            // Load existing record data
            this.loadRecordForEdit(recordId);
        } else {
            // Generate form fields for new record
            config.formFields.forEach(field => {
                const fieldHtml = this.generateFormField(field);
                form.insertAdjacentHTML('beforeend', fieldHtml);
            });
        }

        modal.style.display = 'block';
    }

    generateFormField(field) {
        const { key, label, type, required } = field;
        const requiredAttr = required ? 'required' : '';

        let inputHtml = '';

        switch (type) {
            case 'textarea':
                inputHtml = `<textarea id="${key}" name="${key}" ${requiredAttr}></textarea>`;
                break;
            case 'checkbox':
                inputHtml = `<input type="checkbox" id="${key}" name="${key}" value="true">`;
                break;
            case 'select':
                inputHtml = `<select id="${key}" name="${key}" ${requiredAttr}></select>`;
                break;
            default:
                inputHtml = `<input type="${type}" id="${key}" name="${key}" ${requiredAttr}>`;
        }

        return `
            <div class="form-group">
                <label for="${key}">${label}${required ? ' *' : ''}</label>
                ${inputHtml}
            </div>
        `;
    }

    async loadRecordForEdit(recordId) {
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`/api/admin/${this.currentTable}/${recordId}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const record = await response.json();
            this.populateForm(record);
        } catch (error) {
            console.error('Error loading record:', error);
            this.showMessage(`Error loading record: ${error.message}`, 'error');
        }
    }

    populateForm(record) {
        const config = this.tableConfigs[this.currentTable];
        const form = document.getElementById('record-form');

        form.innerHTML = '';

        // Add hidden ID field for updates
        form.insertAdjacentHTML('afterbegin', `<input type="hidden" name="id" value="${record.id}">`);

        config.formFields.forEach(field => {
            const fieldHtml = this.generateFormField(field);
            form.insertAdjacentHTML('beforeend', fieldHtml);

            // Set value
            const value = this.getNestedValue(record, field.key);
            const element = document.getElementById(field.key);

            if (element) {
                if (field.type === 'checkbox') {
                    element.checked = value === true;
                } else {
                    element.value = value || '';
                }
            }
        });
    }

    async saveRecord() {
        try {
            const formData = new FormData(document.getElementById('record-form'));
            const data = Object.fromEntries(formData.entries());

            // Convert checkbox values
            const config = this.tableConfigs[this.currentTable];
            config.formFields.forEach(field => {
                if (field.type === 'checkbox') {
                    data[field.key] = formData.has(field.key);
                } else if (field.type === 'number') {
                    const value = data[field.key];
                    data[field.key] = value ? parseInt(value) : null;
                }
            });

            const token = localStorage.getItem('token');
            const isUpdate = data.id;
            const url = isUpdate
                ? `/api/admin/${this.currentTable}/${data.id}`
                : `/api/admin/${this.currentTable}`;

            delete data.id; // Remove ID from payload for updates

            const response = await fetch(url, {
                method: isUpdate ? 'PUT' : 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(data)
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || `HTTP ${response.status}: ${response.statusText}`);
            }

            document.getElementById('record-modal').style.display = 'none';
            this.showMessage(`Record ${isUpdate ? 'updated' : 'created'} successfully`, 'success');
            this.loadTableData();
            this.loadDashboardStats();
        } catch (error) {
            console.error('Error saving record:', error);
            this.showMessage(`Error saving record: ${error.message}`, 'error');
        }
    }

    async deleteRecord(recordId) {
        if (!confirm('Are you sure you want to delete this record? This action cannot be undone.')) {
            return;
        }

        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`/api/admin/${this.currentTable}/${recordId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || `HTTP ${response.status}: ${response.statusText}`);
            }

            this.showMessage('Record deleted successfully', 'success');
            this.loadTableData();
            this.loadDashboardStats();
        } catch (error) {
            console.error('Error deleting record:', error);
            this.showMessage(`Error deleting record: ${error.message}`, 'error');
        }
    }

    editRecord(recordId) {
        this.openModal(recordId);
    }

    getNestedValue(obj, path) {
        return path.split('.').reduce((current, key) => current?.[key], obj);
    }

    showMessage(message, type = 'info') {
        const container = document.getElementById('modal-message');
        container.innerHTML = `<div class="${type}">${message}</div>`;

        // Auto-hide after 5 seconds
        setTimeout(() => {
            container.innerHTML = '';
        }, 5000);
    }
}

// Initialize admin dashboard when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.adminDashboard = new AdminDashboard();
});
