const $ = id => document.getElementById(id);
const esc = ERP.escapeHtml;
const DASH = '—';
const CATEGORY_TONE = { Award: 'tone-yellow', Certification: 'tone-blue', Competition: 'tone-green', Leadership: 'tone-purple', Other: 'tone-pink' };
const SKILL_TONES = ['tone-blue', 'tone-purple', 'tone-green', 'tone-pink', 'tone-yellow'];

if (!ERP.token()) ERP.redirectToLogin();

const stateHtml = (message, tone = '') => `<p class="state ${tone}">${esc(message)}</p>`;
const setText = (id, value) => { $(id).textContent = value === null || value === undefined || value === '' ? DASH : value; };
const initial = name => (name || '?').trim().charAt(0).toUpperCase() || '?';
const ordinal = n => { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };

function formatDate(value) {
    const [year, month, day] = String(value).slice(0, 10).split('-').map(Number);
    return new Date(year, month - 1, day).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function showError(message) {
    const notice = $('profileNotice');
    notice.textContent = message;
    notice.hidden = false;
}

async function loadPhoto() {
    try {
        const url = URL.createObjectURL(await ERP.blob('/api/profile/photo'));
        $('avatar').innerHTML = `<img alt="" src="${url}">`;
        $('headerAvatar').innerHTML = `<img alt="" src="${url}">`;
    } catch { /* keep initials when no photo is available */ }
}

let studentRecord = {};

function renderMeta(semesterNumber) {
    const parts = [studentRecord.course_name, semesterNumber ? `${ordinal(semesterNumber)} Semester` : null, studentRecord.section_name ? `Section ${studentRecord.section_name}` : null];
    setText('meta', parts.filter(Boolean).join(' | '));
}

function renderIdentity(profile) {
    studentRecord = profile.profile || {};
    setText('name', profile.name);
    $('verified').hidden = !studentRecord.enrollment_no;
    setText('roll', studentRecord.enrollment_no);
    setText('email', profile.email);
    setText('phone', studentRecord.phone);
    setText('department', profile.department_name);
    setText('batch', studentRecord.batch_name);
    setText('section', studentRecord.section_name);
    renderMeta(null);
    $('avatar').textContent = initial(profile.name);
    $('headerAvatar').textContent = initial(profile.name);
}

async function loadStudentId() {
    try {
        const data = await ERP.call('/api/profile/student-id');
        setText('studentId', data.college_id);
        $('studentQr').src = data.qr_data_url;
        $('studentQr').hidden = false;
    } catch (error) {
        $('idNote').textContent = error.message;
    }
}

async function loadAcademic() {
    const [semesters, summary] = await Promise.allSettled([
        ERP.call('/api/attendance/semesters'),
        ERP.call('/api/attendance/summary')
    ]);
    if (semesters.status === 'fulfilled') {
        const current = semesters.value.items.find(item => item.id === semesters.value.current_semester_id);
        setText('currentSem', current ? ordinal(current.number) : null);
        renderMeta(current ? current.number : null);
    }
    if (summary.status === 'fulfilled') {
        const overall = summary.value.overall;
        setText('attendance', overall.percentage === null ? null : `${overall.percentage}%`);
    }
}

async function loadAchievements() {
    const box = $('achievements');
    try {
        const { items } = await ERP.call('/api/profile/achievements');
        box.innerHTML = items.length
            ? items.slice(0, 3).map(item => `<a class="mini-card ${CATEGORY_TONE[item.category] || 'tone-blue'}" href="profile-achievement.html?id=${encodeURIComponent(item.id)}"><strong>${esc(item.title)}</strong><span>${esc(item.organization || item.category)}</span>${item.achieved_on ? `<small>${esc(formatDate(item.achieved_on))}</small>` : ''}</a>`).join('')
            : stateHtml('No achievements added yet.');
    } catch (error) {
        box.innerHTML = stateHtml(error.message, 'error');
    }
}

async function loadSkills() {
    const box = $('skills');
    try {
        const { items } = await ERP.call('/api/profile/skills');
        box.innerHTML = items.length
            ? items.slice(0, 8).map((item, index) => `<span class="chip ${SKILL_TONES[index % SKILL_TONES.length]}">${esc(item.name)}</span>`).join('')
            : stateHtml('No skills or interests added yet.');
    } catch (error) {
        box.innerHTML = stateHtml(error.message, 'error');
    }
}

async function loadNotifications() {
    const list = $('notifList');
    try {
        const items = await ERP.call('/api/notifications/my-notifications');
        const unread = items.filter(item => !item.is_read).length;
        $('notifBadge').textContent = unread;
        $('notifBadge').hidden = !unread;
        list.innerHTML = items.length
            ? items.slice(0, 6).map(item => `<p class="notif-item ${item.is_read ? '' : 'unread'}">${esc(item.message)}</p>`).join('')
            : stateHtml('You are all caught up.');
    } catch (error) {
        list.innerHTML = stateHtml(error.message, 'error');
    }
}

async function init() {
    loadNotifications();
    let profile;
    try {
        profile = await ERP.call('/api/profile');
    } catch (error) {
        showError(error.message);
        return;
    }
    renderIdentity(profile);
    if (profile.has_photo) loadPhoto();
    if (profile.role !== 'student') {
        const message = 'Achievements, skills and academic records are available for student accounts.';
        showError(message);
        $('achievements').innerHTML = stateHtml(message);
        $('skills').innerHTML = stateHtml(message);
        $('idNote').textContent = message;
        return;
    }
    loadStudentId();
    loadAcademic();
    loadAchievements();
    loadSkills();
}

$('notifButton').onclick = () => {
    const panel = $('notifPanel');
    const opening = panel.hidden;
    panel.hidden = !opening;
    $('notifButton').setAttribute('aria-expanded', String(opening));
};

ERP.bottomNav('profile');
init();
