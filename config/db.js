const mysql = require("mysql2");

const pool = mysql.createPool({
  host: process.env.MYSQLHOST || "localhost",
  user: process.env.MYSQLUSER || "root",
  password: process.env.MYSQLPASSWORD || "",
  database: process.env.MYSQLDATABASE || "institution_od_platform",
  port: process.env.MYSQLPORT || 3306,
  waitForConnections: true,
  connectionLimit: 10
});

// ✅ IMPORTANT
const db = pool.promise();

// TEST
db.getConnection()
  .then(conn => {
    console.log("✅ MySQL connected");
    conn.release();
  })
  .catch(err => {
    console.error("❌ MySQL connection failed:", err);
  });

module.exports = db;

// hopper.proxy.rlwy.net:38034
//mysql-production-a450.up.railway.app 


/*

const mysql = require("mysql2");

const db = mysql.createPool({
  host: process.env.MYSQLHOST,
  port: process.env.MYSQLPORT,
  user: process.env.MYSQLUSER,
  password: process.env.MYSQLPASSWORD,
  database: process.env.MYSQLDATABASE,
  waitForConnections: true,
  connectionLimit: 50
});

db.getConnection((err, conn) => {
  if (err) {
    console.error("❌ MySQL connection failed:", err);
  } else {
    console.log("✅ MySQL connected");
    conn.release();
  }
});

module.exports = db;  */

/*

const dbConfig = {
    host: process.env.MYSQLHOST || "localhost",
    user: process.env.MYSQLUSER || "root",
    password: process.env.MYSQLPASSWORD || "your_local_password",
    database: process.env.MYSQLDATABASE || "od_platform",
    port: process.env.MYSQLPORT || 3306
};

const db = mysql.createPool(dbConfig); */

///.  vercel --prod

/* git add .
git commit -m "fix club id thing"
git push  */