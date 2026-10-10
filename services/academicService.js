const db = require('../config/db');
const auditService = require('./auditService');
const { isDateOnly } = require('../utils/requestValidation');

const ENTITIES = {
    sessions: { table: 'academic_sessions', label: 'session', search: ['code', 'name'], order: 'created_at DESC' },
    semesters: { table: 'semesters', label: 'semester', search: ['name'], order: 'session_id, number' },
    courses: { table: 'courses', label: 'course', search: ['code', 'name'], department: true, order: 'created_at DESC' },
    subjects: { table: 'subjects', label: 'subject', search: ['code', 'name'], courseDepartment: true, order: 'created_at DESC' },
    batches: { table: 'batches', label: 'batch', search: ['name'], courseDepartment: true, order: 'created_at DESC' },
    sections: { table: 'sections', label: 'section', search: ['name'], batchDepartment: true, order: 'created_at DESC' },
    studentProfiles: { table: 'student_profiles', label: 'student profile', profile: 'student' },
    facultyProfiles: { table: 'faculty_profiles', label: 'faculty profile', profile: 'faculty' }
};

const entityConfig = (entity) => {
    const config = ENTITIES[entity];
    if (!config) { const error = new Error('Unsupported academic resource'); error.status = 404; throw error; }
    return config;
};

const fail = (message, status = 400) => { const error = new Error(message); error.status = status; error.publicMessage = message; throw error; };
const cleanString = (value, field, max = 120) => {
    if (typeof value !== 'string' || !value.trim() || value.trim().length > max) fail(`${field} is required and must be at most ${max} characters`);
    return value.trim();
};
const id = (value, field) => { const n = Number(value); if (!Number.isInteger(n) || n < 1) fail(`${field} must be a positive integer`); return n; };
const date = (value, field) => { if (!isDateOnly(value)) fail(`${field} must be a valid YYYY-MM-DD date`); return value; };
const optionalNumber = (value, field, min = 0) => { if (value === null || value === undefined || value === '') return null; const n = Number(value); if (!Number.isFinite(n) || n < min) fail(`${field} must be a valid number`); return n; };
const page = (query) => ({ limit: Math.min(Math.max(Number(query.limit) || 25, 1), 100), offset: Math.max(Number(query.offset) || 0, 0) });

async function departmentFor(entity, recordId) {
    const config = entityConfig(entity);
    let sql = `SELECT d.id FROM ${config.table} x JOIN departments d ON d.id = x.department_id WHERE x.id=?`;
    if (config.courseDepartment) sql = `SELECT d.id FROM ${config.table} x JOIN courses c ON c.id=x.course_id JOIN departments d ON d.id=c.department_id WHERE x.id=?`;
    if (config.batchDepartment) sql = `SELECT d.id FROM ${config.table} x JOIN batches b ON b.id=x.batch_id JOIN courses c ON c.id=b.course_id JOIN departments d ON d.id=c.department_id WHERE x.id=?`;
    const [rows] = await db.query(sql, [recordId]);
    return rows[0]?.id || null;
}

async function canManage(entity, recordId, user) {
    if (user.role === 'super_admin') return true;
    const config = entityConfig(entity);
    if (config.profile) return Number(recordId) === Number(user.id) && ((config.profile === 'student' && user.role === 'student') || (config.profile === 'faculty' && ['hod', 'organizer'].includes(user.role)));
    if (user.role !== 'hod') return false;
    return Number(user.department_id) === Number(await departmentFor(entity, recordId));
}

async function validateProfileUser(entity, userId, actor) {
    if (!entityConfig(entity).profile) return;
    const [rows] = await db.query('SELECT id, role, department_id, is_active, deleted FROM users WHERE id=? LIMIT 1', [userId]);
    const target = rows[0];
    if (!target || !target.is_active || target.deleted) fail('Profile user is not active or does not exist', 400);
    const expectedRole = entity === 'studentProfiles' ? 'student' : null;
    const validFaculty = entity === 'facultyProfiles' && ['hod', 'organizer'].includes(target.role);
    if ((expectedRole && target.role !== expectedRole) || (!expectedRole && !validFaculty)) fail('User role does not match this profile resource', 400);
    if (actor.role !== 'super_admin' && Number(userId) !== Number(actor.id)) fail('You may only manage your own profile', 403);
}

