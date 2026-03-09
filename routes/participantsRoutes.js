const express=require('express')
const router=express.Router()

const participantsController=require('../controllers/participantsController')
const {verifyToken,allowRoles}=require('../middleware/authMiddleware')

const upload=require('../middleware/upload')

router.post(
"/upload",
verifyToken,
allowRoles("organizer"),
upload.single("file"),
participantsController.uploadParticipants
)

module.exports=router