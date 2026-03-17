const db = require('../config/db')

exports.log = async (user_id, action) => {

await db.query(
"INSERT INTO audit_logs (user_id,action) VALUES (?,?)",
[user_id,action]
)

}