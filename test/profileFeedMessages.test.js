const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
process.env.NODE_ENV = 'test';
process.env.DB_HOST ||= 'localhost';
process.env.DB_USER ||= 'root';
process.env.DB_NAME ||= 'institution_od_recovery';
process.env.DB_PORT ||= '3306';
process.env.JWT_SECRET ||= 'x'.repeat(32);
const db = require('../config/db');
const community = require('../services/communityService');

test('profile/feed/message migration is additive and protected from destructive statements', () => {
    const migration = fs.readFileSync(path.join(ROOT, 'db/migrations/010_profile_feed_messages.sql'), 'utf8');
    for (const table of ['erp_profile_details','erp_profile_documents','erp_feed_posts','erp_feed_follows','erp_feed_comments','erp_message_groups','erp_message_conversations','erp_messages','erp_demo_registry']) {
        assert.match(migration, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
    }
    assert.doesNotMatch(migration, /DROP TABLE|TRUNCATE|DELETE FROM/i);
    assert.match(migration, /is_official TINYINT/);
    assert.match(migration, /attachment_storage_key/);
});

test('new routes are mounted and use authenticated middleware', () => {
    const server = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
    assert.match(server, /app\.use\('\/api\/profile', profileRoutes\)/);
    assert.match(server, /app\.use\('\/api\/attendance', attendanceSummaryRoutes\)/);
    assert.match(server, /app\.use\('\/api\/community', communityRoutes\)/);
    assert.match(server, /app\.use\('\/api\/messages', messageRoutes\)/);
    for (const file of ['routes/profileRoutes.js','routes/attendanceSummaryRoutes.js','routes/communityRoutes.js','routes/messageRoutes.js']) {
        assert.match(fs.readFileSync(path.join(ROOT, file), 'utf8'), /verifyToken/);
    }
});

test('attendance summary applies existing attended-status rules and profile is self-scoped', () => {
    const attendance = fs.readFileSync(path.join(ROOT, 'services/attendanceSummaryService.js'), 'utf8');
    assert.match(attendance, /Present.*Late.*Excused/);
    assert.match(attendance, /car\.student_id=\?/);
    const profile = fs.readFileSync(path.join(ROOT, 'services/profileService.js'), 'utf8');
    assert.match(profile, /WHERE u\.id=\?/);
    assert.match(profile, /WHERE id=\? AND user_id=\?/);
});

test('community and messaging services enforce official, academic-peer, and membership boundaries', () => {
    const community = fs.readFileSync(path.join(ROOT, 'services/communityService.js'), 'utf8');
    assert.match(community, /Only authorized staff may publish official posts/);
    assert.match(community, /erp_social_blocks/);
    assert.match(community, /allow_profile_discovery/);
    const messages = fs.readFileSync(path.join(ROOT, 'services/messageService.js'), 'utf8');
    assert.match(messages, /Direct messages are limited to approved academic relationships/);
    assert.match(messages, /Conversation access denied/);
    assert.match(messages, /Only authorized staff may post in official channels/);
    assert.match(messages, /is_member/);
    assert.doesNotMatch(messages, /\) `?member`?[,\s]/);
    const ui = fs.readFileSync(path.join(ROOT, 'public/messages.html'), 'utf8');
    assert.match(ui, /c\.is_member/);
    assert.match(ui, /g\.is_member/);
});

test('feed listings enforce visibility and mutual block rules before returning posts', async t => {
    const originalQuery = db.query;
    const calls = [];
    db.query = async (sql, params) => {
        calls.push({ sql, params });
        if (sql.startsWith('SELECT COUNT(*)')) return [[{ total: 0 }]];
        return [[]];
    };
    t.after(() => { db.query = originalQuery; });

    await community.feed({ filter: 'all' }, { id: 17 });

    assert.match(calls[0].sql, /p\.visibility='college'/);
    assert.match(calls[0].sql, /visibility='following'/);
    assert.match(calls[0].sql, /visibility='classmates'/);
    assert.match(calls[0].sql, /sb\.blocker_id=p\.author_id AND sb\.blocked_id=\?/);
    assert.deepEqual(calls[0].params, [17, 17, 17, 17, 17]);
});

test('private feed media is not disclosed to a non-follower', async t => {
    const originalQuery = db.query;
    let calls = 0;
    db.query = async sql => {
        calls += 1;
        assert.match(sql, /SELECT p\.author_id,p\.visibility/);
        return [[{ author_id: 22, visibility: 'following', follows_author: 0, classmate: 0, blocked: 0 }]];
    };
    t.after(() => { db.query = originalQuery; });

    await assert.rejects(community.media(91, { id: 17 }), error => error.status === 404);
    assert.equal(calls, 1);
});

