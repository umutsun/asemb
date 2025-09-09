import validator from 'validator';
import DOMPurify from 'isomorphic-dompurify';
import { Request, Response, NextFunction } from 'express';

export interface SanitizationRule {
  field: string;
  type: 'string' | 'number' | 'boolean' | 'email' | 'url' | 'json' | 'html' | 'array' | 'object';
  required?: boolean;
  min?: number;
  max?: number;
  pattern?: RegExp;
  enum?: any[];
  custom?: (value: any) => any;
  sanitize?: boolean;
  trim?: boolean;
  escape?: boolean;
  lowercase?: boolean;
  uppercase?: boolean;
  default?: any;
}

export interface ValidationError {
  field: string;
  message: string;
  value?: any;
}

export class InputSanitizer {
  private rules: Map<string, SanitizationRule[]> = new Map();
  private globalFilters: Array<(value: any) => any> = [];

  constructor() {
    this.initializeGlobalFilters();
  }

  private initializeGlobalFilters(): void {
    this.globalFilters.push((value) => {
      if (typeof value === 'string') {
        return this.removeNullBytes(value);
      }
      return value;
    });

    this.globalFilters.push((value) => {
      if (typeof value === 'string') {
        return this.removeControlCharacters(value);
      }
      return value;
    });
  }

  addRules(endpoint: string, rules: SanitizationRule[]): void {
    this.rules.set(endpoint, rules);
  }

  sanitize(data: any, rules: SanitizationRule[]): {
    data: any;
    errors: ValidationError[];
  } {
    const sanitized: any = {};
    const errors: ValidationError[] = [];

    for (const rule of rules) {
      const value = this.getNestedValue(data, rule.field);
      const result = this.sanitizeField(value, rule);

      if (result.error) {
        errors.push(result.error);
      } else {
        this.setNestedValue(sanitized, rule.field, result.value);
      }
    }

    const unexpectedFields = this.findUnexpectedFields(data, rules);
    for (const field of unexpectedFields) {
      errors.push({
        field,
        message: `Unexpected field: ${field}`
      });
    }

    return { data: sanitized, errors };
  }

  private sanitizeField(value: any, rule: SanitizationRule): {
    value?: any;
    error?: ValidationError;
  } {
    if (value === undefined || value === null || value === '') {
      if (rule.required) {
        return {
          error: {
            field: rule.field,
            message: `${rule.field} is required`
          }
        };
      }
      return { value: rule.default !== undefined ? rule.default : null };
    }

    for (const filter of this.globalFilters) {
      value = filter(value);
    }

    switch (rule.type) {
      case 'string':
        return this.sanitizeString(value, rule);
      case 'number':
        return this.sanitizeNumber(value, rule);
      case 'boolean':
        return this.sanitizeBoolean(value, rule);
      case 'email':
        return this.sanitizeEmail(value, rule);
      case 'url':
        return this.sanitizeUrl(value, rule);
      case 'json':
        return this.sanitizeJson(value, rule);
      case 'html':
        return this.sanitizeHtml(value, rule);
      case 'array':
        return this.sanitizeArray(value, rule);
      case 'object':
        return this.sanitizeObject(value, rule);
      default:
        return { value };
    }
  }

  private sanitizeString(value: any, rule: SanitizationRule): {
    value?: any;
    error?: ValidationError;
  } {
    let str = String(value);

    if (rule.trim !== false) {
      str = str.trim();
    }

    if (rule.lowercase) {
      str = str.toLowerCase();
    }

    if (rule.uppercase) {
      str = str.toUpperCase();
    }

    if (rule.escape !== false) {
      str = validator.escape(str);
    }

    if (rule.min && str.length < rule.min) {
      return {
        error: {
          field: rule.field,
          message: `${rule.field} must be at least ${rule.min} characters`
        }
      };
    }

    if (rule.max && str.length > rule.max) {
      str = str.substring(0, rule.max);
    }

    if (rule.pattern && !rule.pattern.test(str)) {
      return {
        error: {
          field: rule.field,
          message: `${rule.field} does not match required pattern`
        }
      };
    }

    if (rule.enum && !rule.enum.includes(str)) {
      return {
        error: {
          field: rule.field,
          message: `${rule.field} must be one of: ${rule.enum.join(', ')}`
        }
      };
    }

    if (rule.custom) {
      str = rule.custom(str);
    }

    return { value: str };
  }

