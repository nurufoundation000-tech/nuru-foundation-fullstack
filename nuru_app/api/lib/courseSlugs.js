const COURSE_SLUGS = {
    'python': { courseId: 1, name: 'Introduction to Programming', category: 'Programming' },
    'web-dev-1': { courseId: 2, name: 'Web Dev 1', category: 'Web Development' },
    'computer-packages': { courseId: 3, name: 'Computer Packages', category: 'Foundational' },
    'cybersecurity-1': { courseId: 4, name: 'Cybersecurity Level 1', category: 'Security' },
    'cybersecurity-2': { courseId: 5, name: 'Cybersecurity Level 2', category: 'Security' },
    'data-science': { courseId: 6, name: 'Data Science', category: 'Data' },
    'data-analysis': { courseId: 7, name: 'Data Analysis', category: 'Data' },
    'data-engineering': { courseId: 8, name: 'Data Engineering', category: 'Data' },
    'web-development-level-1': { courseId: 9, name: 'Web Development Level 1', category: 'Web Development' },
    'web-development-level-2': { courseId: 10, name: 'Web Development Level 2', category: 'Web Development' },
    'web-development-level-3': { courseId: 11, name: 'Web Development Level 3', category: 'Web Development' },
    'ai-essentials': { courseId: 12, name: 'AI Essentials', category: 'AI' },
    'soft-skills': { courseId: 13, name: 'Soft Skills', category: 'Life Skills' }
};

const SLUG_TO_COURSE = Object.fromEntries(
    Object.entries(COURSE_SLUGS).map(([slug, data]) => [data.courseId, slug])
);

module.exports = {
    COURSE_SLUGS,
    SLUG_TO_COURSE
};
