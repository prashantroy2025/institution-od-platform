const qrService = require('../services/qrService');
const db = require('../config/db');


// ------------------ GENERATE QR ------------------

exports.getQR = (req, res) => {

    const { event_id } = req.body;

    qrService.generateQRToken(event_id, (err, token) => {

        if (err) {
            return res.status(500).json({ error: err.message });
        }

        const qrUrl = `http://192.168.0.116:3000/scan.html?token=${token}`;

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

    qrService.validateQRToken(token, (err, tokenRow) => {

        if (err) {
            return res.status(500).json({ error: err.message });
        }

        if (!tokenRow) {
            return res.status(400).json({
                message: "QR code expired. Scan again."
            });
        }

        const event_id = tokenRow.event_id;

        // Check event attendance status
        db.query(
            "SELECT attendance_active FROM events WHERE id=?",
            [event_id],
            (err, eventRows) => {

                if (err) {
                    return res.status(500).json({ error: err.message });
                }

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

                // Insert attendance safely
                db.query(
                    "INSERT IGNORE INTO event_participants (event_id, student_id, ip_address) VALUES (?, ?, ?)",
                    [event_id, student_id, ip_address],
                    (err, result) => {

                        if (err) {
                            return res.status(500).json({ error: err.message });
                        }

                        if (result.affectedRows === 0) {
                            return res.json({
                                message: "Attendance already recorded"
                            });
                        }

                        // Emit live update
                        const io = req.app.get("io");

                        io.emit("attendance_update", {
                            event_id: event_id,
                            student_id: student_id
                        });

                        res.json({
                            message: "Attendance recorded successfully"
                        });

                    }
                );

            }
        );

    });

};



// ------------------ START ATTENDANCE ------------------

exports.startAttendance = (req, res) => {

    const { event_id } = req.body;

    db.query(
        "UPDATE events SET attendance_active = 1 WHERE id = ?",
        [event_id],
        (err) => {

            if (err) {
                return res.status(500).json({ error: err.message });
            }

            res.json({
                message: "Attendance started"
            });

        }
    );

};



// ------------------ CLOSE ATTENDANCE ------------------

exports.closeAttendance = (req, res) => {

    const { event_id } = req.body;

    db.query(
        "UPDATE events SET attendance_active = 0 WHERE id = ?",
        [event_id],
        (err) => {

            if (err) {
                return res.status(500).json({ error: err.message });
            }

            res.json({
                message: "Attendance closed"
            });

        }
    );

};



// ------------------ EVENT PARTICIPANT STATS ------------------

exports.getEventStats = (req, res) => {

    const { event_id } = req.params;

    db.query(
        "SELECT COUNT(*) AS total FROM event_participants WHERE event_id=?",
        [event_id],
        (err, rows) => {

            if (err) {
                return res.status(500).json({ error: err.message });
            }

            res.json({
                participants: rows[0].total
            });

        }
    );

};