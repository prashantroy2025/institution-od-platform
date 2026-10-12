const db = require('../config/db');
const audit = require('./auditService');
const { isDateOnly } = require('../utils/requestValidation');
const files = require('../utils/learningFileStore');

const fail = (message, status = 400) => { const error = new Error(message); error.status = status; error.publicMessage = message; throw error; };
const positive = (value, field) => { const number = Number(value); if (!Number.isInteger(number) || number < 1) fail(`${field} must be a positive integer`); return number; };
const page = query => ({ limit: Math.min(Math.max(Number(query.limit) || 25, 1), 100), offset: Math.max(Number(query.offset) || 0, 0) });
const text = (value, field, max) => { if (typeof value !== 'string' || !value.trim() || value.trim().length > max) fail(`${field} is required and must be at most ${max} characters`); return value.trim(); };
const STAFF = ['super_admin', 'hod'];

async function studentContext(userId, connection = db) {
    const [rows] = await connection.query(`SELECT sp.user_id,sp.batch_id,sp.section_id,b.course_id,b.session_id,c.department_id,
        sem.id semester_id,sem.name semester_name,sem.number semester_number
        FROM student_profiles sp JOIN batches b ON b.id=sp.batch_id JOIN courses c ON c.id=b.course_id
        JOIN semesters sem ON sem.session_id=b.session_id
        WHERE sp.user_id=? AND sp.batch_id IS NOT NULL AND sp.section_id IS NOT NULL AND sem.id=(
          SELECT s2.id FROM semesters s2 WHERE s2.session_id=b.session_id
          ORDER BY (CURRENT_DATE BETWEEN COALESCE(s2.start_date,'1000-01-01') AND COALESCE(s2.end_date,'9999-12-31')) DESC,s2.number DESC LIMIT 1
        ) LIMIT 1`, [userId]);
    if (!rows[0]) fail('Your academic course, section, or semester is not configured', 404);
    return rows[0];
}

async function subjects(query, user) {
    const ctx = await studentContext(user.id); const { limit, offset } = page(query);
    const filters = ['s.course_id=?', 's.semester_id=?', 's.is_active=1']; const params = [ctx.course_id, ctx.semester_id];
    if (query.search) { filters.push('(s.code LIKE ? OR s.name LIKE ?)'); const search = `%${String(query.search).slice(0, 80)}%`; params.push(search, search); }
    const where = filters.join(' AND ');
    const [items] = await db.query(`SELECT s.id,s.code,s.name,s.credits,sem.name semester_name,
        GROUP_CONCAT(DISTINCT u.name ORDER BY u.name SEPARATOR ', ') faculty_names
        FROM subjects s JOIN semesters sem ON sem.id=s.semester_id
        LEFT JOIN timetable_entries t ON t.subject_id=s.id AND t.section_id=?
        LEFT JOIN users u ON u.id=t.faculty_id
        WHERE ${where} GROUP BY s.id ORDER BY s.code LIMIT ? OFFSET ?`, [ctx.section_id, ...params, limit, offset]);
    const [count] = await db.query(`SELECT COUNT(*) total FROM subjects s WHERE ${where}`, params);
    return { academic: { course_id: ctx.course_id, semester_id: ctx.semester_id, semester: ctx.semester_name }, items, pagination: { limit, offset, total: count[0].total } };
}

async function faculty(user) {
    const ctx = await studentContext(user.id);
    const [items] = await db.query(`SELECT u.id,u.name,fp.designation,d.name department_name,
        GROUP_CONCAT(DISTINCT CONCAT(s.code,' — ',s.name) ORDER BY s.code SEPARATOR ', ') subjects_taught
        FROM timetable_entries t JOIN users u ON u.id=t.faculty_id LEFT JOIN faculty_profiles fp ON fp.user_id=u.id
        LEFT JOIN departments d ON d.id=u.department_id JOIN subjects s ON s.id=t.subject_id
        WHERE t.section_id=? AND t.semester_id=? GROUP BY u.id ORDER BY u.name`, [ctx.section_id, ctx.semester_id]);
    return { items };
}

