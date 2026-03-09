const db = require('../config/db')

// CREATE DEPARTMENT
exports.createDepartment = (name) => {

return new Promise((resolve,reject)=>{

db.query(
"INSERT INTO departments (name) VALUES (?)",
[name],
(err,result)=>{

if(err) reject(err)
else resolve(result)

})

})

}


// GET ALL DEPARTMENTS
exports.getDepartments = () => {

return new Promise((resolve,reject)=>{

db.query(
"SELECT * FROM departments",
(err,rows)=>{

if(err) reject(err)
else resolve(rows)

})

})

}


// ASSIGN HOD
exports.assignHOD = (department_id,hod_id) => {

return new Promise((resolve,reject)=>{

db.query(
"UPDATE departments SET hod_id=? WHERE id=?",
[hod_id,department_id],
(err,result)=>{

if(err) reject(err)
else resolve(result)

})

})

}


// DELETE DEPARTMENT
exports.deleteDepartment = (department_id) => {

return new Promise((resolve,reject)=>{

db.query(
"DELETE FROM departments WHERE id=?",
[department_id],
(err,result)=>{

if(err) reject(err)
else resolve(result)

})

})

}