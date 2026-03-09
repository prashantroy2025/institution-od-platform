const db = require('../config/db')

// SYSTEM STATS
exports.getSystemStats = () => {

return new Promise((resolve,reject)=>{

db.query(`
SELECT
(SELECT COUNT(*) FROM users WHERE role='student') AS students,
(SELECT COUNT(*) FROM users WHERE role='organizer') AS organizers,
(SELECT COUNT(*) FROM users WHERE role='hod') AS hods,
(SELECT COUNT(*) FROM events) AS events,
(SELECT COUNT(*) FROM event_participants) AS participants
`,
(err,rows)=>{

if(err) reject(err)
else resolve(rows[0])

})

})

}


// GET USERS BY ROLE
exports.getUsersByRole = (role) => {

return new Promise((resolve,reject)=>{

db.query(
"SELECT id,college_id,name,email,role,is_active,department_id FROM users WHERE role=?",
[role],
(err,rows)=>{

if(err) reject(err)
else resolve(rows)

})

})

}


// DELETE USER
exports.deleteUser = (user_id) => {

return new Promise((resolve,reject)=>{

db.query(
"DELETE FROM users WHERE id=?",
[user_id],
(err,result)=>{

if(err) reject(err)
else resolve(result)

})

})

}

// GET EVENT PARTICIPANTS
exports.getAllEvents = () => {

return new Promise((resolve,reject)=>{

db.query(

`SELECT 
events.id,
events.title,
events.status,
events.from_date,
events.to_date,
COUNT(event_participants.id) AS participants
FROM events
LEFT JOIN event_participants
ON events.id = event_participants.event_id
GROUP BY events.id
ORDER BY events.created_at DESC`,

(err,rows)=>{

if(err){
return reject(err)
}

resolve(rows)

})

})

}







exports.getEventParticipants = (event_id) => {

return new Promise((resolve,reject)=>{

db.query(

`SELECT 
users.name,
users.college_id
FROM event_participants
JOIN users
ON event_participants.student_id = users.id
WHERE event_participants.event_id = ?`,

[event_id],

(err,rows)=>{

if(err){
return reject(err)
}

resolve(rows)

})

})

}