/**
 * Agent Memory service (WS4-A, Redis Iris "Agent Memory" — native equivalent, ADR-0002).
 *
 * Two halves:
 *   - recall(): pull namespace/user-scoped memories from the Python dual store (Redis hot →
 *     Postgres fallback) and format them as a context block for prompt injection.
 *   - extractAndStore(): run LLM extraction on a finished turn (configured provider, Hard
 *     Rule #1), then post the durable memories to the Python store (embed + dedup + dual-write).
 *
 * Everything is FAIL-SAFE and flag-gated by the caller (`ragSettings.agentMemoryEnabled`).
 * recall() returns an empty block on any error; extractAndStore() is fire-and-forget and
 * never throws — chat is never blocked or delayed by memory work.
 *
 * No persistence or embedding lives here — that is the Python agent_memory_service. This file
 * only owns the LLM extraction (which needs the Node multi-provider layer) and the bridge call.
 */

import LLMManager from './llm-manager.service';
import { pythonService } from './python-integration.service';
import { logger } from '../utils/logger';

export interface ExtractedMemory {
  content: string;
  memory_type?: 'discrete' | 'summary' | 'preference' | 'episodic';
  topics?: string[];
  importance?: number;
}

export interface RecallOptions {
  userId?: string | null;
  namespace?: string;
  limit?: number;
  memoryTypes?: string[];
}

export interface ExtractOptions {
  userMessage: string;
  assistantAnswer: string;
  userId?: string | null;
  sessionId?: string | null;
  namespace?: string;
  /** Provider hint (claude/openai/gemini/deepseek) — falls back to the active settings provider. */
  preferredProvider?: string;
  maxMemories?: number;
}

// Instruction is English (English-first per roadmap); extracted memory CONTENT stays in the
// user's own language. No domain/Turkish keywords here — Hard Rule #1.
const EXTRACTION_SYSTEM_PROMPT =
  'You extract durable, reusable memories from a single conversation turn for a long-term ' +
  'memory store. Return ONLY a compact JSON array, no prose, no code fences. Each element: ' +
  '{"content": string (one self-contained fact/preference, written in the user\'s language), ' +
  '"memory_type": one of ["discrete","preference","summary","episodic"], ' +
  '"topics": string[] (1-4 short keywords), "importance": number between 0 and 1}. ' +
  'Extract ONLY stable, future-useful information: user preferences, durable personal/business ' +
  'facts, decisions, identities. Ignore pleasantries, transient phrasing, and corpus content ' +
  'that is not about this specific user. If nothing is worth remembering, return [].';

export class AgentMemoryService {
  private static _instance: AgentMemoryService;
  private llmManager: LLMManager;

  private constructor() {
    this.llmManager = LLMManager.getInstance();
  }

  public static getInstance(): AgentMemoryService {
    if (!AgentMemoryService._instance) {
      AgentMemoryService._instance = new AgentMemoryService();
    }
    return AgentMemoryService._instance;
  }

  /**
   * Recall relevant memories and render them as an injectable context block.
   * Returns `{ memories, contextBlock }`. contextBlock is '' when there is nothing to inject.
   */
  public async recall(
    query: string,
    opts: RecallOptions = {}
  ): Promise<{ memories: any[]; contextBlock: string }> {
    try {
      const memories = await pythonService.agentMemoryRecall(query, opts);
      return { memories, contextBlock: this.buildContextBlock(memories) };
    } catch (error: any) {
      logger.warn('[agentmemory] recall error (empty):', error?.message);
      return { memories: [], contextBlock: '' };
    }
  }

  /** Format recalled memories as a short, clearly-delimited block to prepend to the user prompt. */
  public buildContextBlock(memories: any[]): string {
    if (!memories?.length) return '';
    const lines = memories
      .map((m) => (m?.content || '').toString().trim())
      .filter(Boolean)
      .map((c) => `- ${c}`);
    if (!lines.length) return '';
    return (
      '[Remembered context about this user — use ONLY if relevant to the question, ' +
      'never contradict the cited sources below]\n' +
      lines.join('\n') +
      '\n\n'
    );
  }

  /**
   * Extract durable memories from one finished turn and store them. Fire-and-forget safe:
   * resolves to a small summary and never throws. Call WITHOUT awaiting from the chat path.
   */
  public async extractAndStore(opts: ExtractOptions): Promise<{ stored: number; deduped: number }> {
    const nothing = { stored: 0, deduped: 0 };
    try {
      const userMessage = (opts.userMessage || '').trim();
      const assistantAnswer = (opts.assistantAnswer || '').trim();
      if (!userMessage || !assistantAnswer) return nothing;

      const llmResult = await this.llmManager.generateChatResponse(
        `User: ${userMessage}\nAssistant: ${assistantAnswer}`,
        {
          temperature: 0,
          maxTokens: 600,
          systemPrompt: EXTRACTION_SYSTEM_PROMPT,
          preferredProvider: opts.preferredProvider,
        }
      );

      const items = this.parseMemories(llmResult?.content || '', opts.maxMemories ?? 8);
      if (!items.length) return nothing;

      const res = await pythonService.agentMemoryStore(items, {
        userId: opts.userId ?? null,
        namespace: opts.namespace || 'default',
        sessionId: opts.sessionId ?? null,
        sourceSessionId: opts.sessionId ?? null,
      });
      logger.info(`[agentmemory] extracted ${items.length} → stored ${res.stored}, deduped ${res.deduped}`);
      return { stored: res.stored, deduped: res.deduped };
    } catch (error: any) {
      logger.warn('[agentmemory] extractAndStore error (skipped):', error?.message);
      return nothing;
    }
  }

  /** Defensively parse the LLM's JSON array of memories. Tolerates code fences / surrounding prose. */
  private parseMemories(raw: string, cap: number): ExtractedMemory[] {
    const valid = new Set(['discrete', 'summary', 'preference', 'episodic']);
    try {
      let text = (raw || '').trim();
      // Strip ```json fences if present, then isolate the first [...] array.
      text = text.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
      const start = text.indexOf('[');
      const end = text.lastIndexOf(']');
      if (start === -1 || end === -1 || end <= start) return [];
      const arr = JSON.parse(text.slice(start, end + 1));
      if (!Array.isArray(arr)) return [];
      const out: ExtractedMemory[] = [];
      for (const el of arr) {
        const content = (el?.content || '').toString().trim();
        if (!content) continue;
        const mt = valid.has(el?.memory_type) ? el.memory_type : 'episodic';
        const topics = Array.isArray(el?.topics)
          ? el.topics.map((t: any) => t?.toString().trim()).filter(Boolean).slice(0, 4)
          : [];
        let importance = Number(el?.importance);
        if (!Number.isFinite(importance) || importance < 0 || importance > 1) importance = 0.5;
        out.push({ content, memory_type: mt, topics, importance });
        if (out.length >= cap) break;
      }
      return out;
    } catch {
      return [];
    }
  }
}

export const agentMemoryService = AgentMemoryService.getInstance();
