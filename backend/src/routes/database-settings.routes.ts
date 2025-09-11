import { Router, Request, Response } from 'express';
import { 
  testDatabaseConnection, 
  saveDatabaseSettings, 
  getDatabaseSettings,
  getCustomerPool 
} from '../config/database.config';

const router = Router();

// Get current database settings
router.get('/settings', async (req: Request, res: Response) => {
  try {
    const settings = await getDatabaseSettings();
    
    // Return default settings if none saved
    const defaultSettings = {
      host: process.env.CUSTOMER_DB_HOST || 'localhost',
      port: parseInt(process.env.CUSTOMER_DB_PORT || '5432'),
      database: process.env.CUSTOMER_DB_NAME || '',
      user: process.env.CUSTOMER_DB_USER || 'postgres',
      ssl: process.env.CUSTOMER_DB_SSL === 'true'
    };
    
    res.json({
      success: true,
      settings: settings || defaultSettings,
      isDefault: !settings
    });
  } catch (error: any) {
    console.error('Failed to get database settings:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve database settings'
    });
  }
});

// Save database settings
router.post('/settings', async (req: Request, res: Response) => {
  try {
    const { host, port, database, user, password, ssl } = req.body;
    
    if (!host || !port || !database || !user) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields'
      });
    }
    
    const settings = {
      host,
      port: parseInt(port),
      database,
      user,
      password,
      ssl: ssl === true || ssl === 'true'
    };
    
    // Save to database
    const result = await saveDatabaseSettings(settings);
    
    if (result.success) {
      // Update customer pool with new settings
      getCustomerPool(settings);
      
      res.json({
        success: true,
        message: 'Database settings saved successfully'
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error || 'Failed to save settings'
      });
    }
  } catch (error: any) {
    console.error('Failed to save database settings:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to save database settings'
    });
  }
});

// Test database connection
router.post('/test', async (req: Request, res: Response) => {
  try {
    const { host, port, database, user, password, ssl } = req.body;
    
    if (!host || !port || !database || !user || !password) {
      return res.status(400).json({
        success: false,
        error: 'Missing required connection parameters'
      });
    }
    
    const config = {
      host,
      port: parseInt(port),
      database,
      user,
      password,
      ssl: ssl === true || ssl === 'true' ? { rejectUnauthorized: false } : false
    };
    
    console.log('Testing database connection:', { ...config, password: '***' });
    
    const result = await testDatabaseConnection(config);
    
    if (result.success) {
      res.json({
        success: true,
        message: 'Database connection successful',
        details: {
          host,
          port,
          database,
          user
        }
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error || 'Connection failed',
        details: {
          host,
          port,
          database,
          user
        }
      });
    }
  } catch (error: any) {
    console.error('Database connection test failed:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Connection test failed'
    });
  }
});

// Get database tables (from customer database)
router.get('/tables', async (req: Request, res: Response) => {
  try {
    const settings = await getDatabaseSettings();
    
    if (!settings) {
      return res.status(400).json({
        success: false,
        error: 'No database configured. Please configure database settings first.'
      });
    }
    
    const pool = getCustomerPool(settings);
    const client = await pool.connect();
    
    try {
      // Get all tables with their schemas
      const result = await client.query(`
        SELECT 
          schemaname,
          tablename,
          pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size,
          (SELECT COUNT(*) FROM information_schema.columns 
           WHERE table_schema = t.schemaname 
           AND table_name = t.tablename) as column_count
        FROM pg_tables t
        WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
        ORDER BY schemaname, tablename
      `);
      
      // Get row counts for each table
      const tables = [];
      for (const row of result.rows) {
        try {
          const countResult = await client.query(
            `SELECT COUNT(*) as count FROM "${row.schemaname}"."${row.tablename}"`
          );
          
          tables.push({
            schema: row.schemaname,
            name: row.tablename,
            fullName: `${row.schemaname}.${row.tablename}`,
            size: row.size,
            columnCount: parseInt(row.column_count),
            rowCount: parseInt(countResult.rows[0].count),
            database: settings.database
          });
        } catch (err) {
          // If we can't count rows, still include the table
          tables.push({
            schema: row.schemaname,
            name: row.tablename,
            fullName: `${row.schemaname}.${row.tablename}`,
            size: row.size,
            columnCount: parseInt(row.column_count),
            rowCount: 0,
            database: settings.database
          });
        }
      }
      
      res.json({
        success: true,
        tables,
        database: settings.database,
        host: settings.host,
        port: settings.port
      });
    } finally {
      client.release();
    }
  } catch (error: any) {
    console.error('Failed to get tables:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to retrieve tables'
    });
  }
});

// Get table columns
router.get('/tables/:schema/:table/columns', async (req: Request, res: Response) => {
  try {
    const { schema, table } = req.params;
    const settings = await getDatabaseSettings();
    
    if (!settings) {
      return res.status(400).json({
        success: false,
        error: 'No database configured'
      });
    }
    
    const pool = getCustomerPool(settings);
    const client = await pool.connect();
    
    try {
      const result = await client.query(`
        SELECT 
          column_name,
          data_type,
          character_maximum_length,
          is_nullable,
          column_default
        FROM information_schema.columns
        WHERE table_schema = $1 AND table_name = $2
        ORDER BY ordinal_position
      `, [schema, table]);
      
      res.json({
        success: true,
        columns: result.rows
      });
    } finally {
      client.release();
    }
  } catch (error: any) {
    console.error('Failed to get columns:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to retrieve columns'
    });
  }
});

export default router;