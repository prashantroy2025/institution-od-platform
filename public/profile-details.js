const $ = id => document.getElementById(id);
const esc = ERP.escapeHtml;
const DASH = '—';
const TITLES = { personal: 'Personal Information', achievements: 'Achievements', skills: 'Skills & Interests', privacy: 'Privacy & Security', academic: 'Academic Summary' };
const CATEGORIES = ['Award', 'Certification', 'Competition', 'Leadership', 'Other'];
const DOCUMENT_TYPES = ['application/pdf', 'image/png', 'image/jpeg'];
const DOCUMENT_MAX = 5 * 1024 * 1024;

if (!ERP.token()) ERP.redirectToLogin();

const params = new URLSearchParams(location.search);
const section = TITLES[params.get('section')] ? params.get('section') : 'personal';
const body = $('detailBody');
const today = () => new Date().toLocaleDateString('en-CA');
const ordinal = n => { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };
const stateHtml = (message, tone = '') => `<p class="state ${tone}">${esc(message)}</p>`;
const orDash = value => (value === null || value === undefined || value === '' ? DASH : value);
const fact = (label, value) => `<div><dt>${esc(label)}</dt><dd>${esc(orDash(value))}</dd></div>`;
const setStatus = (element, message, isError = false) => { element.textContent = message; element.classList.toggle('error', isError); };
const validFile = (file, types, maxBytes) => Boolean(file) && types.includes(file.type) && file.size <= maxBytes;

function notify(message, isError = false) {
    const notice = $('notice');
    notice.textContent = message;
    notice.hidden = false;
    notice.classList.toggle('error', isError);
}

