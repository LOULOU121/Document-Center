// Load Postgres client from pg module
const { Pool } = require('pg');

// Configure connection
const pool = new Pool({
  user: 'user',
  host: 'postgres', // matches docker-compose.yml service name
  database: 'documents',
  password: 'pass',
  port: 5432,
});

// Expose a simple query function
module.exports = {
  query: (text, params) => pool.query(text, params),

  // ✅ Helper: get next spec version for a document
  getNextSpecVersion: async (documentId) => {
    const { rows } = await pool.query(
      'SELECT MAX(version) AS max_version FROM specs WHERE document_id = $1',
      [documentId]
    );
    const maxVersion = rows[0].max_version || 0;
    return maxVersion + 1;
  }
};
