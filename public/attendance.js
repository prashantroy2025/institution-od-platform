/* Student Attendance dashboard and feature screens.
 *
 * Data sources (student-scoped by the server from the bearer token):
 *   /api/auth/me                       header avatar
 *   /api/attendance/semesters          semester selector
 *   /api/attendance/analytics          overall, subjects, months, eligibility
 *   /api/attendance/records            recent, filtered and today's records
 *   /api/timetable                     today's scheduled classes
 *   /api/attendance/leave              leave requests and document download
 *   /api/student/my-od                 OD applications and HOD status
 *   /api/notifications/unread-count    bell badge
 */
(() => {
    'use strict';

    if (!ERP.token()) { location.replace('login.html'); return; }

    const $ = id => document.getElementById(id);
    const esc = ERP.escapeHtml;
    const page = document.body.dataset.page;
    const urlParams = new URLSearchParams(location.search);
    const state = { semesterId: null, lastAnalytics: null };
    const PAGE_SIZE = 25;

    const SHORTCUT_VIEWS = {
        mark: { title: 'Mark Attendance (QR/Manual)' },
        history: { title: 'Attendance History' },
        subjects: { title: 'Subject-wise Attendance' },
        monthly: { title: 'Monthly Report' },
        leave: { title: 'Leave Application' },
        od: { title: 'OD Application' },
        analytics: { title: 'Attendance Analytics' },
        compensatory: { title: 'Compensatory Classes' }
    };

    const fmtPct = value => `${Math.round(Number(value) * 10) / 10}%`;
    const fmtDate = iso => {
        const [y, m, d] = String(iso || '').split('-').map(Number);
        return y ? new Date(y, m - 1, d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '';
    };
    const monthLabel = ym => {
        const [y, m] = ym.split('-').map(Number);
        return new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
    };
    const todayIso = () => {
        const d = new Date();
        return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
    };
    const semParam = () => (state.semesterId ? `semester_id=${state.semesterId}` : '');
    const pill = status => {
        const tones = { Present: 'present', Absent: 'absent', Late: 'late', Excused: 'excused', Pending: 'pending', Approved: 'approved', Rejected: 'rejected', 'HOD Approved': 'good', 'Auto Approved': 'good' };
        return `<span class="att-pill ${tones[status] || 'info'}">${esc(status)}</span>`;
    };
    const statusMark = status => {
        const absent = status === 'Absent';
        return `<span class="att-mark ${absent ? 'absent' : 'present'}" aria-label="${esc(status)}">${absent ? '✕' : '✓'}</span>`;
    };
    const stateHtml = (text, error = false) => `<p class="att-state${error ? ' error' : ''}">${esc(text)}</p>`;
    const errorHtml = message => `<div class="att-state error"><p>${esc(message)}</p><button type="button" class="att-button secondary" data-retry>Retry</button></div>`;
    const bar = (percent, low) => `<div class="att-bar" aria-hidden="true"><span class="${low ? 'low' : ''}" style="width:${Math.min(100, Math.max(0, Number(percent) || 0))}%"></span></div>`;

    function handleAuthError(error) {
        if (error.status === 401) { ERP.redirectToLogin(); return true; }
        return false;
    }

    async function load(root, fetcher, render) {
        root.innerHTML = stateHtml('Loading…');
        root.setAttribute('aria-busy', 'true');
        try {
            const data = await fetcher();
            root.setAttribute('aria-busy', 'false');
            render(data);
        } catch (error) {
            if (handleAuthError(error)) return;
            root.setAttribute('aria-busy', 'false');
            root.innerHTML = errorHtml(error.message || 'Unable to load attendance.');
            root.querySelector('[data-retry]').addEventListener('click', () => load(root, fetcher, render));
        }
    }

    /* ---------------- Shared: semester selector and shortcut links ---------------- */

    function setShortcutHrefs() {
        const semesterQuery = state.semesterId ? `&semester_id=${state.semesterId}` : '';
        document.querySelectorAll('[data-view]').forEach(link => {
            link.href = `attendance-view.html?view=${link.dataset.view}${semesterQuery}`;
        });
        const back = $('backLink');
        if (back) back.href = `attendance.html${state.semesterId ? `?semester_id=${state.semesterId}` : ''}`;
    }

    function updateUrlSemester() {
        const next = new URL(location.href);
        if (state.semesterId) next.searchParams.set('semester_id', state.semesterId);
        history.replaceState(null, '', next);
    }

    async function initSemesters() {
        const select = $('semesterSelect');
        try {
            const data = await ERP.call('/api/attendance/semesters');
            const requested = Number(urlParams.get('semester_id'));
            const valid = data.items.some(item => item.id === requested);
            state.semesterId = valid ? requested : data.current_semester_id;
            select.innerHTML = data.items.length
                ? data.items.map(item => `<option value="${item.id}">${esc(item.name)}</option>`).join('')
                : '<option value="">No semesters</option>';
            select.disabled = !data.items.length;
            if (state.semesterId) select.value = String(state.semesterId);
            setShortcutHrefs();
            updateUrlSemester();
            return true;
        } catch (error) {
            if (handleAuthError(error)) return false;
            select.innerHTML = '<option value="">Unavailable</option>';
            select.disabled = true;
            const note = $('semesterState');
            note.hidden = false;
            note.className = 'att-state error';
            note.textContent = `Semesters could not be loaded: ${error.message || 'unknown error'}`;
            return false;
        }
    }

    function refresh() {
        if (page === 'dashboard') {
            renderOverview();
            renderRecent();
            return;
        }
        const view = urlParams.get('view');
        const renderer = VIEW_RENDERERS[view];
        if (renderer) renderer($('viewRoot'));
    }

    /* ---------------- Dashboard ---------------- */

    function renderEligibility(data) {
        const box = $('eligibility');
        const { threshold, eligibility } = data;
        box.hidden = false;
        if (eligibility.status === 'no_records') {
            box.className = 'att-alert neutral';
            box.textContent = `No classes are recorded yet. The minimum attendance is ${threshold}%.`;
        } else if (eligibility.status === 'below_minimum') {
            box.className = 'att-alert';
            box.textContent = `You need ${eligibility.classes_needed} more attended classes to reach the ${threshold}% minimum.`;
        } else {
            box.className = 'att-alert ok';
            box.textContent = eligibility.can_miss === null
                ? `You are above the ${threshold}% minimum.`
                : `You are above the ${threshold}% minimum and can miss up to ${eligibility.can_miss} more classes.`;
        }
    }

    function renderOverview() {
        const body = $('overviewBody');
        const box = $('eligibility');
        box.hidden = true;
        load(body, () => ERP.call(`/api/attendance/analytics?${semParam()}`), data => {
            const o = data.overall;
            if (!o.total) {
                body.innerHTML = stateHtml('No attendance has been recorded for this semester yet.');
            } else {
                body.innerHTML = `<div class="att-overview-body">
                    <div class="att-ring" style="--p:${o.percentage}"><b>${fmtPct(o.percentage)}</b></div>
                    <div class="att-counts">
                        <div class="att-count present"><span>Present</span><strong>${o.present}</strong></div>
                        <div class="att-count absent"><span>Absent</span><strong>${o.absent}</strong></div>
                        <div class="att-count total"><span>Total</span><strong>${o.total}</strong></div>
                    </div>
                </div>
                <p class="att-note">Late ${o.late} · Excused ${o.excused}. Present, Late and Excused count toward attendance.</p>`;
            }
            renderEligibility(data);
        });
    }

    function renderRecent() {
        load($('recentBody'), () => ERP.call(`/api/attendance/records?${semParam()}&limit=5`), data => {
            if (!data.items.length) { $('recentBody').innerHTML = stateHtml('No recent attendance records for this semester.'); return; }
            $('recentBody').innerHTML = `<ul class="att-list">${data.items.map(row => `
                <li class="att-row"><div class="att-row-main"><strong>${esc(row.subject_name)}</strong><small>${esc(row.status)} · ${esc(fmtDate(row.attendance_date))}</small></div>${statusMark(row.status)}</li>`).join('')}</ul>`;
        });
    }

    /* ---------------- Mark Attendance ---------------- */

    function renderMark(root) {
        const today = todayIso();
        const weekday = new Date().getDay() || 7;
        load(root, async () => {
            const [timetable, records] = await Promise.all([
                ERP.call('/api/timetable?limit=100'),
                ERP.call(`/api/attendance/records?${semParam()}&date=${today}&limit=100`)
            ]);
            const entries = timetable.items
                .filter(entry => Number(entry.weekday) === weekday && Number(entry.semester_id) === Number(state.semesterId))
                .sort((a, b) => String(a.start_time).localeCompare(String(b.start_time)));
            return { entries, records: records.items };
        }, ({ entries, records }) => {
            const byTimetable = new Map(records.map(record => [record.timetable_id, record.status]));
            const classes = entries.length
                ? `<ul class="att-list">${entries.map(entry => {
                    const status = byTimetable.get(entry.id);
                    return `<li class="att-row"><div class="att-row-main"><strong>${esc(entry.subject_name)}</strong>
                        <small>${esc(String(entry.start_time).slice(0, 5))} – ${esc(String(entry.end_time).slice(0, 5))}${entry.classroom_name ? ` · ${esc(entry.classroom_name)}` : ''}</small></div>
                        ${status ? pill(status) : '<span class="att-pill info">Not marked yet</span>'}</li>`;
                }).join('')}</ul>`
                : stateHtml('No classes are scheduled for you today in this semester.');
            root.innerHTML = `
                <h2>Today · ${esc(fmtDate(today))}</h2>
                ${classes}
                <p class="att-note" style="margin-top:12px">Class attendance is marked by your faculty. Students cannot mark their own class attendance here, and manual corrections are made only by authorized faculty or HOD.</p>
                <h2 style="margin-top:16px">Event QR check-in</h2>
                <p class="att-note">Campus events use QR codes shown by organizers. The server validates each code before recording attendance.</p>
                <div class="att-actions" style="margin-top:8px"><a class="att-button" href="scan.html">Scan event QR</a></div>`;
        });
    }

    /* ---------------- Attendance History ---------------- */

    function renderHistory(root) {
        root.innerHTML = `
            <div class="att-filters">
                <label>Subject<select id="hSubject"><option value="">All subjects</option></select></label>
                <label>Status<select id="hStatus"><option value="">All statuses</option><option>Present</option><option>Absent</option><option>Late</option><option>Excused</option></select></label>
                <label>Date<input type="date" id="hDate"></label>
                <div class="att-actions" style="align-items:end"><button type="button" class="att-button" id="hApply">Apply</button><button type="button" class="att-button secondary" id="hReset">Reset</button></div>
            </div>
            <div id="hList" style="margin-top:12px"></div>`;

        ERP.call(`/api/attendance/analytics?${semParam()}`).then(data => {
            const select = $('hSubject');
            data.subjects.forEach(subject => {
                const option = document.createElement('option');
                option.value = String(subject.subject_id);
                option.textContent = subject.subject_name;
                select.append(option);
            });
        }).catch(error => { if (handleAuthError(error)) return; });

        let rows = [];
        let offset = 0;
        let total = 0;
        const listRoot = $('hList');

        const query = () => {
            const params = new URLSearchParams();
            if (state.semesterId) params.set('semester_id', state.semesterId);
            if ($('hSubject').value) params.set('subject_id', $('hSubject').value);
            if ($('hStatus').value) params.set('status', $('hStatus').value);
            if ($('hDate').value) params.set('date', $('hDate').value);
            params.set('limit', PAGE_SIZE);
            params.set('offset', offset);
            return params.toString();
        };

        const draw = () => {
            if (!rows.length) { listRoot.innerHTML = stateHtml('No attendance records match these filters.'); return; }
            listRoot.innerHTML = `<ul class="att-list">${rows.map(row => `
                <li class="att-row"><div class="att-row-main"><strong>${esc(row.subject_name)}</strong>
                <small>${esc(fmtDate(row.attendance_date))}${row.start_time ? ` · ${esc(row.start_time)}–${esc(row.end_time)}` : ''}</small></div>${pill(row.status)}</li>`).join('')}</ul>
                ${rows.length < total ? '<div class="att-actions" style="margin-top:10px"><button type="button" class="att-button secondary" id="hMore">Load more</button></div>' : ''}`;
            const more = $('hMore');
            if (more) more.addEventListener('click', () => { offset += PAGE_SIZE; fetchPage(true); });
        };

        const fetchPage = async (append) => {
            if (!append) { offset = 0; rows = []; }
            listRoot.innerHTML = stateHtml('Loading…');
            try {
                const data = await ERP.call(`/api/attendance/records?${query()}`);
                total = data.pagination.total;
                rows = append ? rows.concat(data.items) : data.items;
                draw();
            } catch (error) {
                if (handleAuthError(error)) return;
                listRoot.innerHTML = errorHtml(error.message || 'Unable to load history.');
                listRoot.querySelector('[data-retry]').addEventListener('click', () => fetchPage(false));
            }
        };

        $('hApply').addEventListener('click', () => fetchPage(false));
        $('hReset').addEventListener('click', () => {
            $('hSubject').value = '';
            $('hStatus').value = '';
            $('hDate').value = '';
            fetchPage(false);
        });
        fetchPage(false);
    }

    /* ---------------- Subject-wise and monthly ---------------- */

    function subjectRows(subjects) {
        return `<ul class="att-list">${subjects.map(subject => {
            const note = subject.total === 0
                ? 'No classes recorded yet'
                : subject.below_threshold
                    ? `Needs ${subject.classes_needed} more attended classes`
                    : subject.can_miss === null ? 'Above minimum' : `Can miss up to ${subject.can_miss} more classes`;
            return `<li class="att-row" style="display:block">
                <div class="att-row"><div class="att-row-main"><strong>${esc(subject.subject_name)}</strong>
                <small>${subject.attended} attended of ${subject.total} held</small></div>
                <strong style="color:${subject.below_threshold ? '#9f1239' : '#166534'}">${subject.percentage === null ? '—' : fmtPct(subject.percentage)}</strong></div>
                ${bar(subject.percentage, subject.below_threshold)}
                <p class="att-note" style="margin-top:6px">${esc(note)}</p></li>`;
        }).join('')}</ul>`;
    }

    function renderSubjects(root) {
        load(root, () => ERP.call(`/api/attendance/analytics?${semParam()}`), data => {
            state.lastAnalytics = data;
            if (!data.subjects.length) { root.innerHTML = stateHtml('No subject attendance is recorded for this semester yet.'); return; }
            root.innerHTML = `<p class="att-note" style="margin-bottom:8px">Minimum attendance: ${data.threshold}%</p>${subjectRows(data.subjects)}`;
        });
    }

    function csvEscape(value) {
        const text = value === null || value === undefined ? '' : String(value);
        return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    }

    function downloadMonthlyCsv(data) {
        const lines = [['Month', 'Subject', 'Held', 'Attended', 'Percentage', 'Threshold']];
        data.months.forEach(month => month.subjects.forEach(subject => {
            lines.push([month.month, subject.subject_name, subject.total, subject.attended, subject.percentage ?? '', data.threshold]);
        }));
        const blob = new Blob([lines.map(line => line.map(csvEscape).join(',')).join('\n')], { type: 'text/csv;charset=utf-8' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `attendance-report-${state.semesterId}.csv`;
        document.body.append(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(link.href);
    }

    function renderMonthly(root) {
        load(root, () => ERP.call(`/api/attendance/analytics?${semParam()}`), data => {
            state.lastAnalytics = data;
            if (!data.months.length) { root.innerHTML = stateHtml('No monthly records are available for this semester yet.'); return; }
            root.innerHTML = `
                <div class="att-actions" style="justify-content:space-between;margin-bottom:10px">
                    <p class="att-note">Month-wise totals with subject breakdowns.</p>
                    <button type="button" class="att-button secondary" id="downloadCsv">Download CSV</button>
                </div>
                ${data.months.map(month => `
                    <section style="margin-bottom:16px">
                        <div class="att-row"><strong style="color:#0b2a6f">${esc(monthLabel(month.month))}</strong>
                        <span class="att-pill ${month.below_threshold ? 'bad' : 'good'}">${month.percentage === null ? '—' : fmtPct(month.percentage)} · ${month.attended}/${month.total}</span></div>
                        <table class="att-table"><thead><tr><th>Subject</th><th>Held</th><th>Attended</th><th>%</th></tr></thead><tbody>
                        ${month.subjects.map(subject => `<tr><td>${esc(subject.subject_name)}</td><td>${subject.total}</td><td>${subject.attended}</td><td>${subject.percentage === null ? '—' : fmtPct(subject.percentage)}</td></tr>`).join('')}
                        </tbody></table>
                    </section>`).join('')}`;
            $('downloadCsv').addEventListener('click', () => downloadMonthlyCsv(data));
        });
    }

    /* ---------------- Analytics ---------------- */

    function renderAnalytics(root) {
        load(root, () => ERP.call(`/api/attendance/analytics?${semParam()}`), data => {
            state.lastAnalytics = data;
            if (!data.overall.total) { root.innerHTML = stateHtml('Analytics appear after faculty record attendance for this semester.'); return; }
            const warnings = data.subjects.filter(subject => subject.below_threshold);
            root.innerHTML = `
                <h2>Overall</h2>
                <div class="att-row"><div class="att-row-main"><strong>${fmtPct(data.overall.percentage)}</strong><small>${data.overall.attended} attended of ${data.overall.total} · minimum ${data.threshold}%</small></div><span class="att-pill ${data.overall.below_threshold ? 'bad' : 'good'}">${data.overall.below_threshold ? 'Below minimum' : 'Above minimum'}</span></div>
                ${bar(data.overall.percentage, data.overall.below_threshold)}
                <h2 style="margin-top:18px">Monthly trend</h2>
                <ul class="att-list">${data.months.map(month => `
                    <li class="att-row" style="display:block"><div class="att-row"><span>${esc(monthLabel(month.month))}</span><strong>${month.percentage === null ? '—' : fmtPct(month.percentage)}</strong></div>${bar(month.percentage, month.below_threshold)}</li>`).join('')}</ul>
                <h2 style="margin-top:18px">Subject comparison</h2>
                ${subjectRows(data.subjects)}
                <h2 style="margin-top:18px">Eligibility warnings</h2>
                ${warnings.length
                    ? `<ul class="att-list">${warnings.map(subject => `<li class="att-row"><div class="att-row-main"><strong>${esc(subject.subject_name)}</strong><small>Needs ${subject.classes_needed} more attended classes to reach ${data.threshold}%</small></div>${pill('Absent')}</li>`).join('')}</ul>`
                    : stateHtml('No subject is below the minimum attendance.')}`;
        });
    }

    /* ---------------- Leave ---------------- */

    async function loadLeaveList() {
        const list = $('leaveList');
        if (!list) return;
        await load(list, () => ERP.call('/api/attendance/leave?limit=50'), data => {
            if (!data.items.length) { list.innerHTML = stateHtml('You have not submitted any leave requests.'); return; }
            list.innerHTML = `<ul class="att-list">${data.items.map(item => `
                <li class="att-row"><div class="att-row-main"><strong>${esc(fmtDate(item.from_date))} – ${esc(fmtDate(item.to_date))}</strong>
                <small>${esc(item.reason)}</small>${item.decision_note ? `<small>HOD note: ${esc(item.decision_note)}</small>` : ''}</div>
                <div class="att-actions">${pill(item.status)}${item.has_document ? `<button type="button" class="att-button secondary" data-doc="${item.id}">Document</button>` : ''}</div></li>`).join('')}</ul>`;
            list.querySelectorAll('[data-doc]').forEach(button => button.addEventListener('click', () => openLeaveDocument(button)));
        });
    }

    async function openLeaveDocument(button) {
        button.disabled = true;
        try {
            const response = await fetch(`${ERP.apiBase()}/api/attendance/leave/${button.dataset.doc}/document`, { headers: ERP.authHeaders() });
            if (response.status === 401) { ERP.redirectToLogin(); return; }
            if (!response.ok) throw new Error('Document could not be opened.');
            const url = URL.createObjectURL(await response.blob());
            const link = document.createElement('a');
            link.href = url;
            link.target = '_blank';
            link.rel = 'noopener';
            link.click();
            setTimeout(() => URL.revokeObjectURL(url), 60000);
        } catch (error) {
            window.alert(error.message || 'Document could not be opened.');
        } finally {
            button.disabled = false;
        }
    }

    function renderLeave(root) {
        root.innerHTML = `
            <h2>New leave request</h2>
            <form class="att-form" id="leaveForm">
                <label>From<input type="date" name="from_date" required></label>
                <label>To<input type="date" name="to_date" required></label>
                <label>Reason<textarea name="reason" rows="3" maxlength="500" required></textarea></label>
                <label>Supporting document (optional, PDF, PNG or JPG, max 5 MB)<input type="file" name="document" accept=".pdf,.png,.jpg,.jpeg"></label>
                <p class="att-note">Your HOD reviews each request. Approved leave is recorded for reference and does not change your attendance records.</p>
                <div class="att-actions"><button type="submit" class="att-button" id="leaveSubmit">Submit leave request</button></div>
                <p id="leaveMessage" class="att-state" role="status"></p>
            </form>
            <h2 style="margin-top:18px">My leave requests</h2>
            <div id="leaveList"></div>`;

        const form = $('leaveForm');
        form.addEventListener('submit', async event => {
            event.preventDefault();
            const message = $('leaveMessage');
            const data = new FormData(form);
            if (data.get('to_date') < data.get('from_date')) {
                message.className = 'att-state error';
                message.textContent = 'The end date cannot be before the start date.';
                return;
            }
            const submit = $('leaveSubmit');
            submit.disabled = true;
            message.className = 'att-state';
            message.textContent = 'Submitting…';
            try {
                await ERP.call('/api/attendance/leave', { method: 'POST', body: data });
                form.reset();
                message.textContent = 'Leave request submitted for HOD approval.';
                loadLeaveList();
            } catch (error) {
                if (handleAuthError(error)) return;
                message.className = 'att-state error';
                message.textContent = error.message || 'Leave request could not be submitted.';
            } finally {
                submit.disabled = false;
            }
        });
        loadLeaveList();
    }

    /* ---------------- OD ---------------- */

    function renderOD(root) {
        load(root, () => ERP.call('/api/student/my-od'), rows => {
            const list = rows.length
                ? `<ul class="att-list">${rows.map(row => `
                    <li class="att-row"><div class="att-row-main"><strong>${esc(row.title)}</strong>
                    <small>OD date ${esc(fmtDate(row.applied_date))}</small></div>${pill(row.status)}</li>`).join('')}</ul>`
                : stateHtml('You have no OD applications yet.');
            root.innerHTML = `
                <h2>My OD applications</h2>
                ${list}
                <p class="att-note" style="margin-top:12px">OD requests are created for approved campus events where you are a recorded participant. Registration alone does not grant OD; your HOD must approve the request.</p>
                <div class="att-actions" style="margin-top:10px"><a class="att-button" href="events.html">Go to Events</a></div>`;
        });
    }

    /* ---------------- Compensatory classes ---------------- */

    function renderCompensatory(root) {
        root.innerHTML = `
            <h2>Compensatory classes</h2>
            ${stateHtml('Compensatory class records and requests are not available yet. The compensatory-class policy and its records have not been configured in this ERP, so no eligible classes or requests are shown.')}
            <p class="att-note">Attendance is never changed automatically for compensatory classes. Any adjustment requires an approved workflow.</p>`;
    }

    const VIEW_RENDERERS = {
        mark: renderMark,
        history: renderHistory,
        subjects: renderSubjects,
        monthly: renderMonthly,
        leave: renderLeave,
        od: renderOD,
        analytics: renderAnalytics,
        compensatory: renderCompensatory
    };

    /* ---------------- Boot ---------------- */

    function initViewPage() {
        const view = urlParams.get('view');
        const config = SHORTCUT_VIEWS[view];
        if (!config) {
            $('viewTitle').textContent = 'Attendance';
            $('viewRoot').innerHTML = stateHtml('This attendance feature was not found.', true);
            return;
        }
        $('viewTitle').textContent = config.title;
        document.title = `${config.title} · College ERP`;
    }

    function initBellAndAvatar() {
        ERP.call('/api/auth/me')
            .then(profile => { $('topAvatarInitial').textContent = (profile.name || '?').trim().charAt(0).toUpperCase() || '?'; })
            .catch(error => { if (error.status === 401) ERP.redirectToLogin(); });
        ERP.call('/api/notifications/unread-count')
            .then(data => {
                const unread = Number(data.unread_notifications || 0);
                const badge = $('attUnread');
                if (!badge) return;
                badge.hidden = unread === 0;
                badge.textContent = unread > 9 ? '9+' : String(unread);
            })
            .catch(error => { if (error.status === 401) ERP.redirectToLogin(); });
    }

    async function boot() {
        if (page === 'view') initViewPage();
        setShortcutHrefs();
        $('semesterSelect').addEventListener('change', event => {
            state.semesterId = Number(event.target.value) || null;
            updateUrlSemester();
            setShortcutHrefs();
            refresh();
        });
        initBellAndAvatar();
        await initSemesters();
        refresh();
    }

    boot();
})();
