const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

process.env.NODE_ENV = 'test';
process.env.DB_HOST ||= 'localhost';
process.env.DB_USER ||= 'root';
process.env.DB_NAME ||= 'institution_od_events_test';
process.env.DB_PORT ||= '3306';
process.env.JWT_SECRET ||= 'x'.repeat(32);

const db = require('../config/db');
const studentController = require('../controllers/studentController');

function response() {
    return {
        statusCode: 200,
        payload: undefined,
        status(code) { this.statusCode = code; return this; },
        json(value) { this.payload = value; return this; },
    };
}

test('OD applications reject events that are not approved and published', async () => {
    const originalQuery = db.query;
    const statements = [];
    db.query = async sql => {
        statements.push(sql);
        return [[], []];
    };
    try {
        const res = response();
        await studentController.applyOD({
            user: { id: 12, department_id: 3 },
            body: { event_id: 4, applied_date: '2026-10-09' },
        }, res);
        assert.equal(res.statusCode, 404);
        assert.equal(statements.length, 1);
        assert.match(statements[0], /status='Approved' AND is_deleted=0/);
    } finally {
        db.query = originalQuery;
    }
});

test('OD applications do not create rejected OD rows for students outside the participant roster', async () => {
    const originalQuery = db.query;
    const statements = [];
    db.query = async sql => {
        statements.push(sql);
        if (sql.includes('FROM events WHERE id=?')) return [[{
            id: 4,
            title: 'Campus event',
            from_date: '2026-10-09',
            to_date: '2026-10-10',
            target_hod_id: null,
            department_id: 3,
        }], []];
        if (sql.includes('FROM od_applications')) return [[], []];
        if (sql.includes('FROM event_participants')) return [[], []];
        throw new Error(`Unexpected query: ${sql}`);
    };
    try {
        const res = response();
        await studentController.applyOD({
            user: { id: 12, department_id: 3 },
            body: { event_id: 4, applied_date: '2026-10-09' },
        }, res);
        assert.equal(res.statusCode, 403);
        assert.match(res.payload.message, /recorded event participants/);
        assert.equal(statements.some(sql => /^INSERT INTO od_applications/i.test(sql)), false);
    } finally {
        db.query = originalQuery;
    }
});

test('student event details endpoint returns only approved, non-deleted events', () => {
    const routes = fs.readFileSync('routes/studentRoutes.js', 'utf8');
    const controller = fs.readFileSync('controllers/studentController.js', 'utf8');
    assert.match(routes, /"\/events\/:id"[\s\S]*allowRoles\("student"\)[\s\S]*getEventDetails/);
    assert.match(controller, /WHERE e\.id = \? AND e\.status = 'Approved' AND e\.is_deleted = 0/);
    assert.match(controller, /oa\.student_id = \? ORDER BY oa\.id DESC LIMIT 1/);
});

test('HOD event decisions honor explicit target assignment in both mounted controllers', () => {
    for (const path of ['controllers/hodController.js', 'controllers/eventController.js']) {
        const source = fs.readFileSync(path, 'utf8');
        assert.match(source, /target_hod_id=\? OR \(target_hod_id IS NULL AND department_id=\?\)/);
        assert.match(source, /status='Pending'/);
    }
});

test('organizer event history is restricted to events owned by the authenticated organizer', () => {
    const source = fs.readFileSync('controllers/eventController.js', 'utf8');
    assert.match(source, /WHERE e\.organizer_id = \?/);
    assert.match(source, /\[req\.user\.id, limit, offset\]/);
});

test('event categories are validated before any database write on create', async () => {
    const eventController = require('../controllers/eventController');
    const originalQuery = db.query;
    const statements = [];
    db.query = async sql => {
        statements.push(sql);
        return [[], []];
    };
    try {
        const res = response();
        await eventController.createEvent({
            user: { id: 7, department_id: 3, role: 'organizer' },
            body: { title: 'Hack day', from_date: '2026-10-20', to_date: '2026-10-20', category: 'Sports' },
        }, res);
        assert.equal(res.statusCode, 400);
        assert.match(res.payload.message, /Unsupported event category/);
        assert.equal(statements.length, 0);
    } finally {
        db.query = originalQuery;
    }
});

test('student event list rejects unsupported category filters', async () => {
    const originalQuery = db.query;
    const statements = [];
    db.query = async sql => {
        statements.push(sql);
        return [[], []];
    };
    try {
        const res = response();
        await studentController.getEvents({ user: { id: 12 }, query: { category: 'Sports' } }, res);
        assert.equal(res.statusCode, 400);
        assert.equal(statements.length, 0);
    } finally {
        db.query = originalQuery;
    }
});

test('student event list applies a validated category filter in SQL', async () => {
    const originalQuery = db.query;
    let params;
    db.query = async (sql, values) => {
        params = values;
        return [[], []];
    };
    try {
        const res = response();
        await studentController.getEvents({ user: { id: 12 }, query: { category: 'AI Event' } }, res);
        assert.equal(res.statusCode, 200);
        assert.deepEqual(params, [12, 12, 'AI Event', 'AI Event']);
    } finally {
        db.query = originalQuery;
    }
});

test('category migration adds a nullable events.category column idempotently', () => {
    const sql = fs.readFileSync('db/migrations/015_event_categories.sql', 'utf8')
        .split('\n').filter(line => !line.trimStart().startsWith('--')).join('\n');
    assert.match(sql, /column_name = 'category'/);
    assert.match(sql, /ADD COLUMN category VARCHAR\(40\) NULL/);
    assert.doesNotMatch(sql, /\b(DROP TABLE|DELETE|TRUNCATE)\b/i);
});
