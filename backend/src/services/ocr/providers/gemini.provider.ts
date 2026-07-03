/**
 * Gemini OCR Provider
 * OCR processing using Google Gemini 2.0 Flash
 * Fast, cheap and powerful alternative
 */

import { BaseOCRProvider } from '../base-provider';
import { OCRResult, OCROptions, OCRProviderConfig, OCRProviderType } from '../types';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { logger } from '../../../utils/logger';
import { settingsService } from '../../settings.service';

const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY = 2000; // 2 seconds

export class GeminiProvider extends BaseOCRProvider {
  readonly name: OCRProviderType = 'gemini';
  readonly enabled: boolean = true;

  private client: GoogleGenerativeAI | null = null;
  private model: string = 'gemini-2.0-flash-exp';

  constructor(config: OCRProviderConfig) {
    super(config);
    if (config.model) this.model = config.model;
  }

  /**
   * Initialize the Gemini client
   */
  private async getClient(): Promise<GoogleGenerativeAI> {
    if (this.client) return this.client;

    const apiKey = this.config.apiKey || await settingsService.getApiKey('gemini_api_key');

    if (!apiKey) {
      throw new Error('Gemini API key not found');
    }

    this.client = new GoogleGenerativeAI(apiKey);
    return this.client;
  }

  async isReady(): Promise<boolean> {
    try {
      const apiKey = this.config.apiKey || await settingsService.getApiKey('gemini_api_key');
      return !!apiKey;
    } catch {
      return false;
    }
  }

  /**
   * Image OCR processing
   */
  async processImage(filePath: string, options: OCROptions = {}): Promise<OCRResult> {
    this.startTimer();

    try {
      const client = await this.getClient();
      const model = client.getGenerativeModel({ model: this.model });

      // Image preprocessing
      const { path: processedPath, cleanup } = await this.preprocessImage(filePath);

      // Convert to base64
      const base64Image = await this.fileToBase64(processedPath);
      const mimeType = this.getMimeType(filePath);

      // OCR prompt
      const prompt = options.prompt || this.getDefaultPrompt(options.language);

      // Gemini Vision API call
      const result = await this.generateContentWithRetry(model, [
        {
          inlineData: {
            data: base64Image,
            mimeType
          }
        },
        prompt
      ]);

      // Cleanup
      if (cleanup) await this.cleanup(processedPath);

      const response = await result.response;
      const extractedText = response.text();

      // Token usage (Gemini provides usageMetadata)
      const tokensUsed = response.usageMetadata?.totalTokenCount || 0;

      // Image dimensions
      const dimensions = await this.getImageDimensions(filePath);

      return {
        text: extractedText.trim(),
        confidence: this.calculateConfidence(extractedText),
        metadata: {
          provider: this.name,
          model: this.model,
          processingTimeMs: this.getProcessingTime(),
          tokensUsed,
          cost: this.calculateCost(tokensUsed),
          imageFormat: mimeType,
          imageSize: dimensions
        }
      };
    } catch (error) {
      logger.error('Gemini Vision OCR error:', error);
      throw new Error(`Gemini Vision OCR failed: ${error.message}`);
    }
  }

  /**
   * PDF OCR processing
   */
  async processPDF(filePath: string, options: OCROptions = {}): Promise<OCRResult> {
    this.startTimer();

    try {
      const client = await this.getClient();
      const model = client.getGenerativeModel({ model: this.model });

      // Convert the PDF to base64
      const base64PDF = await this.fileToBase64(filePath);

      // OCR prompt
      const prompt = options.prompt || this.getDefaultPrompt(options.language);

      // Gemini PDF support (beta)
      const result = await this.generateContentWithRetry(model, [
        {
          inlineData: {
            data: base64PDF,
            mimeType: 'application/pdf'
          }
        },
        prompt
      ]);

      const response = await result.response;
      const extractedText = response.text();
      const tokensUsed = response.usageMetadata?.totalTokenCount || 0;

      return {
        text: extractedText.trim(),
        confidence: this.calculateConfidence(extractedText),
        metadata: {
          provider: this.name,
          model: this.model,
          processingTimeMs: this.getProcessingTime(),
          tokensUsed,
          cost: this.calculateCost(tokensUsed),
          imageFormat: 'application/pdf'
        }
      };
    } catch (error) {
      logger.error('Gemini Vision PDF OCR error:', error);
      throw new Error(`Gemini Vision PDF OCR failed: ${error.message}`);
    }
  }

