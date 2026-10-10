const qrService = require('../services/qrService');
const db = require('../config/db');
const { isPositiveInteger, isQRToken } = require('../utils/requestValidation');
const { getManagedEvent } = require('../utils/eventAuthorization');


// ------------------ GENERATE QR ------------------

exports.getQR = async (req, res) => {
    try {
        const { event_id } = req.body;

        if (!isPositiveInteger(event_id)) {
            return res.status(400).json({
                message: "Event ID required"
            });
        }

        if (!await getManagedEvent(db, req.user, event_id)) {
            return res.status(404).json({ message: "Event not found or unauthorized" });
        }

        const token = await qrService.generateQRToken(event_id);

        if (!token) {
            return res.status(500).json({
                message: "QR token generation failed"
            });
        }

        const qrUrl = `${req.protocol}://${req.get("host")}/scan.html?token=${token}`;

        res.json({
            qr_data: qrUrl
        });

    } catch (err) {
        console.error("QR ERROR:", err);
        res.status(500).json({ message: "Server error" });
    }
};



// ------------------ SCAN QR ------------------

exports.scanQR = async (req, res) => {

    try {

        const { token } = req.body;
        const student_id = req.user.id;
        const ip_address = req.ip;

        if (!isQRToken(token)) {
            return res.status(400).json({ message: "Valid QR token required" });
        }

        const tokenRow = await qrService.validateQRToken(token);

        if (!tokenRow) {
            return res.status(400).json({
                message: "QR code expired or invalid"
            });
        }

        const event_id = tokenRow.event_id;

        const [eventRows] = await db.query(
            "SELECT attendance_active FROM events WHERE id=?",
            [event_id]
        );

        if (eventRows.length === 0) {
            return res.status(404).json({
                message: "Event not found"
            });
        }

        if (!eventRows[0].attendance_active) {
            return res.status(400).json({
                message: "Attendance closed"
            });
        }

        const [result] = await db.query(
            "INSERT IGNORE INTO event_participants (event_id, student_id, ip_address) VALUES (?, ?, ?)",
            [event_id, student_id, ip_address]
        );

        if (result.affectedRows === 0) {
            return res.json({
                message: "Attendance already recorded"
            });
        }

        const io = req.app.get("io");

       // get student details
       const [userRows] = await db.query(
       "SELECT name, college_id FROM users WHERE id=?",
        [student_id]
        );

        const student = userRows[0];

        io.emit("attendance_update", {
         event_id,
         student_id: student_id,
         college_id: student.college_id,
         name: student.name
        });

        res.json({
            message: "Attendance recorded successfully"
        });

    } catch (err) {
        console.error("❌ SCAN ERROR:", err);
        res.status(500).json({ message: "Server error" });
    }

};

// ------------------ START ATTENDANCE ------------------



exports.startAttendance = async (req, res) => {

    try{

    const { event_id } = req.body;

    if (!isPositiveInteger(event_id)) {
        return res.status(400).json({ message: "Valid event ID required" });
    }

    if (!await getManagedEvent(db, req.user, event_id)) {
        return res.status(404).json({ message: "Event not found or unauthorized" });
    }

    await db.query(
        "UPDATE events SET attendance_active = 1 WHERE id = ?",
        [event_id]
    );

    res.json({
        message: "Attendance started"
    });

    }catch(err){
        res.status(500).json({ message: "Server error" });
    }

};



// ------------------ CLOSE ATTENDANCE ------------------

exports.closeAttendance = async (req, res) => {

    try{

    const { event_id } = req.body;

    if (!isPositiveInteger(event_id)) {
        return res.status(400).json({ message: "Valid event ID required" });
    }

    if (!await getManagedEvent(db, req.user, event_id)) {
        return res.status(404).json({ message: "Event not found or unauthorized" });
    }

    await db.query(
        "UPDATE events SET attendance_active = 0 WHERE id = ?",
        [event_id]
    );

    res.json({
        message: "Attendance closed"
    });

    }catch(err){
        res.status(500).json({ message: "Server error" });
    }

};



// ------------------ EVENT PARTICIPANT STATS ------------------

exports.getEventStats = async (req, res) => {

    try{

    const { event_id } = req.params;

    if (!isPositiveInteger(event_id)) {
        return res.status(400).json({ message: "Valid event ID required" });
    }

    if (!await getManagedEvent(db, req.user, event_id)) {
        return res.status(404).json({ message: "Event not found or unauthorized" });
    }

    const [rows] = await db.query(
        "SELECT COUNT(*) AS total FROM event_participants WHERE event_id=?",
        [event_id]
    );

    res.json({
        participants: rows[0].total
    });

    }catch(err){
        res.status(500).json({ message: "Server error" });
    }

};