async function mentor(user) {
    const ctx = await studentContext(user.id);
    const [rows] = await db.query(`SELECT u.id,u.name,fp.designation,d.name department_name
        FROM sections sec LEFT JOIN users u ON u.id=sec.advisor_id LEFT JOIN faculty_profiles fp ON fp.user_id=u.id
        LEFT JOIN departments d ON d.id=u.department_id WHERE sec.id=? LIMIT 1`, [ctx.section_id]);
    return { mentor: rows[0]?.id ? rows[0] : null };
}

async function syllabus(query, user) {
    const ctx = await studentContext(user.id); const { limit, offset } = page(query); const params = [ctx.course_id, ctx.semester_id];
    if (query.subject_id) params.push(positive(query.subject_id, 'subject_id'));
    const subjectFilter = query.subject_id ? ' AND s.id=?' : '';
    const [items] = await db.query(`SELECT su.id,su.unit_number,su.title,su.topics,su.learning_outcomes,s.id subject_id,s.code subject_code,s.name subject_name
        FROM syllabus_units su JOIN subjects s ON s.id=su.subject_id
        WHERE s.course_id=? AND s.semester_id=? AND s.is_active=1${subjectFilter}
        ORDER BY s.code,su.unit_number LIMIT ? OFFSET ?`, [...params, limit, offset]);
    return { items };
}

async function createSyllabus(body, user) {
    if (!STAFF.includes(user.role)) fail('Access denied', 403);
    const subjectId = positive(body.subject_id, 'subject_id'), unit = positive(body.unit_number, 'unit_number');
    const [subjects] = await db.query('SELECT s.id,c.department_id FROM subjects s JOIN courses c ON c.id=s.course_id WHERE s.id=?', [subjectId]);
    if (!subjects[0]) fail('Subject not found', 404);
    if (user.role === 'hod' && Number(subjects[0].department_id) !== Number(user.department_id)) fail('Department ownership violation', 403);
    const title = text(body.title, 'title', 180);
    const topics = body.topics == null ? null : text(body.topics, 'topics', 4000);
    const outcomes = body.learning_outcomes == null ? null : text(body.learning_outcomes, 'learning_outcomes', 4000);
    const [result] = await db.query('INSERT INTO syllabus_units(subject_id,unit_number,title,topics,learning_outcomes,created_by) VALUES(?,?,?,?,?,?)', [subjectId, unit, title, topics, outcomes, user.id]);
    await audit.log(user.id, 'CREATE_SYLLABUS_UNIT', 'syllabus_units', result.insertId);
    return { id: result.insertId, subject_id: subjectId, unit_number: unit, title, topics, learning_outcomes: outcomes };
}

async function updateSyllabus(idValue, body, user) {
    if (!STAFF.includes(user.role)) fail('Access denied', 403);
    const unitId = positive(idValue, 'id');
    const [rows] = await db.query(`SELECT su.*,c.department_id FROM syllabus_units su JOIN subjects s ON s.id=su.subject_id JOIN courses c ON c.id=s.course_id WHERE su.id=?`, [unitId]);
    if (!rows[0]) fail('Syllabus unit not found', 404);
    if (user.role === 'hod' && Number(rows[0].department_id) !== Number(user.department_id)) fail('Department ownership violation', 403);
    const unit = body.unit_number === undefined ? rows[0].unit_number : positive(body.unit_number, 'unit_number');
    const title = body.title === undefined ? rows[0].title : text(body.title, 'title', 180);
    const topics = body.topics === undefined ? rows[0].topics : (body.topics === null || body.topics === '' ? null : text(body.topics, 'topics', 4000));
    const outcomes = body.learning_outcomes === undefined ? rows[0].learning_outcomes : (body.learning_outcomes === null || body.learning_outcomes === '' ? null : text(body.learning_outcomes, 'learning_outcomes', 4000));
    await db.query('UPDATE syllabus_units SET unit_number=?,title=?,topics=?,learning_outcomes=? WHERE id=?', [unit,title,topics,outcomes,unitId]);
    await audit.log(user.id, 'UPDATE_SYLLABUS_UNIT', 'syllabus_units', unitId);
    return { id: unitId, unit_number: unit, title, topics, learning_outcomes: outcomes };
}

