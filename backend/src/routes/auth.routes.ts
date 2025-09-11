import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:Semsiye!22@91.99.229.96:5432/asemb'
});

// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-this-in-production';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'your-refresh-secret-key';

// Helper function to generate tokens
function generateTokens(userId: string, email: string, role: string) {
  const accessToken = jwt.sign(
    { userId, email, role },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
  
  const refreshToken = jwt.sign(
    { userId, email, role },
    JWT_REFRESH_SECRET,
    { expiresIn: '7d' }
  );
  
  return { accessToken, refreshToken };
}

// Register endpoint
router.post('/register', async (req: Request, res: Response) => {
  try {
    const { email, password, name, company } = req.body;
    
    // Validate input
    if (!email || !password || !name) {
      return res.status(400).json({ error: 'Email, password and name are required' });
    }
    
    // Check if user already exists
    const existingUser = await pool.query(
      'SELECT id FROM users WHERE email = $1',
      [email]
    );
    
    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: 'User already exists with this email' });
    }
    
    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Create user
    const newUser = await pool.query(
      `INSERT INTO users (email, password, name, role, status, email_verified) 
       VALUES ($1, $2, $3, $4, $5, $6) 
       RETURNING id, email, name, role`,
      [email, hashedPassword, name, 'user', 'active', false]
    );
    
    const userId = newUser.rows[0].id;
    
    // Create user profile
    await pool.query(
      `INSERT INTO user_profiles (user_id, company_name) 
       VALUES ($1, $2)`,
      [userId, company || null]
    );
    
    // Assign free plan by default
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
    
    // Generate tokens
    const { accessToken, refreshToken } = generateTokens(
      userId,
      email,
      'user'
    );
    
    // Save session
    await pool.query(
      `INSERT INTO user_sessions (user_id, token, refresh_token, expires_at, ip_address, user_agent) 
       VALUES ($1, $2, $3, NOW() + INTERVAL '1 hour', $4, $5)`,
      [userId, accessToken, refreshToken, req.ip, req.headers['user-agent']]
    );
    
    // Log activity
    await pool.query(
      `INSERT INTO user_activity_logs (user_id, action, details, ip_address, user_agent) 
       VALUES ($1, $2, $3, $4, $5)`,
      [userId, 'register', JSON.stringify({ email }), req.ip, req.headers['user-agent']]
    );
    
    res.json({
      message: 'Registration successful',
      user: {
        id: userId,
        email,
        name,
        role: 'user'
      },
      accessToken,
      refreshToken
    });
    
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// Login endpoint
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    
    // Validate input
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    
    // Find user
    const userResult = await pool.query(
      'SELECT id, email, password, name, role, status FROM users WHERE email = $1',
      [email]
    );
    
    if (userResult.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const user = userResult.rows[0];
    
    // Check user status
    if (user.status !== 'active') {
      return res.status(403).json({ error: `Account is ${user.status}` });
    }
    
    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    // Update last login
    await pool.query(
      'UPDATE users SET last_login = NOW() WHERE id = $1',
      [user.id]
    );
    
    // Generate tokens
    const { accessToken, refreshToken } = generateTokens(
      user.id,
      user.email,
      user.role
    );
    
    // Save session
    await pool.query(
      `INSERT INTO user_sessions (user_id, token, refresh_token, expires_at, ip_address, user_agent) 
       VALUES ($1, $2, $3, NOW() + INTERVAL '1 hour', $4, $5)`,
      [user.id, accessToken, refreshToken, req.ip, req.headers['user-agent']]
    );
    
    // Log activity
    await pool.query(
      `INSERT INTO user_activity_logs (user_id, action, details, ip_address, user_agent) 
       VALUES ($1, $2, $3, $4, $5)`,
      [user.id, 'login', JSON.stringify({ email }), req.ip, req.headers['user-agent']]
    );
    
    // Get user profile
    const profileResult = await pool.query(
      'SELECT * FROM user_profiles WHERE user_id = $1',
      [user.id]
    );
    
    // Get user subscription
    const subscriptionResult = await pool.query(
      `SELECT s.*, p.name as plan_name, p.features 
       FROM user_subscriptions s 
       JOIN subscription_plans p ON s.plan_id = p.id 
       WHERE s.user_id = $1 AND s.status = 'active' 
       ORDER BY s.created_at DESC LIMIT 1`,
      [user.id]
    );
    
    res.json({
      message: 'Login successful',
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        profile: profileResult.rows[0] || null,
        subscription: subscriptionResult.rows[0] || null
      },
      accessToken,
      refreshToken
    });
    
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Logout endpoint
router.post('/logout', async (req: Request, res: Response) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    
    if (token) {
      // Invalidate the session
      await pool.query(
        'DELETE FROM user_sessions WHERE token = $1',
        [token]
      );
    }
    
    res.json({ message: 'Logout successful' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ error: 'Logout failed' });
  }
});

// Refresh token endpoint
router.post('/refresh', async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body;
    
    if (!refreshToken) {
      return res.status(400).json({ error: 'Refresh token is required' });
    }
    
    // Verify refresh token
    try {
      const decoded = jwt.verify(refreshToken, JWT_REFRESH_SECRET) as any;
      
      // Check if session exists
      const sessionResult = await pool.query(
        'SELECT * FROM user_sessions WHERE refresh_token = $1 AND user_id = $2',
        [refreshToken, decoded.userId]
      );
      
      if (sessionResult.rows.length === 0) {
        return res.status(401).json({ error: 'Invalid refresh token' });
      }
      
      // Generate new tokens
      const { accessToken, refreshToken: newRefreshToken } = generateTokens(
        decoded.userId,
        decoded.email,
        decoded.role
      );
      
      // Update session
      await pool.query(
        `UPDATE user_sessions 
         SET token = $1, refresh_token = $2, expires_at = NOW() + INTERVAL '1 hour' 
         WHERE refresh_token = $3`,
        [accessToken, newRefreshToken, refreshToken]
      );
      
      res.json({
        accessToken,
        refreshToken: newRefreshToken
      });
      
    } catch (error) {
      return res.status(401).json({ error: 'Invalid refresh token' });
    }
    
  } catch (error) {
    console.error('Token refresh error:', error);
    res.status(500).json({ error: 'Token refresh failed' });
  }
});

// Verify token endpoint
router.get('/verify', async (req: Request, res: Response) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }
    
    // Verify JWT token
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as any;
      
      // Check if session exists
      const sessionResult = await pool.query(
        'SELECT * FROM user_sessions WHERE token = $1 AND user_id = $2',
        [token, decoded.userId]
      );
      
      if (sessionResult.rows.length === 0) {
        return res.status(401).json({ error: 'Invalid session' });
      }
      
      // Get user details
      const userResult = await pool.query(
        'SELECT id, email, name, role, status FROM users WHERE id = $1',
        [decoded.userId]
      );
      
      if (userResult.rows.length === 0) {
        return res.status(401).json({ error: 'User not found' });
      }
      
      res.json({
        valid: true,
        user: userResult.rows[0]
      });
      
    } catch (error) {
      return res.status(401).json({ error: 'Invalid token' });
    }
    
  } catch (error) {
    console.error('Token verification error:', error);
    res.status(500).json({ error: 'Token verification failed' });
  }
});

export default router;