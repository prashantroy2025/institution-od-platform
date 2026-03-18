const qrService = require('../services/qrService');
const db = require('../config/db');


// ------------------ GENERATE QR ------------------

exports.getQR = (req, res) => {

const { event_id } = req.body;

if(!event_id){
return res.status(400).json({
message:"Event ID required"
});
}

qrService.generateQRToken(event_id,(err,token)=>{

if(err){
return res.status(500).json({error:err.message});
}

if(!token){
return res.status(500).json({
message:"QR token generation failed"
});
}

const qrUrl = `${req.protocol}://${req.get("host")}/scan.html?token=${token}`;

res.json({
qr_data: qrUrl
});

});

};



// ------------------ SCAN QR ------------------

exports.scanQR = (req, res) => {

    const { token } = req.body;
    const student_id = req.user.id;
    const ip_address = req.ip;

    qrService.validateQRToken(token, async (err, tokenRow) => {

        if (err) {
            return res.status(500).json({ error: err.message });
        }

        if (!tokenRow) {
            return res.status(400).json({
                message: "QR code expired. Scan again."
            });
        }

        const event_id = tokenRow.event_id;

        try{

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

        io.emit("attendance_update", {
            event_id: event_id,
            student_id: student_id
        });

        res.json({
            message: "Attendance recorded successfully"
        });

        }catch(err){
            res.status(500).json({ error: err.message });
        }

    });

};



// ------------------ START ATTENDANCE ------------------



exports.startAttendance = async (req, res) => {

console.log("📥 BODY:", req.body);
console.log("👤 USER:", req.user);

    try{

    const { event_id } = req.body;

    await db.query(
        "UPDATE events SET attendance_active = 1 WHERE id = ?",
        [event_id]
    );

    res.json({
        message: "Attendance started"
    });

    }catch(err){
        res.status(500).json({ error: err.message });
    }

};



// ------------------ CLOSE ATTENDANCE ------------------

exports.closeAttendance = async (req, res) => {

    try{

    const { event_id } = req.body;

    await db.query(
        "UPDATE events SET attendance_active = 0 WHERE id = ?",
        [event_id]
    );

    res.json({
        message: "Attendance closed"
    });

    }catch(err){
        res.status(500).json({ error: err.message });
    }

};



// ------------------ EVENT PARTICIPANT STATS ------------------

exports.getEventStats = async (req, res) => {

    try{

    const { event_id } = req.params;

    const [rows] = await db.query(
        "SELECT COUNT(*) AS total FROM event_participants WHERE event_id=?",
        [event_id]
    );

    res.json({
        participants: rows[0].total
    });

    }catch(err){
        res.status(500).json({ error: err.message });
    }

};