test('preview API requests use the current origin instead of browser localhost', () => {
    const source = fs.readFileSync(path.join(ROOT, 'public/config.js'), 'utf8');
    const resolve = hostname => {
        const context = { window: { location: { hostname, origin: `https://${hostname}` } } };
        vm.runInNewContext(`${source}\nglobalThis.resolvedApiBase = API_BASE;`, context);
        return context.resolvedApiBase;
    };
    assert.equal(resolve('builder-preview.invalid'), 'https://builder-preview.invalid');
    assert.equal(resolve('od-platform.vercel.app'), 'https://institution-od-platform-production.up.railway.app');
});

test('dashboard sends selected post visibility and uses verified invoice payments', () => {
    const home = fs.readFileSync(path.join(ROOT, 'public/home.js'), 'utf8');
    const finance = fs.readFileSync(path.join(ROOT, 'services/financeService.js'), 'utf8');
    assert.match(home, /form\.append\('visibility', postVisibility\)/);
    assert.match(home, /BigInt\(i\.paid_paise \|\| 0\)/);
    assert.match(finance, /p\.status='Verified'\),0\) paid_paise/);
});

test('dashboard quick search uses existing post, people, event and service destinations', () => {
    const home = fs.readFileSync(path.join(ROOT, 'public/home.js'), 'utf8');
    const messages = fs.readFileSync(path.join(ROOT, 'public/messages.html'), 'utf8');
    assert.match(home, /\/api\/community\/people\?/);
    assert.match(home, /\/api\/student\/search-events\?/);
    assert.match(home, /home\.html\?feedSearch=/);
    assert.match(messages, /openPeerFromSearch/);
});

test('Notices reuses official feed and user-scoped notification endpoints', () => {
    const page = fs.readFileSync(path.join(ROOT, 'public/notices.js'), 'utf8');
    const routes = fs.readFileSync(path.join(ROOT, 'routes/notificationRoutes.js'), 'utf8');
    assert.match(page, /filter: 'official'/);
    assert.match(page, /\/api\/notifications\/my-notifications/);
    assert.match(page, /\/api\/notifications\/mark-read/);
    assert.match(routes, /verifyToken/);
});

test('PWA caches only static shell assets and bypasses APIs and Socket.IO', () => {
    const worker = fs.readFileSync(path.join(ROOT, 'public/service-worker.js'), 'utf8');
    const page = fs.readFileSync(path.join(ROOT, 'public/home.html'), 'utf8');
    const timetable = fs.readFileSync(path.join(ROOT, 'public/timetable.html'), 'utf8');
    assert.match(page, /pwa\.js/);
    assert.match(timetable, /pwa\.js/);
    assert.match(worker, /'\/timetable\.html'/);
    assert.match(worker, /url\.pathname\.startsWith\('\/api\/'\)/);
    assert.match(worker, /url\.pathname\.startsWith\('\/socket\.io\/'\)/);
    assert.match(worker, /if \(SHELL_PATHS\.has\(url\.pathname\)\)/);
    assert.match(worker, /cache\.put\(request, response\.clone\(\)\)/);
    assert.match(worker, /caches\.match\('\/offline\.html'\)/);
});

test('service worker bypasses APIs and serves the offline shell for cached navigation', async () => {
    const worker = fs.readFileSync(path.join(ROOT, 'public/service-worker.js'), 'utf8');
    const handlers = {};
    let networkCalls = 0;
    const cache = { addAll: async () => {}, match: async () => null, put: async () => {} };
    const context = {
        URL,
        self: { location: { origin: 'https://erp.test' }, addEventListener: (name, callback) => { handlers[name] = callback; }, skipWaiting: async () => {}, clients: { claim: async () => {} } },
        caches: { open: async () => cache, keys: async () => [], delete: async () => {}, match: async request => request === '/offline.html' ? 'offline shell' : null },
        fetch: async () => { networkCalls += 1; throw new Error('offline'); }
    };
    vm.runInNewContext(worker, context);
    let apiResponded = false;
    handlers.fetch({ request: { method: 'GET', mode: 'cors', url: 'https://erp.test/api/auth/me' }, respondWith: () => { apiResponded = true; } });
    assert.equal(apiResponded, false);
    assert.equal(networkCalls, 0);

    let response;
    handlers.fetch({ request: { method: 'GET', mode: 'navigate', url: 'https://erp.test/home.html' }, respondWith: promise => { response = promise; } });
    assert.equal(await response, 'offline shell');
    assert.equal(networkCalls, 1);
});

test('library catalog exposes and consumes digital resource availability', () => {
    const library = fs.readFileSync(path.join(ROOT, 'services/libraryService.js'), 'utf8');
    const page = fs.readFileSync(path.join(ROOT, 'public/library.html'), 'utf8');
    assert.match(library, /digital_storage_key<>''\) digital_available/);
    assert.match(page, /b\.digital_available/);
    assert.match(page, /esc\(b\.title\)/);
});

