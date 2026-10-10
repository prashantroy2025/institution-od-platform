const db = require('../config/db');
const auditService = require('./auditService');

const VALID = new Set(['Present', 'Absent', 'Late', 'Excused']);
const fail = (message, status = 400) => { const error = new Error(message); error.status = status; error.publicMessage = message; throw error; };
const id = (value, field) => { const number = Number(value); if (!Number.isInteger(number) || number < 1) fail(`${field} must be a positive integer`); return number; };
const date = (value) => { if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) fail('attendance_date must be YYYY-MM-DD'); const parsed = new Date(`${value}T00:00:00Z`); if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) fail('attendance_date must be a valid date'); return value; };
const page = (query) => ({ limit: Math.min(Math.max(Number(query.limit) || 50, 1), 100), offset: Math.max(Number(query.offset) || 0, 0) });
const sqlDate = (value) => value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);

async function context(timetableId) {
    const [rows] = await db.query(`SELECT t.*,s.name subject_name,s.code subject_code,c.department_id,sec.name section_name,b.name batch_name,f.name faculty_name FROM timetable_entries t JOIN subjects s ON s.id=t.subject_id JOIN courses c ON c.id=s.course_id JOIN sections sec ON sec.id=t.section_id JOIN batches b ON b.id=t.batch_id JOIN users f ON f.id=t.faculty_id WHERE t.id=?`, [timetableId]);
    return rows[0];
}
async function authorize(row, user, write) {
    if (!row) fail('Timetable entry not found', 404);
    if (user.role === 'super_admin') return;
    if (user.role === 'hod' && Number(user.department_id) === Number(row.department_id)) return;
    if (write && user.role === 'organizer' && Number(user.id) === Number(row.faculty_id)) return;
    if (!write && user.role === 'student') return;
    if (write && user.role === 'organizer') fail('Faculty is not assigned to this timetable', 403);
    fail('Access denied', 403);
}
async function occurrence(row, value) {
    const attendanceDate = date(value); const parsed = new Date(`${attendanceDate}T00:00:00Z`); const weekday = parsed.getUTCDay() || 7;
    if (Number(row.weekday) !== weekday) fail('Attendance date does not match timetable weekday');
    const [sessions] = await db.query('SELECT start_date,end_date FROM academic_sessions WHERE id=?', [row.session_id]);
    if (!sessions[0] || attendanceDate < sqlDate(sessions[0].start_date) || attendanceDate > sqlDate(sessions[0].end_date)) fail('Attendance date is outside the academic session');
    return attendanceDate;
}
async function students(row, connection = db, studentId = null) { const params = [row.section_id]; const extra = studentId ? ' AND u.id=?' : ''; if (studentId) params.push(studentId); const [rows] = await connection.query(`SELECT u.id,u.name,u.college_id,sp.enrollment_no FROM student_profiles sp JOIN users u ON u.id=sp.user_id WHERE sp.section_id=?${extra} AND u.role='student' AND u.is_active=1 AND (u.deleted=0 OR u.deleted IS NULL) ORDER BY u.name`, params); return rows; }

