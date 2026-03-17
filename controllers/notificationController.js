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
res.status(500).json({ error: err.message });
}

};


exports.markAsRead = async (req, res) => {

try{

const { id } = req.body;

await db.query(
"UPDATE notifications SET is_read=1 WHERE id=?",
[id]
);

res.json({ message: "Notification marked as read" });

}catch(err){
res.status(500).json({ error: err.message });
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
res.status(500).json({ error: err.message });
}

};