  private sanitizeNumber(value: any, rule: SanitizationRule): {
    value?: any;
    error?: ValidationError;
  } {
    const num = Number(value);

    if (isNaN(num)) {
      return {
        error: {
          field: rule.field,
          message: `${rule.field} must be a valid number`
        }
      };
    }

    if (rule.min !== undefined && num < rule.min) {
      return {
        error: {
          field: rule.field,
          message: `${rule.field} must be at least ${rule.min}`
        }
      };
    }

    if (rule.max !== undefined && num > rule.max) {
      return {
        error: {
          field: rule.field,
          message: `${rule.field} must be at most ${rule.max}`
        }
      };
    }

    if (rule.enum && !rule.enum.includes(num)) {
      return {
        error: {
          field: rule.field,
          message: `${rule.field} must be one of: ${rule.enum.join(', ')}`
        }
      };
    }

    return { value: num };
  }

  private sanitizeBoolean(value: any, rule: SanitizationRule): {
    value?: any;
    error?: ValidationError;
  } {
    if (typeof value === 'boolean') {
      return { value };
    }

    if (typeof value === 'string') {
      const lower = value.toLowerCase();
      if (lower === 'true' || lower === '1' || lower === 'yes') {
        return { value: true };
      }
      if (lower === 'false' || lower === '0' || lower === 'no') {
        return { value: false };
      }
    }

    if (typeof value === 'number') {
      return { value: value !== 0 };
    }

    return {
      error: {
        field: rule.field,
        message: `${rule.field} must be a boolean`
      }
    };
  }

  private sanitizeEmail(value: any, rule: SanitizationRule): {
    value?: any;
    error?: ValidationError;
  } {
    const email = String(value).toLowerCase().trim();

    if (!validator.isEmail(email)) {
      return {
        error: {
          field: rule.field,
          message: `${rule.field} must be a valid email address`
        }
      };
    }

    const normalized = validator.normalizeEmail(email, {
      gmail_remove_dots: false,
      gmail_remove_subaddress: false,
      outlookdotcom_remove_subaddress: false,
      yahoo_remove_subaddress: false,
      icloud_remove_subaddress: false
    });

    return { value: normalized || email };
  }

  private sanitizeUrl(value: any, rule: SanitizationRule): {
    value?: any;
    error?: ValidationError;
  } {
    const url = String(value).trim();

    if (!validator.isURL(url, {
      protocols: ['http', 'https'],
      require_protocol: true,
      require_valid_protocol: true
    })) {
      return {
        error: {
          field: rule.field,
          message: `${rule.field} must be a valid URL`
        }
      };
    }

    return { value: url };
  }

  private sanitizeJson(value: any, rule: SanitizationRule): {
    value?: any;
    error?: ValidationError;
  } {
    if (typeof value === 'object') {
      return { value };
    }

    try {
      const parsed = JSON.parse(value);
      return { value: parsed };
    } catch {
      return {
        error: {
          field: rule.field,
          message: `${rule.field} must be valid JSON`
        }
      };
    }
  }

  private sanitizeHtml(value: any, rule: SanitizationRule): {
    value?: any;
    error?: ValidationError;
  } {
    const html = String(value);

    const clean = DOMPurify.sanitize(html, {
      ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a', 'p', 'br', 'ul', 'ol', 'li'],
      ALLOWED_ATTR: ['href', 'target', 'rel'],
      ALLOW_DATA_ATTR: false,
      FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form'],
      FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover']
    });

    if (rule.max && clean.length > rule.max) {
      return { value: clean.substring(0, rule.max) };
    }

    return { value: clean };
  }

  private sanitizeArray(value: any, rule: SanitizationRule): {
    value?: any;
    error?: ValidationError;
  } {
    if (!Array.isArray(value)) {
      return {
        error: {
          field: rule.field,
          message: `${rule.field} must be an array`
        }
      };
    }

    if (rule.min && value.length < rule.min) {
      return {
        error: {
          field: rule.field,
          message: `${rule.field} must have at least ${rule.min} items`
        }
      };
    }

    if (rule.max && value.length > rule.max) {
      value = value.slice(0, rule.max);
    }

    const sanitized = value.map(item => {
      if (typeof item === 'string') {
        return validator.escape(item);
      }
      return item;
    });

    return { value: sanitized };
  }

  private sanitizeObject(value: any, rule: SanitizationRule): {
    value?: any;
    error?: ValidationError;
  } {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return {
        error: {
          field: rule.field,
          message: `${rule.field} must be an object`
        }
      };
    }

    const sanitized: any = {};
    const keys = Object.keys(value);

    if (rule.max && keys.length > rule.max) {
      keys.splice(rule.max);
    }

