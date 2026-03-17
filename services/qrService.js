const crypto = require('crypto');
const db = require('../config/db');

exports.generateQRToken = async (event_id) => {
    const token = crypto.randomBytes(16).toString("hex");
    const expires = new Date(Date.now() + 20000);

    await db.query(
        "INSERT INTO event_qr_tokens (event_id, token, expires_at) VALUES (?, ?, ?)",
        [event_id, token, expires]
    );

    return token;
};

exports.cleanExpiredTokens = async () => {
    try {
        const [result] = await db.query(
            "DELETE FROM event_qr_tokens WHERE expires_at < NOW()"
        );

        if(result.affectedRows > 0){
            console.log("Expired QR tokens cleaned:", result.affectedRows);
        }

    } catch (err) {
        console.error("QR cleanup error:", err);
    }
};