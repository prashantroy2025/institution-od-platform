const db = require('../config/db');

const multer = require("multer");
const csv = require("csv-parser");
const fs = require("fs");

// Get pending events for HOD department
exports.getPendingEvents = async (req, res) => {

try{

const department_id = req.user.department_id;

const hod_id = req.user.id;

const [results] = await db.query(
`SELECT 
events.id,
events.title,
events.from_date,
events.to_date,
events.start_time,
events.end_time,
events.is_full_day,
users.name AS organizer_name
FROM events
LEFT JOIN users ON events.organizer_id = users.id
WHERE events.status = 'Pending'
AND (events.target_hod_id = ? OR (events.target_hod_id IS NULL AND events.department_id = ?))`,
[hod_id, department_id]
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

const [result] = await db.query(
 `UPDATE events SET status='Approved' 
 WHERE id=? AND (department_id=? OR target_hod_id=?)`,
[event_id, req.user.department_id, req.user.id]
);

if (result.affectedRows === 0) {
  return res.status(403).json({ message: "Event not found or not in your department" });
}

res.json({ message: "Event Approved" });

}catch(err){
res.status(500).json({ error: err.message });
}

};


// Reject event
exports.rejectEvent = async (req, res) => {

try{

const { event_id } = req.body;

const [result] = await db.query(
  `UPDATE events SET status='Rejected' 
 WHERE id=? AND (department_id=? OR target_hod_id=?)`,
[event_id, req.user.department_id, req.user.id]
);

if (result.affectedRows === 0) {
  return res.status(403).json({ message: "Event not found or not in your department" });
}

res.json({ message: "Event Rejected" });

}catch(err){
res.status(500).json({ error: err.message });
}

};


exports.getParticipants = async (req,res)=>{

try{

const {event_id} = req.params;

const [rows] = await db.query(
`SELECT users.name, users.college_id, users.email, event_participants.scan_time
 FROM event_participants
 JOIN users ON event_participants.student_id = users.id
 WHERE event_participants.event_id = ?`,
[event_id]
);

res.json(rows);

}catch(err){
res.status(500).json(err);
}

}


/* upload independent attendance */

exports.uploadIndependentAttendance = async (req, res) => {
    try {
        const { title, from_date, to_date, start_time, end_time } = req.body;
        const file = req.file;

        if (!file) {
            return res.status(400).json({ message: "File missing" });
        }

        if (!title || !from_date || !to_date) {
            return res.status(400).json({ message: "Title, from_date and to_date are required" });
        }

        // Create event first, get the event_id
        const [result] = await db.query(
         `INSERT INTO events 
          (organizer_id, title, from_date, to_date, start_time, end_time, status, department_id, is_full_day)
          VALUES (?, ?, ?, ?, ?, ?, 'Approved', ?, 0)`,
          [req.user.id, title, from_date, to_date, start_time || null, end_time || null, req.user.department_id]
      );

        const event_id = result.insertId;  // ← declared immediately after INSERT

        const students = [];

        // Read CSV file
        fs.createReadStream(file.path)
            .pipe(csv())
            .on("data", (row) => {
                students.push(row);
            })
            .on("end", async () => {
                try {
                    let inserted = 0;

                    for (const student of students) {
                        // Look up student by college_id (what's in the CSV)
                        const [users] = await db.query(
                            "SELECT id FROM users WHERE college_id = ? AND role = 'student'",
                            [student.college_id]
                        );

                        if (users.length > 0) {
                            await db.query(
                                "INSERT IGNORE INTO event_participants (event_id, student_id) VALUES (?, ?)",
                                [event_id, users[0].id]
                            );
                            inserted++;
                        }
                    }

                    // Clean up temp file
                    fs.unlink(file.path, () => {});

                    res.json({
                        message: "Attendance uploaded successfully",
                        total_rows: students.length,
                        inserted: inserted
                    });

                } catch (err) {
                    res.status(500).json({ message: "Error inserting participants", error: err.message });
                }
            })
            .on("error", (err) => {
                res.status(500).json({ message: "Error reading CSV file", error: err.message });
            });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// Get all HODs (for organizer dropdown to select target HOD)
exports.getHodList = async (req, res) => {
    try {
        const [rows] = await db.query(
            `SELECT users.id, users.name, departments.name AS department_name
             FROM users
             JOIN departments ON users.department_id = departments.id
             WHERE users.role = 'hod' AND users.is_active = 1
             ORDER BY departments.name ASC`
        );
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: "Internal server error" });
    }
};


// Get all OD applications pending for this HOD
exports.getPendingODs = async (req, res) => {
    try {
        const hod_id = req.user.id;

        const [rows] = await db.query(
            `SELECT 
            oa.id,
            oa.applied_date,
            oa.status,
            u.name AS student_name,
            u.college_id,
            e.title AS event_title,
            e.from_date,
            e.to_date
            FROM od_applications oa
            JOIN users u ON oa.student_id = u.id
            JOIN events e ON oa.event_id = e.id
            WHERE oa.hod_id = ? AND oa.status = 'Pending'
            ORDER BY oa.id DESC`,
            [hod_id]
        );

        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: "Internal server error" });
    }
};


// HOD approves OD → triggers attendance automation
exports.approveOD = async (req, res) => {
    try {
        const hod_id = req.user.id;
        const { od_id } = req.body;

        // Verify this OD belongs to this HOD
        const [odRows] = await db.query(
            "SELECT * FROM od_applications WHERE id=? AND hod_id=?",
            [od_id, hod_id]
        );

        if (odRows.length === 0) {
            return res.status(404).json({ message: "OD not found or not yours to approve" });
        }

        const od = odRows[0];

        await db.query(
            "UPDATE od_applications SET status='HOD Approved' WHERE id=?",
            [od_id]
        );

        // Trigger attendance automation
        const attendanceService = require('../services/attendanceService');
        await attendanceService.markAttendanceForOD(od.student_id, od.event_id, od.applied_date);

        // Notify student
        const notificationService = require('../services/notificationService');
        const [eventRows] = await db.query("SELECT title FROM events WHERE id=?", [od.event_id]);
        notificationService.sendNotification(
            od.student_id,
            `Your OD for "${eventRows[0]?.title}" has been approved by HOD`
        );

        res.json({ message: "OD approved successfully" });
    } catch (err) {
        res.status(500).json({ error: "Internal server error" });
    }
};


// HOD rejects OD
exports.rejectOD = async (req, res) => {
    try {
        const hod_id = req.user.id;
        const { od_id } = req.body;

        const [odRows] = await db.query(
            "SELECT * FROM od_applications WHERE id=? AND hod_id=?",
            [od_id, hod_id]
        );

        if (odRows.length === 0) {
            return res.status(404).json({ message: "OD not found or not yours to reject" });
        }

        const od = odRows[0];

        await db.query(
            "UPDATE od_applications SET status='Rejected' WHERE id=?",
            [od_id]
        );

        // Notify student
        const notificationService = require('../services/notificationService');
        const [eventRows] = await db.query("SELECT title FROM events WHERE id=?", [od.event_id]);
        notificationService.sendNotification(
            od.student_id,
            `Your OD for "${eventRows[0]?.title}" has been rejected by HOD`
        );

        res.json({ message: "OD rejected" });
    } catch (err) {
        res.status(500).json({ error: "Internal server error" });
    }
};