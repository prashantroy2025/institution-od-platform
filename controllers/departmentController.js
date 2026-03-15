const departmentService = require('../services/departmentService')

// GET ALL
exports.getDepartments = async (req,res,next)=>{

try{

const departments = await departmentService.getDepartments()

res.json(departments)

}catch(err){
next(err)
}

}


// CREATE
exports.createDepartment = async (req,res,next)=>{

try{

const {name} = req.body

await departmentService.createDepartment(name)

res.json({
message:"Department created"
})

}catch(err){
next(err)
}

}


// ASSIGN HOD
exports.assignHOD = async (req,res,next)=>{

try{

const {department_id,hod_id} = req.body

await departmentService.assignHOD(department_id,hod_id)

res.json({
message:"HOD assigned"
})

}catch(err){
next(err)
}

}


// DELETE
exports.deleteDepartment = async (req,res,next)=>{

try{

const {department_id} = req.body

db.query(
"INSERT INTO audit_logs (user_id,action,entity,entity_id) VALUES (?,?,?,?)",
[req.user.id,"DELETE_DEPARTMENT","departments",department_id]
)

await departmentService.deleteDepartment(department_id)

res.json({
message:"Department deleted"
})

}catch(err){
next(err)
}

}