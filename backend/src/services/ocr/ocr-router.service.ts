/**
 * OCR Router Service
 * Smart provider selection, fallback chain and cache management
 *
 * Features:
 * - Active OCR model selection from settings
 * - Automatic fallback chain (primary → fallback → tesseract)
 * - Redis cache integration
 * - Cost tracking
 * - Provider health monitoring
 */

import { IOCRProvider, OCRResult, OCROptions, OCRProviderType, OCRProviderConfig } from './types';
import { OpenAIProvider } from './providers/openai.provider';
import { GeminiProvider } from './providers/gemini.provider';
import { DeepSeekProvider } from './providers/deepseek.provider';
import { ocrService } from '../ocr.service';
import { ocrCacheService } from './ocr-cache.service';
import { settingsService } from '../settings.service';
import { logger } from '../../utils/logger';
import fs from 'fs/promises';
import path from 'path';

interface OCRSettings {
  activeProvider: OCRProviderType;
  fallbackEnabled: boolean;
  fallbackProvider: OCRProviderType;
  cacheEnabled: boolean;
  cacheTTL: number;
}

export class OCRRouterService {
  private static instance: OCRRouterService;
  private providers: Map<OCRProviderType, IOCRProvider> = new Map();
  private defaultFallbackChain: OCRProviderType[] = [
    'gemini',     // Cheapest and fastest
    'openai',     // Most reliable
    'deepseek',   // Innovative
    'tesseract'   // Last resort (free)
  ];

  private constructor() {
    this.initializeProviders();
  }

  public static getInstance(): OCRRouterService {
    if (!OCRRouterService.instance) {
      OCRRouterService.instance = new OCRRouterService();
    }
    return OCRRouterService.instance;
  }

  /**
   * Initialize providers
   */
  private async initializeProviders(): Promise<void> {
    try {
      // OpenAI
      this.providers.set('openai', new OpenAIProvider({
        enabled: true,
        supportedFormats: ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
      }));

      // Gemini
      this.providers.set('gemini', new GeminiProvider({
        enabled: true,
        model: 'gemini-2.0-flash-exp',
        supportedFormats: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
      }));

      // DeepSeek
      this.providers.set('deepseek', new DeepSeekProvider({
        enabled: true,
        supportedFormats: ['image/jpeg', 'image/png', 'image/webp']
      }));

      logger.info(' OCR Router - All providers initialized');
    } catch (error) {
      logger.error(' OCR Router - Provider initialization error:', error);
    }
  }

