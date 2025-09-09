import jwt, { JwtPayload, SignOptions, VerifyOptions } from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import Redis from 'ioredis';

export interface User {
  id: string;
  email: string;
  role: string;
  permissions?: string[];
  metadata?: Record<string, any>;
}

export interface TokenPayload extends JwtPayload {
  user: User;
  type: 'access' | 'refresh';
  sessionId?: string;
  fingerprint?: string;
}

export interface AuthConfig {
  accessTokenSecret: string;
  refreshTokenSecret: string;
  accessTokenExpiry: string;
  refreshTokenExpiry: string;
  issuer: string;
  audience: string;
  algorithm?: jwt.Algorithm;
  blacklistEnabled?: boolean;
  fingerprintEnabled?: boolean;
  rotationEnabled?: boolean;
}

export class JWTAuthService {
  private config: AuthConfig;
  private redis?: Redis;
  private publicKey?: string;
  private privateKey?: string;

  constructor(config: AuthConfig, redis?: Redis) {
    this.config = {
      algorithm: 'HS256',
      blacklistEnabled: true,
      fingerprintEnabled: true,
      rotationEnabled: true,
      ...config
    };
    this.redis = redis;

    if (this.config.algorithm.startsWith('RS') || this.config.algorithm.startsWith('ES')) {
      this.generateKeyPair();
    }
  }