test('academic profile self-service cannot change identity fields or delete institutional records', () => {
    const academic = fs.readFileSync(path.join(ROOT, 'services/academicService.js'), 'utf8');
    assert.match(academic, /config\.profile && user\.role !== 'super_admin' \? \['user_id', 'phone'\]/);
    assert.match(academic, /config\.profile && user\.role !== 'super_admin' \? \['phone'\]/);
    assert.match(academic, /config\.profile && user\.role !== 'super_admin'\) fail\('Access denied', 403\)/);
});

test('legacy module pages accept session-only login tokens', () => {
    for (const file of ['public/learning.html','public/class-attendance.html','public/faculty-attendance.html','public/student.html','public/admin.html','public/hod.html','public/organizer.html','public/scan.html','public/examinations.html']) {
        const source = fs.readFileSync(path.join(ROOT, file), 'utf8');
        assert.match(source, /sessionStorage\.getItem\(["']token["']\)/, `${file} should accept session-only auth`);
    }
});

test('learning and feed media render untrusted strings safely', () => {
    const learning = fs.readFileSync(path.join(ROOT, 'public/learning.html'), 'utf8');
    const dashboard = fs.readFileSync(path.join(ROOT, 'public/dashboard.html'), 'utf8');
    const finance = fs.readFileSync(path.join(ROOT, 'public/finance.html'), 'utf8');
    assert.match(learning, /const esc=value=>String\(value\?\?'\'\)/);
    assert.match(learning, /esc\(a\.title\)/);
    assert.match(learning, /data-name="\$\{esc\(m\.original_name\)\}"/);
    assert.match(dashboard, /data-media-name="\$\{escapeHtml\(p\.media_original_name\)\}"/);
    assert.match(dashboard, /downloadPostMedia\(this\)/);
    assert.match(finance, /function esc\(v\)/);
    assert.match(finance, /\$\{esc\(i\.invoice_no\)\}/);
    assert.match(finance, /\$\{esc\(d\.invoice\.invoice_no\)\}/);
});

test('student home summary cards and OD deep links reach their matching dashboards', () => {
    const home = fs.readFileSync(path.join(ROOT, 'public/home.js'), 'utf8');
    const student = fs.readFileSync(path.join(ROOT, 'public/student.html'), 'utf8');
    const timetable = fs.readFileSync(path.join(ROOT, 'public/timetable.html'), 'utf8');
    assert.match(home, /querySelectorAll\('\[data-href\]'\)\.forEach\(card => card\.addEventListener\('click'/);
    assert.match(home, /href: 'timetable\.html'/);
    assert.match(home, /student\.html#myodSection/);
    assert.match(student, /location\.hash === '#myodSection'/);
    assert.match(timetable, /ERP\.call\('\/api\/timetable\?limit=100'\)/);
    assert.match(timetable, /ERP\.escapeHtml/);
});

test('student navigation returns home and message attachments use authenticated fetch', () => {
    const messages = fs.readFileSync(path.join(ROOT, 'public/messages.html'), 'utf8');
    const feedback = fs.readFileSync(path.join(ROOT, 'public/ui-feedback.js'), 'utf8');
    const shared = fs.readFileSync(path.join(ROOT, 'public/erp-app.js'), 'utf8');
    assert.match(messages, /profile&&profile\.role==='student'\?'home\.html':'dashboard\.html'/);
    assert.match(messages, /data-attachment=.*Download/);
    assert.match(messages, /downloadAttachment\(button\)/);
    assert.match(messages, /headers:auth/);
    assert.match(feedback, /Authorization: 'Bearer ' \+ token/);
    assert.match(feedback, /stopImmediatePropagation\(\)/);
    assert.match(shared, /studentHome.*home\.html.*dashboard\.html/);
});

test('demo importer is development/test-only, idempotent, hashed, and does not seed academic outcomes', () => {
    const importer = fs.readFileSync(path.join(ROOT, 'scripts/seedDemoPeople.js'), 'utf8');
    assert.match(importer, /NODE_ENV=development or NODE_ENV=test/);
    assert.match(importer, /production, recovery, live or real database names/);
    assert.match(importer, /SELECT id FROM users WHERE email=\? OR college_id=\?/);
    assert.match(importer, /bcrypt\.hash/);
    assert.match(importer, /erp_demo_registry/);
    assert.doesNotMatch(importer, /class_attendance_records|finance_invoices|official post/i);
    const csv = fs.readFileSync(path.join(ROOT, 'data/demo/college_erp_demo_people_100.csv'), 'utf8').trim().split('\n');
    assert.equal(csv.length, 101);
});
