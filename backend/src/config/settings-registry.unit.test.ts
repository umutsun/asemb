import {
  coerce,
  coerceBoolean,
  serialize,
  validate,
  resolveAlias,
  getDef,
  categoryForKey,
  isRuntimeKey,
  isJunkKey,
  isSecretKey,
  isBlankSecretWrite,
  redactSettingsSecrets,
  projectCategory,
  SettingRow,
} from './settings-registry';

describe('settings-registry: coerce', () => {
  it('coerces numbers, falling back to default on NaN', () => {
    expect(coerce('ragSettings.maxResults', '10')).toBe(10);
    expect(coerce('ragSettings.maxResults', 'not-a-number')).toBe(10); // default
    expect(coerce('database.port', null)).toBe(5432); // default when missing
  });

  it('coerces booleans robustly', () => {
    expect(coerce('database.ssl', 'true')).toBe(true);
    expect(coerce('embeddings.enabled', 'enabled')).toBe(true);
    expect(coerce('database.ssl', '0')).toBe(false);
    expect(coerce('database.ssl', null)).toBe(false); // default
  });

  it('leaves strings and secrets as raw text', () => {
    expect(coerce('openai.model', 'gpt-4o-mini')).toBe('gpt-4o-mini');
    expect(coerce('openai.apiKey', 'sk-abc')).toBe('sk-abc');
  });

  it('parses json-typed values, tolerating malformed text', () => {
    expect(coerce('dataHealth.selfSourcedTables', '["a","b"]')).toEqual(['a', 'b']);
    expect(coerce('ragSettings.tocDetection', 'not json')).toBe('not json');
  });

  it('best-effort parses unknown keys (permissive)', () => {
    expect(coerce('some.unknown.key', '{"x":1}')).toEqual({ x: 1 });
    expect(coerce('some.unknown.key', 'plain')).toBe('plain');
  });

  it('coerceBoolean accepts the canonical truthy set', () => {
    for (const t of ['1', 'true', 'YES', 'On', 'enabled']) expect(coerceBoolean(t)).toBe(true);
    for (const f of ['0', 'false', 'no', '']) expect(coerceBoolean(f)).toBe(false);
  });
});

describe('settings-registry: serialize (mirrors settings.routes POST)', () => {
  it('keeps strings, JSON-stringifies everything else', () => {
    expect(serialize('hello')).toBe('hello');
    expect(serialize(0.3)).toBe('0.3');
    expect(serialize(true)).toBe('true');
    expect(serialize({ a: 1 })).toBe('{"a":1}');
    expect(serialize(['x'])).toBe('["x"]');
  });
});

describe('settings-registry: validate (byte-compatible bounds)', () => {
  it('enforces temperature 0..2', () => {
    expect(validate('llmSettings.temperature', 0.5).ok).toBe(true);
    expect(validate('llmSettings.temperature', 3).ok).toBe(false);
    expect(validate('llmSettings.temperature', '0.5').ok).toBe(false); // must be number, not string
  });

  it('enforces chunkSize 100..5000 and similarityThreshold 0..1', () => {
    expect(validate('ragSettings.chunkSize', 1000).ok).toBe(true);
    expect(validate('ragSettings.chunkSize', 50).ok).toBe(false);
    expect(validate('ragSettings.similarityThreshold', 0.5).ok).toBe(true);
    expect(validate('ragSettings.similarityThreshold', 1.5).ok).toBe(false);
  });

  it('rejects a chat model saved as an embedding model', () => {
    expect(validate('llmSettings.activeEmbeddingModel', 'gpt-4o').ok).toBe(false);
    expect(validate('llmSettings.activeEmbeddingModel', 'text-embedding-3-small').ok).toBe(true);
  });

  it('applies registry-declared numeric bounds (topP <= 1)', () => {
    expect(validate('llmSettings.topP', 0.9).ok).toBe(true);
    expect(validate('llmSettings.topP', 2).ok).toBe(false);
  });

  it('passes unknown keys through', () => {
    expect(validate('apiStatus.openai.status', 'active').ok).toBe(true);
  });
});

describe('settings-registry: aliases', () => {
  it('resolves known legacy keys to canonical', () => {
    expect(resolveAlias('app_name')).toBe('app.name');
    expect(resolveAlias('claude.apiKey')).toBe('anthropic.apiKey');
    expect(resolveAlias('gemini.apiKey')).toBe('google.apiKey');
    expect(resolveAlias('jwtSecret')).toBe('jwt.secret');
    expect(resolveAlias('ocr_active_provider')).toBe('ocrSettings.activeProvider');
  });

  it('is identity for canonical / unknown keys', () => {
    expect(resolveAlias('openai.apiKey')).toBe('openai.apiKey');
    expect(resolveAlias('totally.unknown')).toBe('totally.unknown');
  });

  it('getDef resolves through aliases', () => {
    expect(getDef('claude.apiKey')?.key).toBe('anthropic.apiKey');
  });
});

