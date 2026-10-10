/**
 * Live HTTP integration coverage for the four approved ERP screens
 * (Home/Feed, Attendance, Profile, Messages) against the REAL server.js.
 *
 * Boots the actual Express + Socket.IO server against a disposable per-process
 * MySQL database created by scripts/liveTestHarness (all additive migrations),
 * then exercises real login + JWT issuance, static page serving, RBAC, feed
 * share/search/moderation, attendance arithmetic, unread/read messaging and
 * Socket.IO delivery/reconnect over HTTP.
 *
 * Cleanup is unconditional: server process terminated, temp upload dir removed
 * and the disposable database dropped in test.after (also on failure).
 *
 * Usage: npm test   (requires local MySQL via DB_HOST/DB_USER/DB_PASSWORD)
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { io: connectClient } = require('socket.io-client');

const ROOT = path.resolve(__dirname, '..');
const PORT = 34700 + (process.pid % 200);
const DB = `institution_od_sandbox_ui_${process.pid}`;
const SECRET = 'real-server-ui-secret-0123456789abcdef';
const BASE = `http://127.0.0.1:${PORT}`;

let server;
let uploadDir;
const tokens = {};

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const waitFor = (emitter, event, timeout) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out waiting for ${event}`)), timeout);
    emitter.once(event, (...args) => { clearTimeout(timer); resolve(args); });
});

async function ready() {
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
        try { if ((await fetch(`${BASE}/health`)).ok) return; } catch { /* still booting */ }
        await sleep(100);
    }
    throw new Error('server did not become healthy within 30s');
}

async function request(method, url, actor, body) {
    const response = await fetch(`${BASE}${url}`, {
        method,
        headers: { Authorization: `Bearer ${tokens[actor]}`, ...(body && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}) },
        body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined
    });
    const text = await response.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* non-JSON */ }
    return { status: response.status, json, text, response };
}

async function login(email) {
    const response = await fetch(`${BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: process.env.LIVE_TEST_PASSWORD || 'LiveTest#2026' })
    });
    const data = await response.json().catch(() => null);
    assert.equal(response.status, 200, `login failed for ${email}: ${JSON.stringify(data)}`);
    assert.ok(data.token, 'login must return a JWT');
    return data;
}
test.before(async () => {
    // This suite creates and drops its own uniquely named disposable database on
    // every run (sandbox-named, never production/recovery), so the harness's
    // explicit destroy confirmation is satisfied here.
    process.env.DESTROYING_LIVE_TEST_DB = '1';
    const harness = require(path.join(ROOT, 'scripts/liveTestHarness'));
    await harness.createDatabase(DB);

    uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'erp-real-server-uploads-'));
    server = spawn(process.execPath, ['server.js'], {
        cwd: ROOT,
        env: {
            ...process.env,
            NODE_ENV: 'test',
            PORT: String(PORT),
            DB_NAME: DB,
            DB_HOST: process.env.DB_HOST || 'localhost',
            DB_USER: process.env.DB_USER || 'root',
            DB_PASSWORD: process.env.DB_PASSWORD || '',
            JWT_SECRET: SECRET,
            LEARNING_UPLOAD_DIR: uploadDir
        },
        stdio: ['ignore', 'pipe', 'pipe']
    });
    server.stderr.on('data', chunk => {
        const text = String(chunk);
        if (/Error|error:/.test(text) && !/Token cleanup error/.test(text)) console.error('[real-server]', text.trim());
    });
    await ready();

    for (const email of [
        'live.super_admin@test.local', 'live.hod@test.local', 'live.organizer@test.local',
        'live.student@test.local', 'live.classmate@test.local', 'live.outsider@test.local'
    ]) {
        const session = await login(email);
        tokens[email] = session.token;
    }
    tokens.admin = tokens['live.super_admin@test.local'];
    tokens.hod = tokens['live.hod@test.local'];
    tokens.organizer = tokens['live.organizer@test.local'];
    tokens.student = tokens['live.student@test.local'];
    tokens.peer = tokens['live.classmate@test.local'];
    tokens.outsider = tokens['live.outsider@test.local'];
});

test.after(async () => {
    if (server && server.exitCode === null) {
        server.kill('SIGTERM');
        const deadline = Date.now() + 3000;
        while (server.exitCode === null && Date.now() < deadline) await sleep(50);
        if (server.exitCode === null) server.kill('SIGKILL');
    }
    if (uploadDir) fs.rmSync(uploadDir, { recursive: true, force: true });
    const harness = require(path.join(ROOT, 'scripts/liveTestHarness'));
    await harness.dropDatabase(DB);
});
test('real server serves the four screens, login and /api/auth/me for every role', async () => {
    for (const page of ['/login.html', '/dashboard.html', '/attendance.html', '/profile.html', '/messages.html', '/erp-ui.css', '/config.js', '/ui-feedback.js']) {
        const response = await fetch(`${BASE}${page}`);
        assert.equal(response.status, 200, `${page} must be served by the real server`);
    }

    for (const [actor, role] of [
        ['admin', 'super_admin'], ['hod', 'hod'], ['organizer', 'organizer'],
        ['student', 'student'], ['peer', 'student'], ['outsider', 'student']
    ]) {
        const me = await request('GET', '/api/auth/me', actor);
        assert.equal(me.status, 200, `${actor}: ${me.text}`);
        assert.equal(me.json.role, role, `${actor} role must match the account`);
        assert.ok(!('password' in me.json), '/api/auth/me must never expose a password hash');
        assert.doesNotMatch(JSON.stringify(me.json), /\$2[aby]\$|jwt_secret/i);
    }

    for (const url of ['/api/auth/me', '/api/profile', '/api/attendance/summary', '/api/community/feed', '/api/messages/conversations']) {
        const anonymous = await fetch(`${BASE}${url}`);
        // Existing convention: missing token -> 403 "No token provided", invalid token -> 401.
        assert.ok([401, 403].includes(anonymous.status), `${url} must reject anonymous requests (got ${anonymous.status})`);
        const body = await anonymous.json().catch(() => null);
        assert.match(String(body && body.message), /token|access/i, `${url} rejection must come from authentication`);
    }

    const wrongPassword = await fetch(`${BASE}/api/auth/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'live.student@test.local', password: 'wrong-password' })
    });
    assert.notEqual(wrongPassword.status, 200, 'bad credentials must be rejected');
});

