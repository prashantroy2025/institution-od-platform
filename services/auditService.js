const db = require('../config/db')

exports.log = (user_id, action) => {

db.query(
"INSERT INTO audit_logs (user_id,action) VALUES (?,?)",
[user_id,action]
)

}