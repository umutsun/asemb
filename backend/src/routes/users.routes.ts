import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

const router = Router();

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:Semsiye!22@91.99.229.96:5432/asemb'
});

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-this-in-production';

// Middleware to verify JWT and admin role
const verifyAdmin = (req: Request, res: Response, next: Function) => {
  const token = req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    
    if (decoded.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    (req as any).user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

// Get all users (admin only)
router.get('/', verifyAdmin, async (req: Request, res: Response) => {
  try {
    const result = await pool.query(`
      SELECT 
        u.id,
        u.email,
        u.name,
        u.role,
        u.status,
        u.last_login,
        u.created_at,
        p.company_name,
        p.phone,
        p.bio,
        s.plan_id,
        sp.name as plan_name,
        s.end_date as subscription_end_date
      FROM users u
      LEFT JOIN user_profiles p ON u.id = p.user_id
      LEFT JOIN user_subscriptions s ON u.id = s.user_id AND s.status = 'active'
      LEFT JOIN subscription_plans sp ON s.plan_id = sp.id
      ORDER BY u.created_at DESC
    `);
    
    const users = result.rows.map(row => ({
      id: row.id,
      name: row.name,
      email: row.email,
      role: row.role,
      status: row.status,
      last_login: row.last_login,
      created_at: row.created_at,
      profile: row.company_name ? {
        company_name: row.company_name,
        phone: row.phone,
        bio: row.bio
      } : null,
      subscription: row.plan_id ? {
        plan_name: row.plan_name,
        end_date: row.subscription_end_date
      } : null
    }));
    
    res.json({ users });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// Get single user (admin only)
router.get('/:id', verifyAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(`
      SELECT 
        u.*,
        p.*,
        s.plan_id,
        sp.name as plan_name,
        sp.features as plan_features,
        s.end_date as subscription_end_date
      FROM users u
      LEFT JOIN user_profiles p ON u.id = p.user_id
      LEFT JOIN user_subscriptions s ON u.id = s.user_id AND s.status = 'active'
      LEFT JOIN subscription_plans sp ON s.plan_id = sp.id
      WHERE u.id = $1
    `, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const user = result.rows[0];
    delete user.password; // Never send password
    
    res.json({ user });
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

// Create new user (admin only)
router.post('/', verifyAdmin, async (req: Request, res: Response) => {
  try {
    const { email, password, name, role = 'user', company } = req.body;
    
    // Check if user exists
    const existing = await pool.query(
      'SELECT id FROM users WHERE email = $1',
      [email]
    );
    
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'User already exists' });
    }
    
    // Hash password
    const hashedPassword = await bcrypt.hash(password || 'defaultPassword123', 10);
    
    // Create user
    const newUser = await pool.query(
      `INSERT INTO users (email, password, name, role, status, email_verified) 
       VALUES ($1, $2, $3, $4, $5, $6) 
       RETURNING id, email, name, role`,
      [email, hashedPassword, name, role, 'active', false]
    );
    
    const userId = newUser.rows[0].id;
    
    // Create profile
    await pool.query(
      `INSERT INTO user_profiles (user_id, company_name) 
       VALUES ($1, $2)`,
      [userId, company || null]
    );
    
    // Assign free plan
    const freePlan = await pool.query(
      'SELECT id FROM subscription_plans WHERE name = $1',
      ['Free']
    );
    
    if (freePlan.rows.length > 0) {
      await pool.query(
        `INSERT INTO user_subscriptions (user_id, plan_id, start_date, end_date, status) 
         VALUES ($1, $2, NOW(), NOW() + INTERVAL '30 days', 'active')`,
        [userId, freePlan.rows[0].id]
      );
    }
    
    res.json({ 
      message: 'User created successfully',
      user: newUser.rows[0]
    });
  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

// Update user status (admin only)
router.put('/:id/status', verifyAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    
    if (!['active', 'suspended', 'inactive'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    
    await pool.query(
      'UPDATE users SET status = $1 WHERE id = $2',
      [status, id]
    );
    
    res.json({ message: 'Status updated successfully' });
  } catch (error) {
    console.error('Error updating status:', error);
    res.status(500).json({ error: 'Failed to update status' });
  }
});

// Update user role (admin only)
router.put('/:id/role', verifyAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { role } = req.body;
    
    if (!['admin', 'user', 'premium'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }
    
    await pool.query(
      'UPDATE users SET role = $1 WHERE id = $2',
      [role, id]
    );
    
    res.json({ message: 'Role updated successfully' });
  } catch (error) {
    console.error('Error updating role:', error);
    res.status(500).json({ error: 'Failed to update role' });
  }
});

// Delete user (admin only)
router.delete('/:id', verifyAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    // Don't allow deleting the requesting admin
    if ((req as any).user.userId === id) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }
    
    // Delete user sessions first
    await pool.query('DELETE FROM user_sessions WHERE user_id = $1', [id]);
    
    // Delete user activity logs
    await pool.query('DELETE FROM user_activity_logs WHERE user_id = $1', [id]);
    
    // Delete user subscriptions
    await pool.query('DELETE FROM user_subscriptions WHERE user_id = $1', [id]);
    
    // Delete user profile
    await pool.query('DELETE FROM user_profiles WHERE user_id = $1', [id]);
    
    // Finally delete the user
    await pool.query('DELETE FROM users WHERE id = $1', [id]);
    
    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// Get user statistics (admin only)
router.get('/stats/overview', verifyAdmin, async (req: Request, res: Response) => {
  try {
    const stats = await pool.query(`
      SELECT 
        COUNT(*) as total_users,
        COUNT(CASE WHEN status = 'active' THEN 1 END) as active_users,
        COUNT(CASE WHEN role = 'admin' THEN 1 END) as admin_users,
        COUNT(CASE WHEN role = 'premium' THEN 1 END) as premium_users,
        COUNT(CASE WHEN created_at >= NOW() - INTERVAL '7 days' THEN 1 END) as new_users_week,
        COUNT(CASE WHEN last_login >= NOW() - INTERVAL '24 hours' THEN 1 END) as active_today
      FROM users
    `);
    
    res.json({ stats: stats.rows[0] });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
});

export default router;