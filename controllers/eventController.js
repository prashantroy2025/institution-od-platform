const db = require('../config/db');
const notificationService = require('../services/notificationService');

/* ---------------- CREATE EVENT ---------------- */

exports.createEvent = (req, res) => {

let {
club_id,
title,
from_date,
to_date,
start_time,
end_time,
is_full_day
} = req.body;

const department_id = req.user.department_id;

if (!club_id || !title || !from_date || !to_date) {
return res.status(400).json({ message: "Missing required fields" });
}

if (new Date(to_date) < new Date(from_date)) {
return res.status(400).json({
message: "To date cannot be earlier than from date"
});
}

if (start_time && end_time && start_time > end_time) {
return res.status(400).json({
message: "End time must be after start time"
});
}

if (is_full_day) {
start_time = null;
end_time = null;
}

const proof_file = req.file ? req.file.filename : null;

db.query(
`INSERT INTO events 
(club_id, organizer_id, title, department_id, from_date, to_date, start_time, end_time, is_full_day, proof_file, status)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending')`,
[
club_id,
req.user.id,
title,
department_id,
from_date,
to_date,
start_time,
end_time,
is_full_day || 0,
proof_file
],
(err, result) => {

if (err) {
return res.status(500).json({ error: err.message });
}

const eventId = result.insertId;

/* Notify HOD */

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

/* Audit Log */

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

/* ---------------- GET PENDING EVENTS ---------------- */

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

/* ---------------- APPROVE EVENT ---------------- */

exports.approveEvent = (req, res) => {

const { event_id } = req.body;

db.query(
"UPDATE events SET status='Approved' WHERE id=? AND department_id=?",
[event_id, req.user.department_id],
(err, result) => {

if (result.affectedRows === 0) {
return res.status(404).json({
message: "Event not found or unauthorized"
});
}

res.json({
message: "Event approved successfully"
});

}
);

};

/* ---------------- REJECT EVENT ---------------- */

exports.rejectEvent = (req, res) => {

const { event_id } = req.body;

db.query(
"UPDATE events SET status='Rejected' WHERE id=? AND department_id=?",
[event_id, req.user.department_id],
(err, result) => {

if (result.affectedRows === 0) {
return res.status(404).json({
message: "Event not found or unauthorized"
});
}

res.json({
message: "Event rejected"
});

}
);

};

/* ---------------- MY EVENTS ---------------- */

exports.getMyEvents = (req, res) => {

const organizer_id = req.user.id;

db.query(
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
[organizer_id],
(err, rows) => {

if (err) {
return res.status(500).json({ error: err.message });
}

res.json(rows);

}
);

};

/* ---------------- FIND EVENT ---------------- */

exports.findEventByName = (req, res) => {

const title = req.query.title;

db.query(
"SELECT id,title FROM events WHERE LOWER(title) LIKE LOWER(?) LIMIT 1",
["%" + title + "%"],
(err, rows) => {

if (err) return res.status(500).json(err);

if (rows.length === 0) {
return res.json({ message: "Not found" });
}

res.json(rows[0]);

}
);

};

/* ---------------- DELETE EVENT ---------------- */

exports.deleteEvent = (req, res) => {

const eventId = req.params.id;

db.query(
"UPDATE events SET is_deleted=1 WHERE id=? AND organizer_id=?",
[eventId, req.user.id],
(err) => {

if (err) {
return res.status(500).json({ error: err.message });
}

/* History */

db.query(
"INSERT INTO audit_logs (user_id,action,entity,entity_id) VALUES (?,?,?,?)",
[req.user.id, "DELETE_EVENT", "events", eventId]
);

res.json({
message: "Event deleted successfully"
});

}
);

};

/* ---------------- HISTORY ---------------- */

exports.getHistory = (req, res) => {

db.query(
`SELECT a.action,a.entity,a.entity_id,a.created_at,
u.name,
e.title
FROM audit_logs a
LEFT JOIN users u ON a.user_id=u.id
LEFT JOIN events e ON a.entity_id=e.id
ORDER BY a.created_at DESC`,
(err, rows) => {

if (err) {
return res.status(500).json(err);
}

res.json(rows);

}
);

};

/* ---------------- RECOVER EVENT ---------------- */

exports.recoverEvent = (req, res) => {

const eventId = req.params.id;

db.query(
"UPDATE events SET is_deleted=0 WHERE id=?",
[eventId],
(err) => {

if (err) {
return res.status(500).json({ error: err.message });
}

db.query(
"INSERT INTO audit_logs (user_id,action,entity,entity_id) VALUES (?,?,?,?)",
[req.user.id, "RECOVER_EVENT", "events", eventId]
);

res.json({
message: "Event recovered successfully"
});

}
);

};