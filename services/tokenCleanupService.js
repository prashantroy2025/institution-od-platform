const cron = require('node-cron');
const db = require('../config/db');

const startTokenCleanup = () => {

    // Runs every 1 minute
    cron.schedule('* * * * *', () => {

        db.query(
            "DELETE FROM event_qr_tokens WHERE expires_at < NOW()",
            (err, result) => {

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