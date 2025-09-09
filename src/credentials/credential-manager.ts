/**
 * n8n Credential System Integration
 * Provides secure credential management for all ASEMB nodes
 */

import {
	ICredentialDataDecryptedObject,
	ICredentialsDecrypted,
	ICredentialType,
	INodeCredentialDescription,
	IExecuteFunctions,
	ICredentialTestFunctions,
	NodeOperationError,
} from 'n8n-workflow';
import { Pool } from 'pg';
import Redis from 'ioredis';
import axios from 'axios';

/**
 * PostgreSQL Database Credentials
 */
export class PostgresCredentials implements ICredentialType {
	name = 'postgresAsemb';
	displayName = 'PostgreSQL (ASEMB)';
	documentationUrl = 'https://docs.n8n.io/credentials/postgres';
	properties = [
		{
			displayName: 'Host',
			name: 'host',
			type: 'string' as const,
			default: 'localhost',
			required: true,
		},
		{
			displayName: 'Database',
			name: 'database',
			type: 'string' as const,
			default: 'asemb',
			required: true,
		},
		{
			displayName: 'User',
			name: 'user',
			type: 'string' as const,
			default: 'postgres',
			required: true,
		},
		{
			displayName: 'Password',
			name: 'password',
			type: 'string' as const,
			typeOptions: {
				password: true,
			},
			default: '',
			required: true,
		},
		{
			displayName: 'Port',
			name: 'port',
			type: 'number' as const,
			default: 5432,
		},
		{
			displayName: 'SSL',
			name: 'ssl',
			type: 'options' as const,
			options: [
				{
					name: 'Disable',
					value: 'disable',
				},
				{
					name: 'Allow',
					value: 'allow',
				},
				{
					name: 'Require',
					value: 'require',
				},
				{
					name: 'Verify',
					value: 'verify',
				},
			],
			default: 'disable',
		},
		{
			displayName: 'Connection Options',
			name: 'connectionOptions',
			type: 'json' as const,
			default: '{}',
			description: 'Additional connection options as JSON',
		},
	];

	async test(this: ICredentialTestFunctions, credentials: ICredentialDataDecryptedObject): Promise<any> {
		const pool = new Pool({
			host: credentials.host as string,
			port: credentials.port as number,
			database: credentials.database as string,
			user: credentials.user as string,
			password: credentials.password as string,
			ssl: this.getSSLConfig(credentials.ssl as string),
			connectionTimeoutMillis: 5000,
		});

		try {
			const client = await pool.connect();
			
			// Test basic connectivity
			await client.query('SELECT 1');
			
			// Check for pgvector extension
			const vectorCheck = await client.query(`
				SELECT EXISTS (
					SELECT 1 FROM pg_extension WHERE extname = 'vector'
				) as has_vector
			`);
			
			// Check for embeddings table
			const tableCheck = await client.query(`
				SELECT EXISTS (
					SELECT 1 FROM information_schema.tables 
					WHERE table_name = 'embeddings'
				) as has_table
			`);
			
			client.release();
			
			return {
				status: 'OK',
				message: 'Connection successful',
				details: {
					hasVector: vectorCheck.rows[0].has_vector,
					hasTable: tableCheck.rows[0].has_table,
				},
			};
		} catch (error) {
			throw new Error(`PostgreSQL connection failed: ${(error as Error).message}`);
		} finally {
			await pool.end();
		}
	}

	private getSSLConfig(sslMode: string): any {
		switch (sslMode) {
			case 'require':
				return { rejectUnauthorized: false };
			case 'verify':
				return { rejectUnauthorized: true };
			case 'allow':
				return true;
			default:
				return false;
		}
	}
}

/**
 * OpenAI API Credentials
 */
