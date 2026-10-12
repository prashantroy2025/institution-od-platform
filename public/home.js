/* Student home dashboard — premium blue & white mobile-first ERP screen.
 *
 * Data sources (reused, not duplicated) :
 *   /api/auth/me                     profile, course, batch, section
 *   /api/attendance/summary          subject-wise attendance + history
 *   /api/timetable                   student timetable (next class)
 *   /api/learning/assignments       published assignments for the student
 *   /api/examinations                visible exams for the student
 *   /api/finance/invoices            the student's own invoices
 *   /api/library/my-loans            the student's own library loans
 *   /api/student/events              approved campus events
 *   /api/student/my-od               the student's OD applications
 *   /api/community/feed              campus feed + For You / Official / Events / Following / All filters
 *   /api/community/feed/:id/*        like / save / share / comments
 *   /api/notifications/*             bell badge + notification list
 */
(() => {
    'use strict';

    if (!ERP.token()) { location.replace('login.html'); return; }

    const $ = id => document.getElementById(id);
    const esc = ERP.escapeHtml;
    const toast = message => (window.ERPUI ? ERPUI.success(message) : null);
    const err = message => (window.ERPUI ? ERPUI.error(message) : null);
    const safe = fn => fn().catch(e => { if (e && e.status === 401) ERP.redirectToLogin(); else throw e; });

    /* Stable colour families reused from home.css (:root token classes). */
    const SERVICE_TONES = ['svc-blue', 'svc-green', 'svc-red', 'svc-orange', 'svc-purple', 'svc-pink', 'svc-teal', 'svc-indigo', 'svc-slate', 'svc-cyan', 'svc-lime', 'svc-grid8'];

    /* Full service catalogue. Only real destination pages are linked; anything
       without an implementation renders a labelled, navigable placeholder. */
    const SERVICES = [
        { key: 'academic', label: 'Academic', icon: '📚', tone: 'svc-blue', href: 'academic.html' },
        { key: 'attendance', label: 'Attendance', icon: '📅', tone: 'svc-green', href: 'attendance.html' },
        { key: 'examinations', label: 'Examinations', icon: '📝', tone: 'svc-red', href: 'examinations.html' },
        { key: 'assignments', label: 'Assignments', icon: '📋', tone: 'svc-orange', href: 'learning.html?view=assignments' },
        { key: 'library', label: 'Library', icon: '📖', tone: 'svc-purple', href: 'library.html' },
        { key: 'fees', label: 'Fees', icon: '₹', tone: 'svc-green', href: 'fees.html' },
        { key: 'events', label: 'Events', icon: '🎉', tone: 'svc-red', href: 'events.html' },
        { key: 'notices', label: 'Notices', icon: '📢', tone: 'svc-blue', href: 'notices.html' },
        { key: 'transport', label: 'Transport', icon: '🚌', tone: 'svc-cyan', href: 'transport.html' },
        { key: 'hostel', label: 'Hostel', icon: '🏠', tone: 'svc-pink', href: 'hostel.html' },
        { key: 'certificates', label: 'Certificates', icon: '📜', tone: 'svc-teal', href: 'certificates.html' },
        { key: 'more', label: 'More Services', icon: '⊞', tone: 'svc-grid8', href: 'more-services.html' }
    ];

    /* Modules that have no backend in this installation. They open a clearly
       labelled placeholder page (coming-soon.html?module=…) instead of a broken
       link or a feature that only appears to work. */
    const PLACEHOLDER_MODULES = {
        notices: 'notices.html',
        transport: 'transport.html',
        hostel: 'hostel.html',
        certificates: 'certificates.html'
    };

    /* Cards in the More Services bottom sheet, in display order. Existing modules
       are linked directly; the rest open the labelled placeholder page. */
    const MORE_SERVICES = [
        { label: 'Placement & Training', desc: 'Jobs, Internships, Training Programs', icon: '💼', tone: 'more-blue', href: 'coming-soon.html?module=placement' },
        { label: 'Clubs & Societies', desc: 'Join Clubs, Activities', icon: '👥', tone: 'more-green', href: 'coming-soon.html?module=clubs' },
        { label: 'Grievance / Support', desc: 'Raise a Complaint, Track Status', icon: '❓', tone: 'more-purple', href: 'coming-soon.html?module=grievance' },
        { label: 'Transport / Hostel', desc: 'Bus Routes, Hostel Details', icon: '🚌', tone: 'more-blue', href: 'coming-soon.html?module=transport-hostel' },
        { label: 'Health & Medical', desc: 'Medical Facility, Health Records', icon: '🏥', tone: 'more-red', href: 'coming-soon.html?module=health' },
        { label: 'ID Card / Certificates', desc: 'Download ID, Bonafide, Certificates', icon: '📇', tone: 'more-blue', href: 'profile-student-id.html' },
        { label: 'Campus Map', desc: 'Navigate Campus, Important Locations', icon: '📍', tone: 'more-mint', href: 'coming-soon.html?module=campus-map' },
        { label: 'Feedback', desc: 'Give Feedback, Suggestions', icon: '📣', tone: 'more-orange', href: 'coming-soon.html?module=feedback' },
        { label: 'Alumni Connect', desc: 'Connect with Alumni Network', icon: '🎓', tone: 'more-lilac', href: 'coming-soon.html?module=alumni' },
        { label: 'Lost & Found', desc: 'Report or Search Lost Items', icon: '🔍', tone: 'more-pink', href: 'coming-soon.html?module=lost-found' },
        { label: 'Settings', desc: 'App Settings, Preferences', icon: '⚙️', tone: 'more-slate', href: 'coming-soon.html?module=settings' },
        { label: 'Other Services', desc: 'Additional Tools and Resources', icon: '⋯', tone: 'more-gray', href: 'coming-soon.html?module=other' }
    ];

    const FEED_LABELS = { for_you: 'For You', official: 'Official', events: 'Events', following: 'Following', all: 'All' };
    const FEED_NOTES = {
        for_you: 'Recommended college posts',
        official: 'Official announcements from the college',
        events: 'Posts about campus events',
        following: 'People and clubs you follow',
        all: 'Every post you can see'
    };

    let profile = null;
    let events = [];
    let pendingEventId = null;

    /* ------------------------------ helpers ------------------------------ */

    const timeOf = value => (value == null ? '' : String(value).slice(0, 5));
    const greeting = () => { const h = new Date().getHours(); return h < 12 ? 'Good Morning' : h < 17 ? 'Good Afternoon' : 'Good Evening'; };
    const initial = name => (name || '?').trim().charAt(0).toUpperCase() || '?';

    function money(paise) {
        const value = Number(paise || 0) / 100;
        return '₹' + value.toLocaleString('en-IN', { maximumFractionDigits: 2 });
    }

    function dueLabel(value) {
        if (!value) return '';
        const date = new Date(`${String(value).slice(0, 10)}T23:59:59`);
        const days = Math.ceil((date - new Date()) / 86400000);
        if (days < 0) return 'Overdue';
        if (days === 0) return 'Due today';
        if (days === 1) return 'Due tomorrow';
        return `Due in ${days} days`;
    }

    const setStatus = (message, variant) => { const node = $('homeNotice'); if (node) { node.textContent = message || ''; node.className = 'stu-state' + (variant === 'error' ? ' error' : ''); } };

    /* ------------------------------ quick cards ------------------------------ */

    function quickCard({ tone, icon, key, value, sub, href }) {
        return `<button class="stu-qcard" data-href="${esc(href)}" aria-label="${esc(key)}">
            ${icon}
            <span><span class="qk">${esc(key)}</span><span class="qv">${esc(value)}</span>${sub ? `<span class="qs">${esc(sub)}</span>` : ''}</span>
            <span class="chev" aria-hidden="true">›</span>
        </button>`;
    }

    function ringIcon(percent) {
        const value = Math.max(0, Math.min(100, Math.round(Number(percent) || 0)));
        return `<span class="ring ${value < 75 ? 'low' : ''}" style="--p:${value}" role="img" aria-label="Attendance ${value}%"><b>${value}%</b></span>`;
    }

    async function loadNextClass() {
        try {
            const data = await safe(() => ERP.call('/api/timetable?limit=100'));
            const today = new Date().getDay() === 0 ? 7 : new Date().getDay();
            const now = `${String(new Date().getHours()).padStart(2, '0')}:${String(new Date().getMinutes()).padStart(2, '0')}`;
            const todays = data.items.filter(e => Number(e.weekday) === today).sort((a, b) => timeOf(a.start_time).localeCompare(timeOf(b.start_time)));
            const next = todays.find(e => timeOf(e.end_time) > now) || todays[0];
            if (!next) return quickCard({ tone: 'blue', icon: '<span class="stu-qicon tone-blue">📅</span>', key: 'Next Class', value: 'No classes today', sub: 'Enjoy your day', href: 'attendance.html' });
            return quickCard({
                tone: 'blue', icon: '<span class="stu-qicon tone-blue">📅</span>', key: 'Next Class',
                value: esc(next.subject_name || 'Class'),
                sub: `${timeOf(next.start_time)} – ${timeOf(next.end_time)}${next.classroom_name ? ' · ' + esc(next.classroom_name) : ''}${next.faculty_name ? ' · ' + esc(next.faculty_name) : ''}`,
                href: 'attendance.html'
            });
        } catch (e) {
            return quickCard({ tone: 'blue', icon: '<span class="stu-qicon tone-blue">📅</span>', key: 'Next Class', value: 'Unavailable', sub: 'Timetable not loaded', href: 'attendance.html' });
        }
    }

    async function loadAttendanceCard() {
        try {
            const data = await safe(() => ERP.call('/api/attendance/summary'));
            const overall = data.overall || {};
            const percent = overall.percentage;
            if (percent == null) return quickCard({ tone: 'green', icon: '<span class="stu-qicon tone-green">📅</span>', key: 'Attendance', value: 'No records', sub: 'No attendance marked yet', href: 'attendance.html' });
            return quickCard({ tone: 'green', icon: ringIcon(percent), key: 'Attendance', value: `${overall.attended ?? 0}/${overall.total ?? 0} classes`, sub: `This semester · target ${data.threshold || 75}%`, href: 'attendance.html' });
        } catch (e) {
            return quickCard({ tone: 'green', icon: '<span class="stu-qicon tone-green">📅</span>', key: 'Attendance', value: 'Unavailable', sub: 'Could not load attendance', href: 'attendance.html' });
        }
    }

    async function loadAssignmentsCard() {
        try {
            const data = await safe(() => ERP.call('/api/learning/assignments?limit=100'));
            const items = data.items || [];
            const pending = items.filter(a => !a.submission_status || a.submission_status === 'Returned');
            const overdue = pending.filter(a => a.deadline && dueLabel(a.deadline) === 'Overdue').length;
            const value = pending.length ? `${pending.length} Pending` : 'All done';
            return quickCard({
                tone: 'amber', icon: '<span class="stu-qicon tone-amber">📋</span>', key: 'Assignments',
                value, sub: pending.length ? (overdue ? `${overdue} overdue · rest due soon` : 'Due this week') : 'No pending assignments',
                href: 'learning.html?view=assignments'
            });
        } catch (e) {
            return quickCard({ tone: 'amber', icon: '<span class="stu-qicon tone-amber">📋</span>', key: 'Assignments', value: 'Unavailable', sub: 'Could not load assignments', href: 'learning.html?view=assignments' });
        }
    }

    async function loadFeesCard() {
        try {
            const data = await safe(() => ERP.call('/api/finance/invoices?limit=100'));
            const items = (data.items || []).filter(i => i.status !== 'Paid');
            const outstanding = items.reduce((sum, i) => sum + (BigInt(i.total_paise || 0) - BigInt(i.discount_paise || 0) - BigInt(i.waiver_paise || 0)), 0n);
            const value = items.length ? money(outstanding.toString()) : 'No dues';
            return quickCard({ tone: 'purple', icon: '<span class="stu-qicon tone-purple">₹</span>', key: 'Fees', value, sub: items.length ? `${items.length} unpaid invoice${items.length === 1 ? '' : 's'}` : 'All invoices settled', href: 'fees.html' });
        } catch (e) {
            return quickCard({ tone: 'purple', icon: '<span class="stu-qicon tone-purple">₹</span>', key: 'Fees', value: 'Unavailable', sub: 'Could not load invoices', href: 'fees.html' });
        }
    }

    async function loadExamsCard() {
        try {
            const data = await safe(() => ERP.call('/api/examinations?limit=100'));
            const upcoming = (data.items || []).filter(e => e.scheduled_start && new Date(e.scheduled_start) > new Date()).sort((a, b) => new Date(a.scheduled_start) - new Date(b.scheduled_start));
            if (!upcoming.length) return quickCard({ tone: 'red', icon: '<span class="stu-qicon tone-red">📝</span>', key: 'Examinations', value: 'No exams', sub: 'Nothing scheduled yet', href: 'examinations.html' });
            const next = upcoming[0];
            const when = new Date(next.scheduled_start);
            return quickCard({ tone: 'red', icon: '<span class="stu-qicon tone-red">📝</span>', key: 'Examinations', value: esc(next.title || 'Exam'), sub: `${when.toLocaleDateString()} · ${timeOf(next.scheduled_start)}`, href: 'examinations.html' });
        } catch (e) {
            return quickCard({ tone: 'red', icon: '<span class="stu-qicon tone-red">📝</span>', key: 'Examinations', value: 'Unavailable', sub: 'Could not load exams', href: 'examinations.html' });
        }
    }

    async function loadOdCard() {
        try {
            const data = await safe(() => ERP.call('/api/student/my-od'));
            const rows = data || [];
            const approved = rows.filter(o => o.status === 'Auto Approved' || o.status === 'HOD Approved').length;
            const pending = rows.filter(o => o.status === 'Pending').length;
            if (!rows.length) return quickCard({ tone: 'green', icon: '<span class="stu-qicon tone-green">✅</span>', key: 'OD', value: 'No requests', sub: 'View events and OD requests', href: 'events.html' });
            return quickCard({ tone: 'green', icon: '<span class="stu-qicon tone-green">✅</span>', key: 'OD', value: `${approved} approved`, sub: pending ? `${pending} awaiting HOD approval` : 'No pending requests', href: 'events.html' });
        } catch (e) {
            return quickCard({ tone: 'green', icon: '<span class="stu-qicon tone-green">✅</span>', key: 'OD', value: 'Unavailable', sub: 'Could not load OD requests', href: 'events.html' });
        }
    }

    async function loadQuickCards() {
        const cards = await Promise.all([
            loadNextClass(), loadAttendanceCard(), loadAssignmentsCard(),
            loadFeesCard(), loadExamsCard(), loadOdCard()
        ]);
        $('quickCards').innerHTML = cards.join('');
    }

    /* ------------------------------ profile ------------------------------ */

    async function loadProfile() {
        profile = await safe(() => ERP.call('/api/auth/me'));
        document.title = `Home · ${profile.name}`;
        $('heroName').textContent = profile.name;
        $('heroGreet').textContent = greeting() + ',';
        $('heroAvatar').textContent = initial(profile.name);
        $('topAvatarInitial').textContent = initial(profile.name);
        $('composerAvatar').textContent = initial(profile.name);
        $('drawerAvatar').textContent = initial(profile.name);
        $('drawerName').textContent = profile.name;
        $('drawerMeta').textContent = profile.role === 'student'
            ? [profile.profile.course_name, profile.department_name].filter(Boolean).join(' · ') || 'Student'
            : [profile.profile.designation, profile.department_name].filter(Boolean).join(' · ') || profile.role;

        const student = profile.profile || {};
        const meta = [];
        if (student.course_name) meta.push(`<span class="chip">${esc(student.course_name)}</span>`);
        if (student.batch_name) meta.push(`<span class="chip">${esc(student.batch_name)}</span>`);
        if (student.section_name) meta.push(`<span class="chip">Section ${esc(student.section_name)}</span>`);
        const identity = [student.enrollment_no ? `Roll No: ${esc(student.enrollment_no)}` : '', profile.department_name ? esc(profile.department_name) : ''].filter(Boolean).join(' | ');
        $('heroMeta').innerHTML = (meta.join('') || '<span class="chip">Academic details unavailable</span>') + (identity ? `<span class="roll">${identity}</span>` : '');
    }

    /* ------------------------------ services ------------------------------ */

    function openService(href) {
        const placeholder = Object.keys(PLACEHOLDER_MODULES).find(key => PLACEHOLDER_MODULES[key] === href);
        if (placeholder) { location.href = 'coming-soon.html?module=' + encodeURIComponent(placeholder); return; }
        location.href = href;
    }

    function renderServices() {
        $('serviceGrid').innerHTML = SERVICES.map((service, index) => `
            <button class="stu-svc" data-href="${esc(service.href)}" data-key="${esc(service.key)}" aria-label="${esc(service.label)}">
                <span class="ico ${SERVICE_TONES[index % SERVICE_TONES.length]}">${service.icon}</span>
                <span class="lbl">${esc(service.label)}</span>
            </button>`).join('');
        $('serviceGrid').querySelectorAll('.stu-svc').forEach(node => node.addEventListener('click', () => {
            if (node.dataset.key === 'more') { openOverlay('more'); return; }
            openService(node.dataset.href);
        }));
    }

    function renderMoreServices() {
        $('moreList').innerHTML = MORE_SERVICES.map(service => `
            <a class="more-card ${service.tone}" href="${esc(service.href)}">
                <span class="more-ico" aria-hidden="true">${service.icon}</span>
                <strong>${esc(service.label)}</strong>
                <small>${esc(service.desc)}</small>
            </a>`).join('');
    }

    /* ------------------------------ event banner ------------------------------ */

    let bannerIndex = 0;
    let bannerTimer = null;

    function renderBanner() {
        const banner = $('eventBanner');
        if (!events.length) { banner.hidden = true; return; }
        banner.hidden = false;
        const event = events[bannerIndex % events.length];
        $('bannerEyebrow').textContent = bannerIndex === 0 ? 'Latest event' : 'Upcoming';
        $('bannerTitle').textContent = event.title;
        const range = [event.from_date, event.to_date].filter(Boolean).map(d => new Date(d).toLocaleDateString()).join(' – ');
        $('bannerText').textContent = `${range || 'Date to be announced'}${event.start_time ? ' · ' + timeOf(event.start_time) : ''}`;
        const participated = event.participation_status === 'Participated';
        const od = event.od_status;
        $('bannerTags').innerHTML = [
            participated ? '✓ Participated' : '',
            od ? `OD: ${esc(od)}` : ''
        ].filter(Boolean).map(t => `<span class="tag">${t}</span>`).join('');
        const cta = $('bannerCta');
        cta.firstChild.textContent = participated ? 'View events ' : 'Explore events ';
        $('bannerDots').innerHTML = events.slice(0, 5).map((_, i) => `<span class="dot ${i === bannerIndex % events.length ? 'active' : ''}"></span>`).join('');
    }

    function startBannerRotation() {
        if (bannerTimer || events.length < 2) return;
        bannerTimer = setInterval(() => { bannerIndex += 1; renderBanner(); }, 6000);
    }

    async function loadEvents() {
        try {
            events = await safe(() => ERP.call('/api/student/events'));
            events = (events || []).filter(e => new Date(e.to_date || e.from_date) >= new Date(new Date().toDateString()))
                .sort((a, b) => new Date(a.from_date) - new Date(b.from_date)).slice(0, 5);
            renderBanner();
            startBannerRotation();
            renderComposerEventMenu();
        } catch (e) { $('eventBanner').hidden = true; }
    }

    /* ------------------------------ campus feed ------------------------------ */

    const feed = { filter: 'for_you', search: '', offset: 0, limit: 10, total: 0, loading: false };

    function feedTabButtons() { return [...$('feedTabs').querySelectorAll('.stu-tab')]; }

    async function loadFeed(reset = true) {
        if (feed.loading) return;
        if (reset) feed.offset = 0;
        feed.loading = true;
        releaseMedia();
        // Compact inline busy row instead of tall skeleton cards: keeps the page
        // height stable so switching filters never makes the feed jump.
        $('posts').setAttribute('aria-busy', 'true');
        $('loadMoreBtn').hidden = true;
        try {
            const params = new URLSearchParams({ filter: feed.filter, limit: String(feed.limit), offset: String(feed.offset) });
            if (feed.search) params.set('search', feed.search);
            const data = await safe(() => ERP.call('/api/community/feed?' + params.toString()));
            feed.total = data.pagination.total;
            $('feedNote').textContent = `${FEED_NOTES[data.filter] || 'Campus posts'} · ${feed.total} post${feed.total === 1 ? '' : 's'}${feed.search ? ` matching "${feed.search}"` : ''}`;
            const html = data.items.length ? data.items.map(renderPost).join('') : `<div class="stu-empty">No posts in this view yet.${feed.filter === 'events' ? ' Event posts appear when staff tag a post to a campus event.' : ''}</div>`;
            $('posts').innerHTML = html;
            bindPostActions();
            const remaining = feed.total - feed.offset - feed.limit;
            $('loadMoreBtn').hidden = remaining <= 0;
            $('loadMoreBtn').textContent = `Load more posts (${Math.max(remaining, 0)} remaining)`;
            await hydrateMedia();
        } catch (e) {
            $('posts').innerHTML = `<div class="stu-state error">${esc(e.message)}</div>`;
        } finally { feed.loading = false; $('posts').removeAttribute('aria-busy'); }
    }

    function renderPost(post) {
        const own = profile && Number(post.author_id) === Number(profile.id);
        const official = Number(post.is_official) === 1;
        const created = new Date(post.created_at);
        const media = post.media_storage_key || post.media_original_name;
        const event = post.event_id ? events.find(e => Number(e.id) === Number(post.event_id)) : null;
        const isVideo = /video|mp4/i.test(post.media_mime_type || post.media_original_name || '');
        return `<article class="stu-post" data-id="${esc(post.id)}">
            <div class="ph">
                <span class="ava" aria-hidden="true">${esc(initial(post.author_name))}</span>
                <div>
                    <div class="who">${esc(post.author_name)} ${official ? '<span class="verified" title="Official account">✔</span>' : ''}</div>
                    <div class="meta">${official ? 'Official · ' : ''}${ERP.roleName(post.author_role)} · ${created.toLocaleString()}</div>
                </div>
                ${own ? `<button class="more" data-act="remove" aria-label="Delete your post">🗑</button>` : ''}
            </div>
            <p class="txt">${esc(post.body)}</p>
            ${event ? `<span class="event-chip">📅 ${esc(event.title)}</span>` : ''}
            ${media ? `<div class="media" data-media-for="${esc(post.id)}" data-kind="${isVideo ? 'video' : 'image'}">${isVideo ? '<video controls preload="metadata"></video>' : '<img alt="Post attachment" loading="lazy">'}<span class="count">1/1</span></div>` : ''}
            <div class="actions">
                <button class="stu-act ${post.liked ? 'on' : ''}" data-act="like" aria-pressed="${post.liked ? 'true' : 'false'}">${post.liked ? '❤️' : '🤍'} <span class="actcount">${post.likes}</span></button>
                <button class="stu-act" data-act="comment" aria-expanded="false">💬 <span class="actcount">${post.comments}</span></button>
                <button class="stu-act" data-act="share">↗ ${post.shared ? 'Shared' : 'Share'}${post.shares ? ` (${post.shares})` : ''}</button>
                <button class="stu-act save ${post.saved ? 'on' : ''}" data-act="save" aria-pressed="${post.saved ? 'true' : 'false'}" style="margin-left:auto">${post.saved ? '🔖' : '📑'}</button>
            </div>
            <div class="comments" hidden>
                <form data-form="comment"><input name="body" maxlength="2000" placeholder="Write a comment…" aria-label="Write a comment" required></form>
                <div class="clist" data-role="comments"></div>
            </div>
        </article>`;
    }

    /* Attachments are private: fetch them with the bearer token and hand the browser a
       blob URL. A bare <img src> cannot send the Authorization header, which the API
       rightly rejects with 403 — the same pattern dashboard.html already uses. */
    const mediaBlobs = new Set();

    function releaseMedia() {
        mediaBlobs.forEach(url => URL.revokeObjectURL(url));
        mediaBlobs.clear();
    }

    async function hydrateMedia() {
        const nodes = [...$('posts').querySelectorAll('.media[data-media-for]')];
        await Promise.all(nodes.map(async holder => {
            const node = holder.querySelector('img, video');
            if (!node) return;
            const id = holder.dataset.mediaFor;
            try {
                const response = await fetch(ERP.apiBase() + '/api/community/feed/' + id + '/media', { headers: ERP.authHeaders() });
                if (!response.ok) throw new Error(`attachment unavailable (${response.status})`);
                const url = URL.createObjectURL(await response.blob());
                mediaBlobs.add(url);
                node.src = url;
            } catch (e) {
                holder.innerHTML = `<div class="nomed">${esc(e.message)}</div>`;
            }
        }));
    }

    function bindPostActions() {
        $('posts').querySelectorAll('.stu-post').forEach(node => {
            const id = node.dataset.id;
            node.querySelectorAll('[data-act]').forEach(button => button.addEventListener('click', async () => {
                const action = button.dataset.act;
                try {
                    if (action === 'like' || action === 'save') {
                        const result = await safe(() => ERP.call(`/api/community/feed/${id}/${action}`, { method: 'POST' }));
                        toast(action === 'like' ? (result.active ? 'Liked post' : 'Like removed') : (result.active ? 'Post saved' : 'Removed from saved'));
                        await loadFeed(false);
                    } else if (action === 'share') {
                        await safe(() => ERP.call(`/api/community/feed/${id}/share`, { method: 'POST', body: {} }));
                        toast('Post shared');
                        await loadFeed(false);
                    } else if (action === 'comment') {
                        const area = node.querySelector('.comments');
                        const open = area.hidden;
                        area.hidden = !open;
                        button.setAttribute('aria-expanded', String(open));
                        if (open) await loadComments(id, area);
                    } else if (action === 'remove') {
                        if (!window.ERPUI) return;
                        const ok = await ERPUI.confirm('Remove this post? It will no longer appear in the campus feed.', 'Remove post');
                        if (!ok) return;
                        await safe(() => ERP.call('/api/community/feed/' + id, { method: 'DELETE' })); 
                        toast('Post removed');
                        await loadFeed(true);
                    }
                } catch (e) { err(e.message); }
            }));
            const form = node.querySelector('[data-form="comment"]');
            if (form) form.addEventListener('submit', async event => {
                event.preventDefault();
                const body = form.body.value.trim();
                if (!body) return;
                try {
                    await safe(() => ERP.call(`/api/community/feed/${id}/comments`, { method: 'POST', body: { body } }));
                    form.reset();
                    // Reload the thread and refresh the count in place. Re-fetching the
                    // whole feed here would re-render the post and wipe the thread.
                    const posted = await loadComments(id, node.querySelector('.comments'));
                    const total = Array.isArray(posted) ? posted.length : (posted.items || []).length;
                    const counter = node.querySelector('[data-act="comment"] .actcount');
                    if (counter) counter.textContent = String(total);
                } catch (e) { err(e.message); }
            });
        });
    }

    async function loadComments(id, area) {
        const list = area.querySelector('[data-role="comments"]');
        list.innerHTML = '<div class="stu-state">Loading comments…</div>';
        try {
            const data = await safe(() => ERP.call(`/api/community/feed/${id}/comments`));
            const items = Array.isArray(data) ? data : (data.items || []);
            list.innerHTML = items.length ? items.map(c => `<div class="crow"><b>${esc(c.author_name)}</b> ${esc(c.body)}<small>${new Date(c.created_at).toLocaleString()}</small></div>`).join('') : '<div class="stu-empty">No comments yet.</div>';
            return data;
        } catch (e) { list.innerHTML = `<div class="stu-state error">${esc(e.message)}</div>`; return { items: [] }; }
    }

    /* ------------------------------ composer ------------------------------ */

    let composerFile = null;

    const setComposerFile = file => {
        composerFile = file;
        const attach = $('composerAttach');
        $('postSubmitBtn').disabled = !file && !$('postBody').value.trim();
        if (!file) {
            attach.hidden = true;
            $('composerPreview').hidden = true; $('composerPreviewVideo').hidden = true;
            $('composerFileName').textContent = '';
            $('postImage').value = ''; $('postVideo').value = '';
            return;
        }
        attach.hidden = false;
        $('composerFileName').textContent = file.name;
        const isVideo = /^video\//i.test(file.type);
        $('composerPreview').hidden = isVideo; $('composerPreviewVideo').hidden = !isVideo;
        if (isVideo) $('composerPreviewVideo').src = URL.createObjectURL(file);
        else $('composerPreview').src = URL.createObjectURL(file);
    };

    function renderComposerEventMenu() {
        const menu = $('composerMoreMenu');
        const existing = menu.querySelector('[data-act="event"]');
        if (existing) existing.remove();
        if (!events.length) return;
        events.forEach(event => {
            const button = document.createElement('button');
            button.type = 'button';
            button.dataset.act = 'event';
            button.dataset.eventId = String(event.id);
            button.textContent = `📅 ${event.title}`;
            button.addEventListener('click', () => {
                pendingEventId = event.id;
                $('composerVisLabel').textContent = `Tagged: ${event.title}`;
                menu.classList.remove('open');
            });
            menu.appendChild(button);
        });
    }

    function bindComposer() {
        $('postBody').addEventListener('input', () => { $('postSubmitBtn').disabled = !$('postBody').value.trim() && !composerFile; });
        $('pickImage').addEventListener('click', () => $('postImage').click());
        $('pickVideo').addEventListener('click', () => $('postVideo').click());
        $('postImage').addEventListener('change', e => { if (e.target.files[0]) setComposerFile(e.target.files[0]); });
        $('postVideo').addEventListener('change', e => { if (e.target.files[0]) setComposerFile(e.target.files[0]); });
        $('composerRemove').addEventListener('click', () => setComposerFile(null));
        $('composerMoreBtn').addEventListener('click', () => $('composerMoreMenu').classList.toggle('open'));
        $('composerMoreMenu').querySelectorAll('[data-vis]').forEach(button => button.addEventListener('click', () => {
            const labels = { college: 'Visible to college', classmates: 'Visible to classmates', following: 'Visible to followers' };
            $('composerVisLabel').textContent = labels[button.dataset.vis];
            $('composerMoreMenu').classList.remove('open');
        }));
        document.addEventListener('click', event => {
            if (!event.target.closest('.morewrap')) $('composerMoreMenu').classList.remove('open');
        });

        $('composer').addEventListener('submit', async event => {
            event.preventDefault();
            const body = $('postBody').value.trim();
            if (!body && !composerFile) return;
            const submit = $('postSubmitBtn');
            submit.disabled = true;
            submit.textContent = 'Posting…';
            try {
                const form = new FormData();
                form.append('body', body || composerFile.name);
                if (composerFile) form.append('media', composerFile);
                if (pendingEventId) form.append('event_id', String(pendingEventId));
                await safe(() => ERP.call('/api/community/feed', { method: 'POST', body: form }));
                $('composer').reset();
                setComposerFile(null);
                pendingEventId = null;
                $('composerVisLabel').textContent = '';
                toast('Post published');
                await loadFeed(true);
            } catch (e) { err(e.message); }
            finally { submit.textContent = 'Post'; submit.disabled = !$('postBody').value.trim() && !composerFile; }
        });
    }

    /* ------------------------------ notifications ------------------------------ */

    async function loadNotifications() {
        try {
            const [rows, count] = await Promise.all([
                safe(() => ERP.call('/api/notifications/my-notifications')),
                safe(() => ERP.call('/api/notifications/unread-count'))
            ]);
            const unread = Number(count.unread_notifications || 0);
            const badge = $('bellBadge');
            badge.hidden = unread === 0;
            badge.textContent = unread > 9 ? '9+' : String(unread);
            const items = rows || [];
            $('notifList').innerHTML = items.length
                ? items.slice(0, 30).map(n => `<div class="item ${n.is_read ? '' : 'unread'}"><div class="t">${esc(n.message)}</div><div class="time">${new Date(n.created_at).toLocaleString()}</div></div>`).join('')
                : '<div class="stu-empty">No notifications yet.</div>';
        } catch (e) { $('notifList').innerHTML = `<div class="stu-state error">${esc(e.message)}</div>`; }
    }

    function bindNotifications() {
        $('bellBtn').addEventListener('click', () => {
            const panel = $('notifPanel');
            panel.classList.toggle('open');
            panel.setAttribute('aria-hidden', panel.classList.contains('open') ? 'false' : 'true');
            if (panel.classList.contains('open')) loadNotifications();
        });
        document.addEventListener('click', event => {
            const panel = $('notifPanel');
            if (panel.classList.contains('open') && !event.target.closest('#notifPanel') && !event.target.closest('#bellBtn')) {
                panel.classList.remove('open');
                panel.setAttribute('aria-hidden', 'true');
            }
        });
    }

    /* ------------------------------ overlays ------------------------------ */

    let moreTrigger = null;

    const openOverlay = name => {
        if (name === 'drawer') { $('drawer').classList.add('open'); $('drawerBack').classList.add('open'); $('drawer').setAttribute('aria-hidden', 'false'); }
        if (name === 'sheet') { $('sheetBack').classList.add('open'); $('sheetBack').setAttribute('aria-hidden', 'false'); }
        if (name === 'more') {
            moreTrigger = document.activeElement;
            $('moreServices').classList.add('open');
            $('moreServices').setAttribute('aria-hidden', 'false');
            $('moreServices').querySelector('.close').focus();
        }
    };

    const closeOverlay = name => {
        if (name === 'drawer') { $('drawer').classList.remove('open'); $('drawerBack').classList.remove('open'); $('drawer').setAttribute('aria-hidden', 'true'); }
        if (name === 'sheet') { $('sheetBack').classList.remove('open'); $('sheetBack').setAttribute('aria-hidden', 'true'); }
        if (name === 'more' && $('moreServices').classList.contains('open')) {
            $('moreServices').classList.remove('open');
            $('moreServices').setAttribute('aria-hidden', 'true');
            if (moreTrigger && moreTrigger.isConnected) moreTrigger.focus();
            moreTrigger = null;
        }
    };

    function trapMoreFocus(event) {
        const focusable = [...$('moreServices').querySelectorAll('button, a[href]')];
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }

    function bindOverlays() {
        $('menuBtn').addEventListener('click', () => openOverlay('drawer'));
        $('drawerBack').addEventListener('click', () => closeOverlay('drawer'));
        $('allServicesBtn').addEventListener('click', () => openOverlay('more'));
        $('quickCreateBtn').addEventListener('click', () => openOverlay('sheet'));
        document.querySelectorAll('[data-close]').forEach(node => node.addEventListener('click', () => closeOverlay(node.dataset.close)));
        $('sheetBack').querySelectorAll('[data-create]').forEach(button => button.addEventListener('click', () => {
            closeOverlay('sheet');
            const kind = button.dataset.create;
            if (kind === 'image') $('postImage').click();
            else if (kind === 'video') $('postVideo').click();
            else if (kind === 'event') { $('composerMoreBtn').click(); }
            $('postBody').focus();
        }));
        $('signOutBtn').addEventListener('click', ERP.signOut);
        $('editProfileBtn').addEventListener('click', () => location.href = 'profile.html');
        $('bannerCta').addEventListener('click', () => location.href = 'events.html');
        document.addEventListener('keydown', event => {
            if (event.key === 'Escape') { closeOverlay('drawer'); closeOverlay('sheet'); closeOverlay('more'); $('notifPanel').classList.remove('open'); }
            else if (event.key === 'Tab' && $('moreServices').classList.contains('open')) trapMoreFocus(event);
        });
    }

    function bindDrawerNav() {
        const items = [
            ['🏠', 'Home', 'home.html'],
            ['📅', 'Attendance', 'attendance.html'],
            ['📚', 'Academic', 'academic.html'],
            ['📝', 'Examinations', 'examinations.html'],
            ['📋', 'Assignments', 'learning.html?view=assignments'],
            ['📖', 'Library', 'library.html'],
            ['₹', 'Fees', 'fees.html'],
            ['🎉', 'Events & OD', 'events.html'],
            ['💬', 'Messages', 'messages.html'],
            ['👤', 'Profile', 'profile.html']
        ];
        $('drawerNav').innerHTML = items.map(([icon, label, href]) =>
            `<a href="${esc(href)}" data-href="${esc(href)}"><span class="ico svc-blue">${icon}</span>${esc(label)}</a>`).join('');
        $('drawerNav').querySelectorAll('a[data-href]').forEach(node => node.addEventListener('click', event => {
            event.preventDefault();
            closeOverlay('drawer');
            openService(node.dataset.href);
        }));
    }

    /* ------------------------------ feed controls ------------------------------ */

    function bindFeedControls() {
        feedTabButtons().forEach(button => button.addEventListener('click', () => {
            feedTabButtons().forEach(other => { other.classList.toggle('active', other === button); other.setAttribute('aria-selected', String(other === button)); });
            feed.filter = button.dataset.filter;
            loadFeed(true);
        }));
        $('feedSearchBtn').addEventListener('click', () => {
            const form = $('feedSearchForm');
            form.classList.toggle('open');
            if (form.classList.contains('open')) $('feedSearchInput').focus();
        });
        $('topSearchBtn').addEventListener('click', () => openOverlay('more'));
        $('feedSearchForm').addEventListener('submit', event => {
            event.preventDefault();
            feed.search = $('feedSearchInput').value.trim();
            $('feedSearchClear').hidden = !feed.search;
            loadFeed(true);
        });
        $('feedSearchClear').addEventListener('click', () => {
            $('feedSearchInput').value = '';
            feed.search = '';
            $('feedSearchClear').hidden = true;
            loadFeed(true);
        });
        $('feedFilterBtn').addEventListener('click', () => openOverlay('more'));
        $('loadMoreBtn').addEventListener('click', () => { feed.offset += feed.limit; loadFeed(false); });
    }

    /* ------------------------------ boot ------------------------------ */

    async function boot() {
        try {
            renderServices();
            renderMoreServices();
            bindComposer();
            bindFeedControls();
            bindOverlays();
            bindNotifications();
            bindDrawerNav();
            $('composerVisLabel').textContent = '';
            await loadProfile();
            await Promise.all([loadQuickCards(), loadEvents(), loadNotifications()]);
            await loadFeed(true);
        } catch (e) {
            setStatus(e.message || 'Could not load your dashboard.', 'error');
            $('heroName').textContent = 'Welcome back';
        }
    }

    document.addEventListener('DOMContentLoaded', boot);
})();
