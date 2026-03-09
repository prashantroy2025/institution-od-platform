const crypto = require('crypto');
const db = require('../config/db');

exports.generateQRToken = (event_id, callback) => {

    const token = crypto.randomBytes(16).toString('hex');

    const expires = new Date(Date.now() + 20000); // 20 seconds

    db.query(
        "INSERT INTO event_qr_tokens (event_id, token, expires_at) VALUES (?, ?, ?)",
        [event_id, token, expires],
        (err, result) => {

            if (err) {
                return callback(err, null);
            }

            callback(null, token);
        }
    );

};
exports.validateQRToken = (token, callback) => {

    db.query(
        "SELECT * FROM event_qr_tokens WHERE token=? AND expires_at > NOW()",
        [token],
        (err, rows) => {

            if (err) return callback(err, null);

            if (rows.length === 0) {
                return callback(null, null);
            }

            callback(null, rows[0]);
        }
    );

};

exports.cleanExpiredTokens = () => {

    db.query(
        "DELETE FROM event_qr_tokens WHERE expires_at < NOW()",
        (err) => {
            if(err){
                console.error("QR cleanup error:",err)
            }else{
                console.log("Expired QR tokens cleaned")
            }
        }
    )

}