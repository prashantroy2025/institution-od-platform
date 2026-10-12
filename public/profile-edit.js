const $ = id => document.getElementById(id);
const PHONE_PATTERN = /^\+?[0-9][0-9 -]{6,18}[0-9]$/;
const FIELDS = ['address', 'emergency_name', 'emergency_phone', 'emergency_relation'];
const LIMITS = { address: 500, emergency_name: 160, emergency_phone: 40, emergency_relation: 80 };
const form = $('editForm');

if (!ERP.token()) ERP.redirectToLogin();

let saved = {};
let saving = false;
let discarded = false;

const readForm = () => Object.fromEntries(FIELDS.map(field => [field, form.elements[field].value.trim()]));
const isDirty = () => { const current = readForm(); return FIELDS.some(field => current[field] !== saved[field]); };
const setStatus = (message, isError = false) => {
    const node = $('formStatus');
    node.textContent = message;
    node.classList.toggle('error', isError);
};
const showNotice = (message, isError = false) => {
    const node = $('notice');
    node.textContent = message;
    node.hidden = false;
    node.classList.toggle('error', isError);
};

function validate(data) {
    for (const field of FIELDS) {
        if (data[field].length > LIMITS[field]) return `${field.replace(/_/g, ' ')} must be at most ${LIMITS[field]} characters.`;
    }
    if (data.emergency_phone && !PHONE_PATTERN.test(data.emergency_phone)) return 'Enter a valid emergency phone number, such as +91 98765 43210.';
    return '';
}

function applyServerValues(profile) {
    const emergency = profile.emergency || {};
    saved = {
        address: (profile.address || '').trim(),
        emergency_name: (emergency.name || '').trim(),
        emergency_phone: (emergency.phone || '').trim(),
        emergency_relation: (emergency.relation || '').trim()
    };
    FIELDS.forEach(field => { form.elements[field].value = saved[field]; });
}

function showLoadError(message) {
    $('loading').hidden = true;
    form.hidden = true;
    $('loadErrorText').textContent = message;
    $('loadError').hidden = false;
}

async function load() {
    $('loading').hidden = false;
    $('loadError').hidden = true;
    form.hidden = true;
    try {
        const profile = await ERP.call('/api/profile');
        if (profile.role !== 'student') {
            showLoadError('This page is available to student accounts only.');
            return;
        }
        applyServerValues(profile);
        $('loading').hidden = true;
        form.hidden = false;
    } catch (error) {
        showLoadError(error.status === 403 ? 'You do not have access to this profile.' : `Could not load your profile: ${error.message}`);
    }
}

async function saveChanges(event) {
    event.preventDefault();
    if (saving) return;
    const data = readForm();
    const problem = validate(data);
    if (problem) {
        setStatus(problem, true);
        return;
    }
    saving = true;
    $('saveBtn').disabled = true;
    $('saveBtn').textContent = 'Saving…';
    setStatus('Saving your changes…');
    try {
        await ERP.call('/api/profile', { method: 'PATCH', body: data });
        const refreshed = await ERP.call('/api/profile');
        applyServerValues(refreshed);
        setStatus('Changes saved.');
        showNotice('Your contact and emergency details were updated.');
    } catch (error) {
        setStatus(`Could not save your changes: ${error.message}. Your entries are still here, so you can try again.`, true);
    } finally {
        saving = false;
        $('saveBtn').disabled = false;
        $('saveBtn').textContent = 'Save changes';
    }
}

const leave = () => ERP.goBack('profile.html');

function requestLeave(event) {
    if (event) event.preventDefault();
    if (isDirty()) {
        $('discardPanel').hidden = false;
        $('discardPanel').scrollIntoView({ block: 'nearest' });
        return;
    }
    leave();
}

form.addEventListener('submit', saveChanges);
$('cancelBtn').addEventListener('click', requestLeave);
$('backLink').addEventListener('click', requestLeave);
$('keepEditing').addEventListener('click', () => { $('discardPanel').hidden = true; });
$('discardChanges').addEventListener('click', () => { discarded = true; leave(); });
$('retryLoad').addEventListener('click', load);
window.addEventListener('beforeunload', event => {
    if (!discarded && isDirty()) {
        event.preventDefault();
        event.returnValue = '';
    }
});

ERP.bottomNav('profile');
load();
