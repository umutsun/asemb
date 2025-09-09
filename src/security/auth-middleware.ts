import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { Request, Response, NextFunction } from 'express';
import { createHash } from 'crypto';

interface TokenPayload {
  userId: string;
  email: string;
  role: string;
  permissions: string[];
  iat?: number;
  exp?: number;
}

export class AuthMiddleware {
  private jwtSecret: string;
  private jwtExpiry: string;
  private refreshTokenExpiry: string;
  private saltRounds: number;

  constructor(config?: {
    jwtSecret?: string;
    jwtExpiry?: string;
    refreshTokenExpiry?: string;
    saltRounds?: number;
  }) {
    this.jwtSecret = config?.jwtSecret || process.env.JWT_SECRET || 'default-secret-change-in-production';
    this.jwtExpiry = config?.jwtExpiry || '1h';
    this.refreshTokenExpiry = config?.refreshTokenExpiry || '7d';
    this.saltRounds = config?.saltRounds || 10;
  }

  // JWT Token Generation
  generateToken(payload: TokenPayload): string {
    return jwt.sign(payload, this.jwtSecret, {
      expiresIn: this.jwtExpiry,
      issuer: 'asb-api',
      audience: 'asb-client'
    });
  }

  // Refresh Token Generation
  generateRefreshToken(userId: string): string {
    const payload = {
      userId,
      type: 'refresh',
      random: Math.random().toString(36).substring(7)
    };
    
    return jwt.sign(payload, this.jwtSecret, {
      expiresIn: this.refreshTokenExpiry,
      issuer: 'asb-api'
    });
  }

  // Token Verification Middleware
  verifyToken(req: Request, res: Response, next: NextFunction): void {
    const token = this.extractToken(req);

    if (!token) {
      res.status(401).json({ error: 'No token provided' });
      return;
    }

    try {
      const decoded = jwt.verify(token, this.jwtSecret, {
        issuer: 'asb-api',
        audience: 'asb-client'
      }) as TokenPayload;

      (req as any).user = decoded;
      next();
    } catch (error: any) {
      if (error.name === 'TokenExpiredError') {
        res.status(401).json({ error: 'Token expired' });
      } else if (error.name === 'JsonWebTokenError') {
        res.status(401).json({ error: 'Invalid token' });
      } else {
        res.status(500).json({ error: 'Token verification failed' });
      }
    }
  }

  // Extract token from request
  private extractToken(req: Request): string | null {
    // Check Authorization header
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }

    // Check cookies
    if (req.cookies && req.cookies.token) {
      return req.cookies.token;
    }

    // Check query parameter (not recommended for production)
    if (req.query.token && typeof req.query.token === 'string') {
      return req.query.token;
    }

    return null;
  }

  // Role-based access control
  requireRole(roles: string | string[]) {
    const allowedRoles = Array.isArray(roles) ? roles : [roles];

    return (req: Request, res: Response, next: NextFunction) => {
      const user = (req as any).user;

      if (!user) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      if (!allowedRoles.includes(user.role)) {
        res.status(403).json({ error: 'Insufficient permissions' });
        return;
      }

      next();
    };
  }

  // Permission-based access control
  requirePermission(permissions: string | string[]) {
    const requiredPermissions = Array.isArray(permissions) ? permissions : [permissions];

    return (req: Request, res: Response, next: NextFunction) => {
      const user = (req as any).user;

      if (!user) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const hasPermission = requiredPermissions.every(perm => 
        user.permissions && user.permissions.includes(perm)
      );

      if (!hasPermission) {
        res.status(403).json({ 
          error: 'Missing required permissions',
          required: requiredPermissions,
          current: user.permissions
        });
        return;
      }

      next();
    };
  }

  // Password hashing
  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, this.saltRounds);
  }

  // Password verification
  async verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  // API Key generation
  generateApiKey(userId: string): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2);
    const hash = createHash('sha256')
      .update(`${userId}-${timestamp}-${random}-${this.jwtSecret}`)
      .digest('hex');
    
    return `asb_${hash.substring(0, 32)}`;
  }

  // API Key verification middleware
  verifyApiKey(req: Request, res: Response, next: NextFunction): void {
    const apiKey = req.headers['x-api-key'] as string;

    if (!apiKey) {
      res.status(401).json({ error: 'API key required' });
      return;
    }

    // In production, verify against database
    // For now, basic validation
    if (!apiKey.startsWith('asb_') || apiKey.length !== 36) {
      res.status(401).json({ error: 'Invalid API key format' });
      return;
    }

    // TODO: Verify API key against database
    // const isValid = await this.validateApiKeyInDb(apiKey);
    
    next();
  }
}

// Rate Limiting Configuration
export const createRateLimiter = (options?: {
  windowMs?: number;
  max?: number;
  message?: string;
  skipSuccessfulRequests?: boolean;
}) => {
  return rateLimit({
    windowMs: options?.windowMs || 15 * 60 * 1000, // 15 minutes
    max: options?.max || 100, // limit each IP to 100 requests per windowMs
    message: options?.message || 'Too many requests from this IP, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: options?.skipSuccessfulRequests || false
  });
};

// Specific rate limiters for different endpoints
export const rateLimiters = {
  // Strict limit for auth endpoints
  auth: createRateLimiter({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: 'Too many authentication attempts, please try again later.'
  }),

  // Standard API limit
  api: createRateLimiter({
    windowMs: 15 * 60 * 1000,
    max: 100
  }),

  // Relaxed limit for search
  search: createRateLimiter({
    windowMs: 1 * 60 * 1000,
    max: 30,
    skipSuccessfulRequests: true
  }),

  // Very strict for password reset
  passwordReset: createRateLimiter({
    windowMs: 60 * 60 * 1000,
    max: 3,
    message: 'Too many password reset attempts. Please try again in an hour.'
  })
};

// Security Headers Middleware
export const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"]
    }
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
});

// Input Sanitization Middleware
export const sanitizeInput = (req: Request, res: Response, next: NextFunction) => {
  // Sanitize body
  if (req.body) {
    req.body = sanitizeObject(req.body);
  }

  // Sanitize query parameters
  if (req.query) {
    req.query = sanitizeObject(req.query as any);
  }

  // Sanitize params
  if (req.params) {
    req.params = sanitizeObject(req.params);
  }

  next();
};

function sanitizeObject(obj: any): any {
  if (typeof obj !== 'object' || obj === null) {
    return sanitizeValue(obj);
  }

  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item));
  }

  const sanitized: any = {};
  for (const key in obj) {
    if (obj.hasOwnProperty(key)) {
      // Remove dangerous keys
      if (key.startsWith('$') || key.includes('__proto__')) {
        continue;
      }
      sanitized[key] = sanitizeObject(obj[key]);
    }
  }

  return sanitized;
}

function sanitizeValue(value: any): any {
  if (typeof value === 'string') {
    // Remove potential SQL injection patterns
    value = value.replace(/(['";\\])/g, '\\$1');
    
    // Remove script tags
    value = value.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
    
    // Remove SQL keywords in suspicious contexts
    const sqlKeywords = ['DROP', 'DELETE', 'INSERT', 'UPDATE', 'SELECT', 'UNION', 'OR 1=1'];
    for (const keyword of sqlKeywords) {
      const pattern = new RegExp(`\\b${keyword}\\b`, 'gi');
      value = value.replace(pattern, '');
    }
  }

  return value;
}

// CORS Configuration
export const corsOptions = {
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'];
    
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
  maxAge: 86400 // 24 hours
};