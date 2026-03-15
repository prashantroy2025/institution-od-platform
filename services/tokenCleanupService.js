const cron = require('node-cron');
const db = require('../config/db');

const startTokenCleanup = () => {

    // Run every minute
    cron.schedule('* * * * *', () => {

        db.query(
            "DELETE FROM event_qr_tokens WHERE expires_at < NOW()",
            (err) => {

                if (err) {
                    console.error("Token cleanup error:", err);
                } else {
                    console.log("Expired QR tokens cleaned");
                }

            }
        );

    });

};

module.exports = startTokenCleanup;