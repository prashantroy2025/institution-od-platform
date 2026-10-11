/* Shared ERP front-end helpers.
 * Centralises token handling, API calls, HTML escaping, page-level status
 * messaging and the mobile bottom navigation so every module behaves
 * consistently and never depends on browser alert/prompt dialogs.
 */
const ERP = (() => {
    const TOKEN_KEY = 'token';
    const MESSAGE_KEY = 'erp_last_message';

    const roleLabels = { student: 'Student', organizer: 'Faculty', faculty: 'Faculty', hod: 'HOD', super_admin: 'Super Admin' };
    const roleName = role => roleLabels[role] || (role ? role.replace(/_/g, ' ') : 'Role unavailable');
    const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
    const el = id => document.getElementById(id);

    const token = () => sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY) || '';
    const authHeaders = () => ({ Authorization: 'Bearer ' + token() });
    const apiBase = () => (typeof API_BASE !== 'undefined' ? API_BASE : '');
    const remember = (value, persist) => { sessionStorage.removeItem(TOKEN_KEY); localStorage.removeItem(TOKEN_KEY); (persist ? localStorage : sessionStorage).setItem(TOKEN_KEY, value); };

    async function call(url, options = {}) {
        const headers = { ...authHeaders(), ...(options.headers || {}) };
        // FormData bodies are sent as-is (the browser sets the multipart boundary).
        // Plain objects are serialised here; pre-stringified bodies are passed through.
        if (options.body && !(options.body instanceof FormData) && typeof options.body !== 'string') {
            options = { ...options, body: JSON.stringify(options.body) };
        }
        if (options.body && !(options.body instanceof FormData) && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
        const response = await fetch(apiBase() + url, { ...options, headers });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) { const error = new Error(payload.message || `Request failed (${response.status})`); error.status = response.status; throw error; }
        return payload;
    }

    const signOut = () => { sessionStorage.removeItem(TOKEN_KEY); localStorage.removeItem(TOKEN_KEY); location.replace('login.html'); };
    const redirectToLogin = () => { location.replace('login.html'); };

    /* Page-level status region: announced to assistive tech via aria-live. */
    const status = (message, variant = 'info') => {
        document.querySelectorAll('.page-status').forEach(node => { node.textContent = message || ''; node.classList.toggle('error', variant === 'error'); node.classList.toggle('success', variant === 'success'); node.hidden = !message; });
    };
    const setMessage = (message, variant = 'info') => {
        try { sessionStorage.setItem(MESSAGE_KEY, JSON.stringify({ message, variant })); } catch { /* storage may be unavailable */ }
    };
    const readMessage = () => {
        try { const raw = sessionStorage.getItem(MESSAGE_KEY); if (!raw) return null; sessionStorage.removeItem(MESSAGE_KEY); return JSON.parse(raw); } catch { return null; }
    };
    const flash = () => { const stored = readMessage(); if (stored) status(stored.message, stored.variant); };

    /* Fixed mobile bottom navigation: Home / Messages / Attendance / Profile. */
    const bottomNav = (active) => {
        const nav = document.querySelector('.bottom-nav');
        if (!nav) return;
        const targets = { home: 'dashboard.html', messages: 'messages.html', attendance: 'attendance.html', profile: 'profile.html' };
        const entries = [['home', '⌂', 'Home'], ['messages', '✉', 'Messages'], ['attendance', '▦', 'Attendance'], ['profile', '♙', 'Profile']];
        nav.innerHTML = entries.map(([key, glyph, label]) =>
            `<button type="button" data-bottom="${key}" class="${key === active ? 'active' : ''}" aria-current="${key === active ? 'page' : 'false'}">${glyph}<span>${label}</span></button>`).join('');
        nav.addEventListener('click', event => { const button = event.target.closest('[data-bottom]'); if (button) location.href = targets[button.dataset.bottom]; });
    };

    const backLink = () => { document.querySelectorAll('[data-back]').forEach(link => link.addEventListener('click', event => { event.preventDefault(); location.href = 'dashboard.html'; })); };

    return { el, call, authHeaders, apiBase, token, remember, roleName, roleLabels, escapeHtml, signOut, redirectToLogin, status, setMessage, flash, bottomNav, backLink };
})();

document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('[data-signout]').forEach(button => button.addEventListener('click', event => { event.preventDefault(); ERP.signOut(); }));
    ERP.backLink();
    ERP.flash();
});
