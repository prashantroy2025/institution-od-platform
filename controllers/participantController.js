const fs = require('fs');
const csv = require('csv-parser');
const db = require('../config/db');
const { isPositiveInteger } = require('../utils/requestValidation');
const { getManagedEvent } = require('../utils/eventAuthorization');

const parseCsvFile = (filePath) => new Promise((resolve, reject) => {
    const rows = [];
    fs.createReadStream(filePath)
        .pipe(csv())
        .on('data', (row) => rows.push(row))
        .on('end', () => resolve(rows))
        .on('error', reject);
});

exports.uploadParticipants = async (req, res) => {

    const { event_id } = req.body;

    if (!req.file) {
        return res.status(400).json({ message: "CSV file required" });
    }

    if (!isPositiveInteger(event_id)) {
        return res.status(400).json({ message: "event_id required" });
    }

    if (!await getManagedEvent(db, req.user, event_id)) {
        return res.status(404).json({ message: "Event not found or unauthorized" });
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

            fs.unlink(req.file.path, () => {});

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

if (!await getManagedEvent(db, req.user, event_id)) {
    return res.status(404).json({ message: "Event not found or unauthorized" });
}

const [rows] = await db.query(
"SELECT student_id, scan_time FROM event_participants WHERE event_id=?",
[event_id]
);

res.json(rows);

}catch(err){
console.error("Participant query error:", err);
res.status(500).json({message: "Internal server error"});
}

};


exports.getParticipantCount = async (req,res)=>{

try{

const eventId = req.params.eventId;

if (!await getManagedEvent(db, req.user, eventId)) {
    return res.status(404).json({ message: "Event not found or unauthorized" });
}

const [rows] = await db.query(
"SELECT COUNT(*) as total FROM event_participants WHERE event_id=?",
[eventId]
);

res.json({total: rows[0].total});

}catch(err){
console.error("Participant count error:", err);
res.status(500).json({message: "Internal server error"});
}

};


exports.addParticipant = async (req,res)=>{

try{

const {event_id, student_id} = req.body;

if (!isPositiveInteger(event_id) || !isPositiveInteger(student_id)
    || !await getManagedEvent(db, req.user, event_id)) {
    return res.status(404).json({ message: "Event not found or unauthorized" });
}

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
console.error("Add participant error:", err);
res.status(500).json({message: "Internal server error"});
}

};


exports.removeParticipant = async (req,res)=>{

try{

const {event_id, student_id} = req.body;

if (!isPositiveInteger(event_id) || !isPositiveInteger(student_id)
    || !await getManagedEvent(db, req.user, event_id)) {
    return res.status(404).json({ message: "Event not found or unauthorized" });
}

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
console.error("Remove participant error:", err);
res.status(500).json({message: "Internal server error"});
}

};


exports.reuploadParticipants = async (req, res) => {
  try {
    const { event_id } = req.body;

    if (!req.file || !isPositiveInteger(event_id)) {
      return res.status(400).json({ message: "File required" });
    }

    if (!await getManagedEvent(db, req.user, event_id)) {
      return res.status(404).json({ message: "Event not found or unauthorized" });
    }

    const results = await parseCsvFile(req.file.path);
    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();
        await connection.query("DELETE FROM event_participants WHERE event_id=?", [event_id]);
          let inserted = 0;

          for (const row of results) {
            const [users] = await connection.query(
              "SELECT id FROM users WHERE college_id=? AND role='student'",
              [row.college_id]
            );

            if (users.length > 0) {
              await connection.query(
                "INSERT IGNORE INTO event_participants (event_id, student_id) VALUES (?,?)",
                [event_id, users[0].id]
              );
              inserted++;
            }
          }

          await connection.query(
            "UPDATE events SET attendance_status='resubmitted' WHERE id=?",
            [event_id]
          );

          await connection.query(
            "INSERT INTO audit_logs (user_id,action,entity,entity_id) VALUES (?,?,?,?)",
            [req.user.id, "REUPLOAD_ATTENDANCE", "events", event_id]
          );

          await connection.commit();
          res.json({ message: "Attendance re-submitted", inserted });
    } catch (err) {
          await connection.rollback();
          console.error("Participant reupload error:", err);
          res.status(500).json({ message: "Server error" });
    } finally {
          connection.release();
          fs.unlink(req.file.path, () => {});
    }
  } catch (err) {
    console.error("Participant reupload error:", err);
    res.status(500).json({ message: "Server error" });
  }
};