async function list(entity, query, user) {
    const config = entityConfig(entity); const { limit, offset } = page(query); const params = []; const where = [];
    let select = `SELECT x.* FROM ${config.table} x`;
    if (config.department) { select += ' JOIN departments d ON d.id=x.department_id'; where.push('x.department_id=?'); params.push(user.role === 'hod' ? id(user.department_id, 'department_id') : query.department_id ? id(query.department_id, 'department_id') : null); if (params.at(-1) === null) params.pop(), where.pop(); }
    if (config.courseDepartment) { select += ' JOIN courses c ON c.id=x.course_id'; if (user.role === 'hod') { where.push('c.department_id=?'); params.push(id(user.department_id, 'department_id')); } }
    if (config.batchDepartment) { select += ' JOIN batches b ON b.id=x.batch_id JOIN courses c ON c.id=b.course_id'; if (user.role === 'hod') { where.push('c.department_id=?'); params.push(id(user.department_id, 'department_id')); } }
    if (config.profile) { select += ' JOIN users u ON u.id=x.user_id'; if (user.role !== 'super_admin') { where.push('x.user_id=?'); params.push(user.id); } }
    if (query.search && config.search) { where.push(`(${config.search.map((field) => `x.${field} LIKE ?`).join(' OR ')})`); params.push(...config.search.map(() => `%${String(query.search).slice(0, 80)}%`)); }
    const whereSql = where.length ? ` WHERE ${where.join(' AND ')}` : '';
    const [rows] = await db.query(`${select}${whereSql} ORDER BY ${config.order} LIMIT ? OFFSET ?`, [...params, limit, offset]);
    const countSql = select.replace(`SELECT x.* FROM ${config.table} x`, `SELECT COUNT(*) AS total FROM ${config.table} x`);
    const [count] = await db.query(`${countSql}${whereSql}`, params);
    return { items: rows, pagination: { limit, offset, total: count[0].total } };
}

async function create(entity, body, user) {
    const config = entityConfig(entity);
    if (!config.profile && !['super_admin', 'hod'].includes(user.role)) fail('Access denied', 403);
    if (['sessions', 'semesters'].includes(entity) && user.role !== 'super_admin') fail('Only super_admin may manage institution-wide records', 403);
    if (config.profile) { if (!await canManage(entity, body.user_id || user.id, user) && user.role !== 'super_admin') fail('You may only manage your own profile', 403); }
    const allowed = { sessions: ['code','name','start_date','end_date','is_active'], semesters: ['session_id','number','name','start_date','end_date'], courses: ['department_id','code','name','duration_semesters','is_active'], subjects: ['course_id','semester_id','code','name','credits','is_active'], batches: ['course_id','session_id','name','start_year','end_year','is_active'], sections: ['batch_id','name','advisor_id','is_active'], studentProfiles: ['user_id','enrollment_no','phone','batch_id','section_id'], facultyProfiles: ['user_id','designation','phone','employee_code'] }[entity];
    const data = {}; for (const field of allowed) if (body[field] !== undefined) data[field] = body[field];
    if (entity === 'sessions') { data.code = cleanString(data.code, 'code', 30); data.name = cleanString(data.name, 'name'); }
    if (['courses','subjects'].includes(entity)) { data.code = cleanString(data.code, 'code', 30); data.name = cleanString(data.name, 'name'); }
    if (['semesters','batches','sections'].includes(entity)) data.name = cleanString(data.name, 'name', 80);
    if (config.profile && !data.user_id) data.user_id = user.id;
    if (config.profile) await validateProfileUser(entity, data.user_id, user);
    for (const field of ['start_date', 'end_date']) if (data[field] !== undefined && data[field] !== null) data[field] = date(data[field], field);
    if (data.credits !== undefined) data.credits = optionalNumber(data.credits, 'credits');
    for (const [key, value] of Object.entries(data)) if (['session_id','course_id','semester_id','batch_id','section_id','department_id','advisor_id','user_id'].includes(key) && value != null) data[key] = id(value, key);
    if (config.department && user.role === 'hod' && Number(data.department_id) !== Number(user.department_id)) fail('Department ownership violation', 403);
    if (user.role === 'hod' && config.courseDepartment && Number(await departmentFor('courses', data.course_id)) !== Number(user.department_id)) fail('Department ownership violation', 403);
    if (user.role === 'hod' && config.batchDepartment && Number(await departmentFor('batches', data.batch_id)) !== Number(user.department_id)) fail('Department ownership violation', 403);
    const columns = Object.keys(data); if (!columns.length) fail('At least one field is required');
    const [result] = await db.query(`INSERT INTO ${config.table} (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')})`, columns.map((key) => data[key]));
    await auditService.log(user.id, `CREATE_${entity.toUpperCase()}`, config.table, result.insertId);
    return { id: result.insertId, ...data };
}

