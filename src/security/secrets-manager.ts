import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';

export interface VaultConfig {
  endpoint: string;
  token?: string;
  roleId?: string;
  secretId?: string;
  namespace?: string;
  apiVersion?: string;
  caCert?: string;
  timeout?: number;
}

export interface Secret {
  key: string;
  value: string;
  version?: number;
  metadata?: Record<string, any>;
  createdAt?: Date;
  updatedAt?: Date;
  expiresAt?: Date;
}

export interface EncryptedSecret {
  ciphertext: string;
  iv: string;
  salt: string;
  tag: string;
  algorithm: string;
  keyDerivation: string;
}

export class SecretsManager {
  private vaultConfig?: VaultConfig;
  private cache: Map<string, { secret: Secret; expiry: number }> = new Map();
  private encryptionKey?: Buffer;
  private rotationCallbacks: Map<string, (newValue: string) => Promise<void>> = new Map();

  constructor(vaultConfig?: VaultConfig) {
    this.vaultConfig = vaultConfig;
    this.initializeEncryptionKey();
  }

  private async initializeEncryptionKey(): Promise<void> {
    const masterKey = process.env.MASTER_KEY || await this.generateMasterKey();
    this.encryptionKey = Buffer.from(masterKey, 'hex');
  }

  private async generateMasterKey(): Promise<string> {
    const key = crypto.randomBytes(32);
    const keyPath = path.join(process.cwd(), '.master.key');
    
    try {
      await fs.access(keyPath);
      const existingKey = await fs.readFile(keyPath, 'utf8');
      return existingKey.trim();
    } catch {
      await fs.writeFile(keyPath, key.toString('hex'), { mode: 0o600 });
      return key.toString('hex');
    }
  }

  async getSecret(key: string, options?: {
    version?: number;
    useCache?: boolean;
    decrypt?: boolean;
  }): Promise<Secret | null> {
    if (options?.useCache !== false) {
      const cached = this.getFromCache(key);
      if (cached) return cached;
    }

    if (this.vaultConfig) {
      return await this.getFromVault(key, options?.version);
    }

    return await this.getFromEnv(key, options?.decrypt);
  }

  async setSecret(secret: Secret, options?: {
    encrypt?: boolean;
    rotate?: boolean;
  }): Promise<void> {
    if (options?.rotate) {
      await this.rotateSecret(secret);
    }

    if (this.vaultConfig) {
      await this.saveToVault(secret);
    } else if (options?.encrypt) {
      await this.saveEncrypted(secret);
    } else {
      await this.saveToEnv(secret);
    }

    this.addToCache(secret);
  }

  async deleteSecret(key: string): Promise<void> {
    this.cache.delete(key);

    if (this.vaultConfig) {
      await this.deleteFromVault(key);
    } else {
      await this.deleteFromEnv(key);
    }
  }