  /**
   * Base64 image OCR
   */
  async processBase64Image(
    base64Data: string,
    mimeType: string,
    options: OCROptions = {}
  ): Promise<OCRResult> {
    this.startTimer();

    try {
      const client = await this.getClient();
      const model = client.getGenerativeModel({ model: this.model });

      const prompt = options.prompt || this.getDefaultPrompt(options.language);

      const result = await this.generateContentWithRetry(model, [
        {
          inlineData: {
            data: base64Data,
            mimeType
          }
        },
        prompt
      ]);

      const response = await result.response;
      const extractedText = response.text();
      const tokensUsed = response.usageMetadata?.totalTokenCount || 0;

      return {
        text: extractedText.trim(),
        confidence: this.calculateConfidence(extractedText),
        metadata: {
          provider: this.name,
          model: this.model,
          processingTimeMs: this.getProcessingTime(),
          tokensUsed,
          cost: this.calculateCost(tokensUsed),
          imageFormat: mimeType
        }
      };
    } catch (error) {
      logger.error('Gemini Vision base64 OCR error:', error);
      throw new Error(`Gemini Vision OCR failed: ${error.message}`);
    }
  }

  /**
   * Return the provider config
   */
  getConfig(): OCRProviderConfig {
    return {
      ...this.config,
      model: this.model,
      supportedFormats: ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf'],
      maxFileSize: 20 * 1024 * 1024, // 20MB
      costPerToken: 0.00000015 // Gemini 2.0 Flash is very cheap!
    };
  }

  /**
   * Cost estimation
   */
  async estimateCost(fileSize: number, pageCount: number = 1): Promise<number> {
    // Gemini token calculation
    const estimatedTokens = pageCount * 1000;
    return this.calculateCost(estimatedTokens);
  }

  /**
   * Default OCR prompt
   */
  private getDefaultPrompt(language?: string): string {
    const langInstruction = language
      ? `Please extract all text in ${language}.`
      : 'Please extract all text in its original language.';

    return `${langInstruction}

Transcribe ALL text in this image with perfect accuracy.

It should include:
- All text content in reading order
- Preserve formatting, line breaks, and structure
- Include table data if present
- Maintain original punctuation and spacing

Return ONLY the extracted text, no explanations or additional commentary.`;
  }

  /**
   * Confidence calculation
   */
  private calculateConfidence(text: string): number {
    if (!text || text.length < 10) return 0.6;
    if (text.length > 100) return 0.95;
    if (text.length > 50) return 0.88;
    return 0.78;
  }

  /**
   * Cost calculation (Gemini is very cheap!)
   */
  private calculateCost(tokens: number): number {
    const costPerToken = 0.00000015; // ~$0.15 / 1M tokens
    return tokens * costPerToken;
  }

  /**
   * Retry logic for Gemini API calls
   */
  private async generateContentWithRetry(model: any, parts: any[]): Promise<any> {
    let lastError: any;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        return await model.generateContent(parts);
      } catch (error: any) {
        lastError = error;

        // Check if retryable
        const isRetryable =
          error.status === 429 ||
          error.status === 503 ||
          (error.message && (
            error.message.includes('429') ||
            error.message.includes('503') ||
            error.message.includes('RESOURCE_EXHAUSTED') ||
            error.message.includes('retryDelay')
          ));

        if (!isRetryable || attempt === MAX_RETRIES) {
          throw error;
        }

        // Calculate delay
        let delay = INITIAL_RETRY_DELAY * Math.pow(2, attempt - 1);

        // Extract delay from error message if available (e.g., "retryDelay":"14s")
        if (error.message && error.message.includes('retryDelay')) {
          const match = error.message.match(/retryDelay\\?":\\?"(\d+(\.\d+)?)s\\?"/);
          if (match && match[1]) {
            delay = parseFloat(match[1]) * 1000 + 1000; // Add 1s buffer
          }
        }

        logger.warn(`Gemini API error (Attempt ${attempt}/${MAX_RETRIES}). Retrying in ${delay}ms... Error: ${error.message}`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    throw lastError;
  }
}
