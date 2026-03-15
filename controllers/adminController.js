const adminService = require('../services/adminService')
const db = require('../config/db')


// ---------------- SYSTEM STATS ----------------
exports.getSystemStats = async (req,res,next)=>{

try{

const cacheService = require("../services/cacheService")

const stats = await cacheService.getStats()

res.json(stats)

}catch(err){
next(err)
}

}


// ---------------- GET ALL USERS ----------------
exports.getUsers = async (req,res,next)=>{

try{

const users = await adminService.getUsers()

res.json(users)

}catch(err){
next(err)
}

}


// ---------------- DEACTIVATE USER ----------------
exports.deactivateUser = async (req,res,next)=>{

try{

await adminService.deactivateUser(req.body.user_id)

res.json({
message:"User deactivated"
})

}catch(err){
next(err)
}

}


// ---------------- GET USERS BY ROLE ----------------
exports.getUsersByRole = async (req,res,next)=>{

try{

const users = await adminService.getUsersByRole(req.params.role)

res.json(users)

}catch(err){
next(err)
}

}


// ---------------- DELETE USER ----------------
exports.deleteUser = async (req,res,next)=>{

try{

const { user_id } = req.body

await adminService.deleteUser(user_id)

db.query(
"INSERT INTO audit_logs (user_id,action,entity,entity_id) VALUES (?,?,?,?)",
[req.user.id,"DELETE_USER","users",user_id]
)

res.json({
message:"User deleted successfully"
})

}catch(err){
next(err)
}

}

// ---------------- EVENT PARTICIPANTS ----------------
exports.getEventParticipants = async (req,res,next)=>{

try{

const participants = await adminService.getEventParticipants(req.params.event_id)

res.json(participants)

}catch(err){
next(err)
}

}


// ---------------- GET ALL EVENTS ----------------
exports.getAllEvents = async (req,res,next)=>{

try{

const events = await adminService.getAllEvents()

res.json(events)

}catch(err){
next(err)
}

}

// ---------------- SEARCH USERS ----------------

exports.searchUsers = (req,res)=>{

const {role,keyword} = req.query

let query = "SELECT id,name,email,role,is_active FROM users WHERE 1=1"
let params = []

if(role){
query += " AND role=?"
params.push(role)
}

if(keyword){
query += " AND (name LIKE ? OR email LIKE ? OR college_id LIKE ?)"
params.push(`%${keyword}%`,`%${keyword}%`,`%${keyword}%`)
}

db.query(query,params,(err,rows)=>{

if(err){
return res.status(500).json({error:err.message})
}

res.json(rows)

})

}

// ---------------- ATTENDANCE ANALYTICS ----------------

exports.getAttendanceAnalytics = (req,res)=>{

db.query(
`SELECT 
SUM(CASE WHEN status='Present' THEN 1 ELSE 0 END) AS present,
SUM(CASE WHEN status='Absent' THEN 1 ELSE 0 END) AS absent,
SUM(CASE WHEN status='OD' THEN 1 ELSE 0 END) AS od
FROM attendance`,
(err,rows)=>{

if(err){
console.log(err)
return res.status(500).json({error:"Analytics query failed"})
}

res.json(rows[0])

})

}

// ---------------- EXPORT PARTICIPANTS ----------------

exports.exportParticipants = (req,res)=>{

const {event_id} = req.params

db.query(
`SELECT users.name,users.college_id
FROM event_participants
JOIN users ON users.id = event_participants.student_id
WHERE event_participants.event_id=?`,
[event_id],
(err,rows)=>{

if(err){
return res.status(500).json({error:err.message})
}

let csv = "Name,CollegeID\n"

rows.forEach(r=>{
csv += `${r.name},${r.college_id}\n`
})

res.setHeader("Content-Type","text/csv")
res.setHeader("Content-Disposition","attachment; filename=participants.csv")

res.send(csv)

})

}

// ---------------- GET AUDIT LOGS ----------------

exports.getAuditLogs = (req,res)=>{

db.query(
`SELECT 
audit_logs.id,
audit_logs.user_id,
audit_logs.action,
audit_logs.created_at,
users.name
FROM audit_logs
LEFT JOIN users
ON audit_logs.user_id = users.id
ORDER BY audit_logs.created_at DESC
LIMIT 100`,
(err,rows)=>{

if(err){
console.log("Audit logs error:",err)
return res.status(500).json({error:"Failed to load audit logs"})
}

res.json(rows)

})

}


