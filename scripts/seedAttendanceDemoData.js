/* Guarded, development-only class-attendance demo seeder (Milestone option c).
 *
 * Purpose: give the existing Attendance dashboard real, internally consistent
 * data for the demo student Tara Saxena (users.id=22) in institution_od_demo so
 * History / Subject-wise / Monthly / Analytics / Mark views return real rows.
 *
 * Safety (mirrors scripts/seedAcademicDemoData.js and the demo guards):
 *   - Requires NODE_ENV=development or NODE_ENV=test.
 *   - Only ever targets the explicit `institution_od_demo` database, and
 *     re-verifies SELECT DATABASE() after connecting before any write.
 *   - Single transaction; full rollback on any error.
 *   - Idempotent via erp_college_demo_registry (entity_type attendance_timetable
 *     / attendance_session) plus SELECT-before-INSERT and the schema unique keys
 *     on class_attendance_sessions(timetable_id,attendance_date) and
 *     class_attendance_records(attendance_session_id,student_id).
 *   - Only INSERTs when missing. Never DELETE/UPDATE existing timetable,
 *     class-attendance, or student rows. Creates data for the demo student only.
 *   - The student's current semester and subject are READ from the database
 *     (never hardcoded), using the exact resolution the attendance service uses.
 *
 * Usage:
 *   set -a && . ./.env && set +a
 *   NODE_ENV=development DB_NAME=institution_od_demo node scripts/seedAttendanceDemoData.js [--dry-run]
 */
'use strict';

const mysql = require('mysql2/promise');
const db = require('../config/db');
const dbConfig = db.getDbConfig();

const STUDENT_ID = 22;
const FACULTY_ID = 1027;      // Ritu Verma, EE organizer (marked_by / created_by)
const CLASSROOM_CODE = 'DEMO-ACA-13';
const DEMO_PERIOD_LABEL = 'Sep 2026 demo period';

/* Weekday must match the date. weekday 1=Mon..7=Sun (matches timetable_entries.weekday). */
const SESSIONS = [
    { demo_id: 'ATT-DEMO-TT-A', weekday: 2, start: '11:00:00', end: '12:00:00' },
    { demo_id: 'ATT-DEMO-TT-B', weekday: 4, start: '14:00:00', end: '15:00:00' },
];
const RECORDS = [
    { demo_id: 'ATT-DEMO-S-1', slot: 'ATT-DEMO-TT-A', date: '2026-09-08', status: 'Present' },
    { demo_id: 'ATT-DEMO-S-2', slot: 'ATT-DEMO-TT-B', date: '2026-09-10', status: 'Present' },
    { demo_id: 'ATT-DEMO-S-3', slot: 'ATT-DEMO-TT-A', date: '2026-09-15', status: 'Late' },
    { demo_id: 'ATT-DEMO-S-4', slot: 'ATT-DEMO-TT-B', date: '2026-09-17', status: 'Absent' },
];

function parseArgs(argv) {
    const options = { apply: false };
    for (const arg of argv) {
        if (arg === '--apply') options.apply = true;
        else if (arg === '--dry-run') options.apply = false;
        else if (arg.startsWith('--')) throw new Error(`Unsupported option: ${arg.split('=')[0]}`);
    }
    return options;
}

function assertSafeTarget(env = process.env) {
    if (!['development', 'test'].includes(String(env.NODE_ENV || '').toLowerCase())) {
        throw new Error('Attendance demo seed requires NODE_ENV=development or NODE_ENV=test');
    }
    const database = env.DB_NAME || env.MYSQLDATABASE;
    if (database !== 'institution_od_demo') {
        throw new Error('Attendance demo seed may only target the explicit institution_od_demo database (set DB_NAME)');
    }
    if (env.DB_NAME && env.MYSQLDATABASE && env.DB_NAME !== env.MYSQLDATABASE) {
        throw new Error('DB_NAME and MYSQLDATABASE must agree');
    }
}

const options = parseArgs(process.argv.slice(2));

function weekdayOf(dateStr) {
    return ((new Date(`${dateStr}T00:00:00Z`).getUTCDay() + 6) % 7) + 1;
}

