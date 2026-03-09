const fs = require('fs')
const csv = require('csv-parser')
const db = require('../config/db')

exports.uploadParticipants = (req,res)=>{

const {event_id} = req.body

if(!req.file){
return res.status(400).json({
message:"File required"
})
}

const results=[]

fs.createReadStream(req.file.path)
.pipe(csv())
.on('data',(data)=>results.push(data))
.on('end',()=>{

results.forEach(row=>{

db.query(
"SELECT id FROM users WHERE college_id=? AND role='student'",
[row.college_id],
(err,users)=>{

if(users.length>0){

db.query(
"INSERT IGNORE INTO event_participants (event_id,student_id) VALUES (?,?)",
[event_id,users[0].id]
)

}

}
)

})

res.json({
message:"Participants uploaded successfully",
total_rows:results.length
})

})

}