const adminService = require('../services/adminService');
const db = require('../config/db');

/* ---------------- SYSTEM STATS ---------------- */
exports.getSystemStats = async (req,res,next)=>{
try{
const cacheService = require("../services/cacheService");
const stats = await cacheService.getStats();
res.json(stats);
}catch(err){
next(err);
}
};


/* ---------------- GET ALL USERS ---------------- */
exports.getUsers = async (req,res,next)=>{
try{
const users = await adminService.getUsers();
res.json(users);
}catch(err){
next(err);
}
};


/* ---------------- DEACTIVATE USER ---------------- */
exports.deactivateUser = async (req,res,next)=>{
try{
await adminService.deactivateUser(req.body.user_id);
res.json({ message:"User deactivated" });
}catch(err){
next(err);
}
};


/* ---------------- GET USERS BY ROLE ---------------- */
exports.getUsersByRole = async (req,res,next)=>{
try{
const users = await adminService.getUsersByRole(req.params.role);
res.json(users);
}catch(err){
next(err);
}
};


/* ---------------- DELETE USER ---------------- */
exports.deleteUser = async (req,res,next)=>{
try{
const { user_id } = req.body;

await adminService.deleteUser(user_id);

await db.query(
"INSERT INTO audit_logs (user_id,action,entity,entity_id) VALUES (?,?,?,?)",
[req.user.id,"DELETE_USER","users",user_id]
);

res.json({ message:"User deleted successfully" });

}catch(err){
next(err);
}
};


/* ---------------- EVENT PARTICIPANTS ---------------- */
exports.getEventParticipants = async (req,res,next)=>{
try{
const participants = await adminService.getEventParticipants(req.params.event_id);
res.json(participants);
}catch(err){
next(err);
}
};


/* ---------------- GET ALL EVENTS ---------------- */
exports.getAllEvents = async (req,res,next)=>{
try{
const events = await adminService.getAllEvents();
res.json(events);
}catch(err){
next(err);
}
};


/* ---------------- SEARCH USERS ---------------- */
exports.searchUsers = async (req,res)=>{
try{

const {role,keyword} = req.query;

let query = "SELECT id,name,email,role,is_active FROM users WHERE 1=1";
let params = [];

if(role){
query += " AND role=?";
params.push(role);
}

if(keyword){
query += " AND (name LIKE ? OR email LIKE ? OR college_id LIKE ?)";
params.push(`%${keyword}%`,`%${keyword}%`,`%${keyword}%`);
}

const [rows] = await db.query(query,params);

res.json(rows);

}catch(err){
res.status(500).json({error:err.message});
}
};


/* ---------------- ATTENDANCE ANALYTICS ---------------- */
exports.getAttendanceAnalytics = async (req,res)=>{
try{

const [rows] = await db.query(`
SELECT 
SUM(CASE WHEN status='Present' THEN 1 ELSE 0 END) AS present,
SUM(CASE WHEN status='Absent' THEN 1 ELSE 0 END) AS absent,
SUM(CASE WHEN status='OD' THEN 1 ELSE 0 END) AS od
FROM attendance
`);

res.json(rows[0]);

}catch(err){
res.status(500).json({error:"Analytics query failed"});
}
};


/* ---------------- EXPORT PARTICIPANTS ---------------- */
exports.exportParticipants = async (req,res)=>{
try{

const {event_id} = req.params;

const [rows] = await db.query(`
SELECT users.name,users.college_id
FROM event_participants
JOIN users ON users.id = event_participants.student_id
WHERE event_participants.event_id=?`,
[event_id]
);

let csv = "Name,CollegeID\n";

rows.forEach(r=>{
csv += `${r.name},${r.college_id}\n`;
});

res.setHeader("Content-Type","text/csv");
res.setHeader("Content-Disposition","attachment; filename=participants.csv");

res.send(csv);

}catch(err){
res.status(500).json({error:err.message});
}
};


/* ---------------- GET AUDIT LOGS ---------------- */
exports.getAuditLogs = async (req,res)=>{
try{

const [rows] = await db.query(`
SELECT 
audit_logs.id,
audit_logs.user_id,
audit_logs.action,
audit_logs.created_at,
users.name
FROM audit_logs
LEFT JOIN users ON audit_logs.user_id = users.id
ORDER BY audit_logs.created_at DESC
LIMIT 100
`);

res.json(rows);

}catch(err){
res.status(500).json({error:"Failed to load audit logs"});
}
};


