const mysql = require("mysql2");

const getDbConfig = (env = process.env) => ({
  host: env.DB_HOST || env.MYSQLHOST || "localhost",
  user: env.DB_USER || env.MYSQLUSER || "root",
  password: env.DB_PASSWORD ?? env.MYSQLPASSWORD ?? "",
  database: env.DB_NAME || env.MYSQLDATABASE || "institution_od_recovery",
  port: Number(env.DB_PORT || env.MYSQLPORT || 3306),
  waitForConnections: true,
  connectionLimit: 10
});

const validateRuntimeConfig = (env = process.env) => {
  const config = getDbConfig(env);
  const missing = [];

  if (!config.host) missing.push("DB_HOST");
  if (!config.user) missing.push("DB_USER");
  if (!config.database) missing.push("DB_NAME");
  if (!Number.isInteger(config.port) || config.port < 1 || config.port > 65535) {
    missing.push("DB_PORT");
  }
  if (typeof env.JWT_SECRET !== "string" || env.JWT_SECRET.length < 32) {
    missing.push("JWT_SECRET (minimum 32 characters)");
  }

  if (missing.length > 0) {
    throw new Error(`Invalid runtime configuration: ${missing.join(", ")}`);
  }

  return config;
};

const dbConfig = validateRuntimeConfig();

const pool = mysql.createPool(dbConfig);

// ✅ IMPORTANT
const db = pool.promise();

if (process.env.NODE_ENV !== "test") {
  db.getConnection()
    .then(conn => {
      console.log("✅ MySQL connected", {
        host: dbConfig.host,
        user: dbConfig.user,
        database: dbConfig.database,
        port: dbConfig.port
      });
      conn.release();
    })
    .catch(err => {
      console.error("❌ MySQL connection failed", {
        code: err.code,
        errno: err.errno,
        sqlState: err.sqlState,
        message: err.message,
        host: dbConfig.host,
        user: dbConfig.user,
        database: dbConfig.database,
        port: dbConfig.port
      });
    });
}

module.exports = db;
module.exports.getDbConfig = getDbConfig;
module.exports.validateRuntimeConfig = validateRuntimeConfig;
