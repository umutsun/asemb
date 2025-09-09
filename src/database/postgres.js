// Centralized PostgreSQL connection pool
const { Pool } = require('pg');
require('dotenv').config();

if (!process.env.DATABASE_URL) {
  console.error('FATAL: DATABASE_URL environment variable is not set.');
  // In a real app, you might not want to exit, but for development this is a clear indicator.
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 25, // Max number of clients in the pool
  idleTimeoutMillis: 30000, // How long a client is allowed to remain idle before being closed
  connectionTimeoutMillis: 5000, // How long to wait for a client to connect
});

pool.on('error', (err, client) => {
  console.error('Unexpected error on idle PostgreSQL client', err);
  process.exit(-1);
});

console.log('PostgreSQL connection pool created.');

module.exports = {
  pool,
  // Helper function to execute queries
  query: (text, params) => pool.query(text, params),
};
