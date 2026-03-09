const mysql = require('mysql2')

const pool = mysql.createPool({

host:'localhost',
user:'root',
password:'PrashanT9009',
database:'institution_od_platform',

connectionLimit:20

})

module.exports = pool 