function formatDate(value) {
    const [year, month, day] = String(value).slice(0, 10).split('-').map(Number);
    return new Date(year, month - 1, day).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

async function download(path, name) {
    try {
        const url = URL.createObjectURL(await ERP.blob(path));
        const link = Object.assign(document.createElement('a'), { href: url, download: name || 'document' });
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
        notify(error.message, true);
    }
}

function bindRemove(container, resource, onDone) {
    container.querySelectorAll('[data-remove]').forEach(button => {
        button.onclick = async () => {
            if (button.dataset.armed !== 'true') {
                button.dataset.armed = 'true';
                button.textContent = 'Confirm remove';
                return;
            }
            button.disabled = true;
            try {
                await ERP.call(`/api/profile/${resource}/${button.dataset.remove}`, { method: 'DELETE' });
                notify('Removed successfully.');
                await onDone();
            } catch (error) {
                notify(error.message, true);
                button.disabled = false;
            }
        };
    });
}

/* PERSONAL INFORMATION */

async function renderPersonal() {
    body.innerHTML = stateHtml('Loading personal information…');
    let profile;
    try {
        profile = await ERP.call('/api/profile');
    } catch (error) {
        body.innerHTML = stateHtml(error.message, 'error');
        return;
    }
    const student = profile.profile || {};
    const emergency = profile.emergency || {};
    body.innerHTML = `
        <section class="card" aria-labelledby="recordsTitle">
            <h2 id="recordsTitle">Institution records</h2>
            <p class="hint">Maintained by the institution and read-only here. <a class="text-link" href="profile-photo.html">Change profile photo ›</a></p>
            <dl class="facts" style="margin-top:12px">
                ${fact('Full name', profile.name)}
                ${fact('Email', profile.email)}
                ${fact('Roll number', student.enrollment_no)}
                ${fact('Department', profile.department_name)}
                ${fact('Programme', student.course_name)}
                ${fact('Batch', student.batch_name)}
                ${fact('Section', student.section_name)}
            </dl>
        </section>
        <section class="card" aria-labelledby="contactTitle">
            <h2 id="contactTitle">Contact and emergency details</h2>
            <dl class="facts" style="margin-top:12px">
                ${fact('Address', profile.address)}
                ${fact('Emergency contact', emergency.name)}
                ${fact('Emergency phone', emergency.phone)}
                ${fact('Relationship', emergency.relation)}
            </dl>
            <div style="margin-top:12px"><a class="primary-btn" href="profile-edit.html" style="display:inline-block;text-decoration:none">Edit contact details</a></div>
        </section>
        <section class="card" aria-labelledby="documentsTitle">
            <h2 id="documentsTitle">Private documents</h2>
            <form id="documentForm" class="stack" style="margin-top:12px">
                <div class="form-grid">
                    <label>Document label<input name="label" maxlength="120" required></label>
                    <label>File<input id="documentFile" type="file" accept="application/pdf,image/png,image/jpeg" required></label>
                </div>
                <p class="hint">PDF, PNG or JPEG, up to 5 MB.</p>
                <p class="form-status" id="documentStatus" role="status"></p>
                <div><button class="primary-btn" type="submit">Upload document</button></div>
            </form>
            <ul class="row-list" id="documentList" style="margin-top:14px">
                ${profile.documents.length ? profile.documents.map(d => `
                    <li class="row-item">
                        <div><strong>${esc(d.label)}</strong><small>${esc(d.original_name)}</small></div>
                        <button class="link-btn" type="button" data-doc="${d.id}" data-name="${esc(d.original_name)}">Download</button>
                    </li>`).join('') : '<li class="state">No private documents uploaded.</li>'}
            </ul>
        </section>
        <p class="hint">Passwords, tokens and unrelated sensitive identity documents are never displayed or collected here.</p>`;

    $('documentForm').onsubmit = async event => {
        event.preventDefault();
        const file = $('documentFile').files[0];
        if (!validFile(file, DOCUMENT_TYPES, DOCUMENT_MAX)) return setStatus($('documentStatus'), 'Choose a PDF, PNG or JPEG file up to 5 MB.', true);
        const form = new FormData();
        form.append('label', $('documentForm').label.value.trim());
        form.append('document', file);
        try {
            await ERP.call('/api/profile/documents', { method: 'POST', body: form });
            renderPersonal();
            notify('Document uploaded securely.');
        } catch (error) {
            setStatus($('documentStatus'), error.message, true);
        }
    };

    body.querySelectorAll('[data-doc]').forEach(button => {
        button.onclick = () => download(`/api/profile/documents/${button.dataset.doc}/download`, button.dataset.name);
    });

}

/* ACHIEVEMENTS */

const achievementRow = item => `
    <li class="row-item">
        <div>
            <strong><a href="profile-achievement.html?id=${encodeURIComponent(item.id)}">${esc(item.title)}</a></strong> <span class="status-pill">Self-reported</span>
            <small>${esc([item.category, item.organization, item.achieved_on ? formatDate(item.achieved_on) : null].filter(Boolean).join(' · '))}</small>
            ${item.description ? `<p>${esc(item.description)}</p>` : ''}
        </div>
        <div class="row-actions"><button class="danger-btn" type="button" data-remove="${item.id}">Remove</button></div>
    </li>`;

async function refreshAchievements() {
    const list = $('achievementList');
    try {
        const { items } = await ERP.call('/api/profile/achievements');
        list.innerHTML = items.length ? `<ul class="row-list">${items.map(achievementRow).join('')}</ul>` : stateHtml('No achievements added yet.');
        bindRemove(list, 'achievements', refreshAchievements);
    } catch (error) {
        list.innerHTML = stateHtml(error.message, 'error');
    }
}

function renderAchievements() {
    body.innerHTML = `
        <section class="card" aria-labelledby="addAchievementTitle">
            <h2 id="addAchievementTitle">Add achievement</h2>
            <form id="achievementForm" class="stack form-grid" style="margin-top:12px">
                <label>Title<input name="title" maxlength="160" required></label>
                <label>Category<select name="category">${CATEGORIES.map(c => `<option value="${c}">${c}</option>`).join('')}</select></label>
                <label>Organisation<input name="organization" maxlength="160"></label>
                <label>Date<input name="achieved_on" type="date" max="${today()}"></label>
                <label class="wide">Description<textarea name="description" rows="3" maxlength="1000"></textarea></label>
                <p class="form-status wide" id="achievementStatus" role="status"></p>
                <div class="wide"><button class="primary-btn" type="submit">Add achievement</button></div>
            </form>
        </section>
        <section class="card" aria-labelledby="achievementListTitle">
            <h2 id="achievementListTitle">Your achievements</h2>
            <p class="hint">Entries you add are self-reported. Verification by the institution is not available yet, so no achievement is shown as verified.</p>
            <div id="achievementList" style="margin-top:12px">${stateHtml('Loading achievements…')}</div>
        </section>`;

    $('achievementForm').onsubmit = async event => {
        event.preventDefault();
        const form = event.currentTarget;
        const data = Object.fromEntries(new FormData(form));
        try {
            await ERP.call('/api/profile/achievements', { method: 'POST', body: data });
            form.reset();
            setStatus($('achievementStatus'), 'Achievement added.');
            refreshAchievements();
        } catch (error) {
            setStatus($('achievementStatus'), error.message, true);
        }
    };
    refreshAchievements();
}

/* SKILLS & INTERESTS */

let skillItems = [];

function skillRow(item) {
    return `
        <li class="row-item" data-skill="${item.id}">
            <div><strong>${esc(item.name)}</strong><small>${item.kind === 'interest' ? 'Interest' : 'Skill'}</small></div>
            <div class="row-actions">
                <button class="secondary-btn" type="button" data-edit="${item.id}">Edit</button>
                <button class="danger-btn" type="button" data-remove="${item.id}">Remove</button>
            </div>
        </li>`;
}

function skillEditForm(item) {
    return `
        <li class="row-item" data-skill="${item.id}">
            <form class="form-row" style="flex:1" data-save="${item.id}">
                <input name="name" maxlength="80" value="${esc(item.name)}" aria-label="Skill name" required>
                <select name="kind" aria-label="Type" style="flex:0 0 auto;width:auto">
                    <option value="skill" ${item.kind === 'skill' ? 'selected' : ''}>Skill</option>
                    <option value="interest" ${item.kind === 'interest' ? 'selected' : ''}>Interest</option>
                </select>
                <button class="primary-btn" type="submit">Save</button>
                <button class="secondary-btn" type="button" data-cancel>Cancel</button>
            </form>
        </li>`;
}

function drawSkills() {
    const list = $('skillList');
    list.innerHTML = skillItems.length
        ? `<ul class="row-list">${skillItems.map(skillRow).join('')}</ul>`
        : stateHtml('No skills or interests added yet.');
    list.querySelectorAll('[data-edit]').forEach(button => {
        button.onclick = () => {
            const item = skillItems.find(skill => String(skill.id) === button.dataset.edit);
            button.closest('li').outerHTML = skillEditForm(item);
            bindSkillEdit();
        };
    });
    bindRemove(list, 'skills', refreshSkills);
    bindSkillEdit();
}

function bindSkillEdit() {
    document.querySelectorAll('[data-save]').forEach(form => {
        form.querySelector('[data-cancel]').onclick = () => drawSkills();
        form.onsubmit = async event => {
            event.preventDefault();
            const data = Object.fromEntries(new FormData(form));
            try {
                await ERP.call(`/api/profile/skills/${form.dataset.save}`, { method: 'PATCH', body: data });
                notify('Skill updated.');
                refreshSkills();
            } catch (error) {
                notify(error.message, true);
            }
        };
    });
}

async function refreshSkills() {
    try {
        const { items } = await ERP.call('/api/profile/skills');
        skillItems = items;
        drawSkills();
    } catch (error) {
        $('skillList').innerHTML = stateHtml(error.message, 'error');
    }
}

function renderSkills() {
    body.innerHTML = `
        <section class="card" aria-labelledby="addSkillTitle">
            <h2 id="addSkillTitle">Add skill or interest</h2>
            <form id="skillForm" class="form-row" style="margin-top:12px">
                <input name="name" maxlength="80" placeholder="e.g. Python, Football" aria-label="Skill or interest name" required>
                <select name="kind" aria-label="Type" style="flex:0 0 auto;width:auto">
                    <option value="skill">Skill</option>
                    <option value="interest">Interest</option>
                </select>
                <button class="primary-btn" type="submit">Add</button>
            </form>
            <p class="form-status" id="skillStatus" role="status" style="margin-top:10px"></p>
        </section>
        <section class="card" aria-labelledby="skillListTitle">
            <h2 id="skillListTitle">Your skills and interests</h2>
            <div id="skillList" style="margin-top:12px">${stateHtml('Loading skills…')}</div>
        </section>`;

    $('skillForm').onsubmit = async event => {
        event.preventDefault();
        const form = event.currentTarget;
        try {
            await ERP.call('/api/profile/skills', { method: 'POST', body: Object.fromEntries(new FormData(form)) });
            form.reset();
            setStatus($('skillStatus'), 'Added to your profile.');
            refreshSkills();
        } catch (error) {
            setStatus($('skillStatus'), error.message, true);
        }
    };
    refreshSkills();
}

/* PRIVACY & SECURITY */

async function renderPrivacy() {
    body.innerHTML = `
        <section class="card" aria-labelledby="visibilityTitle">
            <h2 id="visibilityTitle">Profile visibility</h2>
            <form id="privacyForm" class="stack" style="margin-top:12px">
                <label class="check"><input id="discover" type="checkbox"> Allow academic peers to discover my profile</label>
                <label class="check"><input id="dm" type="checkbox"> Allow direct messages from academic peers</label>
                <p class="form-status" id="privacyStatus" role="status"></p>
                <div><button class="primary-btn" type="submit">Save privacy settings</button></div>
            </form>
        </section>
        <section class="card" aria-labelledby="sessionTitle">
            <h2 id="sessionTitle">Session</h2>
            <p class="hint">You are signed in on this device. Signing out removes the saved session from this browser.</p>
            <div style="margin-top:12px"><button class="secondary-btn" id="signOutButton" type="button">Sign out of this device</button></div>
        </section>
        <section class="card" aria-labelledby="passwordTitle">
            <h2 id="passwordTitle">Password</h2>
            <p class="hint">Password change is not available yet because the platform does not expose a change-password endpoint.</p>
            <div style="margin-top:12px"><button class="secondary-btn" type="button" disabled>Change password (not available)</button></div>
        </section>`;

    $('signOutButton').onclick = ERP.signOut;

    $('privacyForm').onsubmit = async event => {
        event.preventDefault();
        try {
            await ERP.call('/api/profile', {
                method: 'PATCH',
                body: { allow_profile_discovery: $('discover').checked, allow_direct_messages: $('dm').checked }
            });
            setStatus($('privacyStatus'), 'Privacy settings saved.');
        } catch (error) {
            setStatus($('privacyStatus'), error.message, true);
        }
    };

    try {
        const profile = await ERP.call('/api/profile');
        $('discover').checked = Boolean(profile.allow_profile_discovery ?? true);
        $('dm').checked = Boolean(profile.allow_direct_messages ?? true);
    } catch (error) {
        setStatus($('privacyStatus'), error.message, true);
    }
}

/* ACADEMIC SUMMARY */

async function renderAcademic() {
    body.innerHTML = `
        <section class="card" aria-labelledby="attendanceTitle">
            <h2 id="attendanceTitle">Attendance</h2>
            <div id="attendanceBody" style="margin-top:12px">${stateHtml('Loading attendance…')}</div>
        </section>
        <section class="card" aria-labelledby="recordsTitle">
            <h2 id="recordsTitle">Academic records</h2>
            <dl class="facts" style="margin-top:12px">
                ${fact('CGPA', null)}
                ${fact('Completed credits', null)}
                <div><dt>Current semester</dt><dd id="academicSemester">—</dd></div>
                ${fact('Backlogs', null)}
            </dl>
            <p class="hint">No published academic records yet. CGPA, completed credits and backlogs will appear here once results are published.</p>
        </section>`;

    const [semesters, summary] = await Promise.allSettled([
        ERP.call('/api/attendance/semesters'),
        ERP.call('/api/attendance/summary')
    ]);

    if (semesters.status === 'fulfilled') {
        const current = semesters.value.items.find(item => item.id === semesters.value.current_semester_id);
        $('academicSemester').textContent = current ? `${ordinal(current.number)} Semester` : DASH;
    }

    const attendance = $('attendanceBody');
    if (summary.status === 'rejected') {
        attendance.innerHTML = stateHtml(summary.reason.message, 'error');
        return;
    }
    const { overall, subjects, threshold } = summary.value;
    if (!overall.total) {
        attendance.innerHTML = stateHtml('No attendance has been recorded yet.');
        return;
    }
    attendance.innerHTML = `
        <p><strong style="font-size:28px">${overall.percentage}%</strong> <span class="muted">overall · ${overall.present + overall.late + overall.excused} of ${overall.total} classes attended · shortage below ${threshold}%</span></p>
        ${subjects.map(subject => `
            <div class="attendance-row ${subject.percentage !== null && subject.percentage < threshold ? 'short' : ''}">
                <span>${esc(subject.subject_name)}</span>
                <strong>${subject.percentage === null ? DASH : `${subject.percentage}%`}</strong>
            </div>`).join('')}`;
}

/* INIT */

const renderers = { personal: renderPersonal, achievements: renderAchievements, skills: renderSkills, privacy: renderPrivacy, academic: renderAcademic };

$('pageTitle').textContent = TITLES[section];
document.title = `${TITLES[section]} · College ERP`;
$('backLink').onclick = event => { event.preventDefault(); ERP.goBack('profile.html'); };
ERP.bottomNav('profile');
renderers[section]();
