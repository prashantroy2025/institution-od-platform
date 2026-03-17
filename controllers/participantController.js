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

                    const [users] = await db.query(
                        "SELECT id FROM users WHERE college_id=? AND role='student'",
                        [row.college_id]
                    );

                    if (users.length > 0) {

                        await db.query(
                            "INSERT IGNORE INTO event_participants (event_id, student_id) VALUES (?,?)",
                            [event_id, users[0].id]
                        );

                        inserted++;
                    }

                }
                 
                await db.query(
                 "UPDATE events SET attendance_status='submitted' WHERE id=?",
                  [event_id]
                );

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


exports.getParticipantsByEvent = async (req,res)=>{

try{

const event_id = req.params.id;

const [rows] = await db.query(
"SELECT student_id, scan_time FROM event_participants WHERE event_id=?",
[event_id]
);

res.json(rows);

}catch(err){
console.error("Participant query error:", err);
res.status(500).json({error: err.message});
}

};


exports.getParticipantCount = async (req,res)=>{

try{

const eventId = req.params.eventId;

const [rows] = await db.query(
"SELECT COUNT(*) as total FROM event_participants WHERE event_id=?",
[eventId]
);

res.json({total: rows[0].total});

}catch(err){
res.status(500).json({error:err.message});
}

};


exports.addParticipant = async (req,res)=>{

try{

const {event_id, student_id} = req.body;

await db.query(
"INSERT INTO event_participants(event_id,student_id) VALUES(?,?)",
[event_id,student_id]
);

// history log
await db.query(
"INSERT INTO audit_logs (user_id,action,entity,entity_id) VALUES (?,?,?,?)",
[req.user.id,"ADD_PARTICIPANT","event_participants",event_id]
);

res.json({message:"Participant added"});

}catch(err){
res.status(500).json({error:err.message});
}

};


exports.removeParticipant = async (req,res)=>{

try{

const {event_id, student_id} = req.body;

await db.query(
"DELETE FROM event_participants WHERE event_id=? AND student_id=?",
[event_id,student_id]
);

// history log
await db.query(
"INSERT INTO audit_logs (user_id,action,entity,entity_id) VALUES (?,?,?,?)",
[req.user.id,"REMOVE_PARTICIPANT","event_participants",event_id]
);

res.json({message:"Participant removed"});

}catch(err){
res.status(500).json({error:err.message});
}

};


exports.reuploadParticipants = async (req,res)=>{

try{

const {event_id} = req.body;

if(!req.file){
return res.status(400).json({message:"File required"});
}

// delete old participants
await db.query(
"DELETE FROM event_participants WHERE event_id=?",
[event_id]
);

// update status
await db.query(
"UPDATE events SET attendance_status='resubmitted' WHERE id=?",
[event_id]
);

// audit log
await db.query(
"INSERT INTO audit_logs (user_id,action,entity,entity_id) VALUES (?,?,?,?)",
[req.user.id,"REUPLOAD_ATTENDANCE","events",event_id]
);

res.json({message:"Attendance re-submitted"});

}catch(err){
res.status(500).json(err);
}

};