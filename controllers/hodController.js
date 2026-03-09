const db = require('../config/db');


// Get pending events for HOD department
exports.getPendingEvents = (req, res) => {

    const department_id = req.user.department_id;

    db.query(
        "SELECT * FROM events WHERE department_id = ? AND status = 'Pending'",
        [department_id],
        (err, results) => {

            if (err) return res.status(500).json({ error: err.message });

            res.json(results);
        }
    );
};


// Approve event
exports.approveEvent = (req, res) => {

    const { event_id } = req.body;

    db.query(
        "UPDATE events SET status='Approved' WHERE id=?",
        [event_id],
        (err, result) => {

            if (err) return res.status(500).json({ error: err.message });

            res.json({ message: "Event Approved" });
        }
    );
};


// Reject event
exports.rejectEvent = (req, res) => {

    const { event_id } = req.body;

    db.query(
        "UPDATE events SET status='Rejected' WHERE id=?",
        [event_id],
        (err, result) => {

            if (err) return res.status(500).json({ error: err.message });

            res.json({ message: "Event Rejected" });
        }
    );
};