const db = require('../config/db');

exports.getNotifications = async (req, res) => {

try{

const user_id = req.user.id;

const [results] = await db.query(
"SELECT * FROM notifications WHERE user_id=? ORDER BY created_at DESC",
[user_id]
);

res.json(results);

}catch(err){
console.error("Notification query error:", err);
res.status(500).json({ message: "Internal server error" });
}

};


exports.markAsRead = async (req, res) => {

try{

        const { id } = req.body;

        const [result] = await db.query(
            "UPDATE notifications SET is_read=1 WHERE id=? AND user_id=?",
            [id, req.user.id]
);

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: "Notification not found" });
        }

res.json({ message: "Notification marked as read" });

}catch(err){
        res.status(500).json({ message: "Server error" });
}

};


exports.getUnreadCount = async (req, res) => {

try{

const user_id = req.user.id;

const [result] = await db.query(
"SELECT COUNT(*) AS unread FROM notifications WHERE user_id=? AND is_read=0",
[user_id]
);

res.json({
unread_notifications: result[0].unread
});

}catch(err){
console.error("Unread notification query error:", err);
res.status(500).json({ message: "Internal server error" });
}

};