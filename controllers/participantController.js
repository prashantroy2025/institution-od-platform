const fs = require('fs');
const csv = require('csv-parser');
const db = require('../config/db');

exports.uploadParticipants = (req, res) => {

    const { event_id } = req.body;

    if (!req.file) {
        return res.status(400).json({ message: "CSV file required" });
    }

    if (!event_id) {
        return res.status(400).json({ message: "event_id required" });
    }

    const results = [];

    fs.createReadStream(req.file.path)
        .pipe(csv())
        .on('data', (data) => results.push(data))
        .on('end', () => {

            let inserted = 0;

            results.forEach(row => {

                db.query(
                    "SELECT id FROM users WHERE college_id=? AND role='student'",
                    [row.college_id],
                    (err, users) => {

                        if (err) {
                            console.error(err);
                            return;
                        }

                        if (users.length > 0) {

                            db.query(
                                "INSERT INTO event_participants (event_id, student_id) VALUES (?, ?)",
                                [event_id, users[0].id],
                                (err) => {
                                    if (!err) inserted++;
                                }
                            );

                        }

                    }
                );

            });

            setTimeout(() => {
                res.json({
                    message: "Participants uploaded successfully",
                    total_rows: results.length,
                    inserted: inserted
                });
            }, 1000);

        });
};