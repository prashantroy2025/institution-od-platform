(() => {
    'use strict';

    if (!ERP.token()) { location.replace('login.html'); return; }

    const $ = id => document.getElementById(id);
    const esc = ERP.escapeHtml;
    const loaded = { announcements: false, notifications: false };

    function showState(container, title, message, error = false) {
        const state = document.createElement('div');
        state.className = 'stu-state' + (error ? ' error' : '');
        state.textContent = `${title}: ${message}`;
        container.replaceChildren(state);
    }

    function noticeCard(title, metadata, message, unread = false) {
        return `<article class="notice-card${unread ? ' unread' : ''}"><h2>${esc(title)}</h2><p class="notice-meta">${esc(metadata)}</p><p>${esc(message)}</p></article>`;
    }

    async function loadAnnouncements() {
        const container = $('announcementList');
        showState(container, 'Loading', 'official announcements');
        try {
            const data = await ERP.call('/api/community/feed?' + new URLSearchParams({ filter: 'official', limit: '30' }));
            container.innerHTML = data.items.length
                ? data.items.map(item => noticeCard(item.author_name, new Date(item.created_at).toLocaleString(), item.body)).join('')
                : '<div class="stu-empty">No official announcements are available.</div>';
            loaded.announcements = true;
        } catch (error) {
            if (error.status === 401) return ERP.redirectToLogin();
            showState(container, 'Announcements unavailable', error.message, true);
        }
    }

    async function loadNotifications() {
        const container = $('notificationList');
        showState(container, 'Loading', 'your notifications');
        try {
            const items = await ERP.call('/api/notifications/my-notifications');
            container.innerHTML = items.length
                ? items.slice(0, 50).map(item => `<article class="notice-card${item.is_read ? '' : ' unread'}"><h2>${esc(item.message)}</h2><p class="notice-meta">${esc(new Date(item.created_at).toLocaleString())}</p>${item.is_read ? '' : `<button class="notice-read" type="button" data-notification-id="${esc(item.id)}">Mark as read</button>`}</article>`).join('')
                : '<div class="stu-empty">No notifications yet.</div>';
            container.querySelectorAll('[data-notification-id]').forEach(button => button.addEventListener('click', async () => {
                button.disabled = true;
                try {
                    await ERP.call('/api/notifications/mark-read', { method: 'POST', body: { id: Number(button.dataset.notificationId) } });
                    await loadNotifications();
                } catch (error) {
                    if (error.status === 401) return ERP.redirectToLogin();
                    button.disabled = false;
                    showState(container, 'Could not mark notification read', error.message, true);
                }
            }));
            loaded.notifications = true;
        } catch (error) {
            if (error.status === 401) return ERP.redirectToLogin();
            showState(container, 'Notifications unavailable', error.message, true);
        }
    }

    function selectTab(name) {
        document.querySelectorAll('[data-notice-tab]').forEach(button => {
            const active = button.dataset.noticeTab === name;
            button.classList.toggle('active', active);
            button.setAttribute('aria-selected', String(active));
        });
        $('announcementList').hidden = name !== 'announcements';
        $('notificationList').hidden = name !== 'notifications';
        if (!loaded[name]) (name === 'announcements' ? loadAnnouncements() : loadNotifications());
    }

    document.querySelectorAll('[data-notice-tab]').forEach(button => button.addEventListener('click', () => selectTab(button.dataset.noticeTab)));
    $('refreshNotices').addEventListener('click', () => {
        loaded.announcements = false;
        loaded.notifications = false;
        selectTab(document.querySelector('[data-notice-tab].active').dataset.noticeTab);
    });
    loadAnnouncements();
})();
