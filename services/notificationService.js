 const db = require('../config/db');

exports.sendNotification = (user_id, message) => {

    db.query(
        "INSERT INTO notifications (user_id, message) VALUES (?, ?)",
        [user_id, message],
        (err) => {
            if (err) {
                console.error("Notification error:", err);
            } else {
                console.log("Notification sent to user:", user_id);
            }
        }
    );

};