async function update(entity, recordId, body, user) {
    const config = entityConfig(entity); const resourceId = id(recordId, 'id'); if (!await canManage(entity, resourceId, user)) fail('Access denied', 403);
    if (['sessions', 'semesters'].includes(entity) && user.role !== 'super_admin') fail('Only super_admin may manage institution-wide records', 403);
    const allowed = { sessions: ['code','name','start_date','end_date','is_active'], semesters: ['session_id','number','name','start_date','end_date'], courses: ['department_id','code','name','duration_semesters','is_active'], subjects: ['course_id','semester_id','code','name','credits','is_active'], batches: ['course_id','session_id','name','start_year','end_year','is_active'], sections: ['batch_id','name','advisor_id','is_active'], studentProfiles: ['enrollment_no','phone','batch_id','section_id'], facultyProfiles: ['designation','phone','employee_code'] }[entity];
    const data = Object.fromEntries(allowed.filter((field) => body[field] !== undefined).map((field) => [field, body[field]])); if (!Object.keys(data).length) fail('At least one field is required');
    if (data.name !== undefined) data.name = cleanString(data.name, 'name', entity === 'sessions' || entity === 'courses' || entity === 'subjects' ? 120 : 80);
    for (const field of ['start_date', 'end_date']) if (data[field] !== undefined && data[field] !== null) data[field] = date(data[field], field);
    if (data.credits !== undefined) data.credits = optionalNumber(data.credits, 'credits');
    if (data.department_id !== undefined && user.role === 'hod' && Number(data.department_id) !== Number(user.department_id)) fail('Department ownership violation', 403);
    if (user.role === 'hod' && config.courseDepartment && data.course_id !== undefined && Number(await departmentFor('courses', data.course_id)) !== Number(user.department_id)) fail('Department ownership violation', 403);
    if (user.role === 'hod' && config.batchDepartment && data.batch_id !== undefined && Number(await departmentFor('batches', data.batch_id)) !== Number(user.department_id)) fail('Department ownership violation', 403);
    if (config.profile) await validateProfileUser(entity, resourceId, user);
    const columns = Object.keys(data); const [result] = await db.query(`UPDATE ${config.table} SET ${columns.map((key) => `${key}=?`).join(',')} WHERE ${config.profile ? 'user_id' : 'id'}=?`, [...columns.map((key) => data[key]), resourceId]);
    if (!result.affectedRows) fail('Academic record not found', 404); await auditService.log(user.id, `UPDATE_${entity.toUpperCase()}`, config.table, resourceId); return { id: resourceId, ...data };
}

async function remove(entity, recordId, user) { const config = entityConfig(entity); const resourceId = id(recordId, 'id'); if (!await canManage(entity, resourceId, user)) fail('Access denied', 403); const key = config.profile ? 'user_id' : 'id'; const [result] = await db.query(`DELETE FROM ${config.table} WHERE ${key}=?`, [resourceId]); if (!result.affectedRows) fail('Academic record not found', 404); await auditService.log(user.id, `DELETE_${entity.toUpperCase()}`, config.table, resourceId); }

module.exports = { list, create, update, remove, canManage, ENTITIES };