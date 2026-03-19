 const db = require('../config/db');

exports.sendNotification = async (user_id, message) => {
    try {
        await db.query(
            "INSERT INTO notifications (user_id, message) VALUES (?, ?)",
            [user_id, message]
        );
        console.log("✅ Notification sent:", user_id);
    } catch (err) {
        console.error("❌ Notification error:", err);
    }
};