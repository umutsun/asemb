/**
 * TTS (Text-to-Speech) Service
 * OpenAI TTS API kullanarak metin-sese dönüşüm
 */

import OpenAI from 'openai';
import { settingsService } from '../settings.service';

export type TTSVoice = 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer';
export type TTSFormat = 'mp3' | 'opus' | 'aac' | 'flac';

export interface TTSOptions {
  text: string;
  voice?: TTSVoice;
  speed?: number;  // 0.25 - 4.0
  format?: TTSFormat;
}

export interface TTSResult {
  audio: Buffer;
  format: TTSFormat;
  voice: TTSVoice;
  textLength: number;
  processingTimeMs: number;
}

export interface VoiceInfo {
  id: TTSVoice;
  name: string;
  gender: 'male' | 'female' | 'neutral';
  description: string;
}

class TTSService {
  private openai: OpenAI | null = null;
  private resolvedApiKey: string | null = null;
  private maxTextLength = 4096;

  /**
   * Resolve the OpenAI API key from DB settings (Hard Rule #1), falling back to
   * env. Runs per request so a key added/changed in `settings` is picked up
   * without a service restart. The OpenAI client is (re)built only when the
   * resolved key changes.
   *
   * Resolve order: settings `openai.apiKey` -> env `OPENAI_API_KEY`.
   */
  private async resolveClient(): Promise<OpenAI | null> {
    let apiKey: string | null = null;
    try {
      const settingValue = await settingsService.getSetting('openai.apiKey');
      if (settingValue && settingValue.trim().length > 0) {
        apiKey = settingValue.trim();
      }
    } catch (error) {
      console.warn('[TTS] Could not read openai.apiKey from settings, falling back to env:', error);
    }

    if (!apiKey) {
      const envKey = process.env.OPENAI_API_KEY;
      if (envKey && envKey.trim().length > 0) {
        apiKey = envKey.trim();
      }
    }

    if (!apiKey) {
      this.openai = null;
      this.resolvedApiKey = null;
      return null;
    }

    // Rebuild the client only when the resolved key changes.
    if (!this.openai || this.resolvedApiKey !== apiKey) {
      this.openai = new OpenAI({ apiKey });
      this.resolvedApiKey = apiKey;
    }

    return this.openai;
  }

  /**
   * Check if TTS service is ready.
   * Reports ready when an OpenAI key is resolvable from settings OR env,
   * re-checked per call so keys added at runtime are honored.
   */
  async isReady(): Promise<boolean> {
    const client = await this.resolveClient();
    return client !== null;
  }

  /**
   * Get available voices
   */
  getVoices(): VoiceInfo[] {
    return [
      { id: 'alloy', name: 'Alloy', gender: 'neutral', description: 'Balanced and versatile voice' },
      { id: 'echo', name: 'Echo', gender: 'male', description: 'Warm and engaging male voice' },
      { id: 'fable', name: 'Fable', gender: 'female', description: 'Expressive British accent' },
      { id: 'onyx', name: 'Onyx', gender: 'male', description: 'Deep and authoritative voice' },
      { id: 'nova', name: 'Nova', gender: 'female', description: 'Friendly and warm female voice' },
      { id: 'shimmer', name: 'Shimmer', gender: 'female', description: 'Clear and optimistic voice' }
    ];
  }

  /**
   * Synthesize text to speech
   */
  async synthesize(options: TTSOptions): Promise<TTSResult> {
    // Resolve the key per request (settings -> env) so a key added at runtime works.
    const openai = await this.resolveClient();
    if (!openai) {
      throw new Error('TTS service not initialized - no OpenAI key in settings (openai.apiKey) or env (OPENAI_API_KEY)');
    }

    const { text, voice = 'alloy', speed = 1.0, format = 'mp3' } = options;

    // Validate text
    if (!text || text.trim().length === 0) {
      throw new Error('Text is required');
    }

    if (text.length > this.maxTextLength) {
      throw new Error(`Text exceeds maximum length of ${this.maxTextLength} characters`);
    }

    // Validate speed
    const validSpeed = Math.max(0.25, Math.min(4.0, speed));

    const startTime = Date.now();

    try {
      console.log(`[TTS] Synthesizing ${text.length} chars with voice: ${voice}, speed: ${validSpeed}`);

      const response = await openai.audio.speech.create({
        model: 'tts-1',
        voice: voice,
        input: text,
        speed: validSpeed,
        response_format: format
      });

      // Get audio buffer from response
      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = Buffer.from(arrayBuffer);

      const processingTimeMs = Date.now() - startTime;
      console.log(`[TTS] Synthesis complete: ${audioBuffer.length} bytes in ${processingTimeMs}ms`);

      return {
        audio: audioBuffer,
        format,
        voice,
        textLength: text.length,
        processingTimeMs
      };
    } catch (error: any) {
      console.error('[TTS] Synthesis failed:', error);
      throw new Error(`TTS synthesis failed: ${error.message}`);
    }
  }

  /**
   * Get TTS settings from database
   */
  async getSettings(): Promise<{
    enabled: boolean;
    voice: TTSVoice;
    speed: number;
  }> {
    const enabled = await settingsService.getSetting('voiceSettings.enableVoiceOutput') === 'true';
    const voice = (await settingsService.getSetting('voiceSettings.ttsVoice') || 'alloy') as TTSVoice;
    const speed = parseFloat(await settingsService.getSetting('voiceSettings.ttsSpeed') || '1.0');

    return { enabled, voice, speed };
  }

  /**
   * Estimate processing cost (approximate)
   */
  estimateCost(textLength: number): number {
    // OpenAI TTS pricing: $0.015 per 1K characters
    return (textLength / 1000) * 0.015;
  }
}

export const ttsService = new TTSService();
