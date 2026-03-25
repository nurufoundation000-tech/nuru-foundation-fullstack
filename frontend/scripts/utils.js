const escapeHtml = (str) => {
    if (str === null || str === undefined) return '';
    const div = document.createElement('div');
    div.textContent = String(str);
    return div.innerHTML;
};

const escapeAttr = (str) => {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
};

const setSecureToken = (token) => {
    try {
        sessionStorage.setItem('token', token);
    } catch (e) {
        console.error('Failed to store token:', e);
    }
};

const getSecureToken = () => {
    return sessionStorage.getItem('token');
};

const clearSecureToken = () => {
    sessionStorage.removeItem('token');
    sessionStorage.removeItem('user');
};
