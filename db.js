const {Pool} =require('pg');,
console.log("DATABASE_URL status:", process.env.DATABASE_URL ? "SET" :"missing");
const pool = new pool({
    connectionString:
    process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV
    === 'production'
    ? { rejectUnauthorized:
        false }
        : false
    });
    module.exports = pool;
