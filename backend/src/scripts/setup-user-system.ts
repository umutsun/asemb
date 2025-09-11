import { Pool } from 'pg';
import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../../.env') });

// ASEMB database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:Semsiye!22@91.99.229.96:5432/asemb'
});

async function setupUserSystem() {
  try {
    console.log('🔧 Setting up user system in ASEMB database...');
    
    // Read SQL file
    const sqlPath = path.join(__dirname, 'create-user-tables.sql');
    let sql = fs.readFileSync(sqlPath, 'utf-8');
    
    // Hash the default admin password
    const adminPassword = await bcrypt.hash('admin123', 10);
    sql = sql.replace('$2b$10$YourHashedPasswordHere', adminPassword);
    
    // Execute SQL commands
    await pool.query(sql);
    
    console.log('✅ User tables created successfully!');
    console.log('📝 Tables created:');
    console.log('   - users');
    console.log('   - user_sessions');
    console.log('   - user_profiles');
    console.log('   - subscription_plans');
    console.log('   - user_subscriptions');
    console.log('   - user_activity_logs');
    console.log('');
    console.log('👤 Default admin user created:');
    console.log('   Email: admin@asemb.com');
    console.log('   Password: admin123 (PLEASE CHANGE THIS!)');
    console.log('');
    console.log('💎 Subscription plans created:');
    console.log('   - Free ($0/month)');
    console.log('   - Starter ($9.99/month)');
    console.log('   - Professional ($29.99/month)');
    console.log('   - Enterprise ($99.99/month)');
    
  } catch (error) {
    console.error('❌ Error setting up user system:', error);
  } finally {
    await pool.end();
  }
}

// Run setup
setupUserSystem();