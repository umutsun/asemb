/**
 * OCR Provider Types & Interfaces
 * Type definitions for the multi-provider OCR system
 */

export type OCRProviderType = 'openai' | 'gemini' | 'deepseek' | 'tesseract' | 'auto';

export interface OCRResult {
  text: string;
  confidence: number;
  metadata: OCRMetadata;
}

export interface OCRMetadata {
  provider: OCRProviderType;
  model?: string;
  processingTimeMs: number;
  tokensUsed?: number;
  cost?: number;
  imageFormat?: string;
  imageSize?: { width: number; height: number };
  pageCount?: number;
  cacheHit?: boolean;
  fallbackUsed?: boolean;
  [key: string]: any;
}

export interface OCROptions {
  provider?: OCRProviderType;
  language?: string;
  prompt?: string;
  detailLevel?: 'low' | 'high' | 'auto';
  maxPages?: number;
  enhanceImage?: boolean;
  skipCache?: boolean; // Skip Redis cache (for ephemeral processing like chat PDF)
}

export interface OCRProviderConfig {
  enabled: boolean;
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  maxFileSize?: number;
  supportedFormats?: string[];
  costPerImage?: number;
  costPerToken?: number;
}

export interface OCRCacheEntry {
  result: OCRResult;
  timestamp: number;
  fileHash: string;
  provider: OCRProviderType;
}

/**
 * OCR Provider Interface
 * All OCR providers must implement this interface
 */
export interface IOCRProvider {
  readonly name: OCRProviderType;
  readonly enabled: boolean;

  /**
   * Check whether the provider is ready
   */
  isReady(): Promise<boolean>;

  /**
   * OCR from an image file
   */
  processImage(
    filePath: string,
    options?: OCROptions
  ): Promise<OCRResult>;

  /**
   * OCR from a PDF file
   */
  processPDF(
    filePath: string,
    options?: OCROptions
  ): Promise<OCRResult>;

  /**
   * OCR from a base64 encoded image
   */
  processBase64Image(
    base64Data: string,
    mimeType: string,
    options?: OCROptions
  ): Promise<OCRResult>;

  /**
   * Get the provider configuration
   */
  getConfig(): OCRProviderConfig;

  /**
   * Estimate cost
   */
  estimateCost(fileSize: number, pageCount?: number): Promise<number>;
}
