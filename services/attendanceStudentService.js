const db = require('../config/db');
const auditService = require('./auditService');
const files = require('../utils/learningFileStore');
const { isDateOnly } = require('../utils/requestValidation');

const fail = (message, status = 400) => { const error = new Error(message); error.status = status; error.publicMessage = message; throw error; };
const page = (query) => ({ limit: Math.min(Math.max(Number(query.limit) || 25, 1), 100), offset: Math.max(Number(query.offset) || 0, 0) });
const toNumber = (value) => Number(value || 0);
const round2 = (value) => Math.round(value * 100) / 100;
const ATTENDED = "('Present','Late','Excused')";

async function studentSession(user) {
    const [rows] = await db.query(
        `SELECT b.session_id FROM student_profiles sp JOIN batches b ON b.id=sp.batch_id
         WHERE sp.user_id=? AND sp.section_id IS NOT NULL`,
        [user.id]
    );
    if (!rows[0]) fail('Your academic batch is not configured', 404);
    return rows[0];
}

async function semesters(user) {
    if (user.role !== 'student') fail('Attendance is available to students only', 403);
    const session = await studentSession(user);
    const [items] = await db.query(
        `SELECT sem.id, sem.number, sem.name,
            DATE_FORMAT(COALESCE(sem.start_date, ses.start_date), '%Y-%m-%d') AS start_date,
            DATE_FORMAT(COALESCE(sem.end_date, ses.end_date), '%Y-%m-%d') AS end_date,
            (CURRENT_DATE BETWEEN COALESCE(sem.start_date, ses.start_date) AND COALESCE(sem.end_date, ses.end_date)) AS is_current
         FROM semesters sem JOIN academic_sessions ses ON ses.id=sem.session_id
         WHERE sem.session_id=? ORDER BY sem.number`,
        [session.session_id]
    );
    const current = items.find((item) => item.is_current) || items[items.length - 1] || null;
    return {
        items: items.map(({ is_current, ...item }) => ({ ...item, is_current: Boolean(is_current) })),
        current_semester_id: current ? current.id : null,
    };
}

async function resolveSemester(user, semesterId) {
    const { items, current_semester_id } = await semesters(user);
    if (!items.length) fail('No semesters are configured for your batch', 404);
    const selected = semesterId === undefined || semesterId === ''
        ? current_semester_id
        : Number(semesterId);
    const semester = items.find((item) => item.id === selected);
    if (!semester) fail('Semester not found for your batch', 404);
    return semester;
}

const percentageOf = (attended, total) => (total ? round2((attended * 100) / total) : null);

function classesNeeded(attended, total, threshold) {
    if (!total || percentageOf(attended, total) >= threshold) return 0;
    if (threshold >= 100) return null;
    return Math.max(0, Math.ceil((threshold * total - 100 * attended) / (100 - threshold)));
}

function classesCanMiss(attended, total, threshold) {
    if (!total || threshold <= 0) return null;
    if (percentageOf(attended, total) < threshold) return 0;
    return Math.max(0, Math.floor((100 * attended + 1e-9) / threshold) - total);
}

function tally(rows) {
    return rows.reduce((acc, row) => {
        acc.total += toNumber(row.total);
        acc.present += toNumber(row.present);
        acc.absent += toNumber(row.absent);
        acc.late += toNumber(row.late);
        acc.excused += toNumber(row.excused);
        return acc;
    }, { total: 0, present: 0, absent: 0, late: 0, excused: 0 });
}

function withMetrics(counts, threshold) {
    const attended = counts.present + counts.late + counts.excused;
    const percentage = percentageOf(attended, counts.total);
    return {
        ...counts,
        attended,
        percentage,
        below_threshold: percentage !== null && percentage < threshold,
        classes_needed: classesNeeded(attended, counts.total, threshold),
        can_miss: classesCanMiss(attended, counts.total, threshold),
    };
}

async function thresholdValue() {
    const [rows] = await db.query('SELECT shortage_threshold FROM attendance_settings WHERE id=1');
    return Number(rows[0]?.shortage_threshold ?? 75);
}

