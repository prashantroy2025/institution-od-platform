const fs = require('fs');
const csv = require('csv-parser');
const db = require('../config/db');

exports.uploadParticipants = async (req, res) => {

    const { event_id } = req.body;

    if (!req.file) {
        return res.status(400).json({ message: "CSV file required" });
    }

    if (!event_id) {
        return res.status(400).json({ message: "event_id required" });
    }

    const results = [];

    fs.createReadStream(req.file.path)
        .pipe(csv())
        .on('data', (data) => results.push(data))
        .on('end', async () => {

            try {

                let inserted = 0;

                for (const row of results) {

                    const users = await new Promise((resolve, reject) => {

                        db.query(
                            "SELECT id FROM users WHERE college_id=? AND role='student'",
                            [row.college_id],
                            (err, result) => {
                                if (err) reject(err);
                                else resolve(result);
                            }
                        );

                    });

                    if (users.length > 0) {

                        await new Promise((resolve, reject) => {

                            db.query(
                                "INSERT IGNORE INTO event_participants (event_id, student_id) VALUES (?,?)",
                                [event_id, users[0].id],
                                (err) => {
                                    if (err) reject(err);
                                    else {
                                        inserted++;
                                        resolve();
                                    }
                                }
                            );

                        });

                    }

                }
                 
                db.query(
                 "UPDATE events SET attendance_status='submitted' WHERE id=?",
                  [event_id]
                )

                res.json({
                    message: "Participants uploaded successfully",
                    total_rows: results.length,
                    inserted: inserted
                });

            } catch (error) {

                console.error(error);

                res.status(500).json({
                    message: "Server error while uploading participants"
                });

            }

        });

};

exports.getParticipantsByEvent = (req,res)=>{

const event_id = req.params.id

db.query(
"SELECT student_id, scan_time FROM event_participants WHERE event_id=?",
[event_id],
(err,rows)=>{

if(err){
console.error("Participant query error:", err)
return res.status(500).json({error: err.message})
}

res.json(rows)

})

}

exports.getParticipantCount = (req,res)=>{

const eventId = req.params.eventId

db.query(
"SELECT COUNT(*) as total FROM event_participants WHERE event_id=?",
[eventId],
(err,rows)=>{

if(err){
return res.status(500).json({error:err.message})
}

res.json({total: rows[0].total})

})

}

exports.addParticipant = (req,res)=>{

const {event_id, student_id} = req.body

db.query(
"INSERT INTO event_participants(event_id,student_id) VALUES(?,?)",
[event_id,student_id],
(err)=>{

if(err){
return res.status(500).json({error:err.message})
}

// history log
db.query(
"INSERT INTO audit_logs (user_id,action,entity,entity_id) VALUES (?,?,?,?)",
[req.user.id,"ADD_PARTICIPANT","event_participants",event_id]
)

res.json({message:"Participant added"})

})
}

exports.removeParticipant = (req,res)=>{

const {event_id, student_id} = req.body

db.query(
"DELETE FROM event_participants WHERE event_id=? AND student_id=?",
[event_id,student_id],
(err)=>{

if(err){
return res.status(500).json({error:err.message})
}

// history log
db.query(
"INSERT INTO audit_logs (user_id,action,entity,entity_id) VALUES (?,?,?,?)",
[req.user.id,"REMOVE_PARTICIPANT","event_participants",event_id]
)

res.json({message:"Participant removed"})

})
}


exports.reuploadParticipants = (req,res)=>{

const {event_id} = req.body

if(!req.file){
return res.status(400).json({message:"File required"})
}

const file = req.file.path

// delete old participants
db.query(
"DELETE FROM event_participants WHERE event_id=?",
[event_id],
(err)=>{

if(err){
return res.status(500).json(err)
}

// process file again
// (reuse your CSV parser here)

db.query(
"UPDATE events SET attendance_status='resubmitted' WHERE id=?",
[event_id]
)

db.query(
"INSERT INTO audit_logs (user_id,action,entity,entity_id) VALUES (?,?,?,?)",
[req.user.id,"REUPLOAD_ATTENDANCE","events",event_id]
)

res.json({message:"Attendance re-submitted"})

})

}
