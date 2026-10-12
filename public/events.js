/* Student Events dashboard.
 *
 * Data sources (existing endpoints, student-scoped by the server):
 *   /api/auth/me                  header avatar
 *   /api/student/events           approved events with the student's participation and OD status
 *   /api/student/search-events    title search over the same data (q=)
 *   /api/student/apply-od         OD application for an event the student participates in
 */
(() => {
    'use strict';

    if (!ERP.token()) { location.replace('login.html'); return; }

    const $ = id => document.getElementById(id);
    const esc = ERP.escapeHtml;
    const TAB_EMPTY = {
        upcoming: 'No upcoming events are published right now.',
        participation: 'You have no recorded participation or OD requests yet.',
        past: 'No past events are recorded yet.'
    };

    let events = [];
    let tab = 'upcoming';
    let query = '';
    let category = 'All';
    let participationFilter = 'all';
    let requestId = 0;
    let loadError = '';

    const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
    const dayOf = value => {
        const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
        const date = match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : new Date(value);
        return Number.isNaN(date.getTime()) ? null : new Date(date.getFullYear(), date.getMonth(), date.getDate());
    };
    const isoDay = value => {
        const day = dayOf(value);
        if (!day) return '';
        return [day.getFullYear(), String(day.getMonth() + 1).padStart(2, '0'), String(day.getDate()).padStart(2, '0')].join('-');
    };
    const shortDate = value => {
        const day = dayOf(value);
        return day ? day.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '';
    };
    const dateRange = event => {
        const from = shortDate(event.from_date);
        const to = shortDate(event.to_date);
        return from === to || !to ? from : `${from} – ${to}`;
    };
    const timeRange = event => [event.start_time, event.end_time]
        .filter(Boolean)
        .map(time => String(time).slice(0, 5))
        .join(' – ');
    const isPast = event => { const end = dayOf(event.to_date); return !!end && end < startOfToday(); };
    const isParticipant = event => event.participation_status === 'Participated';

    function visibleFor(view) {
        if (view === 'upcoming') return events.filter(event => !isPast(event));
        if (view === 'past') return events.filter(isPast);
        return events.filter(event => isParticipant(event) || event.od_status);
    }

    function passesParticipation(event) {
        if (participationFilter === 'participated') return isParticipant(event);
        if (participationFilter === 'not') return !isParticipant(event);
        return true;
    }

    function badgeFor(event) {
        if (event.od_status) return { label: `OD ${event.od_status}`, tone: event.od_status.includes('Approved') ? 'good' : '' };
        if (isPast(event)) return { label: 'Completed', tone: 'muted' };
        if (isParticipant(event)) return { label: 'Participated', tone: 'good' };
        return { label: 'Upcoming', tone: '' };
    }

    function actionFor(event) {
        if (event.od_status) return '';
        if (isPast(event)) return '<button type="button" class="ev-action" disabled>Registration closed</button>';
        if (isParticipant(event)) return `<button type="button" class="ev-action" data-apply-od="${esc(event.id)}" data-applied-date="${esc(isoDay(event.from_date))}">Apply for OD</button>`;
        return '<button type="button" class="ev-action" disabled>Registration unavailable</button>';
    }

    function cardHtml(event, index) {
        const badge = badgeFor(event);
        const initials = String(event.title || '?').trim().split(/\s+/).slice(0, 2).map(word => word.charAt(0).toUpperCase()).join('') || '?';
        const tone = index % 3 === 0 ? '' : ` tone-${(index % 3) + 1}`;
        return `
            <article class="ev-card">
                <div class="ev-banner${tone}" aria-hidden="true">${esc(initials)}</div>
                <div class="ev-body">
                    <div class="ev-head"><h3>${esc(event.title)}</h3><span class="ev-badge ${badge.tone}">${esc(badge.label)}</span></div>
                    ${event.category ? `<p class="ev-category">${esc(event.category)}</p>` : ''}
                    <p class="ev-meta">📅 ${esc(dateRange(event))}</p>
                    ${timeRange(event) ? `<p class="ev-meta">🕘 ${esc(timeRange(event))}</p>` : ''}
                    ${event.organizer_name ? `<p class="ev-meta">👤 ${esc(event.organizer_name)}</p>` : ''}
                    <div class="ev-actions"><button type="button" class="ev-detail-action" data-detail="${esc(event.id)}">Know More</button>${actionFor(event)}</div>
                </div>
            </article>`;
    }

    function setNotice(message, isError = false) {
        const node = $('eventsNotice');
        node.textContent = message || '';
        node.hidden = !message;
        node.classList.toggle('error', isError);
    }

    function renderList() {
        const list = $('eventList');
        if (loadError) { renderError(loadError); return; }
        const items = visibleFor(tab).filter(passesParticipation);
        if (!items.length) {
            const text = query ? `No events match “${query}”.` : TAB_EMPTY[tab];
            list.innerHTML = `<p class="stu-state">${esc(text)}</p>`;
        } else {
            list.innerHTML = items.map(cardHtml).join('');
        }
        list.setAttribute('aria-busy', 'false');
    }

    function renderError(message) {
        $('eventList').innerHTML = `
            <div class="stu-state error">
                <p>${esc(message)}</p>
                <button type="button" class="ev-retry" data-retry>Retry</button>
            </div>`;
        $('eventList').setAttribute('aria-busy', 'false');
    }

    async function load() {
        const current = ++requestId;
        loadError = '';
        $('eventList').setAttribute('aria-busy', 'true');
        $('eventList').innerHTML = '<p class="stu-state">Loading events…</p>';
        const params = new URLSearchParams();
        if (query) params.set('q', query);
        if (category !== 'All') params.set('category', category);
        const endpoint = query ? '/api/student/search-events' : '/api/student/events';
        const url = `${endpoint}${params.toString() ? `?${params}` : ''}`;
        try {
            const data = await ERP.call(url);
            if (current !== requestId) return;
            events = Array.isArray(data) ? data : [];
            renderList();
        } catch (error) {
            if (current !== requestId) return;
            if (error.status === 401) { ERP.redirectToLogin(); return; }
            events = [];
            loadError = error.message || 'Unable to load events.';
            renderError(loadError);
        }
    }

    function setTab(next) {
        tab = next;
        document.querySelectorAll('.ev-tab').forEach(button => {
            const active = button.dataset.tab === next;
            button.classList.toggle('active', active);
            button.setAttribute('aria-selected', String(active));
        });
        renderList();
    }

    $('searchForm').addEventListener('submit', event => {
        event.preventDefault();
        query = $('searchInput').value.trim().slice(0, 100);
        load();
    });

    $('searchInput').addEventListener('search', () => {
        if (!$('searchInput').value.trim() && query) {
            query = '';
            load();
        }
    });

    document.querySelectorAll('.ev-tab').forEach(button => button.addEventListener('click', () => setTab(button.dataset.tab)));

    document.querySelectorAll('.ev-chip').forEach(chip => chip.addEventListener('click', () => {
        if (chip.dataset.category === category) return;
        category = chip.dataset.category;
        document.querySelectorAll('.ev-chip').forEach(item => {
            const active = item === chip;
            item.classList.toggle('active', active);
            item.setAttribute('aria-pressed', String(active));
        });
        load();
    }));

    $('filterToggle').addEventListener('click', () => {
        const panel = $('filterPanel');
        panel.hidden = !panel.hidden;
        $('filterToggle').setAttribute('aria-expanded', String(!panel.hidden));
    });

    $('applyFilter').addEventListener('click', () => {
        participationFilter = $('participationFilter').value;
        renderList();
    });

    $('resetFilter').addEventListener('click', () => {
        participationFilter = 'all';
        $('participationFilter').value = 'all';
        renderList();
    });

    $('eventList').addEventListener('click', async event => {
        if (event.target.closest('[data-retry]')) { load(); return; }
        const detailButton = event.target.closest('[data-detail]');
        if (detailButton) {
            detailButton.disabled = true;
            try {
                const item = await ERP.call(`/api/student/events/${encodeURIComponent(detailButton.dataset.detail)}`);
                $('detailTitle').textContent = item.title || 'Event details';
                $('detailContent').replaceChildren();
                [
                    ['Dates', dateRange(item)],
                    ['Time', timeRange(item)],
                    ['Organizer', item.organizer_name],
                    ['Participation', item.participation_status],
                    ['OD status', item.od_status]
                ].filter(([, value]) => value).forEach(([label, value]) => {
                    const row = document.createElement('p');
                    const strong = document.createElement('strong');
                    strong.textContent = `${label}: `;
                    row.append(strong, document.createTextNode(value));
                    $('detailContent').append(row);
                });
                $('eventDetail').showModal();
            } catch (error) {
                if (error.status === 401) { ERP.redirectToLogin(); return; }
                setNotice(error.message || 'Unable to load event details.', true);
            } finally {
                detailButton.disabled = false;
            }
            return;
        }
        const button = event.target.closest('[data-apply-od]');
        if (!button) return;
        button.disabled = true;
        try {
            const result = await ERP.call('/api/student/apply-od', {
                method: 'POST',
                body: { event_id: Number(button.dataset.applyOd), applied_date: button.dataset.appliedDate }
            });
            setNotice(result.message || 'OD request submitted.');
            await load();
        } catch (error) {
            if (error.status === 401) { ERP.redirectToLogin(); return; }
            setNotice(error.message, true);
            button.disabled = false;
        }
    });

    ERP.call('/api/auth/me')
        .then(profile => { $('topAvatarInitial').textContent = (profile.name || '?').trim().charAt(0).toUpperCase() || '?'; })
        .catch(error => { if (error.status === 401) ERP.redirectToLogin(); });
    ERP.call('/api/notifications/unread-count')
        .then(data => {
            const unread = Number(data.unread_notifications || 0);
            const badge = $('eventsUnread');
            badge.hidden = unread === 0;
            badge.textContent = unread > 9 ? '9+' : String(unread);
            $('eventsBell').setAttribute('aria-label', unread ? `Notifications, ${unread} unread` : 'Notifications');
        })
        .catch(error => {
            if (error.status === 401) ERP.redirectToLogin();
            else setNotice('Unread notification count is unavailable.', true);
        });
    load();
})();
