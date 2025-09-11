import { Router, Request, Response } from 'express';
import pool from '../config/database';

const router = Router();

// Get chatbot settings
router.get('/settings', async (req: Request, res: Response) => {
  try {
    // First, check if table exists, if not create it
    await pool.query(`
      CREATE TABLE IF NOT EXISTS chatbot_settings (
        id SERIAL PRIMARY KEY,
        setting_key VARCHAR(255) UNIQUE NOT NULL,
        setting_value TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Get all settings
    const result = await pool.query('SELECT * FROM chatbot_settings');
    
    // Convert to key-value object
    const settings = result.rows.reduce((acc: any, row: any) => {
      acc[row.setting_key] = row.setting_value;
      return acc;
    }, {});

    // Default values if not set
    const defaultSettings = {
      title: settings.title || 'ASB Hukuki Asistan',
      subtitle: settings.subtitle || 'Yapay Zeka Asistanınız',
      logoUrl: settings.logoUrl || '',
      welcomeMessage: settings.welcomeMessage || 'Türk hukuku hakkında soru sorun, belgeler arasında arama yapın ve hukuki danışmanlık alın.',
      placeholder: settings.placeholder || 'Hukuki sorunuzu yazın...',
      primaryColor: settings.primaryColor || '#3B82F6',
      suggestions: settings.suggestions || JSON.stringify([
        { icon: '📚', title: 'Hukuki Araştırma', description: 'İlgili kararları ve kanunları bulun' },
        { icon: '📄', title: 'Belge Analizi', description: 'Sözleşme ve yasal belgeleri inceleyin' },
        { icon: '⚖️', title: 'İçtihat Hukuku', description: 'Emsal kararları ve içtihatları keşfedin' }
      ])
    };

    res.json(defaultSettings);
  } catch (error) {
    console.error('Error fetching chatbot settings:', error);
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

// Update chatbot settings
router.post('/settings', async (req: Request, res: Response) => {
  try {
    const settings = req.body;

    // Ensure table exists
    await pool.query(`
      CREATE TABLE IF NOT EXISTS chatbot_settings (
        id SERIAL PRIMARY KEY,
        setting_key VARCHAR(255) UNIQUE NOT NULL,
        setting_value TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Update each setting
    for (const [key, value] of Object.entries(settings)) {
      await pool.query(
        `INSERT INTO chatbot_settings (setting_key, setting_value, updated_at) 
         VALUES ($1, $2, CURRENT_TIMESTAMP) 
         ON CONFLICT (setting_key) 
         DO UPDATE SET setting_value = $2, updated_at = CURRENT_TIMESTAMP`,
        [key, typeof value === 'string' ? value : JSON.stringify(value)]
      );
    }

    res.json({ success: true, message: 'Settings updated successfully' });
  } catch (error) {
    console.error('Error updating chatbot settings:', error);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

// Reset to default settings
router.delete('/settings', async (req: Request, res: Response) => {
  try {
    await pool.query('DELETE FROM chatbot_settings');
    res.json({ success: true, message: 'Settings reset to default' });
  } catch (error) {
    console.error('Error resetting settings:', error);
    res.status(500).json({ error: 'Failed to reset settings' });
  }
});

export default router;