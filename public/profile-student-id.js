const $ = id => document.getElementById(id);

if (!ERP.token()) ERP.redirectToLogin();

function showError(message) {
    $('loading').hidden = true;
    $('idCard').hidden = true;
    $('errorText').textContent = message;
    $('errorCard').hidden = false;
}

async function load() {
    $('loading').hidden = false;
    $('errorCard').hidden = true;
    $('idCard').hidden = true;
    try {
        const profile = await ERP.call('/api/profile');
        if (profile.role !== 'student') {
            showError('Student ID cards are available to student accounts only.');
            return;
        }
        const data = await ERP.call('/api/profile/student-id');
        $('name').textContent = data.name || '—';
        $('collegeId').textContent = data.college_id || '—';
        $('qr').src = data.qr_data_url;
        $('qr').hidden = false;
        $('loading').hidden = true;
        $('idCard').hidden = false;
    } catch (error) {
        if (error.status === 403) showError('You do not have access to this student ID.');
        else if (error.status === 404) showError('Your student ID has not been assigned yet. Contact the administration office.');
        else showError(`Could not load your student ID: ${error.message}`);
    }
}

$('qr').addEventListener('error', () => {
    $('qr').hidden = true;
    $('qrError').hidden = false;
});
$('retryLoad').addEventListener('click', load);
$('backLink').addEventListener('click', event => { event.preventDefault(); ERP.goBack('profile.html'); });

ERP.bottomNav('profile');
load();