async function analytics(query, user) {
    if (user.role !== 'student') fail('Attendance analytics are available to students only', 403);
    const semester = await resolveSemester(user, query.semester_id);
    const threshold = await thresholdValue();
    const [rows] = await db.query(
        `SELECT DATE_FORMAT(cas.attendance_date,'%Y-%m') AS month, s.id AS subject_id, s.name AS subject_name,
            COUNT(*) AS total,
            SUM(car.status='Present') AS present,
            SUM(car.status='Absent') AS absent,
            SUM(car.status='Late') AS late,
            SUM(car.status='Excused') AS excused
         FROM class_attendance_records car
         JOIN class_attendance_sessions cas ON cas.id=car.attendance_session_id
         JOIN timetable_entries t ON t.id=cas.timetable_id
         JOIN subjects s ON s.id=t.subject_id
         WHERE car.student_id=? AND t.semester_id=?
         GROUP BY month, s.id, s.name
         ORDER BY month, s.name`,
        [user.id, semester.id]
    );

    const subjectMap = new Map();
    const monthMap = new Map();
    for (const row of rows) {
        const counts = { total: toNumber(row.total), present: toNumber(row.present), absent: toNumber(row.absent), late: toNumber(row.late), excused: toNumber(row.excused) };
        const subject = subjectMap.get(row.subject_id) || { subject_id: row.subject_id, subject_name: row.subject_name, present: 0, absent: 0, late: 0, excused: 0, total: 0 };
        for (const key of Object.keys(counts)) subject[key] += counts[key];
        subjectMap.set(row.subject_id, subject);

        const month = monthMap.get(row.month) || { month: row.month, present: 0, absent: 0, late: 0, excused: 0, total: 0, subjects: [] };
        for (const key of Object.keys(counts)) month[key] += counts[key];
        month.subjects.push({ subject_id: row.subject_id, subject_name: row.subject_name, ...withMetrics(counts, threshold) });
        monthMap.set(row.month, month);
    }

    const overallCounts = tally(rows);
    const subjects = [...subjectMap.values()].map((subject) => ({ subject_id: subject.subject_id, subject_name: subject.subject_name, ...withMetrics(subject, threshold) }));
    const months = [...monthMap.values()].map((month) => ({ month: month.month, ...withMetrics(month, threshold), subjects: month.subjects }));
    const overall = withMetrics(overallCounts, threshold);
    return {
        semester,
        threshold,
        overall,
        eligibility: {
            status: overall.total === 0 ? 'no_records' : (overall.below_threshold ? 'below_minimum' : 'eligible'),
            classes_needed: overall.classes_needed,
            can_miss: overall.can_miss,
        },
        subjects,
        months,
    };
}

async function records(query, user) {
    if (user.role !== 'student') fail('Attendance records are available to students only', 403);
    const semester = await resolveSemester(user, query.semester_id);
    const { limit, offset } = page(query);
    const filters = ['car.student_id=?', 't.semester_id=?'];
    const params = [user.id, semester.id];
    if (query.subject_id) {
        const subjectId = Number(query.subject_id);
        if (!Number.isInteger(subjectId) || subjectId < 1) fail('subject_id must be a positive integer');
        filters.push('t.subject_id=?');
        params.push(subjectId);
    }
    if (query.status) {
        if (!['Present', 'Absent', 'Late', 'Excused'].includes(query.status)) fail('status must be Present, Absent, Late or Excused');
        filters.push('car.status=?');
        params.push(query.status);
    }
    if (query.date) {
        if (!isDateOnly(query.date)) fail('date must be YYYY-MM-DD');
        filters.push('cas.attendance_date=?');
        params.push(query.date);
    }
    const where = filters.join(' AND ');
    const from = `FROM class_attendance_records car
        JOIN class_attendance_sessions cas ON cas.id=car.attendance_session_id
        JOIN timetable_entries t ON t.id=cas.timetable_id
        JOIN subjects s ON s.id=t.subject_id
        WHERE ${where}`;
    const [items] = await db.query(
        `SELECT car.id, t.id AS timetable_id, DATE_FORMAT(cas.attendance_date,'%Y-%m-%d') AS attendance_date, s.id AS subject_id, s.name AS subject_name,
            car.status, TIME_FORMAT(t.start_time,'%H:%i') AS start_time, TIME_FORMAT(t.end_time,'%H:%i') AS end_time
         ${from}
         ORDER BY cas.attendance_date DESC, t.start_time DESC, car.id DESC
         LIMIT ? OFFSET ?`,
        [...params, limit, offset]
    );
    const [count] = await db.query(`SELECT COUNT(*) AS total ${from}`, params);
    return { semester, items, pagination: { limit, offset, total: toNumber(count[0].total) } };
}

async function studentHod(user, connection = db) {
    const [rows] = await connection.query(
        `SELECT c.department_id FROM student_profiles sp
         JOIN batches b ON b.id=sp.batch_id JOIN courses c ON c.id=b.course_id
         WHERE sp.user_id=?`,
        [user.id]
    );
    const departmentId = rows[0]?.department_id;
    if (!departmentId) fail('Your department is not configured', 404);
    const [hods] = await connection.query(
        "SELECT id FROM users WHERE role='hod' AND department_id=? AND is_active=1 ORDER BY id LIMIT 1",
        [departmentId]
    );
    if (!hods[0]) fail('No active HOD is assigned to your department', 409);
    return { department_id: departmentId, hod_id: hods[0].id };
}

