const crypto = require('crypto');
const db = require('../config/db');

exports.generateQRToken = (event_id, callback) => {

    const token = crypto.randomBytes(16).toString("hex");

    const expires = new Date(Date.now() + 20000);

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

exports.cleanExpiredTokens = () => {

 db.query(
  "DELETE FROM event_qr_tokens WHERE expires_at < NOW()",
  (err,result)=>{
   if(err){
    console.error("QR cleanup error:",err)
   }else{
    if(result.affectedRows > 0){
     console.log("Expired QR tokens cleaned:", result.affectedRows)
    }
   }
  }
 )

}