  /**
   * Read OCR settings from the canonical dotted keys (ocrSettings.*).
   * settings.value is TEXT, so booleans are parsed (not compared to `false`) and the
   * provider is validated against the known set — an unknown value logs a warning and
   * falls back rather than silently entering the provider-not-found path.
   */
  private async getOCRSettings(): Promise<OCRSettings> {
    const VALID: OCRProviderType[] = ['openai', 'gemini', 'deepseek', 'tesseract', 'auto'];
    const parseBool = (v: any, def: boolean): boolean => {
      if (v === undefined || v === null || v === '') return def;
      return ['1', 'true', 'yes', 'on', 'enabled'].includes(String(v).replace(/^"|"$/g, '').trim().toLowerCase());
    };
    const normProvider = (v: any, def: OCRProviderType): OCRProviderType => {
      const p = String(v ?? '').replace(/^"|"$/g, '').trim().toLowerCase();
      if ((VALID as string[]).includes(p)) return p as OCRProviderType;
      if (v !== undefined && v !== null && String(v).trim() !== '') {
        logger.warn(`OCR Router - unknown provider "${v}" in settings; falling back to "${def}"`);
      }
      return def;
    };
    try {
      const settings = await settingsService.getAllSettings();

      return {
        activeProvider: normProvider(settings['ocrSettings.activeProvider'], 'auto'),
        fallbackEnabled: parseBool(settings['ocrSettings.fallbackEnabled'], true),
        fallbackProvider: normProvider(settings['ocrSettings.fallbackProvider'], 'tesseract'),
        cacheEnabled: parseBool(settings['ocrSettings.cacheEnabled'], true),
        cacheTTL: Number(String(settings['ocrSettings.cacheTTL'] ?? '').replace(/"/g, '')) || 7 * 24 * 60 * 60
      };
    } catch (error) {
      logger.warn('OCR Router - could not read settings; using defaults');
      return {
        activeProvider: 'auto',
        fallbackEnabled: true,
        fallbackProvider: 'tesseract',
        cacheEnabled: true,
        cacheTTL: 7 * 24 * 60 * 60
      };
    }
  }

  /**
   * Main OCR processing function
   */
  async processDocument(
    filePath: string,
    options: OCROptions = {}
  ): Promise<OCRResult> {
    const startTime = Date.now();

    try {
      // Read settings from settings
      const settings = await this.getOCRSettings();

      // Compute file hash (for cache key)
      const fileBuffer = await fs.readFile(filePath);
      const fileHash = ocrCacheService.calculateFileHash(fileBuffer);

      // Provider selection
      const selectedProvider = options.provider || settings.activeProvider;
      const provider = await this.selectProvider(selectedProvider, filePath);

      logger.info(` Starting OCR: ${path.basename(filePath)} (Provider: ${provider})`);

      // Cache check (unless skipCache option is set)
      const useCache = settings.cacheEnabled && !options.skipCache;
      if (useCache) {
        const cached = await ocrCacheService.get(fileHash, provider, options.prompt);

        if (cached) {
          await ocrCacheService.recordHit();
          logger.info(` Cache HIT - OCR skipped (${Date.now() - startTime}ms)`);
          return cached;
        }

        await ocrCacheService.recordMiss();
      }

      // OCR processing (with fallback chain)
      const result = await this.processWithFallback(
        filePath,
        provider,
        options,
        settings
      );

      // Save to cache (unless skipCache option is set)
      if (useCache && result) {
        await ocrCacheService.set(
          fileHash,
          provider,
          result,
          options.prompt,
          settings.cacheTTL
        );
      }

      logger.info(` OCR completed (${Date.now() - startTime}ms)`);
      return result;

    } catch (error) {
      logger.error(' OCR Router error:', error);
      throw error;
    }
  }

  /**
   * OCR processing with fallback chain
   */
  private async processWithFallback(
    filePath: string,
    primaryProvider: OCRProviderType,
    options: OCROptions,
    settings: OCRSettings
  ): Promise<OCRResult> {
    // Build fallback chain
    const chain: OCRProviderType[] = [primaryProvider];

    if (settings.fallbackEnabled) {
      // Add fallback provider (if different from primary)
      if (settings.fallbackProvider !== primaryProvider) {
        chain.push(settings.fallbackProvider);
      }

      // Add tesseract as last resort
      if (!chain.includes('tesseract')) {
        chain.push('tesseract');
      }
    }

    logger.debug(`OCR Fallback Chain: ${chain.join(' → ')}`);

    // Try the chain in order
    let lastError: Error | null = null;

    for (const providerName of chain) {
      try {
        const result = await this.executeOCR(filePath, providerName, options);

        // If a fallback was used, add it to metadata
        if (providerName !== primaryProvider) {
          result.metadata.fallbackUsed = true;
          result.metadata.primaryProvider = primaryProvider;
          logger.warn(`️ Used fallback: ${primaryProvider} → ${providerName}`);
        }

        return result;
      } catch (error) {
        lastError = error as Error;
        logger.error(`Provider ${providerName} failed:`, error.message);

        // Continue with the fallback chain
        continue;
      }
    }

    // All providers failed
    throw new Error(`All OCR providers failed. Last error: ${lastError?.message}`);
  }

  /**
   * Run OCR with a specific provider
   */
  private async executeOCR(
    filePath: string,
    providerName: OCRProviderType,
    options: OCROptions
  ): Promise<OCRResult> {
    const ext = path.extname(filePath).toLowerCase();

    // Special handling for Tesseract (existing OCRService)
    if (providerName === 'tesseract') {
      const tesseractResult = await ocrService.processDocument(filePath, ext);

      return {
        text: tesseractResult.text,
        confidence: tesseractResult.confidence,
        metadata: {
          provider: 'tesseract',
          processingTimeMs: 0,
          type: tesseractResult.type
        }
      };
    }

    // Vision providers
    const provider = this.providers.get(providerName);

    if (!provider) {
      throw new Error(`Provider not found: ${providerName}`);
    }

    // Check whether the provider is ready
    const isReady = await provider.isReady();
    if (!isReady) {
      throw new Error(`Provider not ready: ${providerName}`);
    }

    // Process based on file type
    if (ext === '.pdf') {
      return await provider.processPDF(filePath, options);
    } else {
      return await provider.processImage(filePath, options);
    }
  }

  /**
   * Smart provider selection
   */
  private async selectProvider(
    requested: OCRProviderType,
    filePath: string
  ): Promise<OCRProviderType> {
    // If a manual selection was made, use it directly
    return requested;
  }

  /**
   * Check whether the provider is ready
   */
  private async isProviderReady(providerName: OCRProviderType): Promise<boolean> {
    if (providerName === 'tesseract') return true; // Tesseract is always ready

    const provider = this.providers.get(providerName);
    if (!provider) return false;

    try {
      return await provider.isReady();
    } catch {
      return false;
    }
  }

  /**
   * List available providers and their states
   */
  async getAvailableProviders(): Promise<Array<{
    name: OCRProviderType;
    enabled: boolean;
    ready: boolean;
    config: OCRProviderConfig;
  }>> {
    const result: Array<any> = [];

    for (const [name, provider] of this.providers.entries()) {
      const ready = await provider.isReady();

      result.push({
        name,
        enabled: provider.enabled,
        ready,
        config: provider.getConfig()
      });
    }

    // Add Tesseract
    result.push({
      name: 'tesseract',
      enabled: true,
      ready: true,
      config: {
        enabled: true,
        supportedFormats: ['.jpg', '.png', '.pdf', '.tiff'],
        costPerImage: 0
      }
    });

    return result;
  }

  /**
   * Get cache statistics
   */
  async getCacheStats() {
    return await ocrCacheService.getStats();
  }

  /**
   * Clear the cache
   */
  async clearCache(fileHash?: string, provider?: OCRProviderType) {
    return await ocrCacheService.clear(fileHash, provider);
  }
}

export const ocrRouterService = OCRRouterService.getInstance();
