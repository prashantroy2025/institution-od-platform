const db = require('../config/db');


// ------------------ EVENT ANALYTICS ------------------

exports.getEventAnalytics = (req, res) => {

    const event_id = req.params.event_id;

    const query = `
        SELECT
            (SELECT COUNT(*) FROM event_participants WHERE event_id = ?) AS participants,
            (SELECT COUNT(*) FROM od_applications WHERE event_id = ?) AS od_requests,
            (SELECT COUNT(*) FROM attendance a
                JOIN od_applications o ON a.student_id = o.student_id
                WHERE o.event_id = ? AND a.status = 'OD'
            ) AS attendance_marked
    `;

    db.query(query, [event_id, event_id, event_id], (err, rows) => {

        if (err) {
            return res.status(500).json({ error: err.message });
        }

        res.json(rows[0]);

    });

};


// ------------------ SYSTEM STATS ------------------

exports.getSystemStats = (req, res) => {

    const query = `
        SELECT
            (SELECT COUNT(*) FROM events) AS total_events,
            (SELECT COUNT(*) FROM event_participants) AS total_participants,
            (SELECT COUNT(*) FROM od_applications) AS total_od_requests,
            (SELECT COUNT(*) FROM users WHERE role='student') AS total_students
    `;

    db.query(query, (err, rows) => {

        if (err) {
            return res.status(500).json({ error: err.message });
        }

        res.json(rows[0]);

    });

};