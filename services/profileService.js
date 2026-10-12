const crypto = require('crypto');
const QRCode = require('qrcode');
const db = require('../config/db');
const audit = require('./auditService');
const files = require('../utils/learningFileStore');

const fail = (message, status = 400) => { const error = new Error(message); error.status = status; error.publicMessage = message; throw error; };
const text = (value, field, max) => { if (value === undefined || value === null || value === '') return null; if (typeof value !== 'string' || value.length > max) fail(`${field} must be at most ${max} characters`); return value.trim(); };
const PHONE = /^\+?[0-9][0-9 -]{6,18}[0-9]$/;
const SKILL_NAME = /^[\p{L}\p{N} +#./&()-]{2,80}$/u;
const SKILL_KINDS = ['skill', 'interest'];
const ACHIEVEMENT_CATEGORIES = ['Award', 'Certification', 'Competition', 'Leadership', 'Other'];
const PHOTO_MAX_BYTES = 2 * 1024 * 1024;
const positiveId = value => { const id = Number(value); if (!Number.isInteger(id) || id < 1) fail('Invalid id'); return id; };
const localToday = () => { const d = new Date(); return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-'); };

async function get(userId) {
    const [rows] = await db.query(`SELECT u.id,u.college_id,u.name,u.email,u.role,u.department_id,d.name department_name,
        sp.enrollment_no,sp.phone student_phone,b.name batch_name,s.name section_name,c.name course_name,
        fp.employee_code,fp.designation,fp.phone faculty_phone,pd.emergency_name,pd.emergency_phone,pd.emergency_relation,
        pd.address,pd.allow_profile_discovery,pd.allow_direct_messages,pd.photo_storage_key
        FROM users u LEFT JOIN departments d ON d.id=u.department_id LEFT JOIN student_profiles sp ON sp.user_id=u.id
        LEFT JOIN batches b ON b.id=sp.batch_id LEFT JOIN sections s ON s.id=sp.section_id LEFT JOIN courses c ON c.id=b.course_id
        LEFT JOIN faculty_profiles fp ON fp.user_id=u.id LEFT JOIN erp_profile_details pd ON pd.user_id=u.id
        WHERE u.id=? AND u.is_active=1 AND (u.deleted=0 OR u.deleted IS NULL) LIMIT 1`, [userId]);
    if (!rows[0]) fail('Profile not found', 404);
    const { photo_storage_key, ...user } = rows[0];
    const [documents] = await db.query('SELECT id,label,original_name,mime_type,uploaded_at FROM erp_profile_documents WHERE user_id=? ORDER BY uploaded_at DESC', [userId]);
    return { ...user, has_photo: Boolean(photo_storage_key), profile: user.role === 'student' ? { enrollment_no:user.enrollment_no, phone:user.student_phone, batch_name:user.batch_name, section_name:user.section_name, course_name:user.course_name } : { employee_code:user.employee_code, designation:user.designation, phone:user.faculty_phone }, emergency: { name:user.emergency_name, phone:user.emergency_phone, relation:user.emergency_relation }, documents };
}

async function update(userId, body) {
    const [existingRows] = await db.query('SELECT * FROM erp_profile_details WHERE user_id=?', [userId]);
    const existing = existingRows[0] || {};
    const emergencyPhone = body.emergency_phone === undefined ? undefined : text(body.emergency_phone, 'emergency_phone', 40);
    if (emergencyPhone && !PHONE.test(emergencyPhone)) fail('emergency_phone must be a valid phone number');
    const details = {
        emergency_name: body.emergency_name === undefined ? existing.emergency_name || null : text(body.emergency_name, 'emergency_name', 160),
        emergency_phone: emergencyPhone === undefined ? existing.emergency_phone || null : emergencyPhone,
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

const detectImageType = buffer => {
    if (buffer.length > 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
    if (buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
    return null;
};

async function setPhoto(user, file) {
    files.validateUpload(file, 'png,jpg,jpeg', PHOTO_MAX_BYTES);
    const mime = detectImageType(file.buffer);
    if (!mime) fail('Profile photo must be a PNG or JPEG image');
    const [existing] = await db.query('SELECT photo_storage_key FROM erp_profile_details WHERE user_id=?', [user.id]);
    const key = await files.save(file);
    try {
        await db.query('INSERT INTO erp_profile_details (user_id,photo_storage_key,photo_mime) VALUES (?,?,?) ON DUPLICATE KEY UPDATE photo_storage_key=VALUES(photo_storage_key),photo_mime=VALUES(photo_mime)', [user.id, key, mime]);
    } catch (error) { await files.remove(key); throw error; }
    if (existing[0] && existing[0].photo_storage_key) await files.remove(existing[0].photo_storage_key);
    await audit.log(user.id, 'UPDATE_PROFILE_PHOTO', 'erp_profile_details', user.id);
    return { has_photo: true };
}

async function photo(userId) {
    const [rows] = await db.query('SELECT photo_storage_key,photo_mime FROM erp_profile_details WHERE user_id=?', [userId]);
    if (!rows[0] || !rows[0].photo_storage_key) fail('No profile photo has been uploaded', 404);
    return { buffer: await files.read(rows[0].photo_storage_key), mime: rows[0].photo_mime };
}

const signStudentId = collegeId => {
    const mac = crypto.createHmac('sha256', process.env.JWT_SECRET).update(`student-id:${collegeId}`).digest('base64url').slice(0, 24);
    return `ERP-STUDENT:${collegeId}:${mac}`;
};

async function studentId(user) {
    const [rows] = await db.query('SELECT college_id,name FROM users WHERE id=?', [user.id]);
    if (!rows[0] || !rows[0].college_id) fail('Student ID has not been assigned', 404);
    const { college_id, name } = rows[0];
    return { college_id, name, qr_data_url: await QRCode.toDataURL(signStudentId(college_id), { margin: 1, width: 220, errorCorrectionLevel: 'M' }) };
}

function skillInput(body) {
    const name = typeof body.name === 'string' ? body.name.trim().replace(/\s+/g, ' ') : '';
    if (!SKILL_NAME.test(name)) fail('Name must be 2 to 80 characters using letters, numbers and + # . / & ( ) -');
    if (!SKILL_KINDS.includes(body.kind)) fail('kind must be skill or interest');
    return { name, kind: body.kind };
}

async function listSkills(userId) {
    const [items] = await db.query('SELECT id,name,kind FROM erp_student_skills WHERE user_id=? ORDER BY kind, name', [userId]);
    return { items };
}

async function addSkill(user, body) {
    const data = skillInput(body);
    try {
        const [result] = await db.query('INSERT INTO erp_student_skills (user_id,name,kind) VALUES (?,?,?)', [user.id, data.name, data.kind]);
        await audit.log(user.id, 'ADD_PROFILE_SKILL', 'erp_student_skills', result.insertId);
        return { id: result.insertId, ...data };
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') fail('This skill or interest is already in your profile', 409);
        throw error;
    }
}

async function updateSkill(user, idValue, body) {
    const id = positiveId(idValue);
    const data = skillInput(body);
    try {
        const [result] = await db.query('UPDATE erp_student_skills SET name=?,kind=? WHERE id=? AND user_id=?', [data.name, data.kind, id, user.id]);
        if (!result.affectedRows) fail('Skill not found', 404);
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') fail('This skill or interest is already in your profile', 409);
        throw error;
    }
    await audit.log(user.id, 'UPDATE_PROFILE_SKILL', 'erp_student_skills', id);
    return { id, ...data };
}

async function removeSkill(user, idValue) {
    const id = positiveId(idValue);
    const [result] = await db.query('DELETE FROM erp_student_skills WHERE id=? AND user_id=?', [id, user.id]);
    if (!result.affectedRows) fail('Skill not found', 404);
    await audit.log(user.id, 'REMOVE_PROFILE_SKILL', 'erp_student_skills', id);
    return { id, removed: true };
}

function achievementInput(body) {
    const title = text(body.title, 'title', 160);
    if (!title || title.length < 3) fail('title must be 3 to 160 characters');
    if (!ACHIEVEMENT_CATEGORIES.includes(body.category)) fail('category is not supported');
    const achievedOn = body.achieved_on ? String(body.achieved_on) : null;
    if (achievedOn && (!/^\d{4}-\d{2}-\d{2}$/.test(achievedOn) || achievedOn > localToday())) fail('achieved_on must be a valid date that is not in the future');
    return {
        title,
        category: body.category,
        organization: text(body.organization, 'organization', 160),
        achieved_on: achievedOn,
        description: text(body.description, 'description', 1000)
    };
}

async function listAchievements(userId) {
    const [items] = await db.query('SELECT id,title,category,organization,achieved_on,description FROM erp_student_achievements WHERE user_id=? ORDER BY achieved_on IS NULL, achieved_on DESC, id DESC', [userId]);
    return { items };
}

async function addAchievement(user, body) {
    const data = achievementInput(body);
    const [result] = await db.query('INSERT INTO erp_student_achievements (user_id,title,category,organization,achieved_on,description) VALUES (?,?,?,?,?,?)', [user.id, data.title, data.category, data.organization, data.achieved_on, data.description]);
    await audit.log(user.id, 'ADD_PROFILE_ACHIEVEMENT', 'erp_student_achievements', result.insertId);
    return { id: result.insertId, ...data };
}

async function removeAchievement(user, idValue) {
    const id = positiveId(idValue);
    const [result] = await db.query('DELETE FROM erp_student_achievements WHERE id=? AND user_id=?', [id, user.id]);
    if (!result.affectedRows) fail('Achievement not found', 404);
    await audit.log(user.id, 'REMOVE_PROFILE_ACHIEVEMENT', 'erp_student_achievements', id);
    return { id, removed: true };
}

module.exports = {
    get, update, addDocument, document, setPhoto, photo, studentId,
    listSkills, addSkill, updateSkill, removeSkill,
    listAchievements, addAchievement, removeAchievement
};
