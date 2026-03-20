const redis = require("redis");

const client = redis.createClient({
    url: process.env.REDIS_URL || "redis://127.0.0.1:6379"
});

client.on("error", (err) => {
    console.error("Redis error:", err.message);
});

client.connect().catch(err => {
    console.error("Redis connect failed:", err.message);
});

module.exports = client;