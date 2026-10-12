const $ = id => document.getElementById(id);
const DASH = '—';
const achievementId = new URLSearchParams(location.search).get('id') || '';

if (!ERP.token()) ERP.redirectToLogin();

const formatDate = value => {
    const [year, month, day] = String(value).slice(0, 10).split('-').map(Number);
    return new Date(year, month - 1, day).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
};

function showError(message) {
    $('loading').hidden = true;
    $('detailCard').hidden = true;
    $('errorText').textContent = message;
    $('errorCard').hidden = false;
}

function render(item) {
    $('title').textContent = item.title || DASH;
    $('category').textContent = item.category || DASH;
    $('organization').textContent = item.organization || DASH;
    $('achievedOn').textContent = item.achieved_on ? formatDate(item.achieved_on) : DASH;
    $('description').textContent = item.description || 'No description added.';
    $('loading').hidden = true;
    $('errorCard').hidden = true;
    $('detailCard').hidden = false;
}

async function load() {
    $('loading').hidden = false;
    $('errorCard').hidden = true;
    $('detailCard').hidden = true;
    if (!/^[1-9]\d*$/.test(achievementId)) {
        showError('This achievement link is invalid.');
        return;
    }
    try {
        const { items } = await ERP.call('/api/profile/achievements');
        const item = items.find(entry => String(entry.id) === achievementId);
        if (!item) {
            showError('This achievement was not found or is not available to your account.');
            return;
        }
        render(item);
    } catch (error) {
        if (error.status === 403) showError('You do not have access to this achievement.');
        else showError(`Could not load this achievement: ${error.message}`);
    }
}

$('retryLoad').addEventListener('click', load);

ERP.bottomNav('profile');
load();
