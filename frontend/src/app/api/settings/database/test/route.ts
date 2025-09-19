import { NextRequest, NextResponse } from 'next/server';
import { Client } from 'pg';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Normalize payload
    const config = {
      host: body.host ?? 'localhost',
      port: parseInt(body.port ?? '5432'),
      database: body.name ?? body.database ?? 'alice_semantic_bridge',
      user: body.user ?? 'postgres',
      password: body.password ?? '',
      ssl: body.ssl ?? false,
    };

    // Create PostgreSQL client
    const client = new Client({
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.user,
      password: config.password,
      ssl: config.ssl,
    });

    // Try to connect
    await client.connect();

    // Test query to get PostgreSQL version
    const result = await client.query('SELECT version()');
    const version = result.rows[0].version;

    // Close connection
    await client.end();

    return NextResponse.json({
      success: true,
      version: version,
      message: 'Bağlantı başarılı',
    });
  } catch (error: unknown) {
    console.error('Database test error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Veritabanı bağlantısı başarısız';
    return NextResponse.json(
      {
        success: false,
        error: errorMessage,
      },
      { status: 500 },
    );
  }
}