describe('settings-registry: category / runtime / junk classification', () => {
  it('maps keys to canonical categories', () => {
    expect(categoryForKey('openai.apiKey')).toBe('llm');
    expect(categoryForKey('ragSettings.maxResults')).toBe('rag');
    expect(categoryForKey('scraper.timeout')).toBe('scraper');
    expect(categoryForKey('unknown.foo')).toBe('general');
  });

  it('flags runtime telemetry but not corpusVersion', () => {
    expect(isRuntimeKey('apiStatus.openai.status')).toBe(true);
    expect(isRuntimeKey('modelTokenUsage.openai:gpt-4o.cost')).toBe(true);
    expect(isRuntimeKey('anthropic.verifiedDate')).toBe(true);
    expect(isRuntimeKey('ragSettings.corpusVersion')).toBe(false);
    expect(isRuntimeKey('openai.apiKey')).toBe(false);
  });

  it('flags junk column-name rows', () => {
    expect(isJunkKey('key')).toBe(true);
    expect(isJunkKey('value')).toBe(true);
    expect(isJunkKey('category')).toBe(true);
    expect(isJunkKey('openai.apiKey')).toBe(false);
  });
});

describe('settings-registry: secret handling', () => {
  it('detects secret keys via registry and regex', () => {
    expect(isSecretKey('openai.apiKey')).toBe(true);
    expect(isSecretKey('security.mcpBearerKey')).toBe(true);
    expect(isSecretKey('some.unknown.password')).toBe(true);
    expect(isSecretKey('openai.model')).toBe(false);
  });

  it('guards blank secret writes only', () => {
    expect(isBlankSecretWrite('openai.apiKey', '')).toBe(true);
    expect(isBlankSecretWrite('openai.apiKey', '   ')).toBe(true);
    expect(isBlankSecretWrite('openai.apiKey', 'sk-abc')).toBe(false);
    expect(isBlankSecretWrite('openai.model', '')).toBe(false);
  });

  it('redacts nested and top-level secrets in place', () => {
    const obj = {
      openai: { apiKey: 'sk-abc', model: 'gpt-4o-mini' },
      security: { mcpBearerKey: 'bear' },
      jwtSecret: 'topsecret',
    };
    redactSettingsSecrets(obj);
    expect(obj.openai.apiKey).toBe('');
    expect(obj.openai.model).toBe('gpt-4o-mini');
    expect(obj.security.mcpBearerKey).toBe('');
    expect(obj.jwtSecret).toBe('');
  });
});

describe('settings-registry: projectCategory === current GET route output', () => {
  // Fixture includes the active models so the route's env-var fallback branch is a no-op,
  // making the structural projection equal to the current settings.routes.ts output.
  const llmRows: SettingRow[] = [
    { key: 'openai.apiKey', value: 'sk-secret' },
    { key: 'openai.model', value: 'gpt-4o-mini' },
    { key: 'llmSettings.activeChatModel', value: 'anthropic/claude-sonnet-4-5' },
    { key: 'llmSettings.activeEmbeddingModel', value: 'openai/text-embedding-3-large' },
    { key: 'llmSettings.temperature', value: '0.3' },
    { key: 'anthropic.verifiedDate', value: '2026-07-01' },
    { key: 'anthropic.status', value: 'active' },
  ];

  it('reproduces nesting, apiStatus synthesis, embedding split and redaction', () => {
    expect(projectCategory(llmRows, 'llm')).toEqual({
      openai: { apiKey: '', model: 'gpt-4o-mini' }, // secret redacted
      anthropic: { verifiedDate: '2026-07-01', status: 'active' },
      llmSettings: {
        activeChatModel: 'anthropic/claude-sonnet-4-5',
        activeEmbeddingModel: 'openai/text-embedding-3-large',
        temperature: 0.3, // JSON.parse('0.3')
        embeddingProvider: 'openai',
        embeddingModel: 'text-embedding-3-large',
      },
      apiStatus: {
        anthropic: {
          status: 'active',
          message: 'anthropic API validated successfully',
          lastChecked: '2026-07-01',
          verifiedDate: '2026-07-01',
          responseTime: 0,
        },
        openai: {
          status: 'inactive',
          message: 'API key not validated',
          lastChecked: null,
          verifiedDate: null,
        },
      },
    });
  });

  it('nests multi-segment keys under the first segment (non-llm)', () => {
    const ragRows: SettingRow[] = [
      { key: 'ragSettings.maxResults', value: '10' },
      { key: 'ragSettings.fieldLabels.konu', value: 'Subject' },
      { key: 'ragSettings.tocDetection', value: '{"minDotSequence":5}' },
    ];
    expect(projectCategory(ragRows, 'rag')).toEqual({
      ragSettings: {
        maxResults: 10,
        'fieldLabels.konu': 'Subject',
        tocDetection: { minDotSequence: 5 },
      },
    });
  });
});
