const db = require('../config/db');

const multer = require("multer");
const csv = require("csv-parser");
const fs = require("fs");

// Get pending events for HOD department
exports.getPendingEvents = async (req, res) => {

try{

const department_id = req.user.department_id;

const [results] = await db.query(
`SELECT 
events.id,
events.title,
events.from_date,
clubs.club_name
FROM events
LEFT JOIN clubs ON events.club_id = clubs.id
WHERE events.department_id = ? 
AND events.status = 'Pending'`,
[department_id]
);

res.json(results);

}catch(err){
res.status(500).json({ error: err.message });
}

};


// Approve event
exports.approveEvent = async (req, res) => {

try{

const { event_id } = req.body;

await db.query(
"UPDATE events SET status='Approved' WHERE id=?",
[event_id]
);

res.json({ message: "Event Approved" });

}catch(err){
res.status(500).json({ error: err.message });
}

};


// Reject event
exports.rejectEvent = async (req, res) => {

try{

const { event_id } = req.body;

await db.query(
"UPDATE events SET status='Rejected' WHERE id=?",
[event_id]
);

res.json({ message: "Event Rejected" });

}catch(err){
res.status(500).json({ error: err.message });
}

};


exports.getParticipants = async (req,res)=>{

try{

const {event_id} = req.params;

const [rows] = await db.query(
"SELECT student_name, roll_no, department FROM event_participants WHERE event_id=?",
[event_id]
);

res.json(rows);

}catch(err){
res.status(500).json(err);
}

}


/* upload independent attendance */

exports.uploadIndependentAttendance = async (req,res)=>{

try{

const {title,from_date,to_date,from_time,to_time} = req.body
const file = req.file

if(!file){
return res.status(400).json({message:"File missing"})
}

// Create event
const [result] = await db.query(
`INSERT INTO events 
(title,from_date,to_date,from_time,to_time,status,created_by) 
VALUES (?,?,?,?,?,'Approved','hod')`,
[title,from_date,to_date,from_time,to_time]
)

const event_id = result.insertId

const students=[]

// Read CSV file
fs.createReadStream(file.path)
.pipe(csv())
.on("data",(row)=>{
students.push(row)
})
.on("end",async ()=>{

// Insert participants
for(const student of students){

await db.query(
`INSERT INTO participants 
(event_id,student_id,source) 
VALUES (?,?, 'hod')`,
[event_id,student.student_id]
)

}

res.json({
message:"Attendance uploaded successfully",
total_students:students.length
})

})

}catch(err){
res.status(500).json(err);
}

}