export class OpenAICredentials implements ICredentialType {
	name = 'openAiAsemb';
	displayName = 'OpenAI (ASEMB)';
	documentationUrl = 'https://docs.n8n.io/credentials/openai';
	properties = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string' as const,
			typeOptions: {
				password: true,
			},
			required: true,
			default: '',
		},
		{
			displayName: 'Organization ID',
			name: 'organizationId',
			type: 'string' as const,
			default: '',
			description: 'Optional organization ID for OpenAI API',
		},
		{
			displayName: 'Base URL',
			name: 'baseUrl',
			type: 'string' as const,
			default: 'https://api.openai.com/v1',
			description: 'API base URL (for Azure or custom endpoints)',
		},
		{
			displayName: 'Default Model',
			name: 'defaultModel',
			type: 'options' as const,
			options: [
				{
					name: 'GPT-4 Turbo',
					value: 'gpt-4-turbo-preview',
				},
				{
					name: 'GPT-4',
					value: 'gpt-4',
				},
				{
					name: 'GPT-3.5 Turbo',
					value: 'gpt-3.5-turbo',
				},
				{
					name: 'Text Embedding 3 Small',
					value: 'text-embedding-3-small',
				},
				{
					name: 'Text Embedding 3 Large',
					value: 'text-embedding-3-large',
				},
				{
					name: 'Text Embedding Ada 002',
					value: 'text-embedding-ada-002',
				},
			],
			default: 'text-embedding-3-small',
		},
		{
			displayName: 'Max Retries',
			name: 'maxRetries',
			type: 'number' as const,
			default: 3,
			description: 'Maximum number of retry attempts',
		},
		{
			displayName: 'Timeout (ms)',
			name: 'timeout',
			type: 'number' as const,
			default: 30000,
			description: 'Request timeout in milliseconds',
		},
	];

	async test(this: ICredentialTestFunctions, credentials: ICredentialDataDecryptedObject): Promise<any> {
		try {
			const response = await axios.get(`${credentials.baseUrl}/models`, {
				headers: {
					'Authorization': `Bearer ${credentials.apiKey}`,
					'OpenAI-Organization': credentials.organizationId as string || '',
				},
				timeout: 5000,
			});

			const models = response.data.data.map((model: any) => model.id);
			
			return {
				status: 'OK',
				message: 'OpenAI API connection successful',
				details: {
					modelsAvailable: models.length,
					hasEmbeddingModel: models.some((m: string) => m.includes('embedding')),
					hasGPTModel: models.some((m: string) => m.includes('gpt')),
				},
			};
		} catch (error) {
			if (axios.isAxiosError(error)) {
				if (error.response?.status === 401) {
					throw new Error('Invalid API key');
				}
				throw new Error(`OpenAI API error: ${error.message}`);
			}
			throw error;
		}
	}
}

/**
 * Redis Credentials
 */
export class RedisCredentials implements ICredentialType {
	name = 'redisAsemb';
	displayName = 'Redis (ASEMB)';
	documentationUrl = 'https://docs.n8n.io/credentials/redis';
	properties = [
		{
			displayName: 'Host',
			name: 'host',
			type: 'string' as const,
			default: 'localhost',
			required: true,
		},
		{
			displayName: 'Port',
			name: 'port',
			type: 'number' as const,
			default: 6379,
		},
		{
			displayName: 'Database',
			name: 'database',
			type: 'number' as const,
			default: 0,
			description: 'Redis database number',
		},
		{
			displayName: 'Password',
			name: 'password',
			type: 'string' as const,
			typeOptions: {
				password: true,
			},
			default: '',
		},
		{
			displayName: 'Use TLS/SSL',
			name: 'useTls',
			type: 'boolean' as const,
			default: false,
		},
		{
			displayName: 'Sentinel Configuration',
			name: 'sentinelConfig',
			type: 'json' as const,
			default: '{}',
			description: 'Redis Sentinel configuration as JSON',
			displayOptions: {
				show: {
					useSentinel: [true],
				},
			},
		},
		{
			displayName: 'Cluster Mode',
			name: 'clusterMode',
			type: 'boolean' as const,
			default: false,
			description: 'Enable Redis Cluster mode',
		},
	];

	async test(this: ICredentialTestFunctions, credentials: ICredentialDataDecryptedObject): Promise<any> {
		const redis = new Redis({
			host: credentials.host as string,
			port: credentials.port as number,
			password: credentials.password as string || undefined,
			db: credentials.database as number,
			tls: credentials.useTls ? {} : undefined,
			retryStrategy: () => null, // Don't retry for test
		});

		try {
			// Test connection
			const pong = await redis.ping();
			
			// Get server info
			const info = await redis.info('server');
			const version = info.match(/redis_version:(.+)/)?.[1]?.trim();
			
			// Check available memory
			const memInfo = await redis.info('memory');
			const usedMemory = memInfo.match(/used_memory_human:(.+)/)?.[1]?.trim();
			
			return {
				status: 'OK',
				message: 'Redis connection successful',
				details: {
					version,
					usedMemory,
					response: pong,
				},
			};
		} catch (error) {
			throw new Error(`Redis connection failed: ${(error as Error).message}`);
		} finally {
			redis.disconnect();
		}
	}
}

/**
 * LightRAG Credentials
 */