  private async getFromVault(key: string, version?: number): Promise<Secret | null> {
    if (!this.vaultConfig) return null;

    const url = `${this.vaultConfig.endpoint}/v1/secret/data/${key}`;
    const headers: Record<string, string> = {
      'X-Vault-Token': this.vaultConfig.token || ''
    };

    if (this.vaultConfig.namespace) {
      headers['X-Vault-Namespace'] = this.vaultConfig.namespace;
    }

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers,
        signal: AbortSignal.timeout(this.vaultConfig.timeout || 5000)
      });

      if (!response.ok) {
        if (response.status === 404) return null;
        throw new Error(`Vault error: ${response.status}`);
      }

      const data = await response.json();
      const secretData = data.data.data;
      const metadata = data.data.metadata;

      return {
        key,
        value: secretData.value,
        version: metadata.version,
        metadata: secretData.metadata,
        createdAt: new Date(metadata.created_time),
        updatedAt: new Date(metadata.created_time)
      };
    } catch (error) {
      console.error('Vault fetch error:', error);
      return null;
    }
  }

  private async saveToVault(secret: Secret): Promise<void> {
    if (!this.vaultConfig) return;

    const url = `${this.vaultConfig.endpoint}/v1/secret/data/${secret.key}`;
    const headers: Record<string, string> = {
      'X-Vault-Token': this.vaultConfig.token || '',
      'Content-Type': 'application/json'
    };

    if (this.vaultConfig.namespace) {
      headers['X-Vault-Namespace'] = this.vaultConfig.namespace;
    }

    const payload = {
      data: {
        value: secret.value,
        metadata: secret.metadata
      }
    };

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(this.vaultConfig.timeout || 5000)
    });

    if (!response.ok) {
      throw new Error(`Vault save error: ${response.status}`);
    }
  }

  private async deleteFromVault(key: string): Promise<void> {
    if (!this.vaultConfig) return;

    const url = `${this.vaultConfig.endpoint}/v1/secret/metadata/${key}`;
    const headers: Record<string, string> = {
      'X-Vault-Token': this.vaultConfig.token || ''
    };

    if (this.vaultConfig.namespace) {
      headers['X-Vault-Namespace'] = this.vaultConfig.namespace;
    }

    const response = await fetch(url, {
      method: 'DELETE',
      headers,
      signal: AbortSignal.timeout(this.vaultConfig.timeout || 5000)
    });

    if (!response.ok && response.status !== 404) {
      throw new Error(`Vault delete error: ${response.status}`);
    }
  }

  private async getFromEnv(key: string, decrypt?: boolean): Promise<Secret | null> {
    const envKey = this.formatEnvKey(key);
    const value = process.env[envKey];

    if (!value) return null;

    let actualValue = value;
    if (decrypt && this.isEncrypted(value)) {
      actualValue = await this.decrypt(value);
    }

    return {
      key,
      value: actualValue,
      createdAt: new Date(),
      updatedAt: new Date()
    };
  }

  private async saveToEnv(secret: Secret): Promise<void> {
    const envKey = this.formatEnvKey(secret.key);
    process.env[envKey] = secret.value;

    const envPath = path.join(process.cwd(), '.env.secrets');
    const envContent = await this.readEnvFile(envPath);
    envContent[envKey] = secret.value;
    await this.writeEnvFile(envPath, envContent);
  }

  private async deleteFromEnv(key: string): Promise<void> {
    const envKey = this.formatEnvKey(key);
    delete process.env[envKey];

    const envPath = path.join(process.cwd(), '.env.secrets');
    const envContent = await this.readEnvFile(envPath);
    delete envContent[envKey];
    await this.writeEnvFile(envPath, envContent);
  }

  private async saveEncrypted(secret: Secret): Promise<void> {
    const encrypted = await this.encrypt(secret.value);
    const encryptedSecret = {
      ...secret,
      value: JSON.stringify(encrypted)
    };
    await this.saveToEnv(encryptedSecret);
  }

  private async encrypt(plaintext: string): Promise<EncryptedSecret> {
    if (!this.encryptionKey) {
      throw new Error('Encryption key not initialized');
    }

    const salt = crypto.randomBytes(32);
    const iv = crypto.randomBytes(16);
    
    const key = crypto.pbkdf2Sync(this.encryptionKey, salt, 100000, 32, 'sha256');
    
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    
    let ciphertext = cipher.update(plaintext, 'utf8', 'hex');
    ciphertext += cipher.final('hex');
    
    const tag = cipher.getAuthTag();

    return {
      ciphertext,
      iv: iv.toString('hex'),
      salt: salt.toString('hex'),
      tag: tag.toString('hex'),
      algorithm: 'aes-256-gcm',
      keyDerivation: 'pbkdf2'
    };
  }

  private async decrypt(encryptedData: string): Promise<string> {
    if (!this.encryptionKey) {
      throw new Error('Encryption key not initialized');
    }

    const encrypted: EncryptedSecret = JSON.parse(encryptedData);
    
    const salt = Buffer.from(encrypted.salt, 'hex');
    const iv = Buffer.from(encrypted.iv, 'hex');
    const tag = Buffer.from(encrypted.tag, 'hex');
    
    const key = crypto.pbkdf2Sync(this.encryptionKey, salt, 100000, 32, 'sha256');
    
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    
    let plaintext = decipher.update(encrypted.ciphertext, 'hex', 'utf8');
    plaintext += decipher.final('utf8');
    
    return plaintext;
  }

  private isEncrypted(value: string): boolean {
    try {
      const parsed = JSON.parse(value);
      return parsed.ciphertext && parsed.iv && parsed.salt && parsed.tag;
    } catch {
      return false;
    }
  }

  async rotateSecret(secret: Secret): Promise<void> {
    const oldSecret = await this.getSecret(secret.key);
    
    await this.setSecret(secret);

    const callback = this.rotationCallbacks.get(secret.key);
    if (callback) {
      await callback(secret.value);
    }

    if (oldSecret) {
      await this.archiveSecret(oldSecret);
    }
  }

  onRotation(key: string, callback: (newValue: string) => Promise<void>): void {
    this.rotationCallbacks.set(key, callback);
  }

  private async archiveSecret(secret: Secret): Promise<void> {
    const archivePath = path.join(process.cwd(), '.secrets-archive');
    await fs.mkdir(archivePath, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${secret.key}-${timestamp}.json`;
    const filepath = path.join(archivePath, filename);

    const encrypted = await this.encrypt(JSON.stringify(secret));
    await fs.writeFile(filepath, JSON.stringify(encrypted), { mode: 0o600 });
  }

  private formatEnvKey(key: string): string {
    return key.toUpperCase().replace(/[^A-Z0-9_]/g, '_');
  }

  private async readEnvFile(filepath: string): Promise<Record<string, string>> {
    try {
      const content = await fs.readFile(filepath, 'utf8');
      const env: Record<string, string> = {};
      
      content.split('\n').forEach(line => {
        const match = line.match(/^([^=]+)=(.*)$/);
        if (match) {
          env[match[1]] = match[2];
        }
      });

      return env;
    } catch {
      return {};
    }
  }

  private async writeEnvFile(filepath: string, env: Record<string, string>): Promise<void> {
    const content = Object.entries(env)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');

    await fs.writeFile(filepath, content, { mode: 0o600 });
  }

  private getFromCache(key: string): Secret | null {
    const cached = this.cache.get(key);
    if (!cached) return null;

    if (Date.now() > cached.expiry) {
      this.cache.delete(key);
      return null;
    }

    return cached.secret;
  }

  private addToCache(secret: Secret, ttl: number = 300000): void {
    this.cache.set(secret.key, {
      secret,
      expiry: Date.now() + ttl
    });
  }

  async validateSecrets(required: string[]): Promise<{
    valid: boolean;
    missing: string[];
  }> {
    const missing: string[] = [];

    for (const key of required) {
      const secret = await this.getSecret(key);
      if (!secret || !secret.value) {
        missing.push(key);
      }
    }

    return {
      valid: missing.length === 0,
      missing
    };
  }

  generateSecureToken(length: number = 32): string {
    return crypto.randomBytes(length).toString('hex');
  }

  generateApiKey(prefix?: string): string {
    const token = crypto.randomBytes(24).toString('base64').replace(/[+/=]/g, '');
    return prefix ? `${prefix}_${token}` : token;
  }

  async hashPassword(password: string): Promise<string> {
    const salt = crypto.randomBytes(16);
    return new Promise((resolve, reject) => {
      crypto.pbkdf2(password, salt, 100000, 64, 'sha512', (err, derivedKey) => {
        if (err) reject(err);
        else resolve(salt.toString('hex') + ':' + derivedKey.toString('hex'));
      });
    });
  }

  async verifyPassword(password: string, hash: string): Promise<boolean> {
    const [salt, key] = hash.split(':');
    return new Promise((resolve, reject) => {
      crypto.pbkdf2(password, Buffer.from(salt, 'hex'), 100000, 64, 'sha512', (err, derivedKey) => {
        if (err) reject(err);
        else resolve(key === derivedKey.toString('hex'));
      });
    });
  }
}

export class VaultClient {
  private config: VaultConfig;
  private token?: string;

  constructor(config: VaultConfig) {
    this.config = config;
    this.token = config.token;
  }

  async authenticate(): Promise<void> {
    if (this.config.roleId && this.config.secretId) {
      await this.appRoleAuth();
    } else if (this.config.token) {
      await this.validateToken();
    } else {
      throw new Error('No authentication method configured');
    }
  }

  private async appRoleAuth(): Promise<void> {
    const url = `${this.config.endpoint}/v1/auth/approle/login`;
    const payload = {
      role_id: this.config.roleId,
      secret_id: this.config.secretId
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`AppRole authentication failed: ${response.status}`);
    }

    const data = await response.json();
    this.token = data.auth.client_token;
  }

  private async validateToken(): Promise<void> {
    const url = `${this.config.endpoint}/v1/auth/token/lookup-self`;
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'X-Vault-Token': this.token! }
    });

    if (!response.ok) {
      throw new Error(`Token validation failed: ${response.status}`);
    }
  }

  async read(path: string): Promise<any> {
    const url = `${this.config.endpoint}/v1/${path}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'X-Vault-Token': this.token! }
    });

    if (!response.ok) {
      if (response.status === 404) return null;
      throw new Error(`Vault read error: ${response.status}`);
    }

    return await response.json();
  }

  async write(path: string, data: any): Promise<void> {
    const url = `${this.config.endpoint}/v1/${path}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'X-Vault-Token': this.token!,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    });

    if (!response.ok) {
      throw new Error(`Vault write error: ${response.status}`);
    }
  }

  async delete(path: string): Promise<void> {
    const url = `${this.config.endpoint}/v1/${path}`;
    const response = await fetch(url, {
      method: 'DELETE',
      headers: { 'X-Vault-Token': this.token! }
    });

    if (!response.ok && response.status !== 404) {
      throw new Error(`Vault delete error: ${response.status}`);
    }
  }

  async list(path: string): Promise<string[]> {
    const url = `${this.config.endpoint}/v1/${path}?list=true`;
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'X-Vault-Token': this.token! }
    });

    if (!response.ok) {
      if (response.status === 404) return [];
      throw new Error(`Vault list error: ${response.status}`);
    }

    const data = await response.json();
    return data.data.keys || [];
  }
}

export default SecretsManager;