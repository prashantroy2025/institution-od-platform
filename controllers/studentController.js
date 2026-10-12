const db = require('../config/db');
const attendanceService = require('../services/attendanceService');
const { isDateOnly, isPositiveInteger } = require('../utils/requestValidation');
const { EVENT_CATEGORIES } = require('../utils/eventCategories');

const categoryFilter = (value) => {
    if (value === undefined || value === '') return { ok: true, category: null };
    return EVENT_CATEGORIES.includes(value) ? { ok: true, category: value } : { ok: false };
};

// All approved events — student sees participation status
exports.getEvents = async (req, res) => {
    try {
        const student_id = req.user.id;
        const filter = categoryFilter(req.query.category);
        if (!filter.ok) return res.status(400).json({ message: "Unsupported event category" });

        const [rows] = await db.query(
    `SELECT
    e.id, e.title, e.category, e.from_date, e.to_date, e.start_time, e.end_time,
    u.name AS organizer_name,
    CASE WHEN p.student_id IS NOT NULL THEN 'Participated' ELSE 'Not Participated' END AS participation_status,
    (SELECT oa.status FROM od_applications oa WHERE oa.event_id = e.id AND oa.student_id = ? ORDER BY oa.id DESC LIMIT 1) AS od_status
    FROM events e
    LEFT JOIN event_participants p ON p.event_id = e.id AND p.student_id = ?
    LEFT JOIN users u ON u.id = e.organizer_id
    WHERE e.status = 'Approved' AND e.is_deleted = 0 AND (? IS NULL OR e.category = ?)
    ORDER BY e.from_date ASC`,
    [student_id, student_id, filter.category, filter.category]
);

        res.json(rows);
    } catch (err) {
        res.status(500).json({ message: "Server error" });
    }
};

exports.getEventDetails = async (req, res) => {
    try {
        const eventId = Number(req.params.id);
        if (!isPositiveInteger(eventId)) return res.status(400).json({ message: "Valid event ID required" });

        const [rows] = await db.query(
            `SELECT e.id, e.title, e.category, e.from_date, e.to_date, e.start_time, e.end_time,
                    u.name AS organizer_name,
                    CASE WHEN p.student_id IS NOT NULL THEN 'Participated' ELSE 'Not Participated' END AS participation_status,
                    (SELECT oa.status FROM od_applications oa WHERE oa.event_id = e.id AND oa.student_id = ? ORDER BY oa.id DESC LIMIT 1) AS od_status
             FROM events e
             LEFT JOIN users u ON u.id = e.organizer_id
             LEFT JOIN event_participants p ON p.event_id = e.id AND p.student_id = ?
             WHERE e.id = ? AND e.status = 'Approved' AND e.is_deleted = 0`,
            [req.user.id, req.user.id, eventId]
        );
        if (!rows.length) return res.status(404).json({ message: "Event not found" });
        res.json(rows[0]);
    } catch (err) {
        res.status(500).json({ message: "Unable to load event details" });
    }
};

// Search events by title — any event from any organizer
exports.searchEvents = async (req, res) => {
    try {
        const student_id = req.user.id;
        const keyword = req.query.q || "";
        const filter = categoryFilter(req.query.category);
        if (!filter.ok) return res.status(400).json({ message: "Unsupported event category" });

        const [rows] = await db.query(
            `SELECT
            e.id,
            e.title,
            e.category,
            e.from_date,
            e.to_date,
            e.start_time,
            e.end_time,
            u.name AS organizer_name,
            CASE 
            WHEN ep.student_id IS NULL THEN 'Not Participated'
            ELSE 'Participated'
            END AS participation_status,
            (SELECT oa.status FROM od_applications oa WHERE oa.event_id = e.id AND oa.student_id = ? ORDER BY oa.id DESC LIMIT 1) AS od_status
            FROM events e
            LEFT JOIN event_participants ep ON e.id = ep.event_id AND ep.student_id = ?
            LEFT JOIN users u ON e.organizer_id = u.id
            WHERE e.status = 'Approved' AND e.is_deleted = 0
            AND e.title LIKE ?
            AND (? IS NULL OR e.category = ?)
            ORDER BY e.from_date DESC`,
            [student_id, student_id, `%${keyword}%`, filter.category, filter.category]
        );

        res.json(rows);
    } catch (err) {
        res.status(500).json({ message: "Server error" });
    }
};


// Apply OD — checks participant list, sends to correct HOD
exports.applyOD = async (req, res) => {
    try {
        const { event_id, applied_date } = req.body;
        const student_id = req.user.id;

        if (!isPositiveInteger(event_id) || !isDateOnly(applied_date)) {
            return res.status(400).json({ message: "Valid event_id and applied_date (YYYY-MM-DD) are required" });
        }

        const [eventRows] = await db.query(
            "SELECT id, title, DATE_FORMAT(from_date, '%Y-%m-%d') AS from_date, DATE_FORMAT(to_date, '%Y-%m-%d') AS to_date, target_hod_id, department_id FROM events WHERE id=? AND status='Approved' AND is_deleted=0",
            [event_id]
        );
        if (!eventRows.length) return res.status(404).json({ message: "Approved event not found" });
        const event = eventRows[0];
        if (applied_date < String(event.from_date).slice(0, 10) || applied_date > String(event.to_date).slice(0, 10)) {
            return res.status(400).json({ message: "OD date must fall within the event dates" });
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
            return res.status(403).json({ message: "Only recorded event participants may request OD" });
        }

        // Determine which HOD to send OD to

        let hod_id = null;
        if (event.target_hod_id) {
            const [assignedHods] = await db.query(
                "SELECT id FROM users WHERE id=? AND role='hod' AND department_id=? AND is_active=1",
                [event.target_hod_id, event.department_id]
            );
            hod_id = assignedHods[0]?.id || null;
        }
        if (!hod_id) {
            const [hodRows] = await db.query(
                "SELECT id FROM users WHERE role='hod' AND department_id=? AND is_active=1 ORDER BY id LIMIT 1",
                [event.department_id]
            );
            hod_id = hodRows[0]?.id || null;
        }
        if (!hod_id) return res.status(409).json({ message: "No active HOD is assigned to this event department" });

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
        res.status(500).json({ message: "Server error" });
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
        console.error("Student OD history error:", err);
        res.status(500).json({ message: "Internal server error" });
    }
};
