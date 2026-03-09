const db = require('../config/db');
const notificationService = require('../services/notificationService');

exports.createEvent = (req, res) => {

    const { club_id, title, department_id, from_date, to_date, is_full_day } = req.body;

    if (!club_id || !title || !department_id || !from_date || !to_date) {
        return res.status(400).json({ message: "Missing required fields" });
    }

    const proof_file = req.file ? req.file.filename : null;

    db.query(
    `INSERT INTO events 
    (club_id, title, department_id, from_date, to_date, is_full_day, proof_file, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'Pending')`,
    [club_id, title, department_id, from_date, to_date, is_full_day || 0, proof_file],
        (err, result) => {

            if (err) {
                return res.status(500).json({ error: err.message });
            }

            const eventId = result.insertId;

            // 🔔 Notify HOD
            db.query(
                "SELECT id FROM users WHERE role='hod' AND department_id=? LIMIT 1",
                [department_id],
                (err, hodRows) => {

                    if (!err && hodRows.length > 0) {

                        const hod_id = hodRows[0].id;

                        notificationService.sendNotification(
                            hod_id,
                            "New event requires approval: " + title
                        );

                    }

                }
            );

            // 🔹 Audit Log
            db.query(
                "INSERT INTO audit_logs (user_id, action, entity, entity_id) VALUES (?, ?, ?, ?)",
                [req.user.id, "CREATE_EVENT", "events", eventId]
            );

            res.json({
                message: "Event created successfully",
                event_id: eventId
            });

        }
    );
};
exports.getPendingEvents = (req, res) => {

    const department_id = req.user.department_id;

    db.query(
        "SELECT * FROM events WHERE status='Pending' AND department_id=?",
        [department_id],
        (err, rows) => {

            if (err) {
                return res.status(500).json({ error: err.message });
            }

            res.json(rows);
        }
    );

};
exports.approveEvent = (req, res) => {

    const { event_id } = req.body;

    db.query(
    "UPDATE events SET status='Approved' WHERE id=? AND department_id=?",
    [event_id, req.user.department_id],
        (err, result) => {

            if (err) {
                return res.status(500).json({ error: err.message });
            }

            res.json({
                message: "Event approved successfully"
            });

        }
    );

};
exports.rejectEvent = (req, res) => {

    const { event_id } = req.body;

    db.query(
        "UPDATE events SET status='Rejected' WHERE id=? AND department_id=?",
        [event_id, req.user.department_id],
        (err, result) => {

            if (err) {
                return res.status(500).json({ error: err.message });
            }

            res.json({
                message: "Event rejected"
            });

        }
    );

};