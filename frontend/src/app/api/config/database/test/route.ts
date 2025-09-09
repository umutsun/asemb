import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';

export async function POST(request: NextRequest) {
  try {
    const config = await request.json();
    
    // Create a test pool
    const pool = new Pool({
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.username,
      password: config.password,
      ssl: config.sslMode === 'require' ? { rejectUnauthorized: false } : false,
      max: 1, // Use minimal connections for testing
      connectionTimeoutMillis: 5000
    });
    
    try {
      // Test basic connection
      const basicTest = await pool.query('SELECT version(), current_database()');
      const version = basicTest.rows[0].version;
      const database = basicTest.rows[0].current_database;
      
      // Check if rag_data schema exists
      const schemaCheck = await pool.query(`
        SELECT schema_name 
        FROM information_schema.schemata 
        WHERE schema_name = $1
      `, [config.schema || 'rag_data']);
      
      const hasRagDataSchema = schemaCheck.rows.length > 0;
      
      // Check if documents table exists
      let documentsCount = 0;
      if (hasRagDataSchema) {
        try {
          const countCheck = await pool.query(`
            SELECT COUNT(*) as count 
            FROM ${config.schema || 'rag_data'}.documents
          `);
          documentsCount = parseInt(countCheck.rows[0].count);
        } catch (error) {
          // Table doesn't exist
        }
      }
      
      // Check for pgvector extension
      const vectorCheck = await pool.query(`
        SELECT * FROM pg_extension WHERE extname = 'vector'
      `);
      const hasVector = vectorCheck.rows.length > 0;
      
      await pool.end();
      
      return NextResponse.json({
        success: true,
        database,
        version,
        hasRagDataSchema,
        documentsCount,
        hasVector,
        message: 'Bağlantı başarılı'
      });
    } catch (error: any) {
      await pool.end();
      throw error;
    }
  } catch (error: any) {
    console.error('Database test error:', error);
    
    let errorMessage = 'Bağlantı başarısız';
    if (error.code === 'ENOTFOUND') {
      errorMessage = 'Sunucu bulunamadı';
    } else if (error.code === '28P01') {
      errorMessage = 'Kullanıcı adı veya şifre hatalı';
    } else if (error.code === '3D000') {
      errorMessage = 'Veritabanı bulunamadı';
    } else if (error.code === 'ECONNREFUSED') {
      errorMessage = 'Bağlantı reddedildi (sunucu kapalı veya port hatalı)';
    }
    
    return NextResponse.json({
      success: false,
      error: errorMessage,
      details: error.message
    });
  }
}