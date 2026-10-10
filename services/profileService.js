const db = require('../config/db');
const audit = require('./auditService');
const files = require('../utils/learningFileStore');

const fail = (message, status = 400) => { const error = new Error(message); error.status = status; error.publicMessage = message; throw error; };
const text = (value, field, max) => { if (value === undefined || value === null || value === '') return null; if (typeof value !== 'string' || value.length > max) fail(`${field} must be at most ${max} characters`); return value.trim(); };

async function get(userId) {
    const [rows] = await db.query(`SELECT u.id,u.college_id,u.name,u.email,u.role,u.department_id,d.name department_name,
        sp.enrollment_no,sp.phone student_phone,b.name batch_name,s.name section_name,c.name course_name,
        fp.employee_code,fp.designation,fp.phone faculty_phone,pd.emergency_name,pd.emergency_phone,pd.emergency_relation,
        pd.address,pd.allow_profile_discovery,pd.allow_direct_messages
        FROM users u LEFT JOIN departments d ON d.id=u.department_id LEFT JOIN student_profiles sp ON sp.user_id=u.id
        LEFT JOIN batches b ON b.id=sp.batch_id LEFT JOIN sections s ON s.id=sp.section_id LEFT JOIN courses c ON c.id=b.course_id
        LEFT JOIN faculty_profiles fp ON fp.user_id=u.id LEFT JOIN erp_profile_details pd ON pd.user_id=u.id
        WHERE u.id=? AND u.is_active=1 AND (u.deleted=0 OR u.deleted IS NULL) LIMIT 1`, [userId]);
    if (!rows[0]) fail('Profile not found', 404);
    const user = rows[0];
    const [documents] = await db.query('SELECT id,label,original_name,mime_type,uploaded_at FROM erp_profile_documents WHERE user_id=? ORDER BY uploaded_at DESC', [userId]);
    return { ...user, profile: user.role === 'student' ? { enrollment_no:user.enrollment_no, phone:user.student_phone, batch_name:user.batch_name, section_name:user.section_name, course_name:user.course_name } : { employee_code:user.employee_code, designation:user.designation, phone:user.faculty_phone }, emergency: { name:user.emergency_name, phone:user.emergency_phone, relation:user.emergency_relation }, documents };
}

async function update(userId, body) {
    const [existingRows] = await db.query('SELECT * FROM erp_profile_details WHERE user_id=?', [userId]);
    const existing = existingRows[0] || {};
    const details = {
        emergency_name: body.emergency_name === undefined ? existing.emergency_name || null : text(body.emergency_name, 'emergency_name', 160),
        emergency_phone: body.emergency_phone === undefined ? existing.emergency_phone || null : text(body.emergency_phone, 'emergency_phone', 40),
        emergency_relation: body.emergency_relation === undefined ? existing.emergency_relation || null : text(body.emergency_relation, 'emergency_relation', 80),
        address: body.address === undefined ? existing.address || null : text(body.address, 'address', 500),
        allow_profile_discovery: body.allow_profile_discovery === undefined ? Number(existing.allow_profile_discovery ?? 1) : Boolean(body.allow_profile_discovery),
        allow_direct_messages: body.allow_direct_messages === undefined ? Number(existing.allow_direct_messages ?? 1) : Boolean(body.allow_direct_messages)
    };
    await db.query(`INSERT INTO erp_profile_details (user_id,emergency_name,emergency_phone,emergency_relation,address,allow_profile_discovery,allow_direct_messages)
        VALUES (?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE emergency_name=VALUES(emergency_name),emergency_phone=VALUES(emergency_phone),emergency_relation=VALUES(emergency_relation),address=VALUES(address),allow_profile_discovery=VALUES(allow_profile_discovery),allow_direct_messages=VALUES(allow_direct_messages)`, [userId, ...Object.values(details)]);
    await audit.log(userId, 'UPDATE_PROFILE_DETAILS', 'erp_profile_details', userId);
    return get(userId);
}

async function addDocument(user, file, label) {
    if (!label || typeof label !== 'string' || label.length > 120) fail('A valid document label is required');
    files.validateUpload(file, 'pdf,png,jpg,jpeg', 5 * 1024 * 1024);
    const key = await files.save(file);
    try {
        const [result] = await db.query('INSERT INTO erp_profile_documents(user_id,label,storage_key,original_name,mime_type) VALUES(?,?,?,?,?)', [user.id, label.trim(), key, file.originalname, file.mimetype]);
        await audit.log(user.id, 'UPLOAD_PROFILE_DOCUMENT', 'erp_profile_documents', result.insertId);
        return { id: result.insertId, label: label.trim(), original_name: file.originalname };
    } catch (error) { await files.remove(key); throw error; }
}

async function document(documentId, user) {
    const [rows] = await db.query('SELECT * FROM erp_profile_documents WHERE id=? AND user_id=?', [documentId, user.id]);
    if (!rows[0]) fail('Document not found', 404);
    return rows[0];
}

module.exports = { get, update, addDocument, document };