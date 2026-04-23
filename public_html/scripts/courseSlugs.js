const COURSE_SLUGS = {
    1: { slug: 'python', name: 'Introduction to Programming' },
    2: { slug: 'web-dev-1', name: 'Web Dev 1' },
    3: { slug: 'computer-packages', name: 'Computer Packages' },
    4: { slug: 'cybersecurity-1', name: 'Cybersecurity Level 1' },
    5: { slug: 'cybersecurity-2', name: 'Cybersecurity Level 2' },
    6: { slug: 'data-science', name: 'Data Science' },
    7: { slug: 'data-analysis', name: 'Data Analysis' },
    8: { slug: 'data-engineering', name: 'Data Engineering' },
    9: { slug: 'web-development-level-1', name: 'Web Development Level 1' },
    10: { slug: 'web-development-level-2', name: 'Web Development Level 2' },
    11: { slug: 'web-development-level-3', name: 'Web Development Level 3' },
    12: { slug: 'ai-essentials', name: 'AI Essentials' },
    13: { slug: 'soft-skills', name: 'Soft Skills' }
};

function getCourseSlug(courseId) {
    return COURSE_SLUGS[courseId]?.slug || null;
}

function getCourseName(courseId) {
    return COURSE_SLUGS[courseId]?.name || 'Unknown Course';
}

window.COURSE_SLUGS = COURSE_SLUGS;
window.getCourseSlug = getCourseSlug;
window.getCourseName = getCourseName;
