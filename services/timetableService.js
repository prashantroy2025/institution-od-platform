const db = require('../config/db');
const auditService = require('./auditService');

const fail = (message, status = 400) => { const error = new Error(message); error.status = status; error.publicMessage = message; throw error; };
const positiveId = (value, field) => { const number = Number(value); if (!Number.isInteger(number) || number < 1) fail(`${field} must be a positive integer`); return number; };
const stringValue = (value, field, max = 100) => { if (typeof value !== 'string' || !value.trim() || value.trim().length > max) fail(`${field} is required and must be at most ${max} characters`); return value.trim(); };
const weekday = (value) => { const number = Number(value); if (!Number.isInteger(number) || number < 1 || number > 7) fail('weekday must be an integer from 1 to 7'); return number; };
const time = (value, field) => { if (typeof value !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(value)) fail(`${field} must be a valid HH:MM time`); return value.length === 5 ? `${value}:00` : value; };
const page = (query) => ({ limit: Math.min(Math.max(Number(query.limit) || 50, 1), 100), offset: Math.max(Number(query.offset) || 0, 0) });

async function departmentForTimetable(id) {
    const [rows] = await db.query(`SELECT c.department_id FROM timetable_entries t JOIN subjects s ON s.id=t.subject_id JOIN courses c ON c.id=s.course_id WHERE t.id=?`, [id]);
    return rows[0]?.department_id || null;
}

async function validateReferences(data) {
    const [rows] = await db.query(`
        SELECT s.id AS subject_id, s.semester_id AS subject_semester_id, s.course_id,
               sem.session_id AS semester_session_id, b.session_id AS batch_session_id,
               b.course_id AS batch_course_id, sec.batch_id AS section_batch_id,
               c.department_id AS subject_department_id, cr.department_id AS classroom_department_id,
               u.role AS faculty_role, u.is_active AS faculty_active, u.deleted AS faculty_deleted
        FROM subjects s
        JOIN semesters sem ON sem.id=?
        JOIN batches b ON b.id=?
        JOIN sections sec ON sec.id=?
        JOIN courses c ON c.id=s.course_id
        JOIN classrooms cr ON cr.id=?
        JOIN users u ON u.id=?
        WHERE s.id=?`, [data.semester_id, data.batch_id, data.section_id, data.classroom_id, data.faculty_id, data.subject_id]);
    const reference = rows[0];
    if (!reference) fail('One or more timetable relationships do not exist', 400);
    if (Number(reference.subject_semester_id) !== data.semester_id) fail('Subject does not belong to the selected semester');
    if (Number(reference.semester_session_id) !== data.session_id || Number(reference.batch_session_id) !== data.session_id) fail('Session does not match semester and batch');
    if (Number(reference.batch_course_id) !== Number(reference.course_id)) fail('Subject does not belong to the selected batch course');
    if (Number(reference.section_batch_id) !== data.batch_id) fail('Section does not belong to the selected batch');
    if (Number(reference.subject_department_id) !== Number(reference.classroom_department_id)) fail('Classroom must belong to the subject department');
    if (!reference.faculty_active || reference.faculty_deleted || !['hod', 'organizer'].includes(reference.faculty_role)) fail('Faculty must be an active HOD or organizer');
}

async function assertOwnership(data, user) {
    if (user.role === 'super_admin') return;
    if (user.role !== 'hod') fail('Only super_admin or HOD may manage timetables', 403);
    const [rows] = await db.query(`SELECT c.department_id FROM subjects s JOIN courses c ON c.id=s.course_id WHERE s.id=?`, [data.subject_id]);
    if (!rows[0] || Number(rows[0].department_id) !== Number(user.department_id)) fail('Department ownership violation', 403);
}

async function assertNoConflict(data, excludeId = null) {
    const params = [data.faculty_id, data.classroom_id, data.session_id, data.semester_id, data.weekday, data.end_time, data.start_time, data.faculty_id, data.classroom_id, data.section_id];
    let exclusion = '';
    if (excludeId) { exclusion = ' AND t.id<>?'; params.push(excludeId); }
    const [rows] = await db.query(`
        SELECT t.id,
          CASE WHEN t.faculty_id=? THEN 'faculty' WHEN t.classroom_id=? THEN 'classroom' ELSE 'section' END AS conflict_type
        FROM timetable_entries t
        WHERE t.session_id=? AND t.semester_id=? AND t.weekday=?
          AND t.start_time < ? AND t.end_time > ?
          AND (t.faculty_id=? OR t.classroom_id=? OR t.section_id=?)${exclusion}
        LIMIT 1`, params);
    if (rows[0]) fail(`Timetable conflicts with an existing ${rows[0].conflict_type} booking`, 409);
}