async function deleteSyllabus(idValue, user) {
    if (!STAFF.includes(user.role)) fail('Access denied', 403);
    const unitId = positive(idValue, 'id');
    const [rows] = await db.query('SELECT c.department_id FROM syllabus_units su JOIN subjects s ON s.id=su.subject_id JOIN courses c ON c.id=s.course_id WHERE su.id=?', [unitId]);
    if (!rows[0]) fail('Syllabus unit not found', 404);
    if (user.role === 'hod' && Number(rows[0].department_id) !== Number(user.department_id)) fail('Department ownership violation', 403);
    await db.query('DELETE FROM syllabus_units WHERE id=?', [unitId]);
    await audit.log(user.id, 'DELETE_SYLLABUS_UNIT', 'syllabus_units', unitId);
}

async function manageSyllabus(query, user) {
    if (!STAFF.includes(user.role)) fail('Access denied', 403);
    const { limit, offset } = page(query); const where = []; const params = [];
    if (user.role === 'hod') { where.push('c.department_id=?'); params.push(positive(user.department_id, 'department_id')); }
    if (query.search) { where.push('(s.code LIKE ? OR s.name LIKE ? OR su.title LIKE ?)'); const search = `%${String(query.search).slice(0,80)}%`; params.push(search,search,search); }
    const suffix = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const [items] = await db.query(`SELECT su.id,su.subject_id,s.code subject_code,s.name subject_name,su.unit_number,su.title,su.topics,su.learning_outcomes
        FROM syllabus_units su JOIN subjects s ON s.id=su.subject_id JOIN courses c ON c.id=s.course_id ${suffix}
        ORDER BY s.code,su.unit_number LIMIT ? OFFSET ?`, [...params,limit,offset]);
    return { items };
}

async function calendar(query, user) {
    const { limit, offset } = page(query);
    const staff = STAFF.includes(user.role); const params = [];
    let where = staff ? '' : 'WHERE e.is_published=1';
    if (user.role === 'student') {
        const ctx = await studentContext(user.id);
        where += ' AND (e.session_id IS NULL OR e.session_id=?) AND (e.semester_id IS NULL OR e.semester_id=?)';
        params.push(ctx.session_id,ctx.semester_id);
    }
    const [items] = await db.query(`SELECT e.id,e.title,e.event_type,e.starts_on,e.ends_on,e.description,e.is_published,e.session_id,e.semester_id,s.name semester_name
        FROM academic_calendar_events e LEFT JOIN semesters s ON s.id=e.semester_id
        ${where} ORDER BY e.starts_on,e.id LIMIT ? OFFSET ?`, [...params,limit,offset]);
    return { items };
}

async function manageCalendar(query, user) {
    if (!STAFF.includes(user.role)) fail('Access denied', 403);
    return calendar(query, user);
}

