import { Pool, QueryConfig, QueryResult } from 'pg';
import sqlstring from 'sqlstring';

export interface QueryValidator {
  validate(query: string, params?: any[]): boolean;
  sanitize(query: string, params?: any[]): { query: string; params: any[] };
}

export interface PreparedStatement {
  name: string;
  text: string;
  paramTypes?: string[];
}

export class SQLInjectionPrevention {
  private pool: Pool;
  private preparedStatements: Map<string, PreparedStatement> = new Map();
  private queryWhitelist: Set<string> = new Set();
  private parameterValidator: ParameterValidator;
  private queryAnalyzer: QueryAnalyzer;

  constructor(pool: Pool) {
    this.pool = pool;
    this.parameterValidator = new ParameterValidator();
    this.queryAnalyzer = new QueryAnalyzer();
    this.initializeWhitelist();
  }

  private initializeWhitelist(): void {
    this.queryWhitelist.add('SELECT * FROM users WHERE id = $1');
    this.queryWhitelist.add('SELECT * FROM documents WHERE project_id = $1 AND deleted_at IS NULL');
    this.queryWhitelist.add('INSERT INTO vectors (id, embedding, metadata) VALUES ($1, $2, $3)');
    this.queryWhitelist.add('UPDATE users SET last_login = $1 WHERE id = $2');
    this.queryWhitelist.add('DELETE FROM sessions WHERE expires_at < $1');
  }

  async prepareStatement(name: string, text: string, paramTypes?: string[]): Promise<void> {
    const statement: PreparedStatement = { name, text, paramTypes };
    this.preparedStatements.set(name, statement);

    const client = await this.pool.connect();
    try {
      await client.query({
        name,
        text,
        values: []
      });
    } finally {
      client.release();
    }
  }

  async executePrepared(
    name: string,
    params: any[]
  ): Promise<QueryResult> {
    const statement = this.preparedStatements.get(name);
    if (!statement) {
      throw new Error(`Prepared statement '${name}' not found`);
    }

    const validatedParams = this.parameterValidator.validateParams(params, statement.paramTypes);

    const queryConfig: QueryConfig = {
      name,
      text: statement.text,
      values: validatedParams
    };

    return await this.pool.query(queryConfig);
  }

  async safeQuery(
    query: string,
    params?: any[],
    options?: {
      allowDynamic?: boolean;
      validateOnly?: boolean;
      logAttempts?: boolean;
    }
  ): Promise<QueryResult> {
    const isWhitelisted = this.queryWhitelist.has(query);
    const isDangerous = this.queryAnalyzer.detectDangerousPatterns(query);

    if (isDangerous && !options?.allowDynamic) {
      if (options?.logAttempts) {
        console.error('SQL Injection attempt detected:', {
          query,
          params,
          timestamp: new Date().toISOString()
        });
      }
      throw new Error('Potentially dangerous SQL query detected');
    }

    if (!isWhitelisted && !options?.allowDynamic) {
      throw new Error('Query not in whitelist');
    }

    const sanitized = this.sanitizeQuery(query, params);

    if (options?.validateOnly) {
      return { rows: [], command: '', rowCount: 0, oid: 0, fields: [] };
    }

    return await this.pool.query(sanitized.query, sanitized.params);
  }

  sanitizeQuery(query: string, params?: any[]): { query: string; params: any[] } {
    let sanitizedQuery = query;
    const sanitizedParams = params ? [...params] : [];

    sanitizedQuery = this.queryAnalyzer.removeComments(sanitizedQuery);
    
    sanitizedQuery = this.queryAnalyzer.normalizeWhitespace(sanitizedQuery);

    for (let i = 0; i < sanitizedParams.length; i++) {
      sanitizedParams[i] = this.parameterValidator.sanitizeValue(sanitizedParams[i]);
    }

    return {
      query: sanitizedQuery,
      params: sanitizedParams
    };
  }