function normalize(body) {
    return {
        session_id: positiveId(body.session_id, 'session_id'), semester_id: positiveId(body.semester_id, 'semester_id'),
        subject_id: positiveId(body.subject_id, 'subject_id'), batch_id: positiveId(body.batch_id, 'batch_id'),
        section_id: positiveId(body.section_id, 'section_id'), faculty_id: positiveId(body.faculty_id, 'faculty_id'),
        classroom_id: positiveId(body.classroom_id, 'classroom_id'), weekday: weekday(body.weekday),
        start_time: time(body.start_time, 'start_time'), end_time: time(body.end_time, 'end_time')
    };
}

async function list(query, user) {
    const { limit, offset } = page(query); const where = []; const params = [];
    if (query.session_id) { where.push('t.session_id=?'); params.push(positiveId(query.session_id, 'session_id')); }
    if (query.semester_id) { where.push('t.semester_id=?'); params.push(positiveId(query.semester_id, 'semester_id')); }
    if (query.weekday) { where.push('t.weekday=?'); params.push(weekday(query.weekday)); }
    if (user.role === 'hod' || user.role === 'organizer') { where.push('c.department_id=?'); params.push(positiveId(user.department_id, 'department_id')); }
    if (user.role === 'student') { where.push('sp.user_id=?'); params.push(user.id); }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const from = `FROM timetable_entries t JOIN subjects s ON s.id=t.subject_id JOIN courses c ON c.id=s.course_id JOIN semesters sem ON sem.id=t.semester_id JOIN batches b ON b.id=t.batch_id JOIN sections sec ON sec.id=t.section_id JOIN users f ON f.id=t.faculty_id JOIN classrooms cr ON cr.id=t.classroom_id LEFT JOIN student_profiles sp ON sp.section_id=t.section_id`;
    const [items] = await db.query(`SELECT t.*, s.code AS subject_code, s.name AS subject_name, sem.name AS semester_name, b.name AS batch_name, sec.name AS section_name, f.name AS faculty_name, cr.code AS classroom_code, cr.name AS classroom_name ${from} ${whereSql} ORDER BY t.weekday, t.start_time LIMIT ? OFFSET ?`, [...params, limit, offset]);
    const [count] = await db.query(`SELECT COUNT(DISTINCT t.id) AS total ${from} ${whereSql}`, params);
    return { items, pagination: { limit, offset, total: count[0].total } };
}

async function getClassrooms(query, user) {
    const where = []; const params = [];
    if (user.role !== 'super_admin') { where.push('department_id=?'); params.push(positiveId(user.department_id, 'department_id')); }
    if (query.search) { where.push('(code LIKE ? OR name LIKE ?)'); params.push(`%${String(query.search).slice(0, 80)}%`, `%${String(query.search).slice(0, 80)}%`); }
    const { limit, offset } = page(query); const suffix = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const [items] = await db.query(`SELECT * FROM classrooms ${suffix} ORDER BY name LIMIT ? OFFSET ?`, [...params, limit, offset]);
    return { items, pagination: { limit, offset, total: items.length } };
}

async function createClassroom(body, user) {
    if (!['super_admin', 'hod'].includes(user.role)) fail('Access denied', 403);
    const department_id = user.role === 'hod' ? positiveId(user.department_id, 'department_id') : positiveId(body.department_id, 'department_id');
    if (user.role === 'hod' && body.department_id !== undefined && Number(body.department_id) !== department_id) fail('Department ownership violation', 403);
    const data = { department_id, code: stringValue(body.code, 'code', 40), name: stringValue(body.name, 'name'), capacity: body.capacity === undefined || body.capacity === '' ? null : positiveId(body.capacity, 'capacity') };
    const [result] = await db.query('INSERT INTO classrooms (department_id,code,name,capacity,created_by) VALUES (?,?,?,?,?)', [data.department_id, data.code, data.name, data.capacity, user.id]);
    await auditService.log(user.id, 'CREATE_CLASSROOM', 'classrooms', result.insertId); return { id: result.insertId, ...data };
}

