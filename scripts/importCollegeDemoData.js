'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const csv = require('csv-parser');
const bcrypt = require('bcryptjs');

const ROOT = path.resolve(__dirname, '..');
const DEFAULT_FILES = {
    students: path.join(ROOT, 'demo_data/students_1000.csv'),
    faculty: path.join(ROOT, 'demo_data/faculty_42.csv'),
    hod: path.join(ROOT, 'demo_data/hod_6.csv'),
    subjects: path.join(ROOT, 'demo_data/subjects_36.csv'),
    attendance: path.join(ROOT, 'demo_data/attendance_sample_12000.csv'),
    marks: path.join(ROOT, 'demo_data/marks_results_6000.csv'),
};
const HEADERS = {
    students: ['demo_person_id','full_name','email','role','college_id','roll_number','department_code','department_name','programme','batch','semester','section','date_of_birth','phone','guardian_name','guardian_phone','avatar_path','is_demo'],
    faculty: ['demo_person_id','full_name','email','role','department_code','department_name','designation','employee_code','phone','avatar_path','is_demo'],
    hod: ['demo_person_id','full_name','email','role','department_code','department_name','designation','employee_code','phone','avatar_path','is_demo'],
    subjects: ['demo_subject_id','subject_code','subject_name','department_code','semester','credits','is_demo'],
    attendance: ['demo_attendance_id','demo_person_id','roll_number','demo_subject_id','subject_code','attendance_date','status','class_start','room_code','is_demo'],
    marks: ['demo_mark_id','demo_person_id','roll_number','demo_subject_id','subject_code','subject_name','academic_session','semester','internal_marks','internal_max','final_marks','final_max','total_marks','total_max','grade','result_status','is_demo'],
};
const DEPARTMENTS = Object.freeze({
    CSE: 'Computer Science and Engineering',
    IT: 'Information Technology',
    ECE: 'Electronics and Communication Engineering',
    ME: 'Mechanical Engineering',
    CE: 'Civil Engineering',
    EE: 'Electrical Engineering',
});
const ATTENDANCE_STATUSES = new Set(['Present', 'Absent', 'Late', 'Excused']);
const RESULT_STATUSES = new Set(['PASS', 'FAIL', 'ABSENT', 'WITHHELD', 'INCOMPLETE']);

function parseArgs(argv) {
    const options = { apply: false, files: { ...DEFAULT_FILES } };
    for (const arg of argv) {
        if (arg === '--dry-run') options.apply = false;
        else if (arg === '--apply') options.apply = true;
        else if (arg.startsWith('--data-dir=')) {
            const dir = path.resolve(arg.slice('--data-dir='.length));
            for (const key of Object.keys(options.files)) options.files[key] = path.join(dir, path.basename(DEFAULT_FILES[key]));
        } else if (arg.startsWith('--')) throw new Error(`Unsupported option: ${arg.split('=')[0]}`);
    }
    return options;
}

function checkSafety(env = process.env, database = env.DB_NAME || env.MYSQLDATABASE) {
    if (!['development', 'test'].includes(String(env.NODE_ENV || '').toLowerCase())) {
        throw new Error('Importer requires NODE_ENV=development or NODE_ENV=test');
    }
    if (database !== 'institution_od_demo') {
        throw new Error('Importer may connect only to the explicit institution_od_demo database (set DB_NAME or MYSQLDATABASE)');
    }
    if (env.DB_NAME && env.MYSQLDATABASE && env.DB_NAME !== env.MYSQLDATABASE) {
        throw new Error('DB_NAME and MYSQLDATABASE must agree');
    }
}

function readCsv(file) {
    return new Promise((resolve, reject) => {
        const rows = [];
        fs.createReadStream(file).pipe(csv())
            .on('data', row => rows.push(row))
            .on('end', () => resolve(rows))
            .on('error', reject);
    });
}

function validateHeaders(actual, required) {
    const missing = required.filter(column => !actual.includes(column));
    if (missing.length) throw new Error(`CSV is missing required columns: ${missing.join(', ')}`);
    const unexpected = actual.filter(column => !required.includes(column));
    if (unexpected.length) throw new Error(`CSV has unexpected columns: ${unexpected.join(', ')}`);
}

