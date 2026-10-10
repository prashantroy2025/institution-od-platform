const db = require('../config/db')

exports.log = async (user_id, action, entity = null, entity_id = null) => {

await db.query(
    "INSERT INTO audit_logs (user_id,action,entity,entity_id) VALUES (?,?,?,?)",
    [user_id, action, entity, entity_id]
)

}