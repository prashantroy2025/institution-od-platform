// Live integration suite: boots the real Express routes with Socket.IO against a
// disposable development/test MySQL database and exercises authentication, RBAC,
// profile privacy, attendance arithmetic, feed/social actions, messaging groups,
// unread/read state, realtime delivery/reconnect and private-file authorization.
//
// Guards (runs only when ALL pass):
//   NODE_ENV=test
//   LIVE_TEST_DB set with a clearly disposable name (demo/dev/test/scratch/tmp/sandbox)
//   database name must NOT match production/recovery/live/real/main/master
//   LIVE_TEST_ALLOW_DESTRUCTIVE=1 before any database is created or dropped
//
// Run: NODE_ENV=test LIVE_TEST_ALLOW_DESTRUCTIVE=1 LIVE_TEST_DB=erp_sandbox_test npm test
// The database name must not contain production/recovery/live/real/main/master.
// The harness always drops the disposable database and temp upload dir in test.after.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const DB_NAME = process.env.LIVE_TEST_DB || '';
const BLOCKED_DB = /prod|recovery|live|real|main|master/i;
const SAFE_DB = /demo|dev|test|scratch|tmp|sandbox/i;
const ALLOW_DROP = process.env.LIVE_TEST_ALLOW_DESTRUCTIVE === '1';
const enabled =
    process.env.NODE_ENV === 'test' &&
    DB_NAME.length > 0 &&
    SAFE_DB.test(DB_NAME) &&
    !BLOCKED_DB.test(DB_NAME) &&
    ALLOW_DROP;

let httpServer = null;
let ioServer = null;
let db = null;
let baseUrl = '';
let uploadDir = '';
const token = {};