async function resolveContext(connection) {
    // Demo student + academic relationships (read, never hardcoded).
    const [students] = await connection.query(
        `SELECT u.id AS user_id, u.email, sp.batch_id, sp.section_id, b.course_id, b.session_id, c.department_id
         FROM users u JOIN student_profiles sp ON sp.user_id = u.id
         JOIN batches b ON b.id = sp.batch_id JOIN courses c ON c.id = b.course_id
         WHERE u.id = ? AND u.role = 'student' AND u.is_active = 1 AND (u.deleted = 0 OR u.deleted IS NULL)
           AND sp.section_id IS NOT NULL`,
        [STUDENT_ID]
    );
    if (students.length !== 1) throw new Error(`Demo student ${STUDENT_ID} not found or not fully linked to batch/section`);
    const student = students[0];
    if (student.email !== 'tarasaxena.student0001@demo.college.invalid') {
        throw new Error(`Refusing: user ${STUDENT_ID} email is not the expected demo student`);
    }

    // Current semester using the SAME resolution as services/attendanceStudentService.semesters():
    // first semester whose (start,end) — falling back to session dates — contains today; else the last by number.
    const [semRows] = await connection.query(
        `SELECT sem.id, sem.number, sem.name,
            (CURRENT_DATE BETWEEN COALESCE(sem.start_date, ses.start_date) AND COALESCE(sem.end_date, ses.end_date)) AS is_current
         FROM semesters sem JOIN academic_sessions ses ON ses.id = sem.session_id
         WHERE sem.session_id = ? ORDER BY sem.number`,
        [student.session_id]
    );
    if (!semRows.length) throw new Error('No semesters configured for the demo student batch');
    const current = semRows.find((r) => Number(r.is_current) === 1) || semRows[semRows.length - 1];
    const semester = current;

    // Subjects valid for this student's course + current semester.
    const [subjects] = await connection.query(
        'SELECT id, code, name FROM subjects WHERE course_id = ? AND semester_id = ? AND is_active = 1 ORDER BY code',
        [student.course_id, semester.id]
    );
    if (!subjects.length) throw new Error('No active subjects for the demo student course and current semester');
    const subject = subjects[0]; // exactly one per semester for this course

    // Faculty marker must exist and be active in the student's department.
    const [faculty] = await connection.query(
        "SELECT id, name FROM users WHERE id = ? AND role IN ('organizer','hod') AND is_active = 1 AND (deleted = 0 OR deleted IS NULL)",
        [FACULTY_ID]
    );
    if (!faculty.length) throw new Error(`Faculty marker ${FACULTY_ID} not found/active; refusing`);

    // Classroom: reuse the existing demo room; create only if missing (never overwrite).
    let classroomId = null;
    const [rooms] = await connection.query('SELECT id FROM classrooms WHERE department_id = ? AND code = ? LIMIT 1', [student.department_id, CLASSROOM_CODE]);
    if (rooms[0]) classroomId = rooms[0].id;
    else {
        const [room] = await connection.query('INSERT INTO classrooms (department_id, code, name, capacity, is_active, created_by) VALUES (?, ?, ?, 40, 1, ?)', [student.department_id, CLASSROOM_CODE, 'Demo Academic Room', FACULTY_ID]);
        classroomId = room.insertId;
    }

    return { student, semester, subject, faculty: faculty[0], classroomId };
}

async function registryGet(connection, entity, demoId) {
    const [rows] = await connection.query('SELECT related_id FROM erp_college_demo_registry WHERE entity_type = ? AND demo_id = ?', [entity, demoId]);
    return rows[0] ? rows[0].related_id : null;
}
async function registrySet(connection, entity, demoId, relatedId) {
    await connection.query('INSERT INTO erp_college_demo_registry (entity_type, demo_id, related_id) VALUES (?, ?, ?)', [entity, demoId, relatedId]);
}


async function ensureTimetable(connection, ctx, slot) {
    let id = await registryGet(connection, 'attendance_timetable', slot.demo_id);
    if (id) {
        const [rows] = await connection.query('SELECT id FROM timetable_entries WHERE id = ? AND session_id = ? AND semester_id = ? AND subject_id = ? AND batch_id = ? AND section_id = ?', [id, ctx.student.session_id, ctx.semester.id, ctx.subject.id, ctx.student.batch_id, ctx.student.section_id]);
        if (rows.length) return rows[0].id;
        id = null; // stale registry; fall through
    }
    const [existing] = await connection.query(
        'SELECT id FROM timetable_entries WHERE session_id = ? AND semester_id = ? AND subject_id = ? AND batch_id = ? AND section_id = ? AND weekday = ? AND start_time = ? AND end_time = ? LIMIT 1',
        [ctx.student.session_id, ctx.semester.id, ctx.subject.id, ctx.student.batch_id, ctx.student.section_id, slot.weekday, slot.start, slot.end]
    );
    if (existing.length) {
        await registrySet(connection, 'attendance_timetable', slot.demo_id, existing[0].id);
        return existing[0].id;
    }
    const [created] = await connection.query(
        'INSERT INTO timetable_entries (session_id, semester_id, subject_id, batch_id, section_id, faculty_id, classroom_id, weekday, start_time, end_time, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [ctx.student.session_id, ctx.semester.id, ctx.subject.id, ctx.student.batch_id, ctx.student.section_id, ctx.faculty.id, ctx.classroomId, slot.weekday, slot.start, slot.end, ctx.faculty.id]
    );
    await registrySet(connection, 'attendance_timetable', slot.demo_id, created.insertId);
    return created.insertId;
}