async function createCalendarEvent(body, user) {
    if (user.role !== 'super_admin') fail('Only super_admin may manage the academic calendar', 403);
    const types = ['Academic Event','Holiday','Examination','Registration Deadline'];
    const type = text(body.event_type, 'event_type', 40);
    if (!types.includes(type)) fail('Unsupported calendar event type');
    if (!isDateOnly(body.starts_on) || !isDateOnly(body.ends_on) || body.ends_on < body.starts_on) fail('Valid start and end dates are required');
    const title = text(body.title, 'title', 180);
    const description = body.description == null || body.description === '' ? null : text(body.description, 'description', 4000);
    const sessionId = body.session_id ? positive(body.session_id, 'session_id') : null;
    const semesterId = body.semester_id ? positive(body.semester_id, 'semester_id') : null;
    const [result] = await db.query('INSERT INTO academic_calendar_events(session_id,semester_id,title,event_type,starts_on,ends_on,description,is_published,created_by) VALUES(?,?,?,?,?,?,?,?,?)', [sessionId,semesterId,title,type,body.starts_on,body.ends_on,description,Boolean(body.is_published),user.id]);
    await audit.log(user.id, 'CREATE_ACADEMIC_CALENDAR_EVENT', 'academic_calendar_events', result.insertId);
    return { id: result.insertId, title, event_type: type, starts_on: body.starts_on, ends_on: body.ends_on, is_published: Boolean(body.is_published) };
}

async function updateCalendarEvent(idValue, body, user) {
    if (user.role !== 'super_admin') fail('Only super_admin may manage the academic calendar', 403);
    const eventId = positive(idValue, 'id');
    const [rows] = await db.query('SELECT * FROM academic_calendar_events WHERE id=?', [eventId]);
    if (!rows[0]) fail('Calendar event not found', 404);
    const old = rows[0]; const type = body.event_type === undefined ? old.event_type : text(body.event_type, 'event_type', 40);
    if (!['Academic Event','Holiday','Examination','Registration Deadline'].includes(type)) fail('Unsupported calendar event type');
    const existingDate = value => value instanceof Date ? value.toISOString().slice(0,10) : String(value).slice(0,10);
    const starts = body.starts_on === undefined ? existingDate(old.starts_on) : body.starts_on;
    const ends = body.ends_on === undefined ? existingDate(old.ends_on) : body.ends_on;
    if (!isDateOnly(starts) || !isDateOnly(ends) || ends < starts) fail('Valid start and end dates are required');
    const title = body.title === undefined ? old.title : text(body.title, 'title', 180);
    const description = body.description === undefined ? old.description : (body.description === '' || body.description === null ? null : text(body.description, 'description', 4000));
    const published = body.is_published === undefined ? old.is_published : Boolean(body.is_published);
    await db.query('UPDATE academic_calendar_events SET title=?,event_type=?,starts_on=?,ends_on=?,description=?,is_published=? WHERE id=?', [title,type,starts,ends,description,published,eventId]);
    await audit.log(user.id, 'UPDATE_ACADEMIC_CALENDAR_EVENT', 'academic_calendar_events', eventId);
    return { id: eventId, title, event_type: type, starts_on: starts, ends_on: ends, is_published: published };
}

async function deleteCalendarEvent(idValue, user) {
    if (user.role !== 'super_admin') fail('Only super_admin may manage the academic calendar', 403);
    const eventId = positive(idValue, 'id');
    const [result] = await db.query('DELETE FROM academic_calendar_events WHERE id=?', [eventId]);
    if (!result.affectedRows) fail('Calendar event not found', 404);
    await audit.log(user.id, 'DELETE_ACADEMIC_CALENDAR_EVENT', 'academic_calendar_events', eventId);
}

async function register(body, user) {
    const ctx = await studentContext(user.id); const subjectId = positive(body.subject_id, 'subject_id');
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        const [eligible] = await connection.query(`SELECT s.id FROM subjects s WHERE s.id=? AND s.course_id=? AND s.semester_id=? AND s.is_active=1 FOR UPDATE`, [subjectId, ctx.course_id, ctx.semester_id]);
        if (!eligible[0]) fail('Subject is not eligible for your current course and semester');
        const [result] = await connection.query(`INSERT INTO academic_course_registrations(student_id,session_id,semester_id,subject_id) VALUES(?,?,?,?)`, [user.id, ctx.session_id, ctx.semester_id, subjectId]);
        await connection.commit();
        await audit.log(user.id, 'SUBMIT_COURSE_REGISTRATION', 'academic_course_registrations', result.insertId);
        return { id: result.insertId, subject_id: subjectId, status: 'Pending' };
    } catch (error) { await connection.rollback(); if (error.code === 'ER_DUP_ENTRY') fail('You already submitted this subject registration', 409); throw error; }
    finally { connection.release(); }
}

