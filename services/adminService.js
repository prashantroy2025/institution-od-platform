const db = require('../config/db')

// SYSTEM STATS
exports.getSystemStats = async () => {

 try{

 const [rows] = await db.query(`
 SELECT
 (SELECT COUNT(*) FROM users WHERE role='student') AS students,
 (SELECT COUNT(*) FROM users WHERE role='organizer') AS organizers,
 (SELECT COUNT(*) FROM users WHERE role='hod') AS hods,
 (SELECT COUNT(*) FROM events) AS events,
 (SELECT COUNT(*) FROM event_participants) AS participants
 `)

 return rows[0]

 }catch(err){
  throw err
 }

}


// GET USERS BY ROLE
exports.getUsersByRole = async (role) => {

 try{

 const [rows] = await db.query(
  "SELECT id,college_id,name,email,role,is_active,department_id FROM users WHERE role=?",
  [role]
 )

 return rows

 }catch(err){
  throw err
 }

}


// DELETE USER
exports.deleteUser = async (user_id) => {

 try{

 const [result] = await db.query(
  "DELETE FROM users WHERE id=?",
  [user_id]
 )

 return result

 }catch(err){
  throw err
 }

}

// GET EVENT PARTICIPANTS
exports.getAllEvents = async () => {

 try{

 const [rows] = await db.query(
 `SELECT 
 events.id,
 events.title,
 events.status,
 events.from_date,
 events.to_date,
 COUNT(event_participants.id) AS participants
 FROM events
 LEFT JOIN event_participants
 ON events.id = event_participants.event_id
 GROUP BY events.id
 ORDER BY events.created_at DESC`
 )

 return rows

 }catch(err){
  throw err
 }

}


// GET EVENT PARTICIPANTS BY EVENT
exports.getEventParticipants = async (event_id) => {

 try{

 const [rows] = await db.query(
 `SELECT 
 users.name,
 users.college_id
 FROM event_participants
 JOIN users
 ON event_participants.student_id = users.id
 WHERE event_participants.event_id = ?`,
 [event_id]
 )

 return rows

 }catch(err){
  throw err
 }

}

// GET ALL USERS
exports.getUsers = async () => {
  try {
    const [rows] = await db.query(
      "SELECT id, college_id, name, email, role, is_active, department_id FROM users"
    );
    return rows;
  } catch (err) {
    throw err;
  }
};

// DEACTIVATE USER
exports.deactivateUser = async (user_id) => {
  try {
    const [result] = await db.query(
      "UPDATE users SET is_active=0 WHERE id=?",
      [user_id]
    );
    return result;
  } catch (err) {
    throw err;
  }
};