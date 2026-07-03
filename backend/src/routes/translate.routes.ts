import { Router, Request, Response } from 'express';
import { lsembPool } from '../config/database.config';
import { translationService } from '../services/translation.service';

const router = Router();

// Translate text using the configured provider — real + settings-driven.
// Default provider is the configured chat LLM (translation.service resolves it from settings);
// DeepL/Google are used when the caller asks for them and their key is set in `settings`.
router.post('/', async (req: Request, res: Response) => {
  try {
    const { text, source = 'auto', target, provider } = req.body;

    if (!text || !target) {
      return res.status(400).json({
        error: 'Text and target language are required'
      });
    }

    const result = await translationService.translateText(text, {
      sourceLang: source,
      targetLang: target,
      provider, // undefined -> settings default (llm)
    });

    res.json({
      translatedText: result.translatedText,
      sourceLanguage: source,
      targetLanguage: target,
      provider: result.provider,
      cost: result.cost,
    });
  } catch (error: any) {
    const status = typeof error?.status === 'number' ? error.status : 500;
    if (status >= 500) console.error('Translation error:', error);
    res.status(status).json({
      error: error.message || 'Translation failed'
    });
  }
});

// Get supported languages
router.get('/languages', async (req: Request, res: Response) => {
  try {
    const languages = [
      { code: 'en', name: 'English', flag: '' },
      { code: 'de', name: 'German', flag: '' },
      { code: 'fr', name: 'French', flag: '' },
      { code: 'es', name: 'Spanish', flag: '' },
      { code: 'it', name: 'Italian', flag: '' },
      { code: 'pt', name: 'Portuguese', flag: '' },
      { code: 'ru', name: 'Russian', flag: '' },
      { code: 'zh', name: 'Chinese', flag: '' },
      { code: 'ja', name: 'Japanese', flag: '' },
      { code: 'tr', name: 'Turkish', flag: '' },
      { code: 'ar', name: 'Arabic', flag: '' },
      { code: 'hi', name: 'Hindi', flag: '' },
      { code: 'ko', name: 'Korean', flag: '' },
      { code: 'nl', name: 'Dutch', flag: '' },
      { code: 'pl', name: 'Polish', flag: '' }
    ];

    res.json({ languages });
  } catch (error) {
    console.error('Error fetching languages:', error);
    res.status(500).json({ error: 'Failed to fetch languages' });
  }
});

/**
 * Translation service health check
 */
router.get('/api/v2/translate/health', async (req: Request, res: Response) => {
  try {
    const startTime = Date.now();

    // Check provider configurations
    const providers = ['deepl', 'google'];
    const providerStatus: any = {};

    for (const provider of providers) {
      const key = provider === 'deepl' ? 'deepl.apiKey' : 'google.translate.apiKey';
      const result = await lsembPool.query(
        'SELECT value FROM settings WHERE key = $1',
        [key]
      );

      const apiKey = result.rows[0]?.value;
      providerStatus[provider] = {
        configured: !!apiKey,
        available: !!apiKey,
        name: provider === 'deepl' ? 'DeepL' : 'Google Translate'
      };
    }

    // Check database connectivity
    let dbStatus = 'disconnected';
    try {
      const testClient = await lsembPool.connect();
      await testClient.query('SELECT 1');
      testClient.release();
      dbStatus = 'connected';
    } catch (error) {
      dbStatus = 'error';
    }

    const responseTime = Date.now() - startTime;
    const hasAnyProvider = Object.values(providerStatus).some((p: any) => p.configured);

    res.json({
      status: hasAnyProvider ? 'healthy' : 'degraded',
      service: 'Translate',
      responseTime: `${responseTime}ms`,
      components: {
        providers: providerStatus,
        database: dbStatus
      },
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    res.status(500).json({
      status: 'unhealthy',
      service: 'Translate',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Check provider configuration (authenticated endpoint)
router.get('/api/v2/translate/status', async (req: Request, res: Response) => {
  try {
    const providers = ['deepl', 'google'];
    const status: any = {};

    for (const provider of providers) {
      const key = provider === 'deepl' ? 'deepl.apiKey' : 'google.translate.apiKey';
      const result = await lsembPool.query(
        'SELECT value FROM settings WHERE key = $1',
        [key]
      );

      const apiKey = result.rows[0]?.value;
      status[provider] = {
        configured: !!apiKey,
        apiKeySet: !!apiKey,
        lastUsed: null
      };
    }

    res.json({ providers: status });
  } catch (error) {
    console.error('Error checking translation status:', error);
    res.status(500).json({ error: 'Failed to check translation status' });
  }
});

export default router;