async function registrations(query, user) {
    if (!STAFF.includes(user.role) && user.role !== 'student') fail('Access denied', 403);
    const { limit, offset } = page(query); const params = []; const where = [];
    if (user.role === 'student') { where.push('r.student_id=?'); params.push(user.id); }
    if (user.role === 'hod') { where.push('c.department_id=?'); params.push(positive(user.department_id, 'department_id')); }
    if (query.status) { where.push('r.status=?'); params.push(text(query.status, 'status', 20)); }
    const suffix = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const [items] = await db.query(`SELECT r.id,r.student_id,u.name student_name,r.session_id,r.semester_id,sem.name semester_name,
        r.subject_id,s.code subject_code,s.name subject_name,s.credits,r.status,r.created_at
        FROM academic_course_registrations r JOIN users u ON u.id=r.student_id JOIN subjects s ON s.id=r.subject_id
        JOIN courses c ON c.id=s.course_id JOIN semesters sem ON sem.id=r.semester_id ${suffix}
        ORDER BY r.created_at DESC LIMIT ? OFFSET ?`, [...params, limit, offset]);
    return { items };
}

async function reviewRegistration(idValue, body, user) {
    if (!STAFF.includes(user.role)) fail('Access denied', 403);
    const status = body.status;
    if (!['Approved', 'Rejected'].includes(status)) fail('status must be Approved or Rejected');
    const registrationId = positive(idValue, 'id');
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        const [rows] = await connection.query(`SELECT r.status,c.department_id FROM academic_course_registrations r
            JOIN subjects s ON s.id=r.subject_id JOIN courses c ON c.id=s.course_id WHERE r.id=? FOR UPDATE`, [registrationId]);
        if (!rows[0]) fail('Registration not found', 404);
        if (user.role === 'hod' && Number(rows[0].department_id) !== Number(user.department_id)) fail('Department ownership violation', 403);
        if (rows[0].status !== 'Pending') fail('Registration has already been reviewed', 409);
        await connection.query('UPDATE academic_course_registrations SET status=?,reviewed_by=?,reviewed_at=NOW() WHERE id=?', [status, user.id, registrationId]);
        await connection.commit();
        await audit.log(user.id, `${status.toUpperCase()}_COURSE_REGISTRATION`, 'academic_course_registrations', registrationId);
        return { id: registrationId, status };
    } catch (error) { await connection.rollback(); throw error; }
    finally { connection.release(); }
}

async function submitRequest(body, user, file) {
    const allowed = ['Certificate', 'Subject Change', 'Academic Record Correction', 'Advisor Appointment'];
    const requestType = text(body.request_type, 'request_type', 40);
    if (!allowed.includes(requestType)) fail('Unsupported academic request type');
    const details = text(body.details, 'details', 4000);
    let subjectId = null;
    if (body.subject_id != null && body.subject_id !== '') {
        const ctx = await studentContext(user.id); subjectId = positive(body.subject_id, 'subject_id');
        const [rows] = await db.query('SELECT id FROM subjects WHERE id=? AND course_id=?', [subjectId, ctx.course_id]);
        if (!rows[0]) fail('Subject is not part of your course', 403);
    }
    if (file) files.validateUpload(file, 'pdf,png,jpg,jpeg', 5 * 1024 * 1024);
    const storageKey = file ? await files.save(file) : null;
    try {
        const [result] = await db.query('INSERT INTO academic_requests(student_id,request_type,subject_id,details,document_storage_key,document_original_name,document_mime,document_size) VALUES(?,?,?,?,?,?,?,?)', [user.id, requestType, subjectId, details, storageKey, file?.originalname || null, file?.mimetype || null, file?.size || null]);
        await audit.log(user.id, 'SUBMIT_ACADEMIC_REQUEST', 'academic_requests', result.insertId);
        return { id: result.insertId, request_type: requestType, status: 'Submitted', document_original_name: file?.originalname || null };
    } catch (error) { if (storageKey) await files.remove(storageKey); throw error; }
}

