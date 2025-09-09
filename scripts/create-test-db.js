require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.POSTGRES_HOST || '91.99.229.96',
  port: process.env.POSTGRES_PORT || 5432,
  database: 'postgres',
  user: process.env.POSTGRES_USER || 'postgres',
  password: process.env.POSTGRES_PASSWORD || 'Semsiye!22'
});

const createTestDB = async () => {
  let client;
  try {
    client = await pool.connect();
    await client.query('CREATE DATABASE asb_test');
    console.log('Database "asb_test" created successfully.');
  } catch (error) {
    if (error.code === '42P04') {
      console.log('Database "asb_test" already exists.');
    } else {
      console.error('Error creating database:', error);
    }
  } finally {
    if (client) {
      client.release();
    }
    pool.end();
  }
};

createTestDB();