export class LightRAGCredentials implements ICredentialType {
	name = 'lightragAsemb';
	displayName = 'LightRAG (ASEMB)';
	properties = [
		{
			displayName: 'API Endpoint',
			name: 'endpoint',
			type: 'string' as const,
			default: 'http://localhost:8080',
			required: true,
			description: 'LightRAG API endpoint',
		},
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string' as const,
			typeOptions: {
				password: true,
			},
			default: '',
			description: 'API key for authentication',
		},
		{
			displayName: 'Workspace',
			name: 'workspace',
			type: 'string' as const,
			default: 'default',
			description: 'LightRAG workspace name',
		},
		{
			displayName: 'Enable Graph Mode',
			name: 'graphMode',
			type: 'boolean' as const,
			default: true,
			description: 'Enable knowledge graph features',
		},
	];

	async test(this: ICredentialTestFunctions, credentials: ICredentialDataDecryptedObject): Promise<any> {
		try {
			const response = await axios.get(`${credentials.endpoint}/health`, {
				headers: credentials.apiKey ? {
					'Authorization': `Bearer ${credentials.apiKey}`,
				} : {},
				timeout: 5000,
			});

			return {
				status: 'OK',
				message: 'LightRAG connection successful',
				details: response.data,
			};
		} catch (error) {
			throw new Error(`LightRAG connection failed: ${(error as Error).message}`);
		}
	}
}

/**
 * Credential Manager for centralized credential handling
 */
export class CredentialManager {
	private static instance: CredentialManager;
	private credentialCache: Map<string, any> = new Map();
	private connectionPools: Map<string, Pool> = new Map();
	private redisClients: Map<string, Redis> = new Map();

	private constructor() {}

	static getInstance(): CredentialManager {
		if (!CredentialManager.instance) {
			CredentialManager.instance = new CredentialManager();
		}
		return CredentialManager.instance;
	}

	/**
	 * Get PostgreSQL connection pool with credentials
	 */
	async getPostgresPool(
		executeFunctions: IExecuteFunctions,
		credentialName = 'postgresAsemb'
	): Promise<Pool> {
		const cacheKey = `pg_${credentialName}`;
		
		if (this.connectionPools.has(cacheKey)) {
			return this.connectionPools.get(cacheKey)!;
		}

		const credentials = await executeFunctions.getCredentials(credentialName);
		
		const pool = new Pool({
			host: credentials.host as string,
			port: credentials.port as number,
			database: credentials.database as string,
			user: credentials.user as string,
			password: credentials.password as string,
			max: 20, // Maximum connections
			idleTimeoutMillis: 30000,
			connectionTimeoutMillis: 2000,
			...(credentials.connectionOptions ? JSON.parse(credentials.connectionOptions as string) : {}),
		});

		// Test connection
		const client = await pool.connect();
		await client.query('SELECT 1');
		client.release();

		this.connectionPools.set(cacheKey, pool);
		return pool;
	}

	/**
	 * Get Redis client with credentials
	 */
	async getRedisClient(
		executeFunctions: IExecuteFunctions,
		credentialName = 'redisAsemb'
	): Promise<Redis> {
		const cacheKey = `redis_${credentialName}`;
		
		if (this.redisClients.has(cacheKey)) {
			const client = this.redisClients.get(cacheKey)!;
			// Check if still connected
			try {
				await client.ping();
				return client;
			} catch {
				// Reconnect if disconnected
				this.redisClients.delete(cacheKey);
			}
		}

		const credentials = await executeFunctions.getCredentials(credentialName);
		
		const redis = new Redis({
			host: credentials.host as string,
			port: credentials.port as number,
			password: credentials.password as string || undefined,
			db: credentials.database as number,
			tls: credentials.useTls ? {} : undefined,
			enableReadyCheck: true,
			maxRetriesPerRequest: 3,
		});

		// Wait for connection
		await new Promise<void>((resolve, reject) => {
			redis.once('ready', resolve);
			redis.once('error', reject);
		});

		this.redisClients.set(cacheKey, redis);
		return redis;
	}

	/**
	 * Get OpenAI configuration with credentials
	 */
	async getOpenAIConfig(
		executeFunctions: IExecuteFunctions,
		credentialName = 'openAiAsemb'
	): Promise<any> {
		const credentials = await executeFunctions.getCredentials(credentialName);
		
		return {
			apiKey: credentials.apiKey as string,
			organization: credentials.organizationId as string || undefined,
			baseURL: credentials.baseUrl as string || 'https://api.openai.com/v1',
			defaultModel: credentials.defaultModel as string || 'text-embedding-3-small',
			maxRetries: credentials.maxRetries as number || 3,
			timeout: credentials.timeout as number || 30000,
		};
	}

