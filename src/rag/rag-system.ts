import { OpenAI } from "@langchain/openai";
import { ChatAnthropic } from "@langchain/anthropic";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { Document } from "langchain/document";
import { VectorStore } from "langchain/vectorstores/base";
import { RetrievalQAChain } from "langchain/chains";

export class RAGSystem {
  private vectorStore: VectorStore;
  private llm: OpenAI | ChatAnthropic;
  private textSplitter: RecursiveCharacterTextSplitter;
  private retrievalChain: RetrievalQAChain;

  constructor(config: {
    vectorStore: VectorStore;
    llmProvider: 'openai' | 'anthropic';
    apiKey: string;
    chunkSize?: number;
    chunkOverlap?: number;
  }) {
    this.vectorStore = config.vectorStore;
    
    // Initialize LLM
    if (config.llmProvider === 'openai') {
      this.llm = new OpenAI({
        openAIApiKey: config.apiKey,
        modelName: 'gpt-4-turbo-preview',
        temperature: 0.3,
        maxTokens: 2000
      });
    } else {
      this.llm = new ChatAnthropic({
        anthropicApiKey: config.apiKey,
        modelName: 'claude-3-opus',
        temperature: 0.3,
        maxTokens: 2000
      });
    }

    // Initialize text splitter
    this.textSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: config.chunkSize || 1000,
      chunkOverlap: config.chunkOverlap || 200,
      separators: ["\n\n", "\n", ".", "!", "?", ",", " ", ""],
      lengthFunction: (text: string) => text.length
    });

    // Initialize retrieval chain
    this.retrievalChain = RetrievalQAChain.fromLLM(
      this.llm,
      this.vectorStore.asRetriever({
        k: 5,
        searchType: "similarity",
        scoreThreshold: 0.7
      }),
      {
        returnSourceDocuments: true,
        verbose: true
      }
    );
  }

  // Document chunking strategy
  async chunkDocuments(documents: Array<{ content: string; metadata: any }>): Promise<Document[]> {
    const allChunks: Document[] = [];

    for (const doc of documents) {
      const chunks = await this.textSplitter.splitText(doc.content);
      
      const chunkDocuments = chunks.map((chunk, index) => {
        return new Document({
          pageContent: chunk,
          metadata: {
            ...doc.metadata,
            chunkIndex: index,
            totalChunks: chunks.length,
            chunkSize: chunk.length,
            originalDocId: doc.metadata.id,
            timestamp: new Date().toISOString()
          }
        });
      });

      allChunks.push(...chunkDocuments);
    }

    return allChunks;
  }

  // Context window optimization
  optimizeContext(documents: Document[], maxTokens: number = 3000): Document[] {
    // Sort by relevance score if available
    const sortedDocs = documents.sort((a, b) => 
      (b.metadata.score || 0) - (a.metadata.score || 0)
    );

    const optimizedDocs: Document[] = [];
    let currentTokens = 0;

    for (const doc of sortedDocs) {
      const estimatedTokens = Math.ceil(doc.pageContent.length / 4);
      
      if (currentTokens + estimatedTokens <= maxTokens) {
        optimizedDocs.push(doc);
        currentTokens += estimatedTokens;
      } else if (optimizedDocs.length === 0) {
        // Include at least one document, truncated if necessary
        const truncatedContent = doc.pageContent.substring(0, maxTokens * 4);
        optimizedDocs.push(new Document({
          pageContent: truncatedContent,
          metadata: { ...doc.metadata, truncated: true }
        }));
        break;
      } else {
        break;
      }
    }

    return optimizedDocs;
  }

  // Source attribution system
  formatSourceAttribution(documents: Document[]): string {
    const sources = documents.map((doc, index) => {
      const source = doc.metadata;
      return `[${index + 1}] ${source.title || source.originalDocId} (${source.source || 'Unknown'})`;
    });

    return sources.join('\n');
  }

  // Hallucination detection
  async detectHallucination(answer: string, sources: Document[]): Promise<{
    isHallucinated: boolean;
    confidence: number;
    issues: string[];
  }> {
    const issues: string[] = [];
    let hallucinationScore = 0;

    // Check if answer contains information not in sources
    const sourceContent = sources.map(d => d.pageContent).join(' ').toLowerCase();
    const answerWords = answer.toLowerCase().split(/\s+/);
    
    let unmatchedWords = 0;
    for (const word of answerWords) {
      if (word.length > 5 && !sourceContent.includes(word)) {
        unmatchedWords++;
      }
    }

    const unmatchedRatio = unmatchedWords / answerWords.length;
    if (unmatchedRatio > 0.3) {
      issues.push('Answer contains significant information not found in sources');
      hallucinationScore += 0.5;
    }

    // Check for specific hallucination patterns
    const hallucinationPatterns = [
      /as of \d{4}/i,  // Specific dates not in sources
      /\d+\.\d+%/,      // Specific percentages
      /exactly \d+/i,   // Exact numbers
      /definitely/i,    // Overconfident language
      /always/i,        // Absolute statements
    ];

    for (const pattern of hallucinationPatterns) {
      if (pattern.test(answer) && !pattern.test(sourceContent)) {
        issues.push(`Potential hallucination pattern detected: ${pattern}`);
        hallucinationScore += 0.2;
      }
    }

    return {
      isHallucinated: hallucinationScore >= 0.5,
      confidence: Math.min(hallucinationScore, 1),
      issues
    };
  }

  // Answer quality scoring
  scoreAnswerQuality(answer: string, query: string, sources: Document[]): {
    score: number;
    metrics: {
      relevance: number;
      completeness: number;
      accuracy: number;
      clarity: number;
      sourceAlignment: number;
    };
    feedback: string[];
  } {
    const metrics = {
      relevance: 0,
      completeness: 0,
      accuracy: 0,
      clarity: 0,
      sourceAlignment: 0
    };
    const feedback: string[] = [];

    // Relevance: Does answer address the query?
    const queryKeywords = query.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    const answerLower = answer.toLowerCase();
    const matchedKeywords = queryKeywords.filter(kw => answerLower.includes(kw));
    metrics.relevance = matchedKeywords.length / Math.max(queryKeywords.length, 1);

    if (metrics.relevance < 0.5) {
      feedback.push('Answer may not fully address the query');
    }

    // Completeness: Answer length and structure
    const wordCount = answer.split(/\s+/).length;
    if (wordCount < 20) {
      metrics.completeness = 0.3;
      feedback.push('Answer is too brief');
    } else if (wordCount > 500) {
      metrics.completeness = 0.7;
      feedback.push('Answer may be too verbose');
    } else {
      metrics.completeness = Math.min(wordCount / 100, 1);
    }

    // Accuracy: Check against sources
    const sourceContent = sources.map(d => d.pageContent).join(' ');
    const answerSentences = answer.split(/[.!?]+/);
    let accurateSentences = 0;

    for (const sentence of answerSentences) {
      if (sentence.trim().length > 10) {
        const sentenceWords = sentence.toLowerCase().split(/\s+/).filter(w => w.length > 3);
        const matchedWords = sentenceWords.filter(w => sourceContent.toLowerCase().includes(w));
        if (matchedWords.length / sentenceWords.length > 0.3) {
          accurateSentences++;
        }
      }
    }

    metrics.accuracy = accurateSentences / Math.max(answerSentences.length, 1);

    // Clarity: Sentence structure and readability
    const avgSentenceLength = wordCount / Math.max(answerSentences.length, 1);
    if (avgSentenceLength > 30) {
      metrics.clarity = 0.5;
      feedback.push('Sentences are too long for clarity');
    } else if (avgSentenceLength < 5) {
      metrics.clarity = 0.3;
      feedback.push('Sentences are too short');
    } else {
      metrics.clarity = 0.8;
    }

    // Source alignment
    metrics.sourceAlignment = sources.length > 0 ? Math.min(sources.length / 3, 1) : 0;

    // Calculate overall score
    const score = (
      metrics.relevance * 0.3 +
      metrics.completeness * 0.2 +
      metrics.accuracy * 0.25 +
      metrics.clarity * 0.15 +
      metrics.sourceAlignment * 0.1
    );

    if (score < 0.6) {
      feedback.push('Overall answer quality needs improvement');
    }

    return { score, metrics, feedback };
  }

  // Main query method
  async query(question: string, options?: {
    maxSources?: number;
    includeMetrics?: boolean;
    checkHallucination?: boolean;
  }): Promise<{
    answer: string;
    sources: Document[];
    attribution: string;
    quality?: any;
    hallucination?: any;
  }> {
    const result = await this.retrievalChain.call({ query: question });
    
    const response: any = {
      answer: result.text,
      sources: result.sourceDocuments || [],
      attribution: this.formatSourceAttribution(result.sourceDocuments || [])
    };

    if (options?.includeMetrics) {
      response.quality = this.scoreAnswerQuality(
        result.text,
        question,
        result.sourceDocuments || []
      );
    }

    if (options?.checkHallucination) {
      response.hallucination = await this.detectHallucination(
        result.text,
        result.sourceDocuments || []
      );
    }

    return response;
  }
}