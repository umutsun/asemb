const { Pool } = require('pg');
require('dotenv').config();

module.exports = async () => {
  const pool = new Pool({
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '5432'),
    database: 'postgres',
    user: process.env.POSTGRES_USER || 'postgres',
    password: process.env.POSTGRES_PASSWORD || 'password',
  });

  const client = await pool.connect();
  try {
    await client.query('CREATE DATABASE asb_test');
  } catch (error) {
    if (error.code !== '42P04') {
      throw error;
    }
  }
  client.release();
  await pool.end();
};