async function updateClassroom(id, body, user) {
    if (!['super_admin', 'hod'].includes(user.role)) fail('Access denied', 403); const classroomId = positiveId(id, 'id');
    const [rows] = await db.query('SELECT * FROM classrooms WHERE id=?', [classroomId]); if (!rows[0]) fail('Classroom not found', 404);
    if (user.role === 'hod' && Number(rows[0].department_id) !== Number(user.department_id)) fail('Department ownership violation', 403);
    const data = { code: body.code === undefined ? rows[0].code : stringValue(body.code, 'code', 40), name: body.name === undefined ? rows[0].name : stringValue(body.name, 'name'), capacity: body.capacity === undefined ? rows[0].capacity : (body.capacity === '' ? null : positiveId(body.capacity, 'capacity')), is_active: body.is_active === undefined ? rows[0].is_active : Boolean(body.is_active) };
    await db.query('UPDATE classrooms SET code=?,name=?,capacity=?,is_active=? WHERE id=?', [data.code, data.name, data.capacity, data.is_active, classroomId]);
    await auditService.log(user.id, 'UPDATE_CLASSROOM', 'classrooms', classroomId); return { id: classroomId, ...data };
}

async function removeClassroom(id, user) { if (!['super_admin', 'hod'].includes(user.role)) fail('Access denied', 403); const classroomId = positiveId(id, 'id'); const [rows] = await db.query('SELECT department_id FROM classrooms WHERE id=?', [classroomId]); if (!rows[0]) fail('Classroom not found', 404); if (user.role === 'hod' && Number(rows[0].department_id) !== Number(user.department_id)) fail('Department ownership violation', 403); try { await db.query('DELETE FROM classrooms WHERE id=?', [classroomId]); } catch (error) { error.publicMessage = 'Classroom is still used by a timetable entry'; throw error; } await auditService.log(user.id, 'DELETE_CLASSROOM', 'classrooms', classroomId); }

async function create(body, user) { if (!['super_admin', 'hod'].includes(user.role)) fail('Access denied', 403); const data = normalize(body); await assertOwnership(data, user); if (data.end_time <= data.start_time) fail('end_time must be after start_time'); await validateReferences(data); await assertNoConflict(data); const [result] = await db.query('INSERT INTO timetable_entries (session_id,semester_id,subject_id,batch_id,section_id,faculty_id,classroom_id,weekday,start_time,end_time,created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?)', [...Object.values(data), user.id]); await auditService.log(user.id, 'CREATE_TIMETABLE', 'timetable_entries', result.insertId); return { id: result.insertId, ...data }; }
async function update(id, body, user) { const entryId = positiveId(id, 'id'); const [existing] = await db.query('SELECT * FROM timetable_entries WHERE id=?', [entryId]); if (!existing[0]) fail('Timetable entry not found', 404); const data = normalize({ ...existing[0], ...body }); await assertOwnership(data, user); await validateReferences(data); await assertNoConflict(data, entryId); await db.query('UPDATE timetable_entries SET session_id=?,semester_id=?,subject_id=?,batch_id=?,section_id=?,faculty_id=?,classroom_id=?,weekday=?,start_time=?,end_time=? WHERE id=?', [...Object.values(data), entryId]); await auditService.log(user.id, 'UPDATE_TIMETABLE', 'timetable_entries', entryId); return { id: entryId, ...data }; }
async function remove(id, user) { const entryId = positiveId(id, 'id'); const [rows] = await db.query('SELECT subject_id FROM timetable_entries WHERE id=?', [entryId]); if (!rows[0]) fail('Timetable entry not found', 404); await assertOwnership({ subject_id: rows[0].subject_id }, user); await db.query('DELETE FROM timetable_entries WHERE id=?', [entryId]); await auditService.log(user.id, 'DELETE_TIMETABLE', 'timetable_entries', entryId); }

module.exports = { list, create, update, remove, getClassrooms, createClassroom, updateClassroom, removeClassroom };