    for (const key of keys) {
      const sanitizedKey = validator.escape(key);
      let sanitizedValue = value[key];

      if (typeof sanitizedValue === 'string') {
        sanitizedValue = validator.escape(sanitizedValue);
      }

      sanitized[sanitizedKey] = sanitizedValue;
    }

    return { value: sanitized };
  }

  private removeNullBytes(str: string): string {
    return str.replace(/\0/g, '');
  }

  private removeControlCharacters(str: string): string {
    return str.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  }

  private getNestedValue(obj: any, path: string): any {
    const keys = path.split('.');
    let value = obj;

    for (const key of keys) {
      if (value === null || value === undefined) {
        return undefined;
      }
      value = value[key];
    }

    return value;
  }

  private setNestedValue(obj: any, path: string, value: any): void {
    const keys = path.split('.');
    const lastKey = keys.pop()!;
    let current = obj;

    for (const key of keys) {
      if (!current[key]) {
        current[key] = {};
      }
      current = current[key];
    }

    current[lastKey] = value;
  }

  private findUnexpectedFields(data: any, rules: SanitizationRule[]): string[] {
    const expectedFields = new Set(rules.map(r => r.field));
    const actualFields = this.getAllFields(data);
    
    return actualFields.filter(field => !expectedFields.has(field));
  }

  private getAllFields(obj: any, prefix = ''): string[] {
    const fields: string[] = [];

    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        const fieldPath = prefix ? `${prefix}.${key}` : key;
        fields.push(fieldPath);

        if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
          fields.push(...this.getAllFields(obj[key], fieldPath));
        }
      }
    }

    return fields;
  }

  middleware(rules?: SanitizationRule[]) {
    return (req: Request, res: Response, next: NextFunction) => {
      const endpoint = `${req.method} ${req.path}`;
      const endpointRules = rules || this.rules.get(endpoint);

      if (!endpointRules) {
        return next();
      }

      const dataToSanitize = {
        ...req.body,
        ...req.query,
        ...req.params
      };

      const { data, errors } = this.sanitize(dataToSanitize, endpointRules);

      if (errors.length > 0) {
        return res.status(400).json({
          error: 'Validation failed',
          details: errors
        });
      }

      req.body = data;
      (req as any).sanitized = data;

      next();
    };
  }
}

export class XSSProtection {
  static sanitizeHTML(html: string): string {
    return DOMPurify.sanitize(html, {
      ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a', 'p', 'br', 'ul', 'ol', 'li', 'blockquote', 'code', 'pre'],
      ALLOWED_ATTR: ['href', 'target', 'rel', 'class'],
      ALLOW_DATA_ATTR: false,
      FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'textarea'],
      FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'onblur']
    });
  }

  static escapeHTML(str: string): string {
    const map: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#x27;',
      '/': '&#x2F;'
    };

    return str.replace(/[&<>"'/]/g, (char) => map[char]);
  }

  static sanitizeJSON(obj: any): any {
    if (typeof obj === 'string') {
      return this.escapeHTML(obj);
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.sanitizeJSON(item));
    }

    if (typeof obj === 'object' && obj !== null) {
      const sanitized: any = {};
      for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
          const sanitizedKey = this.escapeHTML(key);
          sanitized[sanitizedKey] = this.sanitizeJSON(obj[key]);
        }
      }
      return sanitized;
    }

    return obj;
  }

  static preventXSS(req: Request, res: Response, next: NextFunction): void {
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'");
    next();
  }
}

export function createCommonRules(): Record<string, SanitizationRule[]> {
  return {
    'POST /api/auth/register': [
      { field: 'email', type: 'email', required: true },
      { field: 'password', type: 'string', required: true, min: 8, max: 100 },
      { field: 'name', type: 'string', required: true, min: 2, max: 100, trim: true }
    ],
    'POST /api/auth/login': [
      { field: 'email', type: 'email', required: true },
      { field: 'password', type: 'string', required: true }
    ],
    'POST /api/vectors/search': [
      { field: 'query', type: 'string', required: true, min: 1, max: 1000 },
      { field: 'limit', type: 'number', min: 1, max: 100, default: 10 },
      { field: 'threshold', type: 'number', min: 0, max: 1, default: 0.7 }
    ],
    'POST /api/documents': [
      { field: 'title', type: 'string', required: true, max: 200 },
      { field: 'content', type: 'html', required: true, max: 100000 },
      { field: 'metadata', type: 'json', required: false }
    ]
  };
}

export default InputSanitizer;