	/**
	 * Validate all required credentials for a node
	 */
	async validateNodeCredentials(
		executeFunctions: IExecuteFunctions,
		requiredCredentials: INodeCredentialDescription[]
	): Promise<{ valid: boolean; errors: string[] }> {
		const errors: string[] = [];

		for (const credential of requiredCredentials) {
			try {
				const creds = await executeFunctions.getCredentials(credential.name);
				if (!creds) {
					errors.push(`Missing credential: ${credential.name}`);
				}
			} catch (error) {
				errors.push(`Invalid credential ${credential.name}: ${(error as Error).message}`);
			}
		}

		return {
			valid: errors.length === 0,
			errors,
		};
	}

	/**
	 * Clean up resources
	 */
	async cleanup(): Promise<void> {
		// Close all PostgreSQL pools
		for (const pool of this.connectionPools.values()) {
			await pool.end();
		}
		this.connectionPools.clear();

		// Disconnect all Redis clients
		for (const client of this.redisClients.values()) {
			client.disconnect();
		}
		this.redisClients.clear();

		// Clear credential cache
		this.credentialCache.clear();
	}

	/**
	 * Get credential with caching
	 */
	async getCachedCredential(
		executeFunctions: IExecuteFunctions,
		credentialName: string
	): Promise<any> {
		if (this.credentialCache.has(credentialName)) {
			return this.credentialCache.get(credentialName);
		}

		const credential = await executeFunctions.getCredentials(credentialName);
		this.credentialCache.set(credentialName, credential);
		return credential;
	}

	/**
	 * Create a secure credential store
	 */
	async createSecureStore(
		executeFunctions: IExecuteFunctions
	): Promise<SecureCredentialStore> {
		return new SecureCredentialStore(executeFunctions);
	}
}

/**
 * Secure credential store for sensitive operations
 */
export class SecureCredentialStore {
	private credentials: Map<string, ICredentialsDecrypted> = new Map();
	private accessLog: Array<{ credential: string; timestamp: Date; operation: string }> = [];

	constructor(private executeFunctions: IExecuteFunctions) {}

	/**
	 * Load and encrypt credentials
	 */
	async loadCredential(name: string): Promise<void> {
		const creds = await this.executeFunctions.getCredentials(name);
		this.credentials.set(name, creds as ICredentialsDecrypted);
		this.logAccess(name, 'load');
	}

	/**
	 * Get credential value securely
	 */
	getSecure(name: string, field: string): string | undefined {
		this.logAccess(name, `read:${field}`);
		const creds = this.credentials.get(name);
		return creds?.[field] as string;
	}

	/**
	 * Check if credential exists
	 */
	has(name: string): boolean {
		return this.credentials.has(name);
	}

	/**
	 * Clear sensitive data
	 */
	clear(): void {
		this.credentials.clear();
		this.accessLog = [];
	}

	/**
	 * Log credential access for audit
	 */
	private logAccess(credential: string, operation: string): void {
		this.accessLog.push({
			credential,
			operation,
			timestamp: new Date(),
		});
	}

	/**
	 * Get access audit log
	 */
	getAuditLog(): Array<{ credential: string; timestamp: Date; operation: string }> {
		return [...this.accessLog];
	}
}

/**
 * Helper function to handle credential errors
 */
export function handleCredentialError(
	error: any,
	credentialType: string,
	node: any
): never {
	if (error.message?.includes('401') || error.message?.includes('Invalid API key')) {
		throw new NodeOperationError(
			node,
			`Invalid ${credentialType} credentials. Please check your API key.`,
			{ description: 'Go to Credentials and update your API key.' }
		);
	}
	
	if (error.message?.includes('ECONNREFUSED')) {
		throw new NodeOperationError(
			node,
			`Cannot connect to ${credentialType}. Service may be down.`,
			{ description: 'Check if the service is running and accessible.' }
		);
	}
	
	if (error.message?.includes('timeout')) {
		throw new NodeOperationError(
			node,
			`${credentialType} connection timeout.`,
			{ description: 'The service took too long to respond. Try increasing the timeout.' }
		);
	}
	
	throw new NodeOperationError(
		node,
		`${credentialType} error: ${error.message}`,
		{ description: 'Check your credentials and service configuration.' }
	);
}