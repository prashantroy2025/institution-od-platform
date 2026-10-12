/* Student Examinations dashboard and feature screens.
 *
 * Data sources (student-scoped by the server from the bearer token):
 *   /api/auth/me                         header avatar
 *   /api/notifications/unread-count      bell badge
 *   /api/examinations                    exams, venue, registration state, published results
 *   /api/examinations/:id/register       exam registration
 *   /api/examinations/:id/result         published result for one exam
 *   /api/examinations/:id/admit-card     authorized admit card (plain text)
 *   /api/academic/student/syllabus       syllabus units for the student's subjects
 *   /api/academic/student/calendar       published examination notices and deadlines
 *
 * Revaluation, internal marks, question papers and guidelines have no backend records yet,
 * so their screens state that and do not show placeholder data.
 */
(() => {
    'use strict';

    if (!ERP.token()) { location.replace('login.html'); return; }

    const $ = id => document.getElementById(id);
    const esc = ERP.escapeHtml;
    const page = document.body.dataset.page;
    const urlParams = new URLSearchParams(location.search);
    const TICKET_STATUSES = ['Scheduled', 'Registration Open', 'Marks Pending', 'Published'];
    const NOTICE_TYPES = ['Examination', 'Registration Deadline'];

    const VIEWS = {
        schedule: { title: 'Exam Schedule' },
        admit: { title: 'Admit Card' },
        papers: { title: 'Previous Question Papers' },
        results: { title: 'Results' },
        syllabus: { title: 'Syllabus & Exam Pattern' },
        notices: { title: 'Important Notices' },
        registration: { title: 'Exam Registration' },
        revaluation: { title: 'Revaluation / Recheck' },
        hallticket: { title: 'Hall Ticket Downloads' },
        internal: { title: 'Internal Marks' },
        analysis: { title: 'Performance Analysis' },
        guidelines: { title: 'Exam Guidelines' }
    };

    /* ---------------- Formatting and time helpers ---------------- */

    const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
    const HAS_ZONE = /(Z|[+-]\d{2}:?\d{2})$/i;

    // Exam timestamps are absolute instants; they are shown in the viewer's timezone.
    const instant = value => {
        if (!value) return null;
        const text = String(value);
        const date = new Date(HAS_ZONE.test(text) ? text : text.replace(' ', 'T'));
        return Number.isNaN(date.getTime()) ? null : date;
    };
    // Academic calendar dates are calendar days, so they are read as local dates.
    const calendarDate = value => {
        if (!value) return null;
        const text = String(value);
        if (DATE_ONLY.test(text)) {
            const [y, m, d] = text.split('-').map(Number);
            return new Date(y, m - 1, d);
        }
        return instant(text);
    };
    const fmtDay = date => date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    const fmtClock = date => date.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
    const timeRange = (start, end) => (end ? `${fmtClock(start)} – ${fmtClock(end)}` : fmtClock(start));
    const fmtNumber = value => Number(value).toLocaleString('en-IN', { maximumFractionDigits: 2 });
    const fmtPct = value => `${Math.round(Number(value) * 10) / 10}%`;
    const examSubject = exam => `${exam.subject_name}${exam.subject_code ? ` (${exam.subject_code})` : ''}`;

    const withTimes = exam => ({ exam, start: instant(exam.scheduled_start), end: instant(exam.scheduled_end) });
    const hasEnded = (item, now) => (item.end ? item.end.getTime() <= now : item.start.getTime() <= now);

    function countdown(start, now) {
        if (now >= start.getTime()) return { label: 'In progress', tone: 'live' };
        if (start.toDateString() === new Date(now).toDateString()) return { label: 'Today', tone: '' };
        const days = Math.ceil((start.getTime() - now) / 86400000);
        return { label: days === 1 ? '1 Day' : `${days} Days`, tone: '' };
    }

    const pill = (text, tone = 'info') => `<span class="exm-pill ${tone}">${esc(text)}</span>`;
    const statusTone = status => ({ Registered: 'good', Cancelled: 'bad', Published: 'good', 'Marks Pending': 'warn' }[status] || 'info');
    const stateHtml = (text, error = false) => `<p class="exm-state${error ? ' error' : ''}">${esc(text)}</p>`;
    const errorHtml = message => `<div class="exm-state error"><p>${esc(message)}</p><button type="button" class="exm-button secondary" data-retry>Retry</button></div>`;
    const bar = (percent, low) => `<div class="exm-bar" aria-hidden="true"><span class="${low ? 'low' : ''}" style="width:${Math.min(100, Math.max(0, Number(percent) || 0))}%"></span></div>`;

    /* ---------------- Loading and API helpers ---------------- */

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
            root.innerHTML = errorHtml(error.message || 'Unable to load examinations.');
            root.querySelector('[data-retry]').addEventListener('click', () => load(root, fetcher, render));
        }
    }

    const fetchExams = async (query = '') => (await ERP.call(`/api/examinations?limit=100${query}`)).items;

    async function fetchPublishedResults() {
        const exams = await fetchExams('&status=Published');
        return Promise.all(exams.map(async exam => {
            try {
                return { exam, result: await ERP.call(`/api/examinations/${exam.id}/result`) };
            } catch (error) {
                if (handleAuthError(error)) throw error;
                return { exam, error: error.message };
            }
        }));
    }

    /* ---------------- Dashboard ---------------- */

    const UPCOMING_BARS = ['', 'blue', 'purple'];

    function upcomingItem({ exam, start, end }, index, now) {
        const count = countdown(start, now);
        return `<li class="exm-upcoming">
            <span class="bar ${UPCOMING_BARS[index % UPCOMING_BARS.length]}" aria-hidden="true"></span>
            <div class="exm-up-main">
                <div class="exm-up-head"><strong>${esc(examSubject(exam))}</strong><span class="exm-days ${count.tone}">${esc(count.label)}</span></div>
                <small>${esc(exam.title)} · ${esc(exam.exam_type)}</small>
                <span class="exm-meta">${esc(fmtDay(start))} · ${esc(timeRange(start, end))}</span>
            </div>
        </li>`;
    }

    function renderUpcoming() {
        const body = $('upcomingBody');
        load(body, () => fetchExams(), exams => {
            const now = Date.now();
            const upcoming = exams.map(withTimes)
                .filter(item => item.start && !hasEnded(item, now))
                .sort((a, b) => a.start - b.start)
                .slice(0, 3);
            body.innerHTML = upcoming.length
                ? `<ul class="exm-list">${upcoming.map((item, index) => upcomingItem(item, index, now)).join('')}</ul>`
                : stateHtml('No examinations are scheduled for you yet.');
        });
    }

    /* ---------------- Exam Schedule ---------------- */

    function examCard(item, now, extra = '') {
        const { exam, start, end } = item;
        const venue = exam.venue_name ? esc(exam.venue_name) : 'Not assigned yet';
        let when = 'Date not scheduled yet';
        let timing = '';
        if (start) {
            when = `${fmtDay(start)} · ${timeRange(start, end)}`;
            timing = hasEnded(item, now) ? pill('Completed', 'info') : pill(countdown(start, now).label, countdown(start, now).tone === 'live' ? 'good' : 'warn');
        }
        return `<li class="exm-card-inner"><div class="exm-row" style="padding:0;border:0">
            <div class="exm-row-main">
                <strong>${esc(examSubject(exam))}</strong>
                <small>${esc(exam.title)}</small>
                <span class="exm-meta">${esc(when)}</span>
                <span class="exm-meta">Venue: ${venue}</span>
                ${extra}
            </div>
            <div class="exm-actions" style="flex-direction:column;align-items:flex-end;margin-top:0">${pill(exam.exam_type, 'info')}${timing}</div>
        </div></li>`;
    }

    function renderSchedule(root) {
        load(root, () => fetchExams(), exams => {
            if (!exams.length) { root.innerHTML = stateHtml('No examinations have been scheduled for your batch and section yet.'); return; }
            const now = Date.now();
            const items = exams.map(withTimes);
            const upcoming = items.filter(item => item.start && !hasEnded(item, now)).sort((a, b) => a.start - b.start);
            const undated = items.filter(item => !item.start);
            const past = items.filter(item => item.start && hasEnded(item, now)).sort((a, b) => b.start - a.start);
            root.innerHTML = `
                <div class="exm-tabs" role="group" aria-label="Schedule filter">
                    <button type="button" data-tab="upcoming" aria-pressed="true">Upcoming (${upcoming.length + undated.length})</button>
                    <button type="button" data-tab="past" aria-pressed="false">Past (${past.length})</button>
                </div>
                <ul class="exm-list" id="scheduleList"></ul>`;
            const draw = tab => {
                const rows = tab === 'upcoming' ? [...upcoming, ...undated] : past;
                root.querySelectorAll('[data-tab]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.tab === tab)));
                $('scheduleList').innerHTML = rows.length
                    ? rows.map(item => examCard(item, now)).join('')
                    : `<li>${stateHtml(tab === 'upcoming' ? 'No upcoming examinations.' : 'No past examinations yet.')}</li>`;
            };
            root.querySelectorAll('[data-tab]').forEach(button => button.addEventListener('click', () => draw(button.dataset.tab)));
            draw('upcoming');
        });
    }

    /* ---------------- Admit Card and Hall Tickets ---------------- */

    function ticketState(exam) {
        if (exam.my_registration_status !== 'Registered') return { ok: false, text: 'You are not registered for this examination.' };
        if (!TICKET_STATUSES.includes(exam.status)) return { ok: false, text: 'The admit card is not released for this examination yet.' };
        return { ok: true, text: 'Registered. Your seat is confirmed when the admit card is generated.' };
    }

    async function downloadAdmitCard(button) {
        const card = button.closest('[data-card]');
        const error = card.querySelector('[data-error]');
        const examId = button.dataset.admit;
        button.disabled = true;
        error.hidden = true;
        try {
            const response = await fetch(`${ERP.apiBase()}/api/examinations/${examId}/admit-card`, { headers: ERP.authHeaders() });
            if (response.status === 401) { ERP.redirectToLogin(); return; }
            if (!response.ok) {
                const payload = await response.json().catch(() => ({}));
                throw new Error(payload.message || 'Admit card could not be downloaded.');
            }
            const url = URL.createObjectURL(await response.blob());
            const link = document.createElement('a');
            link.href = url;
            link.download = `admit-card-${examId}.txt`;
            document.body.append(link);
            link.click();
            link.remove();
            setTimeout(() => URL.revokeObjectURL(url), 60000);
        } catch (err) {
            error.textContent = err.message || 'Admit card could not be downloaded.';
            error.hidden = false;
        } finally {
            button.disabled = false;
        }
    }

    function drawTickets(root, exams, onlyAvailable) {
        const rows = exams.map(exam => ({ exam, state: ticketState(exam) })).filter(row => !onlyAvailable || row.state.ok);
        if (!rows.length) {
            root.innerHTML = stateHtml(onlyAvailable
                ? 'No hall tickets are available for your registered examinations yet.'
                : 'No examinations are available for admit card checks yet.');
            return;
        }
        root.innerHTML = `<ul class="exm-list">${rows.map(({ exam, state }) => `
            <li class="exm-row" data-card="${exam.id}"><div class="exm-row-main">
                <strong>${esc(examSubject(exam))}</strong><small>${esc(exam.title)} · ${esc(exam.exam_type)}</small>
                <span class="exm-meta">${esc(state.text)}</span>
                <p class="exm-error-text" data-error hidden></p>
            </div>
            <div class="exm-actions" style="flex-direction:column;align-items:flex-end;margin-top:0">
                ${state.ok
                    ? `<button type="button" class="exm-button" data-admit="${exam.id}">Download admit card</button>`
                    : pill('Not eligible', 'warn')}
            </div></li>`).join('')}</ul>
            ${onlyAvailable ? '<p class="exm-note" style="margin-top:10px">Admit cards are issued as text files until PDF generation is configured for this ERP.</p>' : ''}`;
        root.querySelectorAll('[data-admit]').forEach(button => button.addEventListener('click', () => downloadAdmitCard(button)));
    }

    function renderAdmit(root) {
        load(root, () => fetchExams(), exams => drawTickets(root, exams, false));
    }

    function renderHallTickets(root) {
        load(root, () => fetchExams(), exams => drawTickets(root, exams, true));
    }

    /* ---------------- Results and performance ---------------- */

    function renderResults(root) {
        load(root, fetchPublishedResults, outcomes => {
            if (!outcomes.length) { root.innerHTML = stateHtml('No results have been declared for you yet.'); return; }
            root.innerHTML = `<ul class="exm-list">${outcomes.map(({ exam, result, error }) => {
                if (!result) {
                    return `<li class="exm-row"><div class="exm-row-main"><strong>${esc(examSubject(exam))}</strong>
                        <small>${esc(exam.title)}</small><span class="exm-meta">Result could not be shown: ${esc(error)}</span></div>${pill('Unavailable', 'warn')}</li>`;
                }
                const subject = result.subjects[0];
                const summary = result.summary;
                return `<li class="exm-row"><div class="exm-row-main">
                        <strong>${esc(examSubject(exam))}</strong><small>${esc(exam.title)} · ${esc(exam.exam_type)}</small>
                        <span class="exm-meta">Marks ${fmtNumber(subject.marks)} / ${fmtNumber(subject.maximum_marks)} · Pass ${fmtNumber(subject.pass_marks)} · ${fmtPct(summary.percentage)}</span>
                    </div>
                    <div class="exm-actions" style="flex-direction:column;align-items:flex-end;margin-top:0">
                        ${pill('Declared', 'good')}${pill(summary.grade || '—', 'info')}${pill(summary.pass ? 'Pass' : 'Fail', summary.pass ? 'good' : 'bad')}
                    </div></li>`;
            }).join('')}</ul>`;
        });
    }

    function renderAnalysis(root) {
        load(root, fetchPublishedResults, outcomes => {
            const declared = outcomes.filter(outcome => outcome.result);
            if (!declared.length) { root.innerHTML = stateHtml('Performance analysis appears after your results are declared.'); return; }
            const sum = rows => rows.reduce((acc, row) => ({ marks: acc.marks + row.marks, maximum: acc.maximum + row.maximum }), { marks: 0, maximum: 0 });
            const pct = totals => (totals.maximum ? (totals.marks * 100) / totals.maximum : 0);
            const subjectRows = declared.map(({ exam, result }) => ({ name: examSubject(exam), marks: result.summary.total, maximum: result.summary.maximum, pass: result.summary.pass }));
            const overall = sum(subjectRows);
            const semesterMap = new Map();
            declared.forEach(({ exam, result }) => {
                const key = exam.semester_name || 'Semester not set';
                const current = semesterMap.get(key) || { marks: 0, maximum: 0 };
                semesterMap.set(key, { marks: current.marks + result.summary.total, maximum: current.maximum + result.summary.maximum });
            });
            root.innerHTML = `
                <h2>Overall</h2>
                <div class="exm-row"><div class="exm-row-main"><strong>${fmtPct(pct(overall))}</strong><small>${fmtNumber(overall.marks)} of ${fmtNumber(overall.maximum)} marks across ${declared.length} declared exam(s)</small></div></div>
                ${bar(pct(overall), pct(overall) < 40)}
                <h2 style="margin-top:18px">Subject-wise</h2>
                <ul class="exm-list">${subjectRows.map(row => `<li class="exm-row" style="display:block">
                    <div class="exm-row"><span>${esc(row.name)}</span><strong>${fmtPct(pct(row))}</strong></div>${bar(pct(row), !row.pass)}</li>`).join('')}</ul>
                <h2 style="margin-top:18px">Semester-wise</h2>
                <ul class="exm-list">${[...semesterMap.entries()].map(([name, totals]) => `<li class="exm-row" style="display:block">
                    <div class="exm-row"><span>${esc(name)}</span><strong>${fmtPct(pct(totals))}</strong></div>${bar(pct(totals), pct(totals) < 40)}</li>`).join('')}</ul>`;
        });
    }

    /* ---------------- Syllabus, notices and guidelines ---------------- */

    function renderSyllabus(root) {
        load(root, async () => {
            const [syllabus, exams] = await Promise.all([ERP.call('/api/academic/student/syllabus?limit=100'), fetchExams()]);
            return { units: syllabus.items, exams };
        }, ({ units, exams }) => {
            const bySubject = new Map();
            units.forEach(unit => {
                const key = examSubject(unit);
                bySubject.set(key, [...(bySubject.get(key) || []), unit]);
            });
            const syllabusHtml = bySubject.size
                ? [...bySubject.entries()].map(([subject, rows]) => `<h3 class="exm-subhead">${esc(subject)}</h3>
                    <ul class="exm-list">${rows.map(unit => `<li class="exm-row" style="display:block">
                        <strong>Unit ${esc(unit.unit_number)}: ${esc(unit.title)}</strong>
                        ${unit.topics ? `<small>Topics: ${esc(unit.topics)}</small>` : ''}
                        ${unit.learning_outcomes ? `<small>Outcomes: ${esc(unit.learning_outcomes)}</small>` : ''}</li>`).join('')}</ul>`).join('')
                : stateHtml('The syllabus for your subjects has not been published yet.');
            const patternHtml = exams.length
                ? `<ul class="exm-list">${exams.map(exam => `<li class="exm-row"><div class="exm-row-main">
                        <strong>${esc(examSubject(exam))}</strong><small>${esc(exam.title)}</small></div>
                        <div class="exm-actions" style="flex-direction:column;align-items:flex-end;margin-top:0">${pill(exam.exam_type, 'info')}
                        <span class="exm-meta">Pass ${fmtNumber(exam.pass_marks)} / ${fmtNumber(exam.maximum_marks)}</span></div></li>`).join('')}</ul>`
                : stateHtml('Exam pattern appears once examinations are scheduled for you.');
            root.innerHTML = `<h2>Syllabus</h2>${syllabusHtml}
                <h2 style="margin-top:18px">Exam pattern</h2>${patternHtml}
                <p class="exm-note" style="margin-top:12px">Marking schemes are shown with each result once it is declared.</p>`;
        });
    }

    function renderNotices(root) {
        load(root, async () => {
            const data = await ERP.call('/api/academic/student/calendar?limit=100');
            return data.items
                .filter(item => NOTICE_TYPES.includes(item.event_type))
                .sort((a, b) => String(a.starts_on).localeCompare(String(b.starts_on)));
        }, notices => {
            if (!notices.length) { root.innerHTML = stateHtml('No examination notices or deadlines have been published yet.'); return; }
            root.innerHTML = `<ul class="exm-list">${notices.map(notice => {
                const start = calendarDate(notice.starts_on);
                const end = calendarDate(notice.ends_on);
                const range = start && end && start.getTime() !== end.getTime() ? `${fmtDay(start)} – ${fmtDay(end)}` : (start ? fmtDay(start) : '');
                return `<li class="exm-row"><div class="exm-row-main"><strong>${esc(notice.title)}</strong>
                    <span class="exm-meta">${esc(range)}${notice.semester_name ? ` · ${esc(notice.semester_name)}` : ''}</span>
                    ${notice.description ? `<small>${esc(notice.description)}</small>` : ''}</div>
                    ${pill(notice.event_type, notice.event_type === 'Registration Deadline' ? 'warn' : 'info')}</li>`;
            }).join('')}</ul>`;
        });
    }

    /* ---------------- Exam Registration ---------------- */

    function registrationState(exam, now) {
        if (exam.my_registration_status === 'Registered') return { open: false, label: 'Registered', tone: 'good' };
        if (exam.my_registration_status === 'Cancelled') return { open: false, label: 'Registration cancelled', tone: 'bad' };
        if (exam.status !== 'Registration Open') return { open: false, label: 'Registration not open', tone: 'info' };
        const opens = instant(exam.registration_open_at);
        const closes = instant(exam.registration_deadline);
        if (opens && opens.getTime() > now) return { open: false, label: `Opens ${fmtDay(opens)}`, tone: 'info' };
        if (closes && closes.getTime() < now) return { open: false, label: 'Registration closed', tone: 'bad' };
        return { open: true, label: closes ? `Open until ${fmtDay(closes)}` : 'Open', tone: 'good' };
    }

    function registrationRow(exam, state) {
        return `<li class="exm-card-inner" data-card="${exam.id}"><div class="exm-row" style="padding:0;border:0">
            <div class="exm-row-main"><strong>${esc(examSubject(exam))}</strong><small>${esc(exam.title)} · ${esc(exam.exam_type)}</small>
                <span class="exm-meta">${esc(state.label)}</span>
                <p class="exm-error-text" data-error hidden></p></div>
            <div class="exm-actions" style="flex-direction:column;align-items:flex-end;margin-top:0">
                ${state.open ? `<button type="button" class="exm-button" data-register="${exam.id}">Register</button>` : pill(state.label, state.tone)}
            </div></div></li>`;
    }

    function renderRegistration(root) {
        load(root, () => fetchExams(), exams => {
            if (!exams.length) { root.innerHTML = stateHtml('No examinations are open to you for registration yet.'); return; }
            const now = Date.now();
            const rows = exams.map(exam => ({ exam, state: registrationState(exam, now) }));
            const open = rows.filter(row => row.state.open);
            const other = rows.filter(row => !row.state.open);
            root.innerHTML = `
                <h2>Open for registration</h2>
                <ul class="exm-list">${open.length ? open.map(row => registrationRow(row.exam, row.state)).join('') : `<li>${stateHtml('No examinations are open for registration right now.')}</li>`}</ul>
                <h2 style="margin-top:18px">My examinations</h2>
                <ul class="exm-list">${other.length ? other.map(row => registrationRow(row.exam, row.state)).join('') : `<li>${stateHtml('No other examinations.')}</li>`}</ul>`;
            root.querySelectorAll('[data-register]').forEach(button => button.addEventListener('click', () => registerForExam(root, button)));
        });
    }

    async function registerForExam(root, button) {
        const card = button.closest('[data-card]');
        const error = card.querySelector('[data-error]');
        const title = card.querySelector('.exm-row-main strong').textContent;
        if (!window.confirm(`Register for ${title}?`)) return;
        button.disabled = true;
        error.hidden = true;
        try {
            await ERP.call(`/api/examinations/${button.dataset.register}/register`, { method: 'POST' });
            renderRegistration(root);
        } catch (err) {
            if (handleAuthError(err)) return;
            error.textContent = err.message || 'Registration could not be completed.';
            error.hidden = false;
            button.disabled = false;
        }
    }

    /* ---------------- Screens without backend records yet ---------------- */

    const pendingScreen = (title, message) => root => {
        root.innerHTML = `<div class="exm-pending"><strong>${esc(title)}</strong><p class="exm-note" style="margin-top:6px">${esc(message)}</p></div>`;
    };

    const renderPapers = pendingScreen('Question papers are not available yet',
        'No previous question papers have been published in this ERP, so none can be listed, searched or downloaded.');
    const renderRevaluation = pendingScreen('Revaluation and recheck are not configured yet',
        'Revaluation requests, eligibility rules and deadlines have not been set up in this ERP, so no request can be submitted here.');
    const renderInternal = pendingScreen('Internal marks are not recorded yet',
        'Internal assessment marks are not stored in this ERP yet. Published end-examination marks appear under Results.');
    const renderGuidelines = pendingScreen('Exam guidelines are not configured yet',
        'Institution examination rules and instructions have not been entered in this ERP yet.');

    const RENDERERS = {
        schedule: renderSchedule,
        admit: renderAdmit,
        papers: renderPapers,
        results: renderResults,
        syllabus: renderSyllabus,
        notices: renderNotices,
        registration: renderRegistration,
        revaluation: renderRevaluation,
        hallticket: renderHallTickets,
        internal: renderInternal,
        analysis: renderAnalysis,
        guidelines: renderGuidelines
    };

    /* ---------------- Header and boot ---------------- */

    function initView() {
        const view = urlParams.get('view');
        const config = VIEWS[view];
        if (!config) {
            $('viewTitle').textContent = 'Examinations';
            $('viewRoot').innerHTML = stateHtml('This examination feature was not found.', true);
            return;
        }
        $('viewTitle').textContent = config.title;
        document.title = `${config.title} · College ERP`;
        RENDERERS[view]($('viewRoot'));
    }

    function initHeader() {
        ERP.call('/api/auth/me')
            .then(profile => { $('topAvatarInitial').textContent = (profile.name || '?').trim().charAt(0).toUpperCase() || '?'; })
            .catch(error => { if (error.status === 401) ERP.redirectToLogin(); });
        ERP.call('/api/notifications/unread-count')
            .then(data => {
                const unread = Number(data.unread_notifications || 0);
                const badge = $('examUnread');
                if (!badge) return;
                badge.hidden = unread === 0;
                badge.textContent = unread > 9 ? '9+' : String(unread);
            })
            .catch(error => { if (error.status === 401) ERP.redirectToLogin(); });
    }

    function boot() {
        initHeader();
        if (page === 'view') initView();
        else renderUpcoming();
    }

    boot();
})();
