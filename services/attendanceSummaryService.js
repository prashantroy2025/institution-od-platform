const db = require('../config/db');
const fail = (message, status = 400) => { const error = new Error(message); error.status = status; error.publicMessage = message; throw error; };
const date = (value, field) => { if (!value) return null; if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) fail(`${field} must be YYYY-MM-DD`); return value; };
async function summary(query, user) {
    if (!['student','organizer','hod','super_admin'].includes(user.role)) fail('Attendance access denied', 403);
    const from = date(query.from, 'from'); const to = date(query.to, 'to');
    const params = [user.id]; let scope = 'car.student_id=?';
    if (user.role !== 'student') { scope = '1=1'; params.length = 0; if (user.role === 'organizer') { scope += ' AND t.faculty_id=?'; params.push(user.id); } if (user.role === 'hod') { scope += ' AND c.department_id=?'; params.push(user.department_id); } }
    const dateSql = from ? ' AND cas.attendance_date>=?' : ''; const dateSqlTo = to ? ' AND cas.attendance_date<=?' : ''; if (from) params.push(from); if (to) params.push(to);
    const joins = `FROM class_attendance_records car JOIN class_attendance_sessions cas ON cas.id=car.attendance_session_id JOIN timetable_entries t ON t.id=cas.timetable_id JOIN subjects s ON s.id=t.subject_id JOIN courses c ON c.id=s.course_id`;
    const [overall] = await db.query(`SELECT COUNT(*) total,SUM(car.status='Present') present,SUM(car.status='Absent') absent,SUM(car.status='Late') late,SUM(car.status='Excused') excused ${joins} WHERE ${scope}${dateSql}${dateSqlTo}`, params);
    const [subjects] = await db.query(`SELECT s.id subject_id,s.name subject_name,COUNT(*) classes_held,SUM(car.status IN ('Present','Late','Excused')) attended,ROUND(100*SUM(car.status IN ('Present','Late','Excused'))/NULLIF(COUNT(*),0),2) percentage ${joins} WHERE ${scope}${dateSql}${dateSqlTo} GROUP BY s.id,s.name ORDER BY s.name`, params);
    const [history] = await db.query(`SELECT cas.attendance_date,s.name subject_name,car.status,t.start_time,t.end_time,cr.name classroom_name FROM class_attendance_records car JOIN class_attendance_sessions cas ON cas.id=car.attendance_session_id JOIN timetable_entries t ON t.id=cas.timetable_id JOIN subjects s ON s.id=t.subject_id JOIN classrooms cr ON cr.id=t.classroom_id JOIN courses c ON c.id=s.course_id WHERE ${scope}${dateSql}${dateSqlTo} ORDER BY cas.attendance_date DESC,t.start_time DESC LIMIT 100`, params);
    const total = Number(overall[0]?.total || 0); const attended = Number(overall[0]?.present || 0) + Number(overall[0]?.late || 0) + Number(overall[0]?.excused || 0);
    const [threshold] = await db.query('SELECT shortage_threshold FROM attendance_settings WHERE id=1');
    return { overall: { total, present:Number(overall[0]?.present||0), absent:Number(overall[0]?.absent||0), late:Number(overall[0]?.late||0), excused:Number(overall[0]?.excused||0), percentage: total ? Number((attended*100/total).toFixed(2)) : null }, subjects, history, threshold:Number(threshold[0]?.shortage_threshold ?? 75) };
}
module.exports = { summary };