async function mark(timetableId, body, user) {
    const row = await context(id(timetableId, 'timetable_id')); await authorize(row, user, true); const attendanceDate = await occurrence(row, body.attendance_date);
    if (!Array.isArray(body.records) || !body.records.length) fail('records must contain at least one student status');
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        const [existing] = await connection.query('SELECT id FROM class_attendance_sessions WHERE timetable_id=? AND attendance_date=? FOR UPDATE', [row.id, attendanceDate]);
        let sessionId = existing[0]?.id;
        if (!sessionId) { const [result] = await connection.query('INSERT INTO class_attendance_sessions (timetable_id,attendance_date,created_by) VALUES (?,?,?)', [row.id, attendanceDate, user.id]); sessionId = result.insertId; }
        const enrolled = new Set((await students(row, connection)).map((student) => student.id));
        for (const record of body.records) { const studentId = id(record.student_id, 'student_id'); if (!enrolled.has(studentId)) fail('Student is not enrolled in the timetable section'); if (!VALID.has(record.status)) fail('status must be Present, Absent, Late or Excused'); await connection.query(`INSERT INTO class_attendance_records (attendance_session_id,student_id,status,marked_by) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE status=VALUES(status),marked_by=VALUES(marked_by),marked_at=CURRENT_TIMESTAMP`, [sessionId, studentId, record.status, user.id]); }
        await connection.commit(); await auditService.log(user.id, 'MARK_CLASS_ATTENDANCE', 'class_attendance_sessions', sessionId); return { session_id: sessionId, timetable_id: row.id, attendance_date: attendanceDate, records: body.records.length };
    } catch (error) { await connection.rollback(); throw error; } finally { connection.release(); }
}
async function getSession(timetableId, attendanceDate, user) { const row = await context(id(timetableId, 'timetable_id')); await authorize(row, user, false); const value = await occurrence(row, attendanceDate); const enrolled = await students(row, db, user.role === 'student' ? user.id : null); const [records] = await db.query('SELECT student_id,status FROM class_attendance_records car JOIN class_attendance_sessions cas ON cas.id=car.attendance_session_id WHERE cas.timetable_id=? AND cas.attendance_date=?', [row.id, value]); const statuses = new Map(records.map((record) => [record.student_id, record.status])); return { timetable: row, attendance_date: value, students: enrolled.map((student) => ({ ...student, status: statuses.get(student.id) || null })) }; }
async function history(query, user) {
    const { limit, offset } = page(query); const where = []; const params = [];
    if (query.date) { where.push('cas.attendance_date=?'); params.push(date(query.date)); } if (query.subject_id) { where.push('t.subject_id=?'); params.push(id(query.subject_id, 'subject_id')); } if (query.section_id) { where.push('t.section_id=?'); params.push(id(query.section_id, 'section_id')); }
    if (user.role === 'student') { if (query.student_id && Number(query.student_id) !== Number(user.id)) fail('Students may only view their own attendance', 403); where.push('car.student_id=?'); params.push(user.id); } else if (query.student_id) { where.push('car.student_id=?'); params.push(id(query.student_id, 'student_id')); }
    if (user.role === 'hod') { where.push('c.department_id=?'); params.push(id(user.department_id, 'department_id')); } else if (user.role === 'organizer') { where.push('t.faculty_id=?'); params.push(user.id); }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''; const from = `FROM class_attendance_records car JOIN class_attendance_sessions cas ON cas.id=car.attendance_session_id JOIN timetable_entries t ON t.id=cas.timetable_id JOIN subjects s ON s.id=t.subject_id JOIN courses c ON c.id=s.course_id JOIN users u ON u.id=car.student_id JOIN sections sec ON sec.id=t.section_id`;
    const [items] = await db.query(`SELECT car.id,car.student_id,u.name student_name,u.college_id,car.status,cas.attendance_date,t.id timetable_id,t.subject_id,s.name subject_name,t.section_id,sec.name section_name ${from} ${whereSql} ORDER BY cas.attendance_date DESC,u.name LIMIT ? OFFSET ?`, [...params, limit, offset]); const [count] = await db.query(`SELECT COUNT(*) total ${from} ${whereSql}`, params); return { items, pagination: { limit, offset, total: count[0].total } };
}
async function report(query, user) { const { limit, offset } = page(query); const [setting] = await db.query('SELECT shortage_threshold FROM attendance_settings WHERE id=1'); const threshold = query.threshold === undefined ? Number(setting[0]?.shortage_threshold ?? 75) : Number(query.threshold); if (!Number.isFinite(threshold) || threshold < 0 || threshold > 100) fail('threshold must be between 0 and 100'); const where = ["u.role='student'"]; const params = []; if (query.section_id) { where.push('sp.section_id=?'); params.push(id(query.section_id, 'section_id')); } if (user.role === 'student') { where.push('u.id=?'); params.push(user.id); } else if (user.role === 'hod') { where.push('c.department_id=?'); params.push(id(user.department_id, 'department_id')); } else if (user.role === 'organizer') { where.push('t.faculty_id=?'); params.push(user.id); } const joins = `FROM student_profiles sp JOIN users u ON u.id=sp.user_id LEFT JOIN class_attendance_records car ON car.student_id=u.id LEFT JOIN class_attendance_sessions cas ON cas.id=car.attendance_session_id LEFT JOIN timetable_entries t ON t.id=cas.timetable_id LEFT JOIN subjects s ON s.id=t.subject_id LEFT JOIN courses c ON c.id=s.course_id`; const [items] = await db.query(`SELECT u.id student_id,u.name,u.college_id,COUNT(car.id) total_classes,SUM(car.status IN ('Present','Late','Excused')) attended,ROUND(100*SUM(car.status IN ('Present','Late','Excused'))/NULLIF(COUNT(car.id),0),2) attendance_percentage ${joins} WHERE ${where.join(' AND ')} GROUP BY u.id ORDER BY attendance_percentage ASC,u.name LIMIT ? OFFSET ?`, [...params, limit, offset]); const [count] = await db.query(`SELECT COUNT(DISTINCT u.id) total ${joins} WHERE ${where.join(' AND ')}`, params); return { threshold, items: items.map((item) => ({ ...item, shortage: item.attendance_percentage !== null && Number(item.attendance_percentage) < threshold })), pagination: { limit, offset, total: count[0].total } }; }
async function threshold(user, value) { if (value === undefined) { const [rows] = await db.query('SELECT shortage_threshold FROM attendance_settings WHERE id=1'); return rows[0]; } if (user.role !== 'super_admin') fail('Only super_admin may configure shortage threshold', 403); const number = Number(value); if (!Number.isFinite(number) || number < 0 || number > 100) fail('threshold must be between 0 and 100'); await db.query('UPDATE attendance_settings SET shortage_threshold=?,updated_by=? WHERE id=1', [number, user.id]); await auditService.log(user.id, 'UPDATE_ATTENDANCE_THRESHOLD', 'attendance_settings', 1); return { shortage_threshold: number }; }
module.exports = { mark, getSession, history, report, threshold };