// ---------------- EXPORT USERS ----------------

exports.exportUsers = (req,res)=>{

db.query(
"SELECT id,college_id,name,email,role,department_id,is_active FROM users",
(err,rows)=>{

if(err){
console.log("Export error:",err)
return res.status(500).json({error:"Export failed"})
}

let csv = "ID,CollegeID,Name,Email,Role,Department,Active\n"

rows.forEach(user=>{
csv += `${user.id},${user.college_id || ""},${user.name},${user.email},${user.role},${user.department_id || ""},${user.is_active}\n`
})

res.setHeader("Content-Type","text/csv")
res.setHeader("Content-Disposition","attachment; filename=users.csv")

res.send(csv)

})

}

// ---------------- EXPORT EVENTS ----------------

exports.exportEvents = (req,res)=>{

db.query(
"SELECT id,title,status,from_date,to_date FROM events",
(err,rows)=>{

let csv="ID,Title,Status,FromDate,ToDate\n"

rows.forEach(e=>{
csv+=`${e.id},${e.title},${e.status},${e.from_date},${e.to_date}\n`
})

res.setHeader("Content-Type","text/csv")
res.setHeader("Content-Disposition","attachment; filename=events.csv")

res.send(csv)

})
}

// ---------------- EXPORT ATTENDENCE ----------------

exports.exportAttendance = (req,res)=>{

db.query(
`SELECT 
attendance.student_id,
users.name,
attendance.attendance_date,
attendance.period_number,
attendance.status
FROM attendance
LEFT JOIN users ON attendance.student_id=users.id`,
(err,rows)=>{

let csv="StudentID,Name,Date,Period,Status\n"

rows.forEach(a=>{
csv+=`${a.student_id},${a.name},${a.attendance_date},${a.period_number},${a.status}\n`
})

res.setHeader("Content-Type","text/csv")
res.setHeader("Content-Disposition","attachment; filename=attendance.csv")

res.send(csv)

})
}

// ---------------- EXPORT PARTICIPANT ----------------

exports.exportAllParticipants = (req,res)=>{

db.query(
`SELECT 
event_participants.event_id,
users.name,
users.college_id
FROM event_participants
LEFT JOIN users ON event_participants.student_id=users.id`,
(err,rows)=>{

let csv="EventID,StudentName,CollegeID\n"

rows.forEach(p=>{
csv+=`${p.event_id},${p.name},${p.college_id}\n`
})

res.setHeader("Content-Type","text/csv")
res.setHeader("Content-Disposition","attachment; filename=participants.csv")

res.send(csv)

})
}

// ---------------- EXPORT AUDIT LOGS ----------------

exports.exportAuditLogs = (req,res)=>{

db.query(
`SELECT 
audit_logs.id,
users.name,
audit_logs.action,
audit_logs.created_at
FROM audit_logs
LEFT JOIN users ON audit_logs.user_id=users.id`,
(err,rows)=>{

let csv="ID,User,Action,Date\n"

rows.forEach(l=>{
csv+=`${l.id},${l.name},${l.action},${l.created_at}\n`
})

res.setHeader("Content-Type","text/csv")
res.setHeader("Content-Disposition","attachment; filename=audit_logs.csv")

res.send(csv)

})
}

/* ---------------- ADMIN HISTORY ---------------- */

exports.getAdminHistory = (req,res)=>{

db.query(
`SELECT 
a.id,
a.action,
a.entity,
a.entity_id,
a.created_at,
u.name AS admin_name
FROM audit_logs a
LEFT JOIN users u ON a.user_id=u.id
ORDER BY a.created_at DESC`,
(err,rows)=>{

if(err) return res.status(500).json(err)

res.json(rows)

})

}
/*---------------- RECOVER EVENT ---------------- */

exports.recoverUser = (req,res)=>{

const { user_id } = req.body

db.query(
"UPDATE users SET deleted=1 WHERE id=?",
[user_id],
(err,result)=>{

if(err) return res.status(500).json(err)

res.json({message:"User recovered"})

})

}

/*---------------- RECOVER DEPARTMENT ---------------- */

exports.recoverDepartment = (req,res)=>{

const { department_id } = req.body

db.query(
"UPDATE departments SET deleted=0 WHERE id=?",
[department_id],
(err,result)=>{

if(err) return res.status(500).json(err)

res.json({message:"Department recovered"})

})

}