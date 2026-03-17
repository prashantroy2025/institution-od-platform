const db = require('../config/db');
const attendanceService = require('../services/attendanceService');

exports.applyOD = async (req, res) => {

    try{

    console.log("OD Controller reached");
    const { event_id, applied_date } = req.body;
    const student_id = req.user.id;

    const [result] = await db.query(
        "INSERT INTO od_applications (student_id, event_id, applied_date, status) VALUES (?, ?, ?, ?)",
        [student_id, event_id, applied_date, "Auto Approved"]
    );

    // Attendance automation
    attendanceService.markAttendanceForOD(
        student_id,
        event_id,
        applied_date
    );

    res.json({
        message: "OD applied successfully",
        od_id: result.insertId
    });

    }catch(err){
        res.status(500).json({ error: err.message });
    }
};