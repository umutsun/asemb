import { Pool } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config();

export default async () => {
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
  } catch (error: any) {
    if (error.code !== '42P04') {
      throw error;
    }
  }
  client.release();
  await pool.end();
};
