const pool = require('./db');

pool.query('INSERT INTO rating (title_id, rating) VALUES ($1,$2) RETURNING *',
[1,9],
function(error, result){
    if (error) {

        console.log('DATABASE ERROR');

        cosole.log(error.message);
    }else{
         console.log('RATING ADDED');
         console.log(result.row);
    }
    pool.end();
    }
);