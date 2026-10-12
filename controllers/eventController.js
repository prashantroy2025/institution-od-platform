const db = require('../config/db');
const notificationService = require('../services/notificationService');
const { isPositiveInteger } = require('../utils/requestValidation');
const { EVENT_CATEGORIES } = require('../utils/eventCategories');

/* ---------------- CREATE EVENT ---------------- */

exports.createEvent = async (req, res) => {

try{

if (!req.user) {
 return res.status(401).json({ message: "Unauthorized" });
}

let {
title,
from_date,
to_date,
start_time,
end_time,
is_full_day,
target_hod_id,
category
} = req.body;


const department_id = req.user.department_id;

if (!title || !from_date || !to_date) {
return res.status(400).json({ message: "Missing required fields" });
}

if (category && !EVENT_CATEGORIES.includes(category)) {
return res.status(400).json({ message: "Unsupported event category" });
}

if (new Date(to_date) < new Date(from_date)) {
return res.status(400).json({
message: "To date cannot be earlier than from date"
});
}

if (
start_time &&
end_time &&
new Date(`1970-01-01T${start_time}`) > new Date(`1970-01-01T${end_time}`)
) {
return res.status(400).json({
message: "End time must be after start time"
});
}

if (is_full_day) {
start_time = null;
end_time = null;
}

const proof_file = req.file ? req.file.filename : null;

const [clubRows] = await db.query(
    `SELECT id FROM clubs
     WHERE department_id = ?
       AND (organizer_id = ? OR organizer_id IS NULL)
     ORDER BY organizer_id IS NULL, id
     LIMIT 1`,
    [department_id, req.user.id]
);

const club_id = clubRows[0]?.id || null;

if (!club_id) {
    return res.status(400).json({ message: "No club configured for organizer department" });
}

if (target_hod_id) {
    const [hodRows] = await db.query(
        "SELECT id FROM users WHERE id=? AND role='hod' AND is_active=1 AND department_id=?",
        [target_hod_id, department_id]
    );
    if (!hodRows.length) return res.status(400).json({ message: "Target must be an active HOD in the event department" });
}

const [result] = await db.query(
`INSERT INTO events
    (club_id, organizer_id, title, category, department_id, from_date, to_date, start_time, end_time, is_full_day, proof_file, status, target_hod_id)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
[
    club_id,
req.user.id,
title,
category || null,
department_id,
from_date,
to_date,
start_time,
end_time,
is_full_day || 0,
proof_file,
"Pending",
    target_hod_id || null
]
);

const eventId = result.insertId;


/* Notify HOD */

/* Notify HOD — use target_hod_id if provided, else fallback to department HOD */
let notify_hod_id = null;

if (target_hod_id) {
    notify_hod_id = target_hod_id;
} else {
    const [hodRows] = await db.query(
        "SELECT id FROM users WHERE role='hod' AND department_id=? LIMIT 1",
        [department_id]
    );
    if (hodRows.length > 0) {
        notify_hod_id = hodRows[0].id;
    }
}

if (notify_hod_id) {
    notificationService.sendNotification(
        notify_hod_id,
        "New event requires approval: " + title
    );
}

/* Audit Log */

await db.query(
"INSERT INTO audit_logs (user_id, action, entity, entity_id) VALUES (?, ?, ?, ?)",
[req.user.id, "CREATE_EVENT", "events", eventId]
);

res.json({
message: "Event created successfully",
event_id: eventId
});

}catch(err){
console.error("DB ERROR:", err);
res.status(500).json({ message: "Internal server error" });
}

};


/* ---------------- GET PENDING EVENTS ---------------- */

exports.getPendingEvents = async (req, res) => {
    try {
        const department_id = req.user.department_id;
        const hod_id = req.user.id;
        const [rows] = await db.query(
            `SELECT * FROM events WHERE status='Pending'
             AND (target_hod_id = ? OR (target_hod_id IS NULL AND department_id = ?))`,
            [hod_id, department_id]
        );
        res.json(rows);
    } catch(err) {
        console.error("Pending event query error:", err);
        res.status(500).json({ message: "Internal server error" });
    }
};


/* ---------------- APPROVE EVENT ---------------- */

exports.approveEvent = async (req, res) => {

try{

const { event_id } = req.body;

const [result] = await db.query(
  "UPDATE events SET status='Approved' WHERE id=? AND status='Pending' AND (target_hod_id=? OR (target_hod_id IS NULL AND department_id=?))",
  [event_id, req.user.id, req.user.department_id]
);

if (result.affectedRows === 0) {
return res.status(404).json({
message: "Event not found or unauthorized"
});
}

res.json({
message: "Event approved successfully"
});

}catch(err){
console.error("DB ERROR:", err);
res.status(500).json({ message: "Internal server error" });
}

};


/* ---------------- REJECT EVENT ---------------- */

exports.rejectEvent = async (req, res) => {

try{

const { event_id } = req.body;

const [result] = await db.query(
  "UPDATE events SET status='Rejected' WHERE id=? AND status='Pending' AND (target_hod_id=? OR (target_hod_id IS NULL AND department_id=?))",
  [event_id, req.user.id, req.user.department_id]
);

if (result.affectedRows === 0) {
return res.status(404).json({
message: "Event not found or unauthorized"
});
}

res.json({
message: "Event rejected"
});

}catch(err){
console.error("DB ERROR:", err);
res.status(500).json({ message: "Internal server error" });
}

};


/* ---------------- MY EVENTS ---------------- */

exports.getMyEvents = async (req, res) => {

try{

const organizer_id = req.user.id;

const [rows] = await db.query(
`SELECT id,title,from_date,to_date,start_time,end_time,status
FROM events
WHERE organizer_id=? AND is_deleted=0
ORDER BY 
CASE
WHEN status='Pending' THEN 1
WHEN status='Approved' THEN 2
WHEN status='Rejected' THEN 3
END,
created_at DESC`,
[organizer_id]
);

res.json(rows);

}catch(err){
console.error("DB ERROR:", err);
res.status(500).json({ message: "Internal server error" });
}

};


/* ---------------- FIND EVENT ---------------- */

exports.findEventByName = async (req, res) => {

try{

const title = req.query.title;

const [rows] = await db.query(
"SELECT id,title FROM events WHERE LOWER(title) LIKE LOWER(?) LIMIT 1",
["%" + title + "%"]
);

if (rows.length === 0) {
return res.json({ message: "Not found" });
}

res.json(rows[0]);

} catch(err) {
  console.error(err);
  res.status(500).json({ message: "Internal server error" });
}

};


/* ---------------- DELETE EVENT ---------------- */

exports.deleteEvent = async (req, res) => {

try{

const eventId = req.params.id;

const [result] = await db.query(
    "UPDATE events SET is_deleted=1 WHERE id=? AND organizer_id=?",
    [eventId, req.user.id]
);

if (result.affectedRows === 0) {
    return res.status(404).json({ message: "Event not found or unauthorized" });
}

/* History */

await db.query(
"INSERT INTO audit_logs (user_id,action,entity,entity_id) VALUES (?,?,?,?)",
[req.user.id, "DELETE_EVENT", "events", eventId]
);

res.json({
message: "Event deleted successfully"
});

}catch(err){
console.error("DB ERROR:", err);
res.status(500).json({ message: "Internal server error" });
}

};


/* ---------------- HISTORY ---------------- */

exports.getHistory = async (req, res) => {

try{

const limit = Math.min(parseInt(req.query.limit) || 100, 500);
const offset = parseInt(req.query.offset) || 0;

const [rows] = await db.query(
  `SELECT a.action, a.entity, a.entity_id, a.created_at,
   u.name, e.title
   FROM audit_logs a
   JOIN events e ON a.entity = 'events' AND a.entity_id = e.id
   LEFT JOIN users u ON a.user_id = u.id
   WHERE e.organizer_id = ?
   ORDER BY a.created_at DESC
   LIMIT ? OFFSET ?`,
  [req.user.id, limit, offset]
);

res.json(rows);

} catch(err) {
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
}

};


/* ---------------- RECOVER EVENT ---------------- */

exports.recoverEvent = async (req, res) => {

try{

const eventId = req.params.id;

    const [result] = await db.query(
    "UPDATE events SET is_deleted=0 WHERE id=? AND organizer_id=?",
    [eventId, req.user.id]
);

    if (result.affectedRows === 0) {
        return res.status(404).json({ message: "Event not found or unauthorized" });
    }

await db.query(
"INSERT INTO audit_logs (user_id,action,entity,entity_id) VALUES (?,?,?,?)",
[req.user.id, "RECOVER_EVENT", "events", eventId]
);

res.json({
message: "Event recovered successfully"
});

}catch(err){
console.error("DB ERROR:", err);
res.status(500).json({ message: "Internal server error" });
}

};

/* ---------------- SET TARGET HOD ---------------- */
exports.setTargetHod = async (req, res) => {
    try {
        const { event_id, target_hod_id } = req.body;

        if (!isPositiveInteger(event_id) || !isPositiveInteger(target_hod_id)) {
            return res.status(400).json({ message: "Valid event_id and target_hod_id required" });
        }

        const [events] = await db.query(
            "SELECT id, department_id FROM events WHERE id=? AND organizer_id=? AND is_deleted=0",
            [event_id, req.user.id]
        );
        if (!events.length) return res.status(404).json({ message: "Event not found" });

        const [hods] = await db.query(
            "SELECT id FROM users WHERE id=? AND role='hod' AND is_active=1 AND department_id=?",
            [target_hod_id, events[0].department_id]
        );
        if (!hods.length) return res.status(400).json({ message: "Target must be an active HOD in the event department" });

        await db.query(
            "UPDATE events SET target_hod_id=? WHERE id=? AND organizer_id=? AND is_deleted=0",
            [target_hod_id, event_id, req.user.id]
        );

        res.json({ message: "Target HOD updated" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Internal server error" });
    }
};
