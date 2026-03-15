const db = require('../config/db');

const multer = require("multer");
const csv = require("csv-parser");
const fs = require("fs");

// Get pending events for HOD department
exports.getPendingEvents = (req, res) => {

const department_id = req.user.department_id;

db.query(
`SELECT 
events.id,
events.title,
events.from_date,
clubs.club_name
FROM events
LEFT JOIN clubs ON events.club_id = clubs.id
WHERE events.department_id = ? 
AND events.status = 'Pending'`,
[department_id],

(err, results) => {

if (err) return res.status(500).json({ error: err.message });

res.json(results);

});
};


// Approve event
exports.approveEvent = (req, res) => {

    const { event_id } = req.body;

    db.query(
        "UPDATE events SET status='Approved' WHERE id=?",
        [event_id],
        (err, result) => {

            if (err) return res.status(500).json({ error: err.message });

            res.json({ message: "Event Approved" });
        }
    );
};


// Reject event
exports.rejectEvent = (req, res) => {

    const { event_id } = req.body;

    db.query(
        "UPDATE events SET status='Rejected' WHERE id=?",
        [event_id],
        (err, result) => {

            if (err) return res.status(500).json({ error: err.message });

            res.json({ message: "Event Rejected" });
        }
    );
};


exports.getParticipants = (req,res)=>{

const {event_id} = req.params;

db.query(
"SELECT student_name, roll_no, department FROM event_participants WHERE event_id=?",
[event_id],
(err,rows)=>{

if(err) return res.status(500).json(err);

res.json(rows);

});

}

/* upload independent attendance */

exports.uploadIndependentAttendance = (req,res)=>{

const {title,from_date,to_date,from_time,to_time} = req.body
const file = req.file

if(!file){
return res.status(400).json({message:"File missing"})
}

// Create event
db.query(
`INSERT INTO events 
(title,from_date,to_date,from_time,to_time,status,created_by) 
VALUES (?,?,?,?,?,'Approved','hod')`,
[title,from_date,to_date,from_time,to_time],
(err,result)=>{

if(err) return res.status(500).json(err)

const event_id = result.insertId

const students=[]

// Read CSV file
fs.createReadStream(file.path)
.pipe(csv())
.on("data",(row)=>{
students.push(row)
})
.on("end",()=>{

// Insert participants
students.forEach(student=>{

db.query(
`INSERT INTO participants 
(event_id,student_id,source) 
VALUES (?,?, 'hod')`,
[event_id,student.student_id]
)

})

res.json({
message:"Attendance uploaded successfully",
total_students:students.length
})

})

})

}