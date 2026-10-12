const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

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
    // Conversations in the inbox are server-scoped to the authenticated member
    // (WHERE cm.user_id=?), so they never need a per-row is_member flag; group
    // membership is surfaced as g.is_member and consumed by the "join groups" UI.
    assert.match(messages, /WHERE cm\.user_id=\?/);
    assert.match(ui, /g\.is_member/);
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
