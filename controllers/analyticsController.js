const db = require('../config/db');


// ------------------ EVENT ANALYTICS ------------------

exports.getEventAnalytics = (req,res)=>{

const eventId = req.params.eventId

db.query(
`SELECT 
COUNT(*) as total,
MIN(scan_time) as first_scan,
MAX(scan_time) as last_scan
FROM event_participants
WHERE event_id=?`,
[eventId],
(err,rows)=>{

if(err){
return res.status(500).json({error:err.message})
}

res.json(rows[0])

})

}
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