  escapeIdentifier(identifier: string): string {
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(identifier)) {
      throw new Error('Invalid identifier');
    }
    return `"${identifier}"`;
  }

  buildSafeQuery(
    operation: 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE',
    table: string,
    options: {
      columns?: string[];
      where?: Record<string, any>;
      values?: Record<string, any>;
      orderBy?: string[];
      limit?: number;
      offset?: number;
    }
  ): { query: string; params: any[] } {
    const safeTable = this.escapeIdentifier(table);
    const params: any[] = [];
    let query = '';

    switch (operation) {
      case 'SELECT':
        query = this.buildSelectQuery(safeTable, options, params);
        break;
      case 'INSERT':
        query = this.buildInsertQuery(safeTable, options, params);
        break;
      case 'UPDATE':
        query = this.buildUpdateQuery(safeTable, options, params);
        break;
      case 'DELETE':
        query = this.buildDeleteQuery(safeTable, options, params);
        break;
    }

    return { query, params };
  }

  private buildSelectQuery(
    table: string,
    options: any,
    params: any[]
  ): string {
    const columns = options.columns
      ? options.columns.map((c: string) => this.escapeIdentifier(c)).join(', ')
      : '*';

    let query = `SELECT ${columns} FROM ${table}`;

    if (options.where) {
      const whereClause = this.buildWhereClause(options.where, params);
      query += ` WHERE ${whereClause}`;
    }

    if (options.orderBy) {
      const orderByClause = options.orderBy
        .map((col: string) => this.escapeIdentifier(col))
        .join(', ');
      query += ` ORDER BY ${orderByClause}`;
    }

    if (options.limit) {
      query += ` LIMIT ${parseInt(options.limit)}`;
    }

    if (options.offset) {
      query += ` OFFSET ${parseInt(options.offset)}`;
    }

    return query;
  }

  private buildInsertQuery(
    table: string,
    options: any,
    params: any[]
  ): string {
    if (!options.values || Object.keys(options.values).length === 0) {
      throw new Error('INSERT requires values');
    }

    const columns: string[] = [];
    const placeholders: string[] = [];

    Object.entries(options.values).forEach(([key, value], index) => {
      columns.push(this.escapeIdentifier(key));
      placeholders.push(`$${params.length + 1}`);
      params.push(value);
    });

    return `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders.join(', ')})`;
  }

  private buildUpdateQuery(
    table: string,
    options: any,
    params: any[]
  ): string {
    if (!options.values || Object.keys(options.values).length === 0) {
      throw new Error('UPDATE requires values');
    }

    const setClauses: string[] = [];

    Object.entries(options.values).forEach(([key, value]) => {
      setClauses.push(`${this.escapeIdentifier(key)} = $${params.length + 1}`);
      params.push(value);
    });

    let query = `UPDATE ${table} SET ${setClauses.join(', ')}`;

    if (options.where) {
      const whereClause = this.buildWhereClause(options.where, params);
      query += ` WHERE ${whereClause}`;
    }

    return query;
  }

  private buildDeleteQuery(
    table: string,
    options: any,
    params: any[]
  ): string {
    let query = `DELETE FROM ${table}`;

    if (options.where) {
      const whereClause = this.buildWhereClause(options.where, params);
      query += ` WHERE ${whereClause}`;
    }

    return query;
  }

  private buildWhereClause(
    conditions: Record<string, any>,
    params: any[]
  ): string {
    const clauses: string[] = [];

    Object.entries(conditions).forEach(([key, value]) => {
      if (value === null) {
        clauses.push(`${this.escapeIdentifier(key)} IS NULL`);
      } else if (Array.isArray(value)) {
        const placeholders = value.map((_, i) => `$${params.length + i + 1}`).join(', ');
        clauses.push(`${this.escapeIdentifier(key)} IN (${placeholders})`);
        params.push(...value);
      } else {
        clauses.push(`${this.escapeIdentifier(key)} = $${params.length + 1}`);
        params.push(value);
      }
    });

    return clauses.join(' AND ');
  }
}

class ParameterValidator {
  private typeValidators: Map<string, (value: any) => boolean> = new Map();

  constructor() {
    this.initializeValidators();
  }

