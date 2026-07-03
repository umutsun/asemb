import { Router, Request, Response } from 'express';
import { Pool } from 'pg';

const router = Router();

// Check multiple databases for Turkish law tables
router.get('/check-tables', async (req: Request, res: Response) => {
  const results: any = {};
  
  // Build a base connection from environment (no hardcoded credentials/host).
  const pgUser = process.env.POSTGRES_USER;
  const pgPassword = process.env.POSTGRES_PASSWORD;
  const pgHost = process.env.POSTGRES_HOST;
  const pgPort = process.env.POSTGRES_PORT || '5432';
  const buildConnection = (dbName: string) =>
    `postgresql://${pgUser}:${pgPassword}@${pgHost}:${pgPort}/${dbName}`;

  // Databases to check (DB names are not secrets)
  const databases = [
    { name: 'lsemb', connection: buildConnection('lsemb') },
    { name: 'postgres', connection: buildConnection('postgres') },
    { name: 'semantic_db', connection: buildConnection('semantic_db') }
  ];
  
  // Tables we're looking for
  const targetTables = ['OZELGELER', 'MAKALELER', 'SORUCEVAP', 'DANISTAYKARARLARI'];
  
  for (const db of databases) {
    try {
      const pool = new Pool({ connectionString: db.connection });
      
      // Get all tables in this database
      const tablesResult = await pool.query(`
        SELECT table_name, table_schema
        FROM information_schema.tables 
        WHERE table_type = 'BASE TABLE'
          AND table_schema NOT IN ('pg_catalog', 'information_schema')
        ORDER BY table_name
      `);
      
      results[db.name] = {
        tables: tablesResult.rows,
        targetTablesFound: []
      };
      
      // Check for target tables (case-insensitive)
      for (const targetTable of targetTables) {
        const found = tablesResult.rows.find(
          (t: any) => t.table_name.toUpperCase() === targetTable.toUpperCase()
        );
        if (found) {
          results[db.name].targetTablesFound.push(found);
        }
      }
      
      await pool.end();
    } catch (error) {
      results[db.name] = { error: (error as Error).message };
    }
  }
  
  res.json(results);
});

export default router;