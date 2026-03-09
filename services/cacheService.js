const redisClient = require("../config/redis")
const adminService = require("./adminService")

async function getStats(){

try{

const cache = await redisClient.get("stats")

if(cache){
return JSON.parse(cache)
}

const stats = await adminService.getSystemStats()

await redisClient.setEx("stats",60,JSON.stringify(stats))

return stats

}catch(err){

console.error("Redis error:",err)

return adminService.getSystemStats()

}

}

module.exports = {
getStats
}