  private initializeValidators(): void {
    this.typeValidators.set('string', (v) => typeof v === 'string');
    this.typeValidators.set('number', (v) => typeof v === 'number' && !isNaN(v));
    this.typeValidators.set('boolean', (v) => typeof v === 'boolean');
    this.typeValidators.set('date', (v) => v instanceof Date || !isNaN(Date.parse(v)));
    this.typeValidators.set('uuid', (v) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v));
    this.typeValidators.set('email', (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v));
    this.typeValidators.set('json', (v) => {
      try {
        JSON.parse(typeof v === 'string' ? v : JSON.stringify(v));
        return true;
      } catch {
        return false;
      }
    });
  }

  validateParams(params: any[], types?: string[]): any[] {
    if (!types) return params;

    return params.map((param, index) => {
      const type = types[index];
      if (!type) return param;

      const validator = this.typeValidators.get(type);
      if (validator && !validator(param)) {
        throw new Error(`Parameter at index ${index} failed ${type} validation`);
      }

      return param;
    });
  }

  sanitizeValue(value: any): any {
    if (value === null || value === undefined) {
      return null;
    }

    if (typeof value === 'string') {
      return this.sanitizeString(value);
    }

    if (typeof value === 'number') {
      return this.sanitizeNumber(value);
    }

    if (Array.isArray(value)) {
      return value.map(v => this.sanitizeValue(v));
    }

    if (typeof value === 'object') {
      return this.sanitizeObject(value);
    }

    return value;
  }

  private sanitizeString(str: string): string {
    str = str.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
    
    str = str.replace(/\\x[0-9a-fA-F]{2}/g, '');
    
    return str.substring(0, 10000);
  }

  private sanitizeNumber(num: number): number {
    if (!isFinite(num)) {
      throw new Error('Invalid number: must be finite');
    }

    if (num > Number.MAX_SAFE_INTEGER || num < Number.MIN_SAFE_INTEGER) {
      throw new Error('Number out of safe range');
    }

    return num;
  }

  private sanitizeObject(obj: any): any {
    if (obj instanceof Date) {
      return obj;
    }

    if (Buffer.isBuffer(obj)) {
      return obj;
    }

    const sanitized: any = {};
    const keys = Object.keys(obj).slice(0, 100);

    for (const key of keys) {
      const sanitizedKey = this.sanitizeString(key);
      sanitized[sanitizedKey] = this.sanitizeValue(obj[key]);
    }

    return sanitized;
  }
}

class QueryAnalyzer {
  private dangerousPatterns: RegExp[] = [
    /(\b)(UNION)(\b)/gi,
    /(\b)(SELECT\s+.*\s+FROM\s+information_schema)/gi,
    /(\b)(DROP\s+(TABLE|DATABASE|SCHEMA|VIEW|INDEX))/gi,
    /(\b)(CREATE\s+(TABLE|DATABASE|SCHEMA|VIEW|INDEX))/gi,
    /(\b)(ALTER\s+(TABLE|DATABASE|SCHEMA))/gi,
    /(\b)(TRUNCATE)/gi,
    /(;|\||&&|--|\*|\/\*|\*\/|xp_|sp_)/gi,
    /(\b)(EXEC|EXECUTE)(\s|\()/gi,
    /(\b)(SCRIPT)(\b)/gi,
    /(\b)(DECLARE\s+@)/gi,
    /(0x[0-9a-fA-F]+)/g,
    /(\b)(WAITFOR\s+DELAY)/gi,
    /(\b)(BENCHMARK)/gi,
    /(\b)(SLEEP)/gi
  ];

  detectDangerousPatterns(query: string): boolean {
    const normalizedQuery = this.normalizeWhitespace(query.toUpperCase());
    
    for (const pattern of this.dangerousPatterns) {
      if (pattern.test(normalizedQuery)) {
        return true;
      }
    }

    const openParens = (normalizedQuery.match(/\(/g) || []).length;
    const closeParens = (normalizedQuery.match(/\)/g) || []).length;
    if (openParens !== closeParens) {
      return true;
    }

    if (normalizedQuery.includes('/*') || normalizedQuery.includes('*/')) {
      return true;
    }

    return false;
  }

  removeComments(query: string): string {
    query = query.replace(/--[^\n]*/g, '');
    
    query = query.replace(/\/\*[\s\S]*?\*\//g, '');
    
    query = query.replace(/#[^\n]*/g, '');

    return query;
  }

  normalizeWhitespace(query: string): string {
    return query
      .replace(/\s+/g, ' ')
      .replace(/\(\s+/g, '(')
      .replace(/\s+\)/g, ')')
      .trim();
  }

  extractTableNames(query: string): string[] {
    const tables: string[] = [];
    const patterns = [
      /FROM\s+([a-zA-Z_][a-zA-Z0-9_]*)/gi,
      /JOIN\s+([a-zA-Z_][a-zA-Z0-9_]*)/gi,
      /INTO\s+([a-zA-Z_][a-zA-Z0-9_]*)/gi,
      /UPDATE\s+([a-zA-Z_][a-zA-Z0-9_]*)/gi,
      /DELETE\s+FROM\s+([a-zA-Z_][a-zA-Z0-9_]*)/gi
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(query)) !== null) {
        tables.push(match[1]);
      }
    }

    return [...new Set(tables)];
  }
}

export default SQLInjectionPrevention;