  private generateKeyPair(): void {
    if (this.config.algorithm.startsWith('RS')) {
      const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
      });
      this.publicKey = publicKey;
      this.privateKey = privateKey;
    } else if (this.config.algorithm.startsWith('ES')) {
      const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', {
        namedCurve: 'P-256',
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
      });
      this.publicKey = publicKey;
      this.privateKey = privateKey;
    }
  }

  generateAccessToken(user: User, sessionId?: string, fingerprint?: string): string {
    const payload: TokenPayload = {
      user,
      type: 'access',
      sessionId: sessionId || this.generateSessionId(),
      fingerprint: this.config.fingerprintEnabled ? fingerprint : undefined
    };

    const options: SignOptions = {
      expiresIn: this.config.accessTokenExpiry,
      issuer: this.config.issuer,
      audience: this.config.audience,
      algorithm: this.config.algorithm,
      jwtid: this.generateTokenId()
    };

    const secret = this.privateKey || this.config.accessTokenSecret;
    return jwt.sign(payload, secret, options);
  }

  generateRefreshToken(user: User, sessionId?: string): string {
    const payload: TokenPayload = {
      user: { id: user.id, email: user.email, role: user.role },
      type: 'refresh',
      sessionId: sessionId || this.generateSessionId()
    };

    const options: SignOptions = {
      expiresIn: this.config.refreshTokenExpiry,
      issuer: this.config.issuer,
      audience: this.config.audience,
      algorithm: this.config.algorithm,
      jwtid: this.generateTokenId()
    };

    const secret = this.privateKey || this.config.refreshTokenSecret;
    return jwt.sign(payload, secret, options);
  }

  async verifyAccessToken(token: string, fingerprint?: string): Promise<TokenPayload> {
    if (await this.isBlacklisted(token)) {
      throw new Error('Token has been revoked');
    }

    const options: VerifyOptions = {
      issuer: this.config.issuer,
      audience: this.config.audience,
      algorithms: [this.config.algorithm]
    };

    const secret = this.publicKey || this.config.accessTokenSecret;
    const payload = jwt.verify(token, secret, options) as TokenPayload;

    if (payload.type !== 'access') {
      throw new Error('Invalid token type');
    }

    if (this.config.fingerprintEnabled && payload.fingerprint !== fingerprint) {
      throw new Error('Invalid token fingerprint');
    }

    return payload;
  }

  async verifyRefreshToken(token: string): Promise<TokenPayload> {
    if (await this.isBlacklisted(token)) {
      throw new Error('Token has been revoked');
    }

    const options: VerifyOptions = {
      issuer: this.config.issuer,
      audience: this.config.audience,
      algorithms: [this.config.algorithm]
    };

    const secret = this.publicKey || this.config.refreshTokenSecret;
    const payload = jwt.verify(token, secret, options) as TokenPayload;

    if (payload.type !== 'refresh') {
      throw new Error('Invalid token type');
    }

    return payload;
  }

  async refreshTokens(refreshToken: string, fingerprint?: string): Promise<{
    accessToken: string;
    refreshToken: string;
  }> {
    const payload = await this.verifyRefreshToken(refreshToken);

    if (this.config.rotationEnabled) {
      await this.blacklistToken(refreshToken);
    }

    const user = payload.user;
    const sessionId = payload.sessionId;

    const newAccessToken = this.generateAccessToken(user, sessionId, fingerprint);
    const newRefreshToken = this.config.rotationEnabled
      ? this.generateRefreshToken(user, sessionId)
      : refreshToken;

    if (this.redis && sessionId) {
      await this.updateSession(sessionId, user, newAccessToken, newRefreshToken);
    }

    return {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken
    };
  }

  async revokeToken(token: string): Promise<void> {
    await this.blacklistToken(token);
  }

  async revokeSession(sessionId: string): Promise<void> {
    if (!this.redis) return;

    const sessionKey = `session:${sessionId}`;
    const session = await this.redis.get(sessionKey);

    if (session) {
      const sessionData = JSON.parse(session);
      if (sessionData.accessToken) {
        await this.blacklistToken(sessionData.accessToken);
      }
      if (sessionData.refreshToken) {
        await this.blacklistToken(sessionData.refreshToken);
      }
      await this.redis.del(sessionKey);
    }
  }

  async revokeAllUserSessions(userId: string): Promise<void> {
    if (!this.redis) return;

    const pattern = `session:*`;
    const keys = await this.redis.keys(pattern);

    for (const key of keys) {
      const session = await this.redis.get(key);
      if (session) {
        const sessionData = JSON.parse(session);
        if (sessionData.userId === userId) {
          await this.revokeSession(key.replace('session:', ''));
        }
      }
    }
  }

  private async blacklistToken(token: string): Promise<void> {
    if (!this.redis || !this.config.blacklistEnabled) return;

    const decoded = jwt.decode(token) as JwtPayload;
    if (!decoded || !decoded.exp) return;

    const ttl = decoded.exp - Math.floor(Date.now() / 1000);
    if (ttl > 0) {
      const tokenId = decoded.jti || this.hashToken(token);
      await this.redis.set(`blacklist:${tokenId}`, '1', 'EX', ttl);
    }
  }

  private async isBlacklisted(token: string): Promise<boolean> {
    if (!this.redis || !this.config.blacklistEnabled) return false;

    const decoded = jwt.decode(token) as JwtPayload;
    if (!decoded) return true;

    const tokenId = decoded.jti || this.hashToken(token);
    const blacklisted = await this.redis.get(`blacklist:${tokenId}`);
    return blacklisted === '1';
  }

  private async updateSession(
    sessionId: string,
    user: User,
    accessToken: string,
    refreshToken: string
  ): Promise<void> {
    if (!this.redis) return;

    const sessionData = {
      userId: user.id,
      user,
      accessToken,
      refreshToken,
      createdAt: new Date().toISOString(),
      lastActivity: new Date().toISOString()
    };

    const ttl = this.parseExpiry(this.config.refreshTokenExpiry);
    await this.redis.set(
      `session:${sessionId}`,
      JSON.stringify(sessionData),
      'EX',
      ttl
    );
  }

  private generateSessionId(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  private generateTokenId(): string {
    return crypto.randomBytes(16).toString('hex');
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex').substring(0, 16);
  }

  private parseExpiry(expiry: string): number {
    const units: Record<string, number> = {
      s: 1,
      m: 60,
      h: 3600,
      d: 86400,
      w: 604800
    };

    const match = expiry.match(/^(\d+)([smhdw])$/);
    if (!match) return 3600;

    const [, value, unit] = match;
    return parseInt(value) * units[unit];
  }

  generateFingerprint(req: Request): string {
    const components = [
      req.headers['user-agent'] || '',
      req.headers['accept-language'] || '',
      req.headers['accept-encoding'] || '',
      req.ip || ''
    ];

    return crypto
      .createHash('sha256')
      .update(components.join('|'))
      .digest('hex')
      .substring(0, 16);
  }

  middleware(options?: {
    optional?: boolean;
    roles?: string[];
    permissions?: string[];
  }) {
    return async (req: Request, res: Response, next: NextFunction) => {
      try {
        const token = this.extractToken(req);

        if (!token) {
          if (options?.optional) {
            return next();
          }
          return res.status(401).json({ error: 'No token provided' });
        }

        const fingerprint = this.config.fingerprintEnabled
          ? this.generateFingerprint(req)
          : undefined;

        const payload = await this.verifyAccessToken(token, fingerprint);

        if (options?.roles && !options.roles.includes(payload.user.role)) {
          return res.status(403).json({ error: 'Insufficient role' });
        }

        if (options?.permissions) {
          const userPermissions = payload.user.permissions || [];
          const hasPermission = options.permissions.some(p => userPermissions.includes(p));
          if (!hasPermission) {
            return res.status(403).json({ error: 'Insufficient permissions' });
          }
        }

        (req as any).user = payload.user;
        (req as any).sessionId = payload.sessionId;
        (req as any).token = token;

        next();
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Invalid token';
        res.status(401).json({ error: message });
      }
    };
  }

  private extractToken(req: Request): string | null {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }

    const cookieToken = req.cookies?.token;
    if (cookieToken) {
      return cookieToken;
    }

    const queryToken = req.query.token as string;
    if (queryToken) {
      return queryToken;
    }

    return null;
  }
}

