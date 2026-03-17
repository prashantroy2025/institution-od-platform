const db = require('../config/db')

// CREATE DEPARTMENT
exports.createDepartment = async (name) => {

const [result] = await db.query(
"INSERT INTO departments (name) VALUES (?)",
[name]
)

return result

}


// GET ALL DEPARTMENTS
exports.getDepartments = async () => {

const [rows] = await db.query(
"SELECT * FROM departments"
)

return rows

}


// ASSIGN HOD
exports.assignHOD = async (department_id,hod_id) => {

const [result] = await db.query(
"UPDATE departments SET hod_id=? WHERE id=?",
[hod_id,department_id]
)

return result

}


// DELETE DEPARTMENT
exports.deleteDepartment = async (department_id) => {

const [result] = await db.query(
"DELETE FROM departments WHERE id=?",
[department_id]
)

return result

}