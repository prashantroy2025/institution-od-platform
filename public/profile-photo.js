const $ = id => document.getElementById(id);
const PHOTO_TYPES = ['image/png', 'image/jpeg'];
const PHOTO_MAX_BYTES = 2 * 1024 * 1024;

if (!ERP.token()) ERP.redirectToLogin();

let studentName = '';
let savedUrl = null;
let previewUrl = null;
let selectedFile = null;
let activeUpload = null;

const setStatus = (message, isError = false) => {
    const node = $('photoStatus');
    node.textContent = message;
    node.classList.toggle('error', isError);
};
const showNotice = (message, isError = false) => {
    const node = $('notice');
    node.textContent = message;
    node.hidden = false;
    node.classList.toggle('error', isError);
};
const initials = name => (name || '?').trim().charAt(0).toUpperCase() || '?';

function setPreview(url) {
    const stage = $('preview');
    stage.innerHTML = url ? `<img alt="Your profile photo" src="${url}">` : `<span>${ERP.escapeHtml(initials(studentName))}</span>`;
}

function revokePreview() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = null;
}

function refreshButtons() {
    const uploading = Boolean(activeUpload);
    $('uploadBtn').disabled = uploading || !selectedFile;
    $('photoInput').disabled = uploading;
    $('cancelUpload').hidden = !uploading;
}

function validatePhoto(file) {
    if (!PHOTO_TYPES.includes(file.type)) return 'Choose a PNG or JPEG image.';
    if (file.size > PHOTO_MAX_BYTES) return 'Choose a photo up to 2 MB.';
    return '';
}

async function loadCurrentPhoto(hasPhoto) {
    if (!hasPhoto) return null;
    try {
        return URL.createObjectURL(await ERP.blob('/api/profile/photo'));
    } catch (error) {
        showNotice(`Could not load your current photo: ${error.message}`, true);
        return null;
    }
}

function showError(message) {
    $('loading').hidden = true;
    $('photoCard').hidden = true;
    $('errorText').textContent = message;
    $('errorCard').hidden = false;
}

async function load() {
    $('loading').hidden = false;
    $('errorCard').hidden = true;
    $('photoCard').hidden = true;
    try {
        const profile = await ERP.call('/api/profile');
        if (profile.role !== 'student') {
            showError('Profile photo management is available to student accounts only.');
            return;
        }
        studentName = profile.name || '';
        savedUrl = await loadCurrentPhoto(profile.has_photo);
        setPreview(savedUrl);
        $('loading').hidden = true;
        $('photoCard').hidden = false;
        refreshButtons();
    } catch (error) {
        showError(error.status === 403 ? 'You do not have access to this profile.' : `Could not load your profile: ${error.message}`);
    }
}

$('photoInput').addEventListener('change', () => {
    const file = $('photoInput').files[0];
    if (!file) {
        selectedFile = null;
        revokePreview();
        setPreview(savedUrl);
        $('selectedName').textContent = '';
        setStatus('');
        refreshButtons();
        return;
    }
    const problem = validatePhoto(file);
    if (problem) {
        $('photoInput').value = '';
        selectedFile = null;
        revokePreview();
        setPreview(savedUrl);
        $('selectedName').textContent = '';
        setStatus(problem, true);
        refreshButtons();
        return;
    }
    selectedFile = file;
    revokePreview();
    previewUrl = URL.createObjectURL(file);
    setPreview(previewUrl);
    $('selectedName').textContent = `Selected: ${file.name}`;
    setStatus('');
    refreshButtons();
});

function setProgress(percent) {
    $('progressBar').hidden = false;
    $('progressBar').setAttribute('aria-valuenow', String(Math.round(percent)));
    $('progressFill').style.width = `${Math.round(percent)}%`;
}

function uploadPhoto(file) {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        activeUpload = xhr;
        xhr.open('POST', ERP.apiBase() + '/api/profile/photo');
        xhr.setRequestHeader('Authorization', 'Bearer ' + ERP.token());
        xhr.upload.onprogress = event => { if (event.lengthComputable) setProgress((event.loaded / event.total) * 100); };
        xhr.onload = () => {
            let payload = {};
            try { payload = JSON.parse(xhr.responseText || '{}'); } catch { /* non-JSON response */ }
            if (xhr.status === 401) { ERP.signOut(); return; }
            if (xhr.status >= 200 && xhr.status < 300) resolve(payload);
            else { const error = new Error(payload.message || `Upload failed (${xhr.status})`); error.status = xhr.status; reject(error); }
        };
        xhr.onerror = () => reject(new Error('Network error. Check your connection and try again.'));
        xhr.onabort = () => { const error = new Error('Upload cancelled.'); error.cancelled = true; reject(error); };
        const form = new FormData();
        form.append('photo', file);
        xhr.send(form);
    });
}

$('photoForm').addEventListener('submit', async event => {
    event.preventDefault();
    if (activeUpload || !selectedFile) return;
    const file = selectedFile;
    setStatus('Uploading…');
    setProgress(0);
    refreshButtons();
    try {
        await uploadPhoto(file);
        const url = URL.createObjectURL(file);
        if (savedUrl) URL.revokeObjectURL(savedUrl);
        savedUrl = url;
        revokePreview();
        selectedFile = null;
        $('photoInput').value = '';
        $('selectedName').textContent = '';
        setPreview(savedUrl);
        setStatus('Profile photo updated.');
        showNotice('Your profile photo was saved.');
    } catch (error) {
        if (error.cancelled) setStatus('Upload cancelled. Your previous photo is unchanged and the selected file is still ready to upload.');
        else setStatus(`Upload failed: ${error.message}. Your selected photo is still here, so you can try again.`, true);
    } finally {
        activeUpload = null;
        $('progressBar').hidden = true;
        refreshButtons();
    }
});

$('cancelUpload').addEventListener('click', () => { if (activeUpload) activeUpload.abort(); });
$('retryLoad').addEventListener('click', load);
window.addEventListener('beforeunload', event => {
    if (activeUpload) { event.preventDefault(); event.returnValue = ''; }
});

ERP.bottomNav('profile');
load();
