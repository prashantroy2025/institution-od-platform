const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

process.env.NODE_ENV = 'test';
process.env.DB_HOST ||= 'localhost';
process.env.DB_USER ||= 'root';
process.env.DB_NAME ||= 'institution_od_attendance_test';
process.env.DB_PORT ||= '3306';
process.env.JWT_SECRET ||= 'x'.repeat(32);

const db = require('../config/db');
const service = require('../services/attendanceStudentService');

const student = { id: 12, role: 'student' };
const hod = { id: 3, role: 'hod', department_id: 2 };

function withQuery(handler, fn) {
    const original = db.query;
    db.query = async (sql, params) => handler(sql, params);
    return fn().finally(() => { db.query = original; });
}

function fixtures({ semesters = [{ id: 5, number: 3, name: 'Semester 3', start_date: '2026-07-01', end_date: '2026-12-31', is_current: 1 }], threshold = 75, analytics = [], records = [] } = {}) {
    return async (sql) => {
        if (sql.includes('SELECT b.session_id')) return [[{ session_id: 1 }]];
        if (sql.includes('FROM semesters sem JOIN academic_sessions')) return [semesters];
        if (sql.includes('attendance_settings')) return [[{ shortage_threshold: threshold }]];
        if (sql.includes('GROUP BY month')) return [analytics];
        if (sql.includes('SELECT COUNT(*) AS total FROM class_attendance_records')) return [[{ total: records.length }]];
        if (sql.includes('car.status, TIME_FORMAT')) return [records];
        throw new Error(`Unexpected query: ${sql}`);
    };
}

test('analytics computes attended share and classes needed to reach the minimum', async () => {
    const rows = [{ month: '2026-08', subject_id: 1, subject_name: 'Data Structures', total: 10, present: 4, absent: 4, late: 1, excused: 1 }];
    const data = await withQuery(fixtures({ analytics: rows }), () => service.analytics({}, student));
    assert.equal(data.overall.total, 10);
    assert.equal(data.overall.attended, 6);
    assert.equal(data.overall.percentage, 60);
    assert.equal(data.overall.classes_needed, 6);
    assert.equal(data.overall.can_miss, 0);
    assert.equal(data.eligibility.status, 'below_minimum');
    assert.equal(data.subjects[0].below_threshold, true);
    assert.equal(data.months[0].month, '2026-08');
});

test('analytics reports eligibility and remaining absences above the minimum', async () => {
    const rows = [{ month: '2026-08', subject_id: 1, subject_name: 'Maths', total: 20, present: 18, absent: 2, late: 0, excused: 0 }];
    const data = await withQuery(fixtures({ analytics: rows, threshold: 75 }), () => service.analytics({}, student));
    assert.equal(data.overall.percentage, 90);
    assert.equal(data.eligibility.status, 'eligible');
    assert.equal(data.eligibility.classes_needed, 0);
    assert.equal(data.eligibility.can_miss, 4);
});

test('analytics handles a semester with zero sessions without dividing by zero', async () => {
    const data = await withQuery(fixtures({ analytics: [] }), () => service.analytics({}, student));
    assert.equal(data.overall.total, 0);
    assert.equal(data.overall.percentage, null);
    assert.equal(data.eligibility.status, 'no_records');
    assert.deepEqual(data.subjects, []);
    assert.deepEqual(data.months, []);
});

test('semester selection is limited to semesters of the student batch', async () => {
    await assert.rejects(
        () => withQuery(fixtures(), () => service.analytics({ semester_id: '99' }, student)),
        (error) => error.status === 404
    );
});

test('attendance analytics and records are restricted to students', async () => {
    await assert.rejects(() => service.analytics({}, hod), (error) => error.status === 403);
    await assert.rejects(() => service.records({}, hod), (error) => error.status === 403);
    await assert.rejects(() => service.semesters(hod), (error) => error.status === 403);
});

test('records reject unsupported status filters', async () => {
    await assert.rejects(
        () => withQuery(fixtures(), () => service.records({ status: 'Sick' }, student)),
        (error) => error.status === 400
    );
});

test('leave requests validate dates and reasons before touching the database', async () => {
    let calls = 0;
    await withQuery(async () => { calls += 1; return [[]]; }, async () => {
        await assert.rejects(() => service.createLeave(student, { from_date: '2026-10-10', to_date: '2026-10-09', reason: 'Fever' }, null), (error) => error.status === 400);
        await assert.rejects(() => service.createLeave(student, { from_date: '2026-10-09', to_date: '2026-10-10', reason: '   ' }, null), (error) => error.status === 400);
        await assert.rejects(() => service.createLeave(hod, { from_date: '2026-10-09', to_date: '2026-10-10', reason: 'Fever' }, null), (error) => error.status === 403);
    });
    assert.equal(calls, 0);
});

test('leave creation rejects overlapping pending or approved requests', async () => {
    const executed = [];
    const connection = {
        beginTransaction: async () => executed.push('begin'),
        commit: async () => executed.push('commit'),
        rollback: async () => executed.push('rollback'),
        release: () => executed.push('release'),
        query: async (sql) => {
            if (sql.includes('FROM student_profiles sp')) return [[{ department_id: 2 }]];
            if (sql.includes("role='hod'")) return [[{ id: 3 }]];
            if (sql.includes('FROM attendance_leave_requests')) return [[{ id: 77 }]];
            throw new Error(`Unexpected query: ${sql}`);
        },
    };
    const original = db.getConnection;
    db.getConnection = async () => connection;
    try {
        await assert.rejects(
            () => service.createLeave(student, { from_date: '2026-10-09', to_date: '2026-10-10', reason: 'Fever' }, null),
            (error) => error.status === 409
        );
    } finally {
        db.getConnection = original;
    }
    assert.ok(executed.includes('rollback'));
    assert.equal(executed.includes('commit'), false);
});

test('leave decisions are limited to the assigned HOD and valid statuses', async () => {
    await assert.rejects(() => service.decideLeave(1, { status: 'Approved' }, student), (error) => error.status === 403);
    await assert.rejects(() => service.decideLeave(1, { status: 'Maybe' }, hod), (error) => error.status === 400);
});

test('student attendance routes and server mount exist with role guards', () => {
    const routes = fs.readFileSync('routes/attendanceStudentRoutes.js', 'utf8');
    const server = fs.readFileSync('server.js', 'utf8');
    assert.match(routes, /router\.get\('\/analytics', verifyToken, allowRoles\('student'\)/);
    assert.match(routes, /router\.post\('\/leave\/:id\/decision', verifyToken, allowRoles\('hod'\)/);
    assert.match(server, /app\.use\('\/api\/attendance', attendanceStudentRoutes\)/);
});
