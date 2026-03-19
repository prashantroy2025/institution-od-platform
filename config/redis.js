const redis = require("redis");

const client = redis.createClient({
  url: process.env.REDIS_URL || "redis://127.0.0.1:6379"
});

client.on("error", (err) => {
  console.error("❌ Redis error:", err);
});

client.connect().catch(err => {
  console.error("❌ Redis connection failed:", err);
});

module.exports = client;
```

Add to `.env`:
```
REDIS_URL=redis  //your_redis_host:6379