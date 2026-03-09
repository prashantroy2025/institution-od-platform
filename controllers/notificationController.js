const db = require('../config/db');

exports.getNotifications = (req, res) => {

    const user_id = req.user.id;

    db.query(
        "SELECT * FROM notifications WHERE user_id=? ORDER BY created_at DESC",
        [user_id],
        (err, results) => {

            if (err) return res.status(500).json({ error: err.message });

            res.json(results);

        }
    );

};
exports.markAsRead = (req, res) => {

    const { id } = req.body;

    db.query(
        "UPDATE notifications SET is_read=1 WHERE id=?",
        [id],
        (err) => {

            if (err) return res.status(500).json({ error: err.message });

            res.json({ message: "Notification marked as read" });

        }
    );

};
exports.getUnreadCount = (req, res) => {

    const user_id = req.user.id;

    db.query(
        "SELECT COUNT(*) AS unread FROM notifications WHERE user_id=? AND is_read=0",
        [user_id],
        (err, result) => {

            if (err) {
                return res.status(500).json({ error: err.message });
            }

            res.json({
                unread_notifications: result[0].unread
            });

        }
    );

};