export class PermissionManager {
  private permissions: Map<string, Set<string>> = new Map();
  private roleHierarchy: Map<string, string[]> = new Map();

  constructor() {
    this.setupDefaultRoles();
  }

  private setupDefaultRoles(): void {
    this.roleHierarchy.set('admin', ['moderator', 'user']);
    this.roleHierarchy.set('moderator', ['user']);
    this.roleHierarchy.set('user', []);

    this.permissions.set('admin', new Set([
      'admin.access',
      'users.manage',
      'content.delete',
      'settings.modify',
      'logs.view',
      'system.configure'
    ]));

    this.permissions.set('moderator', new Set([
      'content.moderate',
      'users.view',
      'reports.handle'
    ]));

    this.permissions.set('user', new Set([
      'content.create',
      'content.read',
      'profile.update'
    ]));
  }

  hasPermission(role: string, permission: string): boolean {
    const rolePermissions = this.permissions.get(role);
    if (rolePermissions?.has(permission)) {
      return true;
    }

    const inheritedRoles = this.roleHierarchy.get(role) || [];
    for (const inheritedRole of inheritedRoles) {
      if (this.hasPermission(inheritedRole, permission)) {
        return true;
      }
    }

    return false;
  }

  getRolePermissions(role: string): string[] {
    const allPermissions = new Set<string>();

    const directPermissions = this.permissions.get(role);
    if (directPermissions) {
      directPermissions.forEach(p => allPermissions.add(p));
    }

    const inheritedRoles = this.roleHierarchy.get(role) || [];
    for (const inheritedRole of inheritedRoles) {
      const inheritedPermissions = this.getRolePermissions(inheritedRole);
      inheritedPermissions.forEach(p => allPermissions.add(p));
    }

    return Array.from(allPermissions);
  }

  addRole(role: string, permissions: string[], inherits?: string[]): void {
    this.permissions.set(role, new Set(permissions));
    if (inherits) {
      this.roleHierarchy.set(role, inherits);
    }
  }

  addPermissionToRole(role: string, permission: string): void {
    const rolePermissions = this.permissions.get(role) || new Set();
    rolePermissions.add(permission);
    this.permissions.set(role, rolePermissions);
  }

  removePermissionFromRole(role: string, permission: string): void {
    const rolePermissions = this.permissions.get(role);
    if (rolePermissions) {
      rolePermissions.delete(permission);
    }
  }
}

export default JWTAuthService;