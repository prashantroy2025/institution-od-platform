const db = require('../config/db');
const { isPositiveInteger } = require('../utils/requestValidation');
const { getManagedEvent } = require('../utils/eventAuthorization');


// ------------------ EVENT ANALYTICS ------------------

exports.getEventAnalytics = async (req,res)=>{

try{

const eventId = req.params.event_id;

if (!isPositiveInteger(eventId)) {
    return res.status(400).json({ message: "Valid event ID required" });
}

const event = await getManagedEvent(db, req.user, eventId);
if (!event) {
    return res.status(404).json({ message: "Event not found or unauthorized" });
}

const [rows] = await db.query(
`SELECT 
COUNT(*) as total,
MIN(scan_time) as first_scan,
MAX(scan_time) as last_scan
FROM event_participants
WHERE event_id=?`,
[eventId]
);

res.json(rows[0]);

}catch(err){
console.error("Event analytics error:", err);
res.status(500).json({ message: "Server error" });
}

}


// ------------------ SYSTEM STATS ------------------

exports.getSystemStats = async (req, res) => {

try{

const query = `
    SELECT
        (SELECT COUNT(*) FROM events) AS total_events,
        (SELECT COUNT(*) FROM event_participants) AS total_participants,
        (SELECT COUNT(*) FROM od_applications) AS total_od_requests,
        (SELECT COUNT(*) FROM users WHERE role='student') AS total_students
`;

const [rows] = await db.query(query);

res.json(rows[0]);

}catch(err){
console.error("System analytics error:", err);
res.status(500).json({ message: "Server error" });
}

};