/* ---------------- EXPORT USERS ---------------- */
exports.exportUsers = async (req,res)=>{
try{

const [rows] = await db.query(
"SELECT id,college_id,name,email,role,department_id,is_active FROM users"
);

let csv = "ID,CollegeID,Name,Email,Role,Department,Active\n";

rows.forEach(user=>{
csv += `${user.id},${user.college_id || ""},${user.name},${user.email},${user.role},${user.department_id || ""},${user.is_active}\n`;
});

res.setHeader("Content-Type","text/csv");
res.setHeader("Content-Disposition","attachment; filename=users.csv");

res.send(csv);

}catch(err){
res.status(500).json({error:"Export failed"});
}
};


/* ---------------- EXPORT EVENTS ---------------- */
exports.exportEvents = async (req,res)=>{
try{

const [rows] = await db.query(
"SELECT id,title,status,from_date,to_date FROM events"
);

let csv="ID,Title,Status,FromDate,ToDate\n";

rows.forEach(e=>{
csv+=`${e.id},${e.title},${e.status},${e.from_date},${e.to_date}\n`;
});

res.setHeader("Content-Type","text/csv");
res.setHeader("Content-Disposition","attachment; filename=events.csv");

res.send(csv);

}catch(err){
res.status(500).json({error:"Export failed"});
}
};


/* ---------------- EXPORT ATTENDANCE ---------------- */
exports.exportAttendance = async (req,res)=>{
try{

const [rows] = await db.query(`
SELECT 
attendance.student_id,
users.name,
attendance.attendance_date,
attendance.period_number,
attendance.status
FROM attendance
LEFT JOIN users ON attendance.student_id=users.id
`);

let csv="StudentID,Name,Date,Period,Status\n";

rows.forEach(a=>{
csv+=`${a.student_id},${a.name},${a.attendance_date},${a.period_number},${a.status}\n`;
});

res.setHeader("Content-Type","text/csv");
res.setHeader("Content-Disposition","attachment; filename=attendance.csv");

res.send(csv);

}catch(err){
res.status(500).json({error:"Export failed"});
}
};


/* ---------------- EXPORT ALL PARTICIPANTS ---------------- */
exports.exportAllParticipants = async (req,res)=>{
try{

const [rows] = await db.query(`
SELECT 
event_participants.event_id,
users.name,
users.college_id
FROM event_participants
LEFT JOIN users ON event_participants.student_id=users.id
`);

let csv="EventID,StudentName,CollegeID\n";

rows.forEach(p=>{
csv+=`${p.event_id},${p.name},${p.college_id}\n`;
});

res.setHeader("Content-Type","text/csv");
res.setHeader("Content-Disposition","attachment; filename=participants.csv");

res.send(csv);

}catch(err){
res.status(500).json({error:"Export failed"});
}
};


/* ---------------- EXPORT AUDIT LOGS ---------------- */
exports.exportAuditLogs = async (req,res)=>{
try{

const [rows] = await db.query(`
SELECT 
audit_logs.id,
users.name,
audit_logs.action,
audit_logs.created_at
FROM audit_logs
LEFT JOIN users ON audit_logs.user_id=users.id
`);

let csv="ID,User,Action,Date\n";

rows.forEach(l=>{
csv+=`${l.id},${l.name},${l.action},${l.created_at}\n`;
});

res.setHeader("Content-Type","text/csv");
res.setHeader("Content-Disposition","attachment; filename=audit_logs.csv");

res.send(csv);

}catch(err){
res.status(500).json({error:"Export failed"});
}
};


/* ---------------- ADMIN HISTORY ---------------- */
exports.getAdminHistory = async (req,res)=>{
try{

const [rows] = await db.query(`
SELECT 
a.id,
a.action,
a.entity,
a.entity_id,
a.created_at,
u.name AS admin_name
FROM audit_logs a
LEFT JOIN users u ON a.user_id=u.id
ORDER BY a.created_at DESC
`);

res.json(rows);

}catch(err){
res.status(500).json(err);
}
};


/* ---------------- RECOVER USER ---------------- */
exports.recoverUser = async (req,res)=>{
try{

const { user_id } = req.body;

await db.query(
"UPDATE users SET deleted=0 WHERE id=?",
[user_id]
);

res.json({message:"User recovered"});

}catch(err){
res.status(500).json(err);
}
};


/* ---------------- RECOVER DEPARTMENT ---------------- */
exports.recoverDepartment = async (req,res)=>{
try{

const { department_id } = req.body;

await db.query(
"UPDATE departments SET deleted=0 WHERE id=?",
[department_id]
);

res.json({message:"Department recovered"});

}catch(err){
res.status(500).json(err);
}
};