function loadTestEnv() {
    for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split('\n')) {
        const match = line.match(/^([A-Z_]+)=(.*)$/);
        if (!match) continue;
        const [, key, value] = match;
        if (value.trim()) process.env[key] = value;
    }
    process.env.NODE_ENV = 'test';
    process.env.DB_NAME = DB_NAME;
    if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
        process.env.JWT_SECRET = 'live-integration-test-secret-value-32chars';
    }
    uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'erp-live-uploads-'));
    process.env.LEARNING_UPLOAD_DIR = uploadDir;
    // The module guard above already required an explicit allow flag plus a disposable
    // database name; propagate it to the harness's own destroy confirmation.
    process.env.DESTROYING_LIVE_TEST_DB = '1';
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
// socket.io-client uses its own emitter (no Node removeListener), so wait via its native once().
const waitFor = (emitter, event, timeout) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out waiting for ${event}`)), timeout);
    emitter.once(event, (...args) => { clearTimeout(timer); resolve(args); });
});

// Authenticated API call. FormData bodies pass through untouched so fetch sets the boundary.
async function as(role, method, url, body) {
    const response = await fetch(baseUrl + url, {
        method,
        headers: {
            Authorization: `Bearer ${token[role]}`,
            ...(body && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : {})
        },
        body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined
    });
    const text = await response.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* non-JSON body (e.g. file download) */ }
    return { status: response.status, json, text, response };
}

async function login(email) {
    const response = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: process.env.LIVE_TEST_PASSWORD || 'LiveTest#2026' })
    });
    const data = await response.json().catch(() => null);
    assert.equal(response.status, 200, `login failed for ${email}: ${JSON.stringify(data)}`);
    assert.ok(data.token, 'login must return a JWT');
    return data;
}
if (!enabled) {
    test('live integration suite is guarded and skipped without an explicit disposable database', t => {
        console.log('# live integration SKIPPED: requires NODE_ENV=test, LIVE_TEST_DB (disposable name) and LIVE_TEST_ALLOW_DESTRUCTIVE=1');
        t.skip('not requested');
    });
} else {
    loadTestEnv();

    test.before(async () => {
        const harness = require(path.join(ROOT, 'scripts/liveTestHarness'));
        await harness.createDatabase(DB_NAME);
        const express = require('express');
        const http = require('http');
        const { Server } = require('socket.io');
        const jwt = require('jsonwebtoken');

        const instance = express();
        instance.use(express.json());
        for (const [mount, name] of [
            ['/api/auth', 'authRoutes'],
            ['/api/profile', 'profileRoutes'],
            ['/api/attendance', 'attendanceSummaryRoutes'],
            ['/api/community', 'communityRoutes'],
            ['/api/messages', 'messageRoutes']
        ]) instance.use(mount, require(path.join(ROOT, 'routes', name)));

        httpServer = http.createServer(instance);
        ioServer = new Server(httpServer, { cors: { origin: '*' } });
        // Mirrors server.js exactly: JWT-authenticated sockets may only join
        // conversations they are members of (verified server-side).
        ioServer.use((socket, next) => {
            const raw = socket.handshake.auth?.token;
            if (!raw) return next(new Error('Authentication required'));
            jwt.verify(raw, process.env.JWT_SECRET, (error, decoded) => {
                if (error) return next(new Error('Invalid token'));
                socket.user = decoded;
                next();
            });
        });
        ioServer.on('connection', socket => {
            socket.on('conversation:join', async conversationId => {
                const conversation = Number(conversationId);
                if (!Number.isInteger(conversation) || conversation < 1) return;
                const [rows] = await db.query(
                    'SELECT 1 FROM erp_message_conversation_members WHERE conversation_id=? AND user_id=? LIMIT 1',
                    [conversation, socket.user.id]
                );
                if (rows.length) socket.join(`conversation:${conversation}`);
            });
            socket.on('conversation:leave', conversationId => socket.leave(`conversation:${conversationId}`));
        });
        instance.set('io', ioServer);
        db = require(path.join(ROOT, 'config/db'));

        await new Promise(resolve => httpServer.listen(0, resolve));
        baseUrl = `http://127.0.0.1:${httpServer.address().port}`;
    });

    test.after(async () => {
        // Force-close realtime clients first; otherwise io.close() waits forever on open sockets.
        try { if (ioServer) ioServer.disconnectSockets(true); } catch { /* already closed */ }
        const closers = [];
        if (ioServer) closers.push(new Promise(resolve => { try { ioServer.close(() => resolve()); } catch { resolve(); } }));
        if (httpServer) closers.push(new Promise(resolve => { try { httpServer.closeAllConnections?.(); httpServer.close(() => resolve()); } catch { resolve(); } }));
        await Promise.race([Promise.all(closers), sleep(4000)]);
        try { if (db) await db.end(); } catch { /* pool already closed */ }
        if (uploadDir) fs.rmSync(uploadDir, { recursive: true, force: true });
        const harness = require(path.join(ROOT, 'scripts/liveTestHarness'));
        await harness.dropDatabase(DB_NAME);
    });
    test('login works for every role and /api/auth/me returns only that user', async () => {
        for (const [role, email] of [
            ['student', 'live.student@test.local'],
            ['peer', 'live.classmate@test.local'],
            ['outsider', 'live.outsider@test.local'],
            ['organizer', 'live.organizer@test.local'],
            ['hod', 'live.hod@test.local'],
            ['super_admin', 'live.super_admin@test.local']
        ]) {
            const session = await login(email);
            token[role] = session.token;
            const me = await as(role, 'GET', '/api/auth/me');
            assert.equal(me.status, 200, `${role}: ${JSON.stringify(me.json)}`);
            assert.equal(me.json.email, email, `${role} /api/auth/me must return the authenticated user`);
            assert.equal(me.json.password, undefined);
            assert.doesNotMatch(JSON.stringify(me.json), /password_hash|\$2[aby]\$|jwt_secret/i);
        }
        assert.ok(token.student !== token.super_admin, 'roles must not share tokens');
    });

    test('profile is self-scoped, persists updates and never exposes credentials', async () => {
        const student = await as('student', 'GET', '/api/profile');
        assert.equal(student.status, 200, JSON.stringify(student.json));
        assert.equal(student.json.role, 'student');
        assert.equal(student.json.email, 'live.student@test.local');
        assert.ok(student.json.profile, 'student academic profile must be present');
        assert.doesNotMatch(JSON.stringify(student.json), /password_hash|\$2[aby]\$|jwt_secret|aadhaar/i);

        const patched = await as('student', 'PATCH', '/api/profile', {
            emergency_name: 'Live Test Guardian',
            emergency_phone: '9000000000',
            emergency_relation: 'Parent',
            allow_profile_discovery: true,
            allow_direct_messages: true
        });
        assert.equal(patched.status, 200, JSON.stringify(patched.json));
        assert.equal(patched.json.emergency.name, 'Live Test Guardian');
        const reloaded = await as('student', 'GET', '/api/profile');
        assert.equal(reloaded.json.emergency.name, 'Live Test Guardian', 'profile update must persist');
        assert.equal(reloaded.json.emergency.phone, '9000000000');
    });

    test('unauthenticated requests are rejected on every protected endpoint', async () => {
        for (const url of ['/api/profile', '/api/auth/me', '/api/community/feed', '/api/attendance/summary', '/api/messages/conversations']) {
            const response = await fetch(baseUrl + url);
            assert.notEqual(response.status, 200, `${url} must require authentication`);
        }
    });

    test('attendance summary is self-scoped and arithmetically correct for every role', async () => {
        // Fixture (harness): student 4 -> Present(03-02), Absent(03-09); student 5 -> Present, Late.
        const student = await as('student', 'GET', '/api/attendance/summary');
        assert.equal(student.status, 200, JSON.stringify(student.json));
        assert.equal(typeof student.json.overall.percentage, 'number', 'overall percentage must be numeric');
        assert.equal(student.json.overall.total, 2, 'student must see exactly their own 2 sessions');
        assert.equal(student.json.overall.present, 1);
        assert.equal(student.json.overall.absent, 1);
        assert.equal(student.json.overall.percentage, 50, '1 attended of 2 held = 50%');
        assert.ok(Array.isArray(student.json.subjects) && student.json.subjects.length > 0);
        for (const subject of student.json.subjects) {
            assert.ok(Number(subject.percentage) >= 0 && Number(subject.percentage) <= 100, `percentage out of range: ${subject.percentage}`);
            assert.ok(subject.attended <= subject.classes_held, 'attended can never exceed held');
            assert.equal(Number(subject.percentage), Math.round(subject.attended * 100 / subject.classes_held * 100) / 100, 'subject percentage must match attended/held');
        }
        assert.doesNotMatch(JSON.stringify(student.json), /NaN|undefined/);

        // Date filter arithmetic: only the second session (Absent) is in range.
        const filtered = await as('student', 'GET', '/api/attendance/summary?from=2026-03-09&to=2026-03-09');
        assert.equal(filtered.json.overall.total, 1);
        assert.equal(filtered.json.overall.absent, 1);
        assert.equal(filtered.json.overall.percentage, 0);

        // Faculty sees all sessions on their timetable (4 records), proving student self-scoping.
        const faculty = await as('organizer', 'GET', '/api/attendance/summary');
        assert.equal(faculty.status, 200, JSON.stringify(faculty.json));
        assert.equal(faculty.json.overall.total, 4, 'faculty workload covers all 4 fixture records');
        assert.equal(faculty.json.overall.percentage, 75);

        for (const role of ['hod', 'super_admin']) {
            const staff = await as(role, 'GET', '/api/attendance/summary');
            assert.equal(staff.status, 200, `${role} attendance summary failed: ${JSON.stringify(staff.json)}`);
        }
    });
    test('feed: official posts restricted to staff, search, saved filter and pagination', async () => {
        const officialDenied = await as('student', 'POST', '/api/community/feed', { body: 'student official attempt', is_official: true });
        assert.equal(officialDenied.status, 403, 'students must not publish official posts');

        const created = await as('student', 'POST', '/api/community/feed', { body: 'live integration student post' });
        assert.equal(created.status, 201, JSON.stringify(created.json));
        assert.ok(created.json.id > 0);

        const facultyOfficial = await as('organizer', 'POST', '/api/community/feed', { body: 'official live update', is_official: true });
        assert.equal(facultyOfficial.status, 201, 'authorized staff may publish official posts');

        const feed = await as('student', 'GET', '/api/community/feed?filter=college');
        assert.equal(feed.status, 200);
        assert.ok(feed.json.items.map(p => p.id).includes(created.json.id), 'own post must appear in college feed');
        const official = feed.json.items.find(p => p.id === facultyOfficial.json.id);
        assert.equal(official.is_official, 1, 'official flag must be returned');
        assert.equal(feed.json.items[0].is_official, 1, 'official posts are listed first');
        assert.ok(feed.json.pagination.total >= 2);

        const searched = await as('student', 'GET', '/api/community/feed?search=live+integration');
        assert.equal(searched.status, 200);
        assert.ok(searched.json.items.some(p => p.body.includes('live integration')));

        const none = await as('student', 'GET', '/api/community/feed?search=zzz-no-match-zzz');
        assert.equal(none.json.items.length, 0, 'search must not fabricate matches');
        assert.equal(none.json.pagination.total, 0);

        const saved = await as('student', 'POST', `/api/community/feed/${created.json.id}/save`);
        assert.equal(saved.json.active, true);
        const savedFeed = await as('student', 'GET', '/api/community/feed?filter=saved');
        assert.ok(savedFeed.json.items.map(p => p.id).includes(created.json.id), 'saved filter must persist');
        await as('student', 'POST', `/api/community/feed/${created.json.id}/save`);
        const cleared = await as('student', 'GET', '/api/community/feed?filter=saved');
        assert.ok(!cleared.json.items.map(p => p.id).includes(created.json.id));
    });
    test('social actions: share, follow, block, discovery privacy and moderation RBAC', async () => {
        const mine = await as('student', 'POST', '/api/community/feed', { body: 'post to be shared live' });
        assert.equal(mine.status, 201, JSON.stringify(mine.json));
        const mineId = mine.json.id;

        const shared = await as('organizer', 'POST', `/api/community/feed/${mineId}/share`, { note: 'worth reading' });
        assert.equal(shared.status, 201, JSON.stringify(shared.json));
        assert.deepEqual({ shared: shared.json.shared, shares: shared.json.shares }, { shared: true, shares: 1 });
        const ownShare = await as('student', 'POST', `/api/community/feed/${mineId}/share`, {});
        assert.equal(ownShare.status, 400, 'cannot share your own post');
        const feedAfterShare = await as('student', 'GET', '/api/community/feed');
        const sharedItem = feedAfterShare.json.items.find(p => p.id === mineId);
        assert.equal(Number(sharedItem.shares), 1, 'share count must persist and be visible');
        assert.equal(Boolean(sharedItem.shared), false, 'share flag is scoped to the current user');
        const unshared = await as('organizer', 'DELETE', `/api/community/feed/${mineId}/share`);
        assert.deepEqual({ shared: unshared.json.shared, shares: unshared.json.shares }, { shared: false, shares: 0 });

        const follow = await as('student', 'POST', '/api/community/follow/3');
        assert.equal(follow.status, 200);
        assert.equal(follow.json.following, true);
        const orgPost = await as('organizer', 'POST', '/api/community/feed', { body: 'organizer timeline live post' });
        assert.equal(orgPost.status, 201);
        const following = await as('student', 'GET', '/api/community/feed?filter=following');
        assert.ok(following.json.items.map(p => p.id).includes(orgPost.json.id), 'followed author appears in Following');

        const block = await as('student', 'POST', '/api/community/block/3');
        assert.equal(block.json.blocked, true);
        const afterBlock = await as('student', 'GET', '/api/community/feed?filter=college');
        assert.ok(!afterBlock.json.items.some(p => p.id === orgPost.json.id || p.author_id === 3), 'blocked author hidden from feed');
        const peopleAfterBlock = await as('student', 'GET', '/api/community/people');
        assert.ok(!peopleAfterBlock.json.items.some(u => u.id === 3), 'blocked author hidden from suggestions');

        await as('student', 'PATCH', '/api/profile', { allow_profile_discovery: false });
        const hiddenPeople = await as('organizer', 'GET', '/api/community/people');
        assert.ok(!hiddenPeople.json.items.some(u => u.id === 4), 'discovery opt-out must hide the student');
        await as('student', 'PATCH', '/api/profile', { allow_profile_discovery: true });
        const shownPeople = await as('organizer', 'GET', '/api/community/people');
        assert.ok(shownPeople.json.items.some(u => u.id === 4), 'discovery opt-in must restore the student');

        const unblock = await as('student', 'DELETE', '/api/community/block/3');
        assert.equal(unblock.json.blocked, false);

        const report = await as('student', 'POST', '/api/community/reports', { target_type: 'post', target_id: orgPost.json.id, reason: 'live moderation probe' });
        assert.equal(report.status, 201, JSON.stringify(report.json));
        assert.equal(report.json.status, 'Open');
        const studentList = await as('student', 'GET', '/api/community/reports');
        assert.equal(studentList.status, 403, 'students must not read the moderation queue');
        const studentModerate = await as('student', 'PATCH', `/api/community/reports/${report.json.id}`, { action: 'reviewed' });
        assert.equal(studentModerate.status, 403, 'students must not moderate');
        const staffList = await as('organizer', 'GET', '/api/community/reports?status=Open');
        assert.equal(staffList.status, 200);
        assert.ok(staffList.json.items.some(r => r.id === report.json.id));
        const moderated = await as('organizer', 'PATCH', `/api/community/reports/${report.json.id}`, { action: 'content_removed', note: 'removed by live test' });
        assert.equal(moderated.status, 200, JSON.stringify(moderated.json));
        assert.equal(moderated.json.status, 'Closed');
        const afterModeration = await as('student', 'GET', '/api/community/feed');
        assert.ok(!afterModeration.json.items.some(p => p.id === orgPost.json.id), 'removed content disappears from the feed');
        const closedList = await as('organizer', 'GET', '/api/community/reports?status=Closed');
        const closedRow = closedList.json.items.find(r => r.id === report.json.id);
        assert.ok(closedRow, 'closed report stays queryable');
        assert.equal(closedRow.last_action, 'content_removed', 'moderation action trail must persist');
    });
    test('direct messages, academic groups, official channels and unread/read state', async () => {
        // Direct messages: classmates allowed, unrelated students blocked by policy.
        const dm = await as('student', 'POST', '/api/messages/direct', { target_id: 5 });
        assert.equal(dm.status, 201, JSON.stringify(dm.json));
        const convId = dm.json.id;
        const outsiderDm = await as('student', 'POST', '/api/messages/direct', { target_id: 6 });
        assert.equal(outsiderDm.status, 403, 'DM limited to approved academic relationships');
        const selfDm = await as('student', 'POST', '/api/messages/direct', { target_id: 4 });
        assert.equal(selfDm.status, 400, 'cannot message yourself');
        const again = await as('student', 'POST', '/api/messages/direct', { target_id: 5 });
        assert.equal(again.json.id, convId, 'repeat DM must reuse the existing conversation');

        const sent = await as('student', 'POST', `/api/messages/conversations/${convId}/messages`, { body: 'live direct message' });
        assert.equal(sent.status, 201, JSON.stringify(sent.json));

        // Unread count and read state are persisted per member.
        const peerConvs = await as('peer', 'GET', '/api/messages/conversations');
        const peerItem = peerConvs.json.items.find(c => c.id === convId);
        assert.ok(peerItem, 'recipient must see the conversation');
        assert.equal(peerItem.unread_count, 1, 'one unread message from the sender');
        const history = await as('peer', 'GET', `/api/messages/conversations/${convId}/messages`);
        assert.ok(history.json.items.some(m => m.body === 'live direct message' && m.sender_id === 4));
        const read = await as('peer', 'POST', `/api/messages/conversations/${convId}/read`, { message_id: sent.json.id });
        assert.equal(read.status, 200, JSON.stringify(read.json));
        const afterRead = await as('peer', 'GET', '/api/messages/conversations');
        assert.equal(afterRead.json.items.find(c => c.id === convId).unread_count, 0, 'read state must clear unread');

        // Block/deny directions and non-member access.
        await as('peer', 'POST', '/api/community/block/4');
        const blockedDm = await as('student', 'POST', '/api/messages/direct', { target_id: 5 });
        assert.equal(blockedDm.status, 403, 'blocked relationships cannot open DMs');
        await as('peer', 'DELETE', '/api/community/block/4');
        const nonMember = await as('outsider', 'GET', `/api/messages/conversations/${convId}/messages`);
        assert.equal(nonMember.status, 403, 'non-members cannot read a conversation');

        // Academic group tied to section 1: eligible joins, unrelated student denied.
        const group = await as('organizer', 'POST', '/api/messages/groups', { name: 'Live Section A', group_type: 'academic', section_id: 1 });
        assert.equal(group.status, 201, JSON.stringify(group.json));
        const joined = await as('student', 'POST', `/api/messages/groups/${group.json.id}/join`);
        assert.equal(joined.status, 201, JSON.stringify(joined.json));
        assert.equal(joined.json.conversation_id, group.json.conversation_id);
        const deniedJoin = await as('outsider', 'POST', `/api/messages/groups/${group.json.id}/join`);
        assert.equal(deniedJoin.status, 403, 'ineligible students must not join unrelated academic groups');

        const groupMsg = await as('organizer', 'POST', `/api/messages/conversations/${group.json.conversation_id}/messages`, { body: 'live group announcement' });
        assert.equal(groupMsg.status, 201);
        const studentReads = await as('student', 'GET', `/api/messages/conversations/${group.json.conversation_id}/messages`);
        assert.ok(studentReads.json.items.some(m => m.body === 'live group announcement'));
        const outsiderReads = await as('outsider', 'GET', `/api/messages/conversations/${group.json.conversation_id}/messages`);
        assert.equal(outsiderReads.status, 403, 'group history stays private to members');

        // Official channel: department-scoped join allowed, posting restricted to staff.
        const official = await as('organizer', 'POST', '/api/messages/groups', { name: 'Live Official Channel', group_type: 'official', department_id: 1 });
        assert.equal(official.status, 201, JSON.stringify(official.json));
        const officialJoin = await as('student', 'POST', `/api/messages/groups/${official.json.id}/join`);
        assert.equal(officialJoin.status, 201);
        const studentPost = await as('student', 'POST', `/api/messages/conversations/${official.json.conversation_id}/messages`, { body: 'not allowed' });
        assert.equal(studentPost.status, 403, `status=${studentPost.status} body=${studentPost.text}`);
        assert.match(studentPost.text, /authorized staff/i);
        const staffPost = await as('organizer', 'POST', `/api/messages/conversations/${official.json.conversation_id}/messages`, { body: 'live official notice' });
        assert.equal(staffPost.status, 201);
        const fakeOfficial = await as('student', 'POST', '/api/messages/groups', { name: 'Fake official', group_type: 'official' });
        assert.equal(fakeOfficial.status, 403, 'students must not create official groups');

        // Group directory contract: is_member flag is always present (reserved-word-safe alias).
        const directory = await as('student', 'GET', '/api/messages/groups');
        assert.equal(directory.status, 200, JSON.stringify(directory.json));
        const sectionA = directory.json.items.find(g => g.name === 'Live Section A');
        assert.ok(sectionA, 'created academic group must be listed');
        assert.equal(Number(sectionA.is_member), 1, 'eligible member flag must be set');
        assert.ok(!('member' in sectionA), 'legacy reserved-word alias must not leak into the API');
        const outsiderDirectory = await as('outsider', 'GET', '/api/messages/groups');
        const outsiderView = (outsiderDirectory.json.items || []).find(g => g.name === 'Live Section A');
        if (outsiderView) assert.equal(Number(outsiderView.is_member), 0, 'visibility must not imply membership');
    });
    test('Socket.IO delivers to joined members only and reconnects safely', async () => {
        const { io: connectClient } = require('socket.io-client');
        const dm = await as('student', 'POST', '/api/messages/direct', { target_id: 5 });
        const convId = dm.json.id;

        const recipient = connectClient(baseUrl, { auth: { token: token.peer }, transports: ['websocket'] });
        const outsiderSocket = connectClient(baseUrl, { auth: { token: token.outsider }, transports: ['websocket'] });
        await waitFor(recipient, 'connect', 3000);
        await waitFor(outsiderSocket, 'connect', 3000);
        // Re-join on every connect so reconnects restore room membership (mirrors messages.html).
        recipient.on('connect', () => recipient.emit('conversation:join', convId));
        recipient.emit('conversation:join', convId);
        outsiderSocket.emit('conversation:join', convId);
        await sleep(150);

        const outsiderGot = [];
        outsiderSocket.on('message:new', payload => outsiderGot.push(payload));
        const firstDelivery = waitFor(recipient, 'message:new', 3000);
        const sent = await as('student', 'POST', `/api/messages/conversations/${convId}/messages`, { body: 'realtime delivery probe' });
        assert.equal(sent.status, 201);
        const [payload] = await firstDelivery;
        assert.equal(payload.conversation_id, convId);
        assert.equal(payload.body, 'realtime delivery probe');
        assert.equal(payload.sender_id, 4);

        await sleep(700);
        assert.equal(outsiderGot.length, 0, 'non-members must never receive conversation events');

        // Reconnect: rooms are dropped server-side, re-join on connect restores delivery.
        recipient.disconnect();
        await new Promise(resolve => setTimeout(resolve, 100));
        recipient.connect();
        await waitFor(recipient, 'connect', 3000);
        recipient.emit('conversation:join', convId);
        await sleep(150);
        const secondDelivery = waitFor(recipient, 'message:new', 3000);
        const sentAgain = await as('student', 'POST', `/api/messages/conversations/${convId}/messages`, { body: 'after reconnect probe' });
        assert.equal(sentAgain.status, 201);
        const [payloadAgain] = await secondDelivery;
        assert.equal(payloadAgain.body, 'after reconnect probe');

        recipient.close();
        outsiderSocket.close();
    });

    test('private profile documents and feed media authorize every download', async () => {
        const documentForm = new FormData();
        documentForm.append('label', 'Live Test Certificate');
        documentForm.append('document', new Blob(['%PDF-1.4 live integration test'], { type: 'application/pdf' }), 'live-test.pdf');
        const uploaded = await as('student', 'POST', '/api/profile/documents', documentForm);
        assert.equal(uploaded.status, 201, JSON.stringify(uploaded.json));
        assert.ok(uploaded.json.id > 0);

        const own = await fetch(`${baseUrl}/api/profile/documents/${uploaded.json.id}/download`, { headers: { Authorization: `Bearer ${token.student}` } });
        assert.equal(own.status, 200, 'owner must download their own document');
        assert.match(own.headers.get('content-type') || '', /pdf/);
        const other = await fetch(`${baseUrl}/api/profile/documents/${uploaded.json.id}/download`, { headers: { Authorization: `Bearer ${token.peer}` } });
        assert.ok([403, 404].includes(other.status), 'other users must not download private documents');
        const anonymous = await fetch(`${baseUrl}/api/profile/documents/${uploaded.json.id}/download`);
        assert.notEqual(anonymous.status, 200, 'anonymous download must be rejected');

        const mediaForm = new FormData();
        mediaForm.append('body', 'live media post');
        mediaForm.append('media', new Blob([Buffer.from('89504e470d0a1a0a0d0a1a0a', 'hex')], { type: 'image/png' }), 'probe.png');
        const posted = await as('student', 'POST', '/api/community/feed', mediaForm);
        assert.equal(posted.status, 201, JSON.stringify(posted.json));
        const peerMedia = await fetch(`${baseUrl}/api/community/feed/${posted.json.id}/media`, { headers: { Authorization: `Bearer ${token.peer}` } });
        assert.equal(peerMedia.status, 200, 'authenticated users may view non-private feed media');

        const block = await as('peer', 'POST', '/api/community/block/4');
        assert.equal(block.json && block.json.blocked, true, `block must persist: ${block.text}`);
        const blockedMedia = await fetch(`${baseUrl}/api/community/feed/${posted.json.id}/media`, { headers: { Authorization: `Bearer ${token.peer}` } });
        assert.equal(blockedMedia.status, 404, 'blocked authors must not expose media');
        await as('peer', 'DELETE', '/api/community/block/4');
        const anonymousMedia = await fetch(`${baseUrl}/api/community/feed/${posted.json.id}/media`);
        assert.notEqual(anonymousMedia.status, 200, 'anonymous media download must be rejected');

        const removed = await as('student', 'DELETE', `/api/community/feed/${posted.json.id}`);
        assert.equal(removed.json.removed, true, 'authors may remove their own posts');
    });





}

