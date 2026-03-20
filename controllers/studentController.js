const db = require('../config/db');
const attendanceService = require('../services/attendanceService');

// All approved events — student sees participation status
exports.getEvents = async (req, res) => {
    try {
        const student_id = req.user.id;

        const [rows] = await db.query(
    `SELECT 
    e.id, e.title, e.from_date, e.to_date,
    CASE 
    WHEN ep.student_id IS NULL THEN 'Not Participated'
    ELSE 'Participated'
    END AS participation_status,
    oa.status AS od_status
    FROM events e
    LEFT JOIN event_participants ep ON e.id = ep.event_id AND ep.student_id = ?
    LEFT JOIN od_applications oa ON oa.event_id = e.id AND oa.student_id = ?
    WHERE e.status = 'Approved' AND e.is_deleted = 0
    ORDER BY e.from_date DESC`,
    [student_id, student_id]
);

        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};


// Search events by title — any event from any organizer
exports.searchEvents = async (req, res) => {
    try {
        const student_id = req.user.id;
        const keyword = req.query.q || "";

        const [rows] = await db.query(
            `SELECT 
            e.id,
            e.title,
            e.from_date,
            e.to_date,
            u.name AS organizer_name,
            CASE 
            WHEN ep.student_id IS NULL THEN 'Not Participated'
            ELSE 'Participated'
            END AS participation_status,
            CASE
            WHEN oa.id IS NULL THEN NULL
            ELSE oa.status
            END AS od_status
            FROM events e
            LEFT JOIN event_participants ep ON e.id = ep.event_id AND ep.student_id = ?
            LEFT JOIN users u ON e.organizer_id = u.id
            LEFT JOIN od_applications oa ON oa.event_id = e.id AND oa.student_id = ?
            WHERE e.status = 'Approved' AND e.is_deleted = 0
            AND e.title LIKE ?
            ORDER BY e.from_date DESC`,
            [student_id, student_id, `%${keyword}%`]
        );

        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};


// Apply OD — checks participant list, sends to correct HOD
exports.applyOD = async (req, res) => {
    try {
        const { event_id, applied_date } = req.body;
        const student_id = req.user.id;

        if (!event_id || !applied_date) {
            return res.status(400).json({ message: "Missing required fields" });
        }

        // Check if already applied
        const [existing] = await db.query(
            "SELECT id, status FROM od_applications WHERE student_id=? AND event_id=?",
            [student_id, event_id]
        );

        if (existing.length > 0) {
            return res.json({ message: "OD already applied", status: existing[0].status });
        }

        // Check if student is in participant list
        const [rows] = await db.query(
            "SELECT * FROM event_participants WHERE event_id=? AND student_id=?",
            [event_id, student_id]
        );

        if (rows.length === 0) {
            // Not a participant — Reject immediately
            await db.query(
                "INSERT INTO od_applications (student_id, event_id, applied_date, status) VALUES (?,?,?,?)",
                [student_id, event_id, applied_date, "Rejected"]
            );
            return res.json({ message: "OD Rejected — you are not in the participant list" });
        }

        // Get the target HOD for this event
        const [eventRows] = await db.query(
            "SELECT target_hod_id, department_id, title FROM events WHERE id=?",
            [event_id]
        );

        if (eventRows.length === 0) {
            return res.status(404).json({ message: "Event not found" });
        }

        const event = eventRows[0];

        // Determine which HOD to send OD to
        let hod_id = event.target_hod_id;

        if (!hod_id) {
            // Fallback: find HOD by student's department
            const [hodRows] = await db.query(
                "SELECT id FROM users WHERE role='hod' AND department_id=? AND is_active=1 LIMIT 1",
                [req.user.department_id]
            );
            if (hodRows.length > 0) hod_id = hodRows[0].id;
        }

        // Insert OD as Pending — HOD must approve
        const [result] = await db.query(
            "INSERT INTO od_applications (student_id, event_id, applied_date, status, hod_id) VALUES (?,?,?,?,?)",
            [student_id, event_id, applied_date, "Pending", hod_id]
        );

        // Notify HOD
        if (hod_id) {
            const notificationService = require('../services/notificationService');
            const [stuRows] = await db.query("SELECT name FROM users WHERE id=?", [student_id]);
            const stuName = stuRows[0]?.name || "A student";
            notificationService.sendNotification(
                hod_id,
                `OD request from ${stuName} for event: ${event.title}`
            );
        }

        res.json({
            message: "OD application submitted — waiting for HOD approval",
            od_id: result.insertId
        });

    } catch (err) {
        console.error("OD Apply Error:", err);
        res.status(500).json({ error: err.message });
    }
};


// My OD applications — only show Approved ones on dashboard, all in history
exports.getMyOD = async (req, res) => {
    try {
        const student_id = req.user.id;
        const filter = req.query.filter; // "approved" for dashboard, empty for all

        let statusFilter = "";
        if (filter === "approved") {
            statusFilter = "AND o.status IN ('Auto Approved', 'HOD Approved')";
        }

        const [rows] = await db.query(
            `SELECT 
            e.title,
            e.from_date,
            e.to_date,
            o.applied_date,
            o.status,
            o.id AS od_id
            FROM od_applications o
            JOIN events e ON o.event_id = e.id
            WHERE o.student_id = ? ${statusFilter}
            ORDER BY o.id DESC`,
            [student_id]
        );

        res.json(rows);
    } catch (err) {
        res.status(500).json(err);
    }
};