test('attendance summary over the real server is self-scoped and arithmetically correct', async () => {
    const student = await request('GET', '/api/attendance/summary', 'student');
    assert.equal(student.status, 200, student.text);
    assert.equal(student.json.overall.total, 2, 'student sees only their own records');
    assert.equal(student.json.overall.percentage, 50);
    for (const subject of student.json.subjects) {
        assert.ok(Number(subject.percentage) >= 0 && Number(subject.percentage) <= 100);
        assert.ok(subject.attended <= subject.classes_held);
    }
    const faculty = await request('GET', '/api/attendance/summary', 'organizer');
    assert.equal(faculty.json.overall.total, 4, 'faculty workload view covers the timetable');
    for (const role of ['admin', 'hod']) {
        const staff = await request('GET', '/api/attendance/summary', role);
        assert.equal(staff.status, 200, `${role}: ${staff.text}`);
    }
    const invalid = await request('GET', '/api/attendance/summary?from=not-a-date', 'student');
    assert.equal(invalid.status, 400, 'invalid date filters must be rejected');
});
test('profile privacy persists and cross-user profile reads are denied', async () => {
    const privacy = await request('PATCH', '/api/profile', 'student', {
        allow_profile_discovery: false, allow_direct_messages: false,
        emergency_name: 'Guardian One', emergency_phone: '9990001111', emergency_relation: 'Parent'
    });
    assert.equal(privacy.status, 200, privacy.text);
    assert.equal(Number(privacy.json.allow_profile_discovery), 0, 'profile-discovery change must persist');
    assert.equal(privacy.json.emergency.name, 'Guardian One', 'emergency contact must persist');

    const reloaded = await request('GET', '/api/profile', 'student');
    assert.equal(Number(reloaded.json.allow_profile_discovery), 0, 'privacy flag must survive a reload');

    const otherProfile = await fetch(`${BASE}/api/profile/6`, { headers: { Authorization: `Bearer ${tokens.student}` } });
    assert.ok([403, 404].includes(otherProfile.status), 'students must not read another user profile record');

    await request('PATCH', '/api/profile', 'student', { allow_profile_discovery: true });
});