async function requests(query, user) {
    if (!STAFF.includes(user.role) && user.role !== 'student') fail('Access denied', 403);
    const { limit, offset } = page(query); const params = []; const where = [];
    if (user.role === 'student') { where.push('r.student_id=?'); params.push(user.id); }
    if (user.role === 'hod') { where.push('u.department_id=?'); params.push(positive(user.department_id, 'department_id')); }
    const suffix = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const [items] = await db.query(`SELECT r.id,r.request_type,r.subject_id,s.code subject_code,s.name subject_name,r.details,r.document_original_name,r.status,r.created_at,r.reviewed_at,u.name student_name
        FROM academic_requests r JOIN users u ON u.id=r.student_id LEFT JOIN subjects s ON s.id=r.subject_id
        ${suffix} ORDER BY r.created_at DESC LIMIT ? OFFSET ?`, [...params, limit, offset]);
    return { items };
}

async function requestDocument(idValue, user) {
    const requestId = positive(idValue, 'id');
    const [rows] = await db.query(`SELECT r.*,u.department_id FROM academic_requests r JOIN users u ON u.id=r.student_id WHERE r.id=?`, [requestId]);
    const row = rows[0];
    if (!row || !row.document_storage_key) fail('Request document not found', 404);
    if (user.role === 'student' && Number(row.student_id) !== Number(user.id)) fail('Access denied', 403);
    if (user.role === 'hod' && Number(row.department_id) !== Number(user.department_id)) fail('Department ownership violation', 403);
    if (!['student','hod','super_admin'].includes(user.role)) fail('Access denied', 403);
    return { buffer: await files.read(row.document_storage_key), name: row.document_original_name, mime: row.document_mime };
}

async function reviewRequest(idValue, body, user) {
    if (!STAFF.includes(user.role)) fail('Access denied', 403);
    const status = body.status;
    if (!['Under Review', 'Approved', 'Rejected'].includes(status)) fail('status must be Under Review, Approved, or Rejected');
    const requestId = positive(idValue, 'id');
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        const [rows] = await connection.query('SELECT r.status,u.department_id FROM academic_requests r JOIN users u ON u.id=r.student_id WHERE r.id=? FOR UPDATE', [requestId]);
        if (!rows[0]) fail('Request not found', 404);
        if (user.role === 'hod' && Number(rows[0].department_id) !== Number(user.department_id)) fail('Department ownership violation', 403);
        if (['Approved', 'Rejected'].includes(rows[0].status)) fail('Request has already been decided', 409);
        await connection.query('UPDATE academic_requests SET status=?,reviewed_by=?,reviewed_at=NOW() WHERE id=?', [status, user.id, requestId]);
        await connection.commit();
    } catch (error) { await connection.rollback(); throw error; }
    finally { connection.release(); }
    await audit.log(user.id, `${status.toUpperCase().replaceAll(' ', '_')}_ACADEMIC_REQUEST`, 'academic_requests', requestId);
    return { id: requestId, status };
}

module.exports = { subjects, faculty, mentor, syllabus, manageSyllabus, createSyllabus, updateSyllabus, deleteSyllabus, calendar, manageCalendar, createCalendarEvent, updateCalendarEvent, deleteCalendarEvent, register, registrations, reviewRegistration, submitRequest, requests, requestDocument, reviewRequest };