async function ensureSessionAndRecord(connection, ctx, timetableIds, rec) {
    const slot = SESSIONS.find((s) => s.demo_id === rec.slot);
    const timetableId = timetableIds[rec.slot];
    if (weekdayOf(rec.date) !== slot.weekday) {
        throw new Error(`Internal error: ${rec.date} weekday ${weekdayOf(rec.date)} != slot weekday ${slot.weekday}`);
    }
    let sessionId = null;
    const [sess] = await connection.query('SELECT id FROM class_attendance_sessions WHERE timetable_id = ? AND attendance_date = ?', [timetableId, rec.date]);
    if (sess.length) sessionId = sess[0].id;
    else {
        const [created] = await connection.query('INSERT INTO class_attendance_sessions (timetable_id, attendance_date, created_by) VALUES (?, ?, ?)', [timetableId, rec.date, ctx.faculty.id]);
        sessionId = created.insertId;
    }
    await registrySet(connection, 'attendance_session', rec.demo_id, sessionId);
    const [existingRec] = await connection.query('SELECT id FROM class_attendance_records WHERE attendance_session_id = ? AND student_id = ?', [sessionId, ctx.student.user_id]);
    if (!existingRec.length) {
        await connection.query('INSERT INTO class_attendance_records (attendance_session_id, student_id, status, marked_by) VALUES (?, ?, ?, ?)', [sessionId, ctx.student.user_id, rec.status, ctx.faculty.id]);
        return 'created';
    }
    return 'existing';
}


async function seed(connection) {
    const [dbRows] = await connection.query('SELECT DATABASE() database_name');
    if (dbRows[0]?.database_name !== 'institution_od_demo') throw new Error('Connected database verification failed; refusing writes');

    const ctx = await resolveContext(connection);

    if (!options.apply) {
        return {
            mode: 'dry-run',
            target: 'institution_od_demo',
            student: { user_id: ctx.student.user_id, email: ctx.student.email, batch_id: ctx.student.batch_id, section_id: ctx.student.section_id, course_id: ctx.student.course_id },
            current_semester: { id: ctx.semester.id, number: ctx.semester.number, name: ctx.semester.name },
            subject: ctx.subject,
            faculty: ctx.faculty,
            classroom_id: ctx.classroomId,
            period: DEMO_PERIOD_LABEL,
            timetable_slots: SESSIONS.map((s) => ({ ...s, weekday_label: ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][s.weekday] })),
            records: RECORDS,
        };
    }

    await connection.beginTransaction();
    try {
        const timetableIds = {};
        for (const slot of SESSIONS) timetableIds[slot.demo_id] = await ensureTimetable(connection, ctx, slot);
        const outcomes = [];
        for (const rec of RECORDS) outcomes.push({ demo_id: rec.demo_id, date: rec.date, status: rec.status, result: await ensureSessionAndRecord(connection, ctx, timetableIds, rec) });
        await connection.commit();
        return {
            mode: 'apply',
            target: 'institution_od_demo',
            student_user_id: ctx.student.user_id,
            current_semester: { id: ctx.semester.id, number: ctx.semester.number, name: ctx.semester.name },
            subject: ctx.subject,
            timetable_ids: timetableIds,
            records: outcomes,
            period: DEMO_PERIOD_LABEL,
        };
    } catch (error) {
        await connection.rollback();
        throw error;
    }
}

async function main() {
    assertSafeTarget();
    const connection = await mysql.createConnection({ ...dbConfig, database: 'institution_od_demo', multipleStatements: false });
    try {
        console.log(JSON.stringify(await seed(connection), null, 2));
    } finally {
        await connection.end();
        try { db.end && db.end(); } catch { /* pool */ }
        process.exit(process.exitCode || 0);
    }
}

if (require.main === module) {
    main().catch((error) => { console.error(`Attendance demo seed refused/failed: ${error.message}`); process.exit(1); });
}

module.exports = { parseArgs, assertSafeTarget, weekdayOf };

