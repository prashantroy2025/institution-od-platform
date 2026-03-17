const cron = require('node-cron');
const db = require('../config/db');

const startTokenCleanup = () => {

    cron.schedule('* * * * *', async () => {
        try {
            await db.query(
                "DELETE FROM event_qr_tokens WHERE expires_at < NOW()"
            );
            console.log("Expired QR tokens cleaned");
        } catch (err) {
            console.error("Token cleanup error:", err);
        }
    });

};

module.exports = startTokenCleanup;