const LEAVE_COLUMNS = `l.id, DATE_FORMAT(l.from_date,'%Y-%m-%d') AS from_date, DATE_FORMAT(l.to_date,'%Y-%m-%d') AS to_date,
    l.reason, l.status, l.decision_note, l.hod_id, l.student_id, u.name AS student_name, u.college_id,
    (l.document_key IS NOT NULL) AS has_document, l.document_original_name, l.created_at, l.decided_at`;

async function createLeave(user, body, file) {
    if (user.role !== 'student') fail('Only students may request leave', 403);
    const fromDate = body.from_date;
    const toDate = body.to_date;
    if (!isDateOnly(fromDate) || !isDateOnly(toDate) || toDate < fromDate) fail('Valid from and to dates are required');
    const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
    if (!reason || reason.length > 500) fail('reason is required and must be at most 500 characters');

    let documentKey = null;
    if (file) {
        files.validateUpload(file, 'pdf,png,jpg,jpeg', 5 * 1024 * 1024);
        documentKey = await files.save(file);
    }

    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        const { department_id, hod_id } = await studentHod(user, connection);
        const [overlap] = await connection.query(
            `SELECT id FROM attendance_leave_requests
             WHERE student_id=? AND status IN ('Pending','Approved') AND from_date<=? AND to_date>=? FOR UPDATE`,
            [user.id, toDate, fromDate]
        );
        if (overlap.length) fail('A pending or approved leave request already overlaps these dates', 409);
        const [result] = await connection.query(
            `INSERT INTO attendance_leave_requests
                (student_id, department_id, hod_id, from_date, to_date, reason, document_key, document_original_name, document_mime, status)
             VALUES (?,?,?,?,?,?,?,?,?,'Pending')`,
            [user.id, department_id, hod_id, fromDate, toDate, reason, documentKey, file ? file.originalname : null, file ? file.mimetype : null]
        );
        await auditService.log(user.id, 'REQUEST_ATTENDANCE_LEAVE', 'attendance_leave_requests', result.insertId);
        await connection.commit();
        return { id: result.insertId, status: 'Pending' };
    } catch (error) {
        await connection.rollback();
        if (documentKey) await files.remove(documentKey);
        throw error;
    } finally {
        connection.release();
    }
}

async function listLeave(query, user) {
    const { limit, offset } = page(query);
    let where;
    if (user.role === 'student') where = 'l.student_id=?';
    else if (user.role === 'hod') where = 'l.hod_id=?';
    else fail('Leave requests are available to students and HODs only', 403);
    const [items] = await db.query(
        `SELECT ${LEAVE_COLUMNS} FROM attendance_leave_requests l JOIN users u ON u.id=l.student_id
         WHERE ${where} ORDER BY l.created_at DESC, l.id DESC LIMIT ? OFFSET ?`,
        [user.id, limit, offset]
    );
    const [count] = await db.query(`SELECT COUNT(*) AS total FROM attendance_leave_requests l WHERE ${where}`, [user.id]);
    return { items, pagination: { limit, offset, total: toNumber(count[0].total) } };
}

async function decideLeave(idValue, body, user) {
    if (user.role !== 'hod') fail('Only the assigned HOD may decide leave requests', 403);
    const id = Number(idValue);
    if (!Number.isInteger(id) || id < 1) fail('id must be a positive integer');
    if (!['Approved', 'Rejected'].includes(body.status)) fail('status must be Approved or Rejected');
    const note = typeof body.decision_note === 'string' ? body.decision_note.trim().slice(0, 300) : null;
    const [result] = await db.query(
        `UPDATE attendance_leave_requests SET status=?, decision_note=?, decided_by=?, decided_at=CURRENT_TIMESTAMP
         WHERE id=? AND hod_id=? AND status='Pending'`,
        [body.status, note || null, user.id, id, user.id]
    );
    if (!result.affectedRows) fail('Pending leave request not found for you', 404);
    await auditService.log(user.id, `${body.status.toUpperCase()}_ATTENDANCE_LEAVE`, 'attendance_leave_requests', id);
    return { id, status: body.status };
}

async function leaveDocument(idValue, user) {
    const id = Number(idValue);
    if (!Number.isInteger(id) || id < 1) fail('id must be a positive integer');
    const [rows] = await db.query(
        'SELECT document_key, document_original_name, document_mime FROM attendance_leave_requests WHERE id=? AND (student_id=? OR hod_id=?)',
        [id, user.id, user.id]
    );
    if (!rows[0] || !rows[0].document_key) fail('Document not found', 404);
    const buffer = await files.read(rows[0].document_key);
    return { buffer, mime: rows[0].document_mime, name: rows[0].document_original_name };
}

module.exports = { semesters, analytics, records, createLeave, listLeave, decideLeave, leaveDocument };
