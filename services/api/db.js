const { Pool } = require('pg');

const pool = new Pool({
  user: 'user',
  host: 'postgres', // <- must match docker-compose.yml service name
  database: 'documents',
  password: 'pass',
  port: 5432,
});

module.exports = {
  query: (text, params) => pool.query(text, params),
};