function numeric(value) {
    if (value === undefined || String(value).trim() === '') return NaN;
    return Number(value);
}
function validDate(value) {
    const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return false;
    const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
    return date.toISOString().slice(0, 10) === value;
}
function validateBundle(data) {
    const issues = [];
    const duplicateIds = [];
    const seen = new Map();
    for (const kind of Object.keys(HEADERS)) {
        const idField = kind === 'subjects' ? 'demo_subject_id' : kind === 'attendance' ? 'demo_attendance_id' : kind === 'marks' ? 'demo_mark_id' : 'demo_person_id';
        for (const [index, row] of (data[kind] || []).entries()) {
            const rowNumber = index + 2;
            const id = String(row[idField] || '').trim();
            if (!id) issues.push({ kind, row: rowNumber, id: '', reason: `missing ${idField}` });
            const key = `${['students','faculty','hod'].includes(kind) ? 'person' : kind}:${id}`;
            if (id && seen.has(key)) duplicateIds.push({ kind, id, row: rowNumber, firstRow: seen.get(key) });
            else if (id) seen.set(key, rowNumber);
            if (String(row.is_demo).toLowerCase() !== 'true') issues.push({ kind, row: rowNumber, id, reason: 'is_demo is not true' });
            const expectedRole = { students: 'student', faculty: 'organizer', hod: 'hod' }[kind];
            if (expectedRole && row.role !== expectedRole) issues.push({ kind, row: rowNumber, id, reason: `role must be ${expectedRole}` });
            if (kind === 'subjects' && !DEPARTMENTS[row.department_code]) issues.push({ kind, row: rowNumber, id, reason: 'department code is not supported' });
            if (kind === 'students' || kind === 'faculty' || kind === 'hod') {
                if (DEPARTMENTS[row.department_code] !== row.department_name) issues.push({ kind, row: rowNumber, id, reason: 'department code/name is not an exact supported mapping' });
                if (!row.email || !row.email.toLowerCase().endsWith('.invalid')) issues.push({ kind, row: rowNumber, id, reason: 'email must use the reserved .invalid domain' });
            }
            if (kind === 'students' && (!Number.isInteger(numeric(row.semester)) || numeric(row.semester) < 1 || numeric(row.semester) > 20)) issues.push({ kind, row: rowNumber, id, reason: 'invalid semester' });
            if (kind === 'subjects' && (!Number.isInteger(numeric(row.semester)) || numeric(row.semester) < 1 || numeric(row.semester) > 20 || !Number.isFinite(numeric(row.credits)) || numeric(row.credits) < 0)) issues.push({ kind, row: rowNumber, id, reason: 'invalid subject semester or credits' });
            if (kind === 'attendance' && (!validDate(row.attendance_date) || !ATTENDANCE_STATUSES.has(row.status))) issues.push({ kind, row: rowNumber, id, reason: 'invalid attendance date or status' });
            if (kind === 'marks') {
                const internal = numeric(row.internal_marks), internalMax = numeric(row.internal_max);
                const final = numeric(row.final_marks), finalMax = numeric(row.final_max);
                const total = numeric(row.total_marks), totalMax = numeric(row.total_max);
                if ([internal, internalMax, final, finalMax, total, totalMax].some(value => !Number.isFinite(value)) || internal < 0 || final < 0 || internalMax <= 0 || finalMax <= 0 || totalMax <= 0 || internal > internalMax || final > finalMax || total > totalMax || Math.abs(total - internal - final) > 0.001 || Math.abs(totalMax - internalMax - finalMax) > 0.001 || !RESULT_STATUSES.has(String(row.result_status).toUpperCase())) {
                    issues.push({ kind, row: rowNumber, id, reason: 'invalid mark arithmetic, bounds, or result_status' });
                }
                if (!Number.isInteger(numeric(row.semester)) || numeric(row.semester) < 1 || numeric(row.semester) > 20) issues.push({ kind, row: rowNumber, id, reason: 'invalid mark semester' });
            }
        }
    }
    const people = new Map();
    for (const kind of ['students','faculty','hod']) for (const row of data[kind] || []) people.set(row.demo_person_id, { ...row, kind });
    const subjects = new Map((data.subjects || []).map(row => [row.demo_subject_id, row]));
    const references = [];
    for (const kind of ['attendance','marks']) {
        for (const [index, row] of (data[kind] || []).entries()) {
            const person = people.get(row.demo_person_id);
            const subject = subjects.get(row.demo_subject_id);
            let reason = '';
            if (!person || person.kind !== 'students') reason = 'student relationship is unresolved';
            else if (person.roll_number !== row.roll_number) reason = 'roll number does not match the student profile';
            else if (!subject || subject.subject_code !== row.subject_code) reason = 'subject relationship is unresolved';
            else if (kind === 'marks' && subject.subject_name !== row.subject_name) reason = 'subject name does not match the subject profile';
            else if (subject.department_code !== person.department_code) reason = 'student and subject department differ';
            else if (Number(subject.semester) !== Number(person.semester) || (kind === 'marks' && Number(row.semester) !== Number(person.semester))) reason = 'student, subject, and source semester do not exactly match';
            if (reason) references.push({ kind, row: index + 2, id: row[kind === 'attendance' ? 'demo_attendance_id' : 'demo_mark_id'], reason });
        }
    }
    return { issues, duplicateIds, references };
}

async function loadBundle(files) {
    const data = {};
    for (const kind of Object.keys(HEADERS)) {
        const file = files[kind];
        if (!fs.existsSync(file)) throw new Error(`CSV not found: ${file}`);
        validateHeaders(await csvHeaders(file), HEADERS[kind]);
        data[kind] = await readCsv(file);
    }
    return data;
}
function csvHeaders(file) {
    return new Promise((resolve, reject) => {
        const stream = fs.createReadStream(file).pipe(csv());
        stream.on('headers', headers => { stream.destroy(); resolve(headers); });
        stream.on('error', error => { if (error.code !== 'ERR_STREAM_PREMATURE_CLOSE') reject(error); });
        stream.on('end', () => reject(new Error(`CSV is empty or has no header: ${path.basename(file)}`)));
    });
}

function dbConfig(env = process.env) {
    return {
        host: env.DB_HOST || env.MYSQLHOST || 'localhost',
        user: env.DB_USER || env.MYSQLUSER || 'root',
        password: env.DB_PASSWORD ?? env.MYSQLPASSWORD ?? '',
        database: env.DB_NAME || env.MYSQLDATABASE,
        port: Number(env.DB_PORT || env.MYSQLPORT || 3306),
        multipleStatements: false,
    };
}
async function tableExists(conn, table) {
    const [rows] = await conn.execute('SELECT COUNT(*) AS count FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?', [table]);
    return Number(rows[0].count) > 0;
}
async function ensureDemoSchema(conn) {
    const [rows] = await conn.execute('SELECT DATABASE() AS database_name');
    if (rows[0]?.database_name !== 'institution_od_demo') throw new Error('Connected database verification failed; refusing schema changes');
    const registryExists = await tableExists(conn, 'erp_college_demo_registry');
    const detailsExist = await tableExists(conn, 'erp_demo_mark_details');
    if (registryExists && detailsExist) return false;
    const migration = fs.readFileSync(path.join(ROOT, 'db/migrations/013_college_demo_import.sql'), 'utf8');
    for (const statement of migration.split(';').map(value => value.trim()).filter(Boolean)) await conn.execute(statement);
    return true;
}
async function exactOrCreate(conn, entity, demoId, selectSql, selectParams, insertSql, insertParams) {
    const [registered] = await conn.execute('SELECT related_id FROM erp_college_demo_registry WHERE entity_type = ? AND demo_id = ?', [entity, demoId]);
    if (registered.length === 1) return registered[0].related_id;
    const [existing] = await conn.execute(selectSql, selectParams);
    if (existing.length > 1) throw new Error(`${entity} ${demoId} maps to multiple existing records`);
    let id = existing[0]?.id;
    if (!id) {
        const [created] = await conn.execute(insertSql, insertParams);
        id = created.insertId;
    }
    await conn.execute('INSERT INTO erp_college_demo_registry (entity_type, demo_id, related_id) VALUES (?, ?, ?)', [entity, demoId, id]);
    return id;
}
function yearRange(value) {
    const match = String(value).match(/^(\d{4})-(\d{4})$/);
    if (!match || Number(match[2]) <= Number(match[1])) return null;
    return { start: Number(match[1]), end: Number(match[2]) };
}
async function ensureAcademicFoundation(conn, data) {
    const departments = new Map();
    const sources = [...data.students, ...data.faculty, ...data.hod, ...data.subjects];
    for (const code of new Set(sources.map(row => row.department_code))) {
        const name = DEPARTMENTS[code];
        if (!name) continue;
        const [rows] = await conn.execute('SELECT id, deleted FROM departments WHERE name = ?', [name]);
        const active = rows.filter(row => row.deleted === 0 || row.deleted === null);
        if (active.length > 1) throw new Error(`Department ${code} is ambiguous`);
        if (active.length === 1) departments.set(code, active[0].id);
        else if (rows.length) throw new Error(`Department ${code} exists but is deleted; refusing to overwrite it`);
        else {
            const [created] = await conn.execute('INSERT INTO departments (name, deleted) VALUES (?, 0)', [name]);
            departments.set(code, created.insertId);
        }
    }

    const sessions = new Map();
    for (const label of new Set(data.marks.map(row => row.academic_session))) {
        const range = yearRange(label);
        if (!range) continue;
        const demoId = `college-demo-session-${label}`;
        const id = await exactOrCreate(conn, 'session', demoId,
            'SELECT id FROM academic_sessions WHERE code = ?', [label],
            'INSERT INTO academic_sessions (code, name, start_date, end_date, is_active) VALUES (?, ?, ?, ?, 1)',
            [label, label, `${range.start}-01-01`, `${range.end}-12-31`]);
        sessions.set(label, id);
        for (let number = 1; number <= 8; number++) {
            const semesterId = await exactOrCreate(conn, 'semester', `${demoId}-sem-${number}`,
                'SELECT id FROM semesters WHERE session_id = ? AND number = ?', [id, number],
                'INSERT INTO semesters (session_id, number, name) VALUES (?, ?, ?)', [id, number, `Semester ${number}`]);
            sessions.set(`${label}:${number}`, semesterId);
        }
    }

    const courses = new Map();
    for (const row of data.students) {
        const departmentId = departments.get(row.department_code);
        if (!departmentId || !row.programme) continue;
        const code = row.programme.toUpperCase().replace(/[^A-Z0-9]+/g, '-').slice(0, 30).replace(/-+$/g, '');
        const id = await exactOrCreate(conn, 'course', `${row.department_code}-${code}`,
            'SELECT id FROM courses WHERE department_id = ? AND name = ?', [departmentId, row.programme],
            'INSERT INTO courses (department_id, code, name, duration_semesters, is_active) VALUES (?, ?, ?, 8, 1)', [departmentId, code, row.programme]);
        courses.set(`${row.department_code}:${row.programme}`, id);
    }

    const batchIds = new Map();
    const primarySession = sessions.get(data.marks[0]?.academic_session);
    for (const row of data.students) {
        const range = yearRange(row.batch);
        const courseId = courses.get(`${row.department_code}:${row.programme}`);
        const sessionId = primarySession;
        if (!range || !courseId || !sessionId) continue;
        const key = `${row.department_code}:${row.programme}:${row.batch}`;
        if (!batchIds.has(key)) batchIds.set(key, await exactOrCreate(conn, 'batch', key,
            'SELECT id FROM batches WHERE course_id = ? AND session_id = ? AND name = ?', [courseId, sessionId, row.batch],
            'INSERT INTO batches (course_id, session_id, name, start_year, end_year, is_active) VALUES (?, ?, ?, ?, ?, 1)', [courseId, sessionId, row.batch, range.start, range.end]));
        const batchId = batchIds.get(key);
        const sectionKey = `${key}:${row.section}`;
        if (!batchIds.has(sectionKey)) batchIds.set(sectionKey, await exactOrCreate(conn, 'section', sectionKey,
            'SELECT id FROM sections WHERE batch_id = ? AND name = ?', [batchId, row.section],
            'INSERT INTO sections (batch_id, name, is_active) VALUES (?, ?, 1)', [batchId, row.section]));
    }

    for (const row of data.subjects) {
        const departmentId = departments.get(row.department_code);
        const sessionId = primarySession;
        if (!departmentId || !sessionId) continue;
        const programmes = [...new Set(data.students.filter(student => student.department_code === row.department_code).map(student => student.programme))];
        const courseId = programmes.length === 1 ? courses.get(`${row.department_code}:${programmes[0]}`) : null;
        const semesterId = sessions.get(`${data.marks[0]?.academic_session}:${Number(row.semester)}`);
        if (!courseId || !semesterId) continue;
        await exactOrCreate(conn, 'subject', row.demo_subject_id,
            'SELECT id FROM subjects WHERE course_id = ? AND semester_id = ? AND code = ?', [courseId, semesterId, row.subject_code],
            'INSERT INTO subjects (course_id, semester_id, code, name, credits, is_active) VALUES (?, ?, ?, ?, ?, 1)', [courseId, semesterId, row.subject_code, row.subject_name, Number(row.credits)]);
    }
    return { departments, courses, batches: batchIds, sessions };
}

async function checkRelationships(conn, row, kind) {
    const deptName = DEPARTMENTS[row.department_code];
    const [departments] = await conn.execute('SELECT id FROM departments WHERE name = ? AND (deleted = 0 OR deleted IS NULL)', [deptName]);
    if (departments.length !== 1) return { reason: 'exact department relationship is missing or ambiguous' };
    if (kind === 'faculty' || kind === 'hod') return { departmentId: departments[0].id };
    const [courses] = await conn.execute('SELECT id FROM courses WHERE department_id = ? AND name = ?', [departments[0].id, row.programme]);
    if (courses.length !== 1) return { reason: 'exact programme relationship is missing or ambiguous' };
    const [batches] = await conn.execute('SELECT id, session_id FROM batches WHERE course_id = ? AND name = ?', [courses[0].id, row.batch]);
    if (batches.length !== 1) return { reason: 'exact batch relationship is missing or ambiguous' };
    const [sections] = await conn.execute('SELECT id FROM sections WHERE batch_id = ? AND name = ?', [batches[0].id, row.section]);
    if (sections.length !== 1) return { reason: 'exact batch section relationship is missing or ambiguous' };
    const [semester] = await conn.execute('SELECT id FROM semesters WHERE session_id = ? AND number = ?', [batches[0].session_id, Number(row.semester)]);
    if (semester.length !== 1) return { reason: 'exact batch-session semester relationship is missing or ambiguous' };
    return { departmentId: departments[0].id, courseId: courses[0].id, batchId: batches[0].id, sectionId: sections[0].id, sessionId: batches[0].session_id, semesterId: semester[0].id };
}
async function registryExisting(conn, entity, demoId) {
    const [rows] = await conn.execute('SELECT related_id FROM erp_college_demo_registry WHERE entity_type = ? AND demo_id = ?', [entity, demoId]);
    return rows[0] || null;
}
async function registryInsert(conn, entity, demoId, relatedId) {
    await conn.execute('INSERT INTO erp_college_demo_registry (entity_type, demo_id, related_id) VALUES (?, ?, ?)', [entity, demoId, relatedId || null]);
}
async function importPerson(conn, kind, row, counters) {
    const entity = kind === 'students' ? 'student' : kind;
    if (await registryExisting(conn, entity, row.demo_person_id)) { counters.skipped++; return; }
    const relationship = await checkRelationships(conn, row, kind);
    if (relationship.reason) { counters.unresolved++; return; }
    const [existing] = await conn.execute('SELECT id FROM users WHERE email = ? OR college_id = ? LIMIT 1', [row.email, kind === 'students' ? row.college_id : row.employee_code]);
    if (existing.length) { counters.skipped++; return; }
    const profileQuery = kind === 'students'
        ? 'SELECT user_id FROM student_profiles WHERE enrollment_no = ? LIMIT 1'
        : 'SELECT user_id FROM faculty_profiles WHERE employee_code = ? LIMIT 1';
    const profileKey = kind === 'students' ? row.roll_number : row.employee_code;
    const [profileConflict] = await conn.execute(profileQuery, [profileKey]);
    if (profileConflict.length) { counters.skipped++; return; }
    const passwordHash = await bcrypt.hash(crypto.randomBytes(48).toString('hex'), 12);
    const collegeId = kind === 'students' ? row.college_id : row.employee_code;
    const [created] = await conn.execute('INSERT INTO users (college_id, name, email, password, role, department_id, is_active, deleted) VALUES (?, ?, ?, ?, ?, ?, 1, 0)', [collegeId, row.full_name, row.email, passwordHash, row.role, relationship.departmentId]);
    if (kind === 'students') {
        await conn.execute('INSERT INTO student_profiles (user_id, enrollment_no, phone, batch_id, section_id) VALUES (?, ?, ?, ?, ?)', [created.insertId, row.roll_number, row.phone || null, relationship.batchId, relationship.sectionId]);
    } else {
        await conn.execute('INSERT INTO faculty_profiles (user_id, employee_code, designation, phone) VALUES (?, ?, ?, ?)', [created.insertId, row.employee_code, row.designation || null, row.phone || null]);
    }
    await registryInsert(conn, entity, row.demo_person_id, created.insertId);
    counters.imported++;
}
async function importSubject(conn, row, counters) {
    if (await registryExisting(conn, 'subject', row.demo_subject_id)) { counters.skipped++; return; }
    const deptName = DEPARTMENTS[row.department_code];
    const [subjects] = await conn.execute('SELECT s.id FROM subjects s JOIN courses c ON c.id = s.course_id JOIN semesters sm ON sm.id = s.semester_id JOIN departments d ON d.id = c.department_id WHERE d.name = ? AND s.code = ? AND s.name = ? AND sm.number = ? AND (d.deleted = 0 OR d.deleted IS NULL)', [deptName, row.subject_code, row.subject_name, Number(row.semester)]);
    if (subjects.length !== 1) { counters.unresolved++; return; }
    await registryInsert(conn, 'subject', row.demo_subject_id, subjects[0].id);
    counters.imported++;
}
async function importAttendance(conn, row, people, subjects, counters) {
    if (await registryExisting(conn, 'attendance', row.demo_attendance_id)) { counters.skipped++; return; }
    const person = people.get(row.demo_person_id), subject = subjects.get(row.demo_subject_id);
    if (!person || !subject || person.roll_number !== row.roll_number || subject.subject_code !== row.subject_code || subject.department_code !== person.department_code || Number(subject.semester) !== Number(person.semester)) { counters.unresolved++; return; }
    const [student] = await conn.execute('SELECT u.id, sp.batch_id, sp.section_id, b.session_id, sm.number AS semester_number FROM users u JOIN student_profiles sp ON sp.user_id = u.id JOIN batches b ON b.id = sp.batch_id JOIN semesters sm ON sm.session_id = b.session_id WHERE u.college_id = ? AND u.role = \'student\' AND sp.enrollment_no = ? AND sm.number = ?', [person.college_id, row.roll_number, Number(person.semester)]);
    if (student.length !== 1) { counters.unresolved++; return; }
    const weekday = ((new Date(`${row.attendance_date}T00:00:00Z`).getUTCDay() + 6) % 7) + 1;
    const start = /^\d{2}:\d{2}$/.test(row.class_start) ? `${row.class_start}:00` : row.class_start;
    const [matches] = await conn.execute('SELECT t.id, t.faculty_id FROM timetable_entries t JOIN classrooms cl ON cl.id = t.classroom_id JOIN academic_sessions ac ON ac.id = t.session_id JOIN subjects s ON s.id = t.subject_id JOIN courses c ON c.id = s.course_id JOIN departments d ON d.id = c.department_id JOIN semesters sm ON sm.id = t.semester_id WHERE t.batch_id = ? AND t.section_id = ? AND s.code = ? AND s.name = ? AND d.name = ? AND sm.number = ? AND t.session_id = ? AND t.weekday = ? AND t.start_time = ? AND cl.code = ? AND ? BETWEEN ac.start_date AND ac.end_date', [student[0].batch_id, student[0].section_id, row.subject_code, subject.subject_name, DEPARTMENTS[person.department_code], Number(person.semester), student[0].session_id, weekday, start, row.room_code, row.attendance_date]);
    if (matches.length !== 1) { counters.unresolved++; return; }
    const timetableId = matches[0].id, facultyId = matches[0].faculty_id;
    const [existingSession] = await conn.execute('SELECT id FROM class_attendance_sessions WHERE timetable_id = ? AND attendance_date = ?', [timetableId, row.attendance_date]);
    let sessionId;
    if (existingSession.length > 1) { counters.unresolved++; return; }
    if (existingSession.length === 1) sessionId = existingSession[0].id;
    else {
        const [inserted] = await conn.execute('INSERT INTO class_attendance_sessions (timetable_id, attendance_date, created_by) VALUES (?, ?, ?)', [timetableId, row.attendance_date, facultyId]);
        sessionId = inserted.insertId;
    }
    const [existingRecord] = await conn.execute('SELECT id FROM class_attendance_records WHERE attendance_session_id = ? AND student_id = ?', [sessionId, student[0].id]);
    if (existingRecord.length) { counters.unresolved++; return; }
    const [record] = await conn.execute('INSERT INTO class_attendance_records (attendance_session_id, student_id, status, marked_by) VALUES (?, ?, ?, ?)', [sessionId, student[0].id, row.status, facultyId]);
    await registryInsert(conn, 'attendance', row.demo_attendance_id, record.insertId);
    counters.imported++;
}
async function importMark(conn, row, people, subjects, counters, staffId) {
    if (await registryExisting(conn, 'mark', row.demo_mark_id)) { counters.skipped++; return; }
    const person = people.get(row.demo_person_id), subject = subjects.get(row.demo_subject_id);
    if (!person || !subject || person.roll_number !== row.roll_number || subject.subject_code !== row.subject_code || subject.subject_name !== row.subject_name || subject.department_code !== person.department_code || Number(subject.semester) !== Number(person.semester) || Number(row.semester) !== Number(person.semester)) { counters.unresolved++; return; }
    const [students] = await conn.execute('SELECT u.id, sp.batch_id, b.session_id, b.name AS batch_name, c.id AS course_id, c.name AS programme, sec.id AS section_id FROM users u JOIN student_profiles sp ON sp.user_id=u.id JOIN batches b ON b.id=sp.batch_id JOIN courses c ON c.id=b.course_id JOIN sections sec ON sec.id=sp.section_id WHERE u.email=? AND u.role=\'student\' AND sp.enrollment_no=?', [person.email, row.roll_number]);
    const [targets] = await conn.execute('SELECT s.id AS subject_id, s.course_id, s.semester_id, sem.session_id, sem.number FROM subjects s JOIN semesters sem ON sem.id=s.semester_id JOIN courses c ON c.id=s.course_id JOIN departments d ON d.id=c.department_id WHERE d.name=? AND s.code=? AND s.name=? AND sem.number=?', [DEPARTMENTS[person.department_code], row.subject_code, row.subject_name, Number(row.semester)]);
    const [sessions] = await conn.execute('SELECT id FROM academic_sessions WHERE code=?', [row.academic_session]);
    if (!staffId || students.length !== 1 || targets.length !== 1 || sessions.length !== 1 || Number(students[0].session_id) !== Number(sessions[0].id) || students[0].batch_name !== person.batch || students[0].programme !== person.programme || Number(targets[0].course_id) !== Number(students[0].course_id) || Number(targets[0].session_id) !== Number(sessions[0].id)) { counters.unresolved++; return; }
    const title = `Demo results ${row.academic_session} ${row.subject_code} semester ${row.semester}`;
    const [exams] = await conn.execute('SELECT id, batch_id, section_id FROM examinations WHERE session_id=? AND semester_id=? AND subject_id=? AND batch_id=? AND section_id=? AND title=?', [sessions[0].id, targets[0].semester_id, targets[0].subject_id, students[0].batch_id, students[0].section_id, title]);
    let examId;
    if (exams.length > 1) { counters.unresolved++; return; }
    if (exams.length === 1) examId = exams[0].id;
    else {
        const rules = JSON.stringify({ bands: [{ grade: 'A', min_percent: 80 }, { grade: 'B', min_percent: 60 }, { grade: 'C', min_percent: 40 }, { grade: 'F', min_percent: 0 }] });
        const [exam] = await conn.execute('INSERT INTO examinations (session_id,semester_id,subject_id,batch_id,section_id,created_by,title,exam_type,maximum_marks,pass_marks,grading_rules,status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)', [sessions[0].id, targets[0].semester_id, targets[0].subject_id, students[0].batch_id, students[0].section_id, staffId, title, 'Final', Number(row.total_max), Number(row.total_max) * 0.4, rules, 'Published']);
        examId = exam.insertId;
    }
    const [registrations] = await conn.execute('SELECT id, status FROM examination_registrations WHERE exam_id=? AND student_id=?', [examId, students[0].id]);
    if (registrations.length > 1 || (registrations.length === 1 && registrations[0].status !== 'Registered')) { counters.unresolved++; return; }
    if (!registrations.length) await conn.execute('INSERT INTO examination_registrations (exam_id,student_id,status) VALUES (?,?,\'Registered\')', [examId, students[0].id]);
    const [existingMarks] = await conn.execute('SELECT id FROM examination_marks WHERE exam_id=? AND student_id=?', [examId, students[0].id]);
    if (existingMarks.length) { counters.unresolved++; return; }
    const [mark] = await conn.execute('INSERT INTO examination_marks (exam_id,student_id,marks,entered_by,published_at,published_by) VALUES (?,?,?,?,CURRENT_TIMESTAMP,?)', [examId, students[0].id, Number(row.total_marks), staffId, staffId]);
    await conn.execute('INSERT INTO erp_demo_mark_details (examination_mark_id,demo_mark_id,academic_session,source_semester,internal_marks,internal_max,final_marks,final_max,total_marks,total_max,grade,result_status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)', [mark.insertId, row.demo_mark_id, row.academic_session, Number(row.semester), Number(row.internal_marks), Number(row.internal_max), Number(row.final_marks), Number(row.final_max), Number(row.total_marks), Number(row.total_max), row.grade, row.result_status]);
    await registryInsert(conn, 'mark', row.demo_mark_id, mark.insertId);
    counters.imported++;
}

async function applyBundle(data, connection) {
    const counters = Object.fromEntries(Object.keys(HEADERS).map(kind => [kind, { imported: 0, skipped: 0, unresolved: 0 }]));
    await connection.beginTransaction();
    try {
        if (!(await tableExists(connection, 'erp_college_demo_registry')) || !(await tableExists(connection, 'erp_demo_mark_details'))) {
            throw new Error('Required additive migration 013 is not applied; refusing writes');
        }
        const [dbRows] = await connection.execute('SELECT DATABASE() AS database_name');
        if (!dbRows[0] || dbRows[0].database_name !== 'institution_od_demo') throw new Error('Connected database verification failed; refusing writes');
        await ensureAcademicFoundation(connection, data);
        for (const kind of ['students', 'faculty', 'hod']) for (const row of data[kind]) await importPerson(connection, kind, row, counters[kind]);
        for (const row of data.subjects) await importSubject(connection, row, counters.subjects);
        const people = new Map([...data.students, ...data.faculty, ...data.hod].map(row => [row.demo_person_id, row]));
        const subjects = new Map(data.subjects.map(row => [row.demo_subject_id, row]));
        for (const row of data.attendance) await importAttendance(connection, row, people, subjects, counters.attendance);
        const [staff] = await connection.execute('SELECT id FROM users WHERE role IN (\'super_admin\', \'hod\') AND is_active=1 AND (deleted=0 OR deleted IS NULL) ORDER BY CASE role WHEN \'super_admin\' THEN 0 ELSE 1 END, id LIMIT 1');
        for (const row of data.marks) await importMark(connection, row, people, subjects, counters.marks, staff[0]?.id);
        await connection.commit();
        return { files: counters, totals: Object.values(counters).reduce((total, count) => ({ imported: total.imported + count.imported, skipped: total.skipped + count.skipped, unresolved: total.unresolved + count.unresolved }), { imported: 0, skipped: 0, unresolved: 0 }) };
    } catch (error) {
        await connection.rollback();
        throw error;
    }
}

function buildFileSummaries(data, validation, databaseResults) {
    return Object.fromEntries(Object.keys(HEADERS).map(kind => {
        const rows = data[kind].length;
        const invalid = validation.issues.filter(issue => issue.kind === kind).length + validation.duplicateIds.filter(issue => issue.kind === kind).length;
        const sourceUnresolved = validation.references.filter(reference => reference.kind === kind).length;
        const sourceSkipped = validation.duplicateIds.filter(issue => issue.kind === kind).length;
        const database = databaseResults?.[kind];
        return [kind, {
            rows,
            valid: rows - invalid,
            sourceCandidates: Math.max(0, rows - invalid - sourceUnresolved),
            planned: database ? database.imported + database.skipped : null,
            inserted: database?.imported ?? 0,
            skipped: sourceSkipped + (database?.skipped ?? 0),
            invalid,
            unresolved: sourceUnresolved + (database?.unresolved ?? 0),
        }];
    }));
}

async function runImporter(argv = process.argv.slice(2), dependencies = {}) {
    const options = parseArgs(argv);
    const env = dependencies.env || process.env;
    const data = await loadBundle(options.files);
    const validation = validateBundle(data);
    const invalid = validation.issues.length + validation.duplicateIds.length;
    if (!options.apply) {
        return { mode: 'dry-run', files: buildFileSummaries(data, validation), validation: { invalidRows: invalid, issues: validation.issues.length, duplicateIds: validation.duplicateIds.length, unresolvedReferences: validation.references.length, unresolvedReasons: validation.references.reduce((counts, reference) => ({ ...counts, [reference.reason]: (counts[reference.reason] || 0) + 1 }), {}), unresolvedExamples: validation.references.slice(0, 20) } };
    }
    checkSafety(env);
    if (invalid) throw new Error(`CSV validation failed (${invalid} issue(s)); no database writes attempted`);
    if (!env.DB_NAME && !env.MYSQLDATABASE) throw new Error('Set DB_NAME= institution_od_demo explicitly before --apply');
    const mysql = dependencies.mysql || require('mysql2/promise');
    const connection = dependencies.connection || await mysql.createConnection(dbConfig(env));
    try {
        const [dbRows] = await connection.execute('SELECT DATABASE() AS database_name');
        if (!dbRows[0] || dbRows[0].database_name !== 'institution_od_demo') throw new Error('Connected database verification failed; refusing writes');
        const schemaChanged = await ensureDemoSchema(connection);
        const imported = await applyBundle(data, connection);
        return { mode: 'apply', schema: schemaChanged ? 'additive demo schema applied' : 'already present', files: buildFileSummaries(data, validation, imported.files), totals: imported.totals, unresolvedReferences: validation.references.length };
    } finally {
        if (!dependencies.connection) await connection.end();
    }
}

if (require.main === module) {
    runImporter().then(result => {
        console.log(JSON.stringify(result, null, 2));
    }).catch(error => {
        console.error(`College demo importer refused/failed: ${error.message}`);
        process.exitCode = 1;
    });
}

module.exports = { HEADERS, DEPARTMENTS, validateHeaders, validateBundle, validDate, parseArgs, checkSafety, dbConfig, loadBundle, ensureDemoSchema, applyBundle, runImporter };
