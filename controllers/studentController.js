const db = require('../config/db');
const attendanceService = require('../services/attendanceService');

exports.applyOD = (req, res) => {

    console.log("OD Controller reached");

    const { event_id, applied_date } = req.body;
    const student_id = req.user.id;

    if (!event_id || !applied_date) {
        return res.status(400).json({ message: "Missing required fields" });
    }

    // Step 1: Check if student participated in event
    db.query(
        "SELECT * FROM event_participants WHERE event_id=? AND student_id=?",
        [event_id, student_id],
        (err, rows) => {

            if (err) return res.status(500).json({ error: err.message });

            // Student not in participant list
            if (rows.length === 0) {

                db.query(
                    "INSERT INTO od_applications (student_id,event_id,applied_date,status) VALUES (?,?,?,?)",
                    [student_id,event_id,applied_date,"Rejected"]
                );

                return res.json({
                    message: "OD Rejected - Student not in participant list"
                });

            }

            // Student participated → Approve
            db.query(
                "INSERT INTO od_applications (student_id,event_id,applied_date,status) VALUES (?,?,?,?)",
                [student_id,event_id,applied_date,"Auto Approved"],
                (err,result)=>{

                    if (err) return res.status(500).json({ error: err.message });

                    attendanceService.markAttendanceForOD(
                        student_id,
                        event_id,
                        applied_date
                    );

                    res.json({
                        message:"OD Auto Approved",
                        od_id: result.insertId
                    });

                }
            );

        }
    );

};
exports.getEvents = (req,res)=>{

db.query(
"SELECT id,title,from_date FROM events WHERE status='Approved'",
(err,rows)=>{

if(err) return res.status(500).json({error:err.message})

res.json(rows)

}
)

}