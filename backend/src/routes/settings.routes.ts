import { Router, Request, Response } from 'express';
import { Pool } from 'pg';

const router = Router();

// Use the main database connection
const pgPool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:Semsiye!22@91.99.229.96:5432/asemb'
});

// Get all settings
router.get('/all', async (req: Request, res: Response) => {
  try {
    const result = await pgPool.query('SELECT setting_key, setting_value FROM chatbot_settings');
    
    const settings: { [key: string]: string } = {};
    result.rows.forEach(row => {
      settings[row.setting_key] = row.setting_value;
    });
    
    res.json(settings);
  } catch (error) {
    console.error('Error fetching settings:', error);
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

// Get specific setting
router.get('/:key', async (req: Request, res: Response) => {
  try {
    const { key } = req.params;
    const result = await pgPool.query(
      'SELECT setting_value FROM chatbot_settings WHERE setting_key = $1',
      [key]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Setting not found' });
    }
    
    res.json({ value: result.rows[0].setting_value });
  } catch (error) {
    console.error('Error fetching setting:', error);
    res.status(500).json({ error: 'Failed to fetch setting' });
  }
});

// Update setting
router.put('/:key', async (req: Request, res: Response) => {
  try {
    const { key } = req.params;
    const { value } = req.body;
    
    // Check if setting exists
    const checkResult = await pgPool.query(
      'SELECT setting_key FROM chatbot_settings WHERE setting_key = $1',
      [key]
    );
    
    if (checkResult.rows.length === 0) {
      // Insert new setting
      await pgPool.query(
        'INSERT INTO chatbot_settings (setting_key, setting_value) VALUES ($1, $2)',
        [key, value]
      );
    } else {
      // Update existing setting
      await pgPool.query(
        'UPDATE chatbot_settings SET setting_value = $1 WHERE setting_key = $2',
        [value, key]
      );
    }
    
    res.json({ success: true, key, value });
  } catch (error) {
    console.error('Error updating setting:', error);
    res.status(500).json({ error: 'Failed to update setting' });
  }
});

// Get database configuration
router.get('/database/config', async (req: Request, res: Response) => {
  try {
    const keys = ['db_host', 'db_port', 'db_name', 'db_user', 'db_password'];
    const result = await pgPool.query(
      'SELECT setting_key, setting_value FROM chatbot_settings WHERE setting_key = ANY($1)',
      [keys]
    );
    
    const config: { [key: string]: string } = {
      host: '91.99.229.96',
      port: '5432',
      database: 'asemb',
      username: 'postgres',
      password: 'Semsiye!22'
    };
    
    result.rows.forEach(row => {
      switch(row.setting_key) {
        case 'db_host': config.host = row.setting_value; break;
        case 'db_port': config.port = row.setting_value; break;
        case 'db_name': config.database = row.setting_value; break;
        case 'db_user': config.username = row.setting_value; break;
        case 'db_password': config.password = row.setting_value; break;
      }
    });
    
    res.json(config);
  } catch (error) {
    console.error('Error fetching database config:', error);
    res.status(500).json({ error: 'Failed to fetch database config' });
  }
});

export default router;