test('feed search, share and moderation work through the real middleware stack', async () => {
    const denied = await request('POST', '/api/community/feed', 'student', { body: 'official attempt', is_official: true });
    assert.equal(denied.status, 403, 'students must not publish official posts');

    const post = await request('POST', '/api/community/feed', 'student', { body: 'real server feed probe' });
    assert.equal(post.status, 201, post.text);
    const official = await request('POST', '/api/community/feed', 'organizer', { body: 'real server official probe', is_official: true });
    assert.equal(official.status, 201, official.text);

    const feed = await request('GET', '/api/community/feed?filter=college', 'student');
    assert.equal(feed.status, 200);
    assert.ok(feed.json.items[0].is_official === 1, 'official posts must lead the feed');
    const searched = await request('GET', '/api/community/feed?search=real+server+feed', 'student');
    assert.ok(searched.json.items.some(p => p.id === post.json.id), 'search must find the post');

    const shared = await request('POST', `/api/community/feed/${post.json.id}/share`, 'organizer', { note: 'shared on real server' });
    assert.equal(shared.status, 201, shared.text);
    assert.equal(shared.json.shares, 1);
    const ownShare = await request('POST', `/api/community/feed/${post.json.id}/share`, 'student', {});
    assert.equal(ownShare.status, 400, 'own posts cannot be shared');

    const report = await request('POST', '/api/community/reports', 'student', { target_type: 'post', target_id: post.json.id, reason: 'real server moderation probe' });
    assert.equal(report.status, 201, report.text);
    const studentQueue = await request('GET', '/api/community/reports', 'student');
    assert.equal(studentQueue.status, 403, 'students must not read the moderation queue');
    const staffQueue = await request('GET', '/api/community/reports?status=Open', 'organizer');
    assert.ok(staffQueue.json.items.some(r => r.id === report.json.id));
    const moderated = await request('PATCH', `/api/community/reports/${report.json.id}`, 'organizer', { action: 'content_removed' });
    assert.equal(moderated.status, 200, moderated.text);
    const after = await request('GET', '/api/community/feed?filter=college', 'student');
    assert.ok(!after.json.items.some(p => p.id === post.json.id), 'removed content must disappear');
});
test('messages persist unread/read state and official channels stay staff-only', async () => {
    const dm = await request('POST', '/api/messages/direct', 'student', { target_id: 5 });
    assert.equal(dm.status, 201, dm.text);
    const outsiderDm = await request('POST', '/api/messages/direct', 'student', { target_id: 6 });
    assert.equal(outsiderDm.status, 403, 'DM limited to approved academic relationships');

    const sent = await request('POST', `/api/messages/conversations/${dm.json.id}/messages`, 'student', { body: 'real server direct probe' });
    assert.equal(sent.status, 201, sent.text);

    const peerConvs = await request('GET', '/api/messages/conversations', 'peer');
    const peerItem = peerConvs.json.items.find(c => c.id === dm.json.id);
    assert.ok(peerItem, 'recipient must see the conversation');
    assert.equal(peerItem.unread_count, 1, 'one unread message');
    await request('POST', `/api/messages/conversations/${dm.json.id}/read`, 'peer', { message_id: sent.json.id });
    const afterRead = await request('GET', '/api/messages/conversations', 'peer');
    assert.equal(afterRead.json.items.find(c => c.id === dm.json.id).unread_count, 0, 'read state must persist');

    const nonMember = await request('GET', `/api/messages/conversations/${dm.json.id}/messages`, 'outsider');
    assert.equal(nonMember.status, 403, 'non-members cannot read a conversation');

    const official = await request('POST', '/api/messages/groups', 'organizer', { name: 'Real Server Official', group_type: 'official', department_id: 1 });
    assert.equal(official.status, 201, official.text);
    await request('POST', `/api/messages/groups/${official.json.id}/join`, 'student');
    const studentPost = await request('POST', `/api/messages/conversations/${official.json.conversation_id}/messages`, 'student', { body: 'not allowed' });
    assert.equal(studentPost.status, 403, `body=${studentPost.text}`);
    assert.match(studentPost.text, /authorized staff/i);
    const staffPost = await request('POST', `/api/messages/conversations/${official.json.conversation_id}/messages`, 'organizer', { body: 'real server official notice' });
    assert.equal(staffPost.status, 201, staffPost.text);
});

test('Socket.IO delivers to joined members and reconnects against the real server', async () => {
    const dm = await request('POST', '/api/messages/direct', 'student', { target_id: 5 });
    const convId = dm.json.id;

    const recipient = connectClient(BASE, { auth: { token: tokens.peer }, transports: ['websocket'] });
    const outsiderSocket = connectClient(BASE, { auth: { token: tokens.outsider }, transports: ['websocket'] });
    await waitFor(recipient, 'connect', 5000);
    await waitFor(outsiderSocket, 'connect', 5000);
    recipient.on('connect', () => recipient.emit('conversation:join', convId));
    recipient.emit('conversation:join', convId);
    outsiderSocket.emit('conversation:join', convId);
    await sleep(200);

    const outsiderGot = [];
    outsiderSocket.on('message:new', payload => outsiderGot.push(payload));
    const firstDelivery = waitFor(recipient, 'message:new', 5000);
    const sent = await request('POST', `/api/messages/conversations/${convId}/messages`, 'student', { body: 'realtime probe via real server' });
    assert.equal(sent.status, 201, sent.text);
    const [payload] = await firstDelivery;
    assert.equal(payload.body, 'realtime probe via real server');
    assert.equal(payload.conversation_id, convId);

    await sleep(700);
    assert.equal(outsiderGot.length, 0, 'non-members must never receive conversation events');

    recipient.disconnect();
    await sleep(150);
    recipient.connect();
    await waitFor(recipient, 'connect', 5000);
    recipient.emit('conversation:join', convId);
    await sleep(200);
    const secondDelivery = waitFor(recipient, 'message:new', 5000);
    const sentAgain = await request('POST', `/api/messages/conversations/${convId}/messages`, 'student', { body: 'after reconnect probe' });
    assert.equal(sentAgain.status, 201, sentAgain.text);
    const [payloadAgain] = await secondDelivery;
    assert.equal(payloadAgain.body, 'after reconnect probe');

    recipient.close();
    outsiderSocket.close();
});




