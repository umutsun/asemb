import { Document } from 'langchain/document';

export interface ContextWindow {
  maxTokens: number;
  currentTokens: number;
  documents: Document[];
  strategy: ContextStrategy;
}

export interface ContextStrategy {
  name: string;
  maxContextSize: number;
  relevanceThreshold: number;
  diversityWeight: number;
  recencyWeight: number;
}

export const CONTEXT_STRATEGIES: Record<string, ContextStrategy> = {
  balanced: {
    name: 'balanced',
    maxContextSize: 8000,
    relevanceThreshold: 0.7,
    diversityWeight: 0.3,
    recencyWeight: 0.2
  },
  relevance_focused: {
    name: 'relevance_focused',
    maxContextSize: 6000,
    relevanceThreshold: 0.8,
    diversityWeight: 0.1,
    recencyWeight: 0.1
  },
  comprehensive: {
    name: 'comprehensive',
    maxContextSize: 12000,
    relevanceThreshold: 0.6,
    diversityWeight: 0.4,
    recencyWeight: 0.2
  },
  recent_priority: {
    name: 'recent_priority',
    maxContextSize: 8000,
    relevanceThreshold: 0.65,
    diversityWeight: 0.2,
    recencyWeight: 0.5
  }
};

export class ContextOptimizer {
  private strategy: ContextStrategy;
  private tokenCounter: (text: string) => number;

  constructor(
    strategy: ContextStrategy = CONTEXT_STRATEGIES.balanced,
    tokenCounter?: (text: string) => number
  ) {
    this.strategy = strategy;
    this.tokenCounter = tokenCounter || this.defaultTokenCounter;
  }

  private defaultTokenCounter(text: string): number {
    return Math.ceil(text.length / 4);
  }

  async optimizeContext(
    documents: Document[],
    query: string,
    additionalConstraints?: {
      minDocuments?: number;
      maxDocuments?: number;
      preserveOrder?: boolean;
    }
  ): Promise<ContextWindow> {
    const scoredDocs = this.scoreDocuments(documents, query);
    const filteredDocs = this.filterByRelevance(scoredDocs);
    const diversifiedDocs = this.applyDiversification(filteredDocs);
    const windowDocs = this.fitToWindow(diversifiedDocs, additionalConstraints);

    const currentTokens = this.calculateTotalTokens(windowDocs);

    return {
      maxTokens: this.strategy.maxContextSize,
      currentTokens,
      documents: windowDocs,
      strategy: this.strategy
    };
  }

  private scoreDocuments(documents: Document[], query: string): Document[] {
    return documents.map(doc => {
      const relevanceScore = this.calculateRelevance(doc, query);
      const recencyScore = this.calculateRecency(doc);
      const lengthPenalty = this.calculateLengthPenalty(doc);

      const totalScore = 
        relevanceScore * (1 - this.strategy.recencyWeight) +
        recencyScore * this.strategy.recencyWeight;

      return {
        ...doc,
        metadata: {
          ...doc.metadata,
          relevanceScore,
          recencyScore,
          lengthPenalty,
          totalScore,
          tokens: this.tokenCounter(doc.pageContent)
        }
      };
    }).sort((a, b) => (b.metadata?.totalScore || 0) - (a.metadata?.totalScore || 0));
  }

  private calculateRelevance(doc: Document, query: string): number {
    if (doc.metadata?.score !== undefined) {
      return doc.metadata.score;
    }

    const docLower = doc.pageContent.toLowerCase();
    const queryTerms = query.toLowerCase().split(/\s+/);
    
    let matchCount = 0;
    let totalWeight = 0;

    queryTerms.forEach(term => {
      const termCount = (docLower.match(new RegExp(term, 'g')) || []).length;
      matchCount += Math.min(termCount, 3);
      totalWeight += 1;
    });

    const baseScore = totalWeight > 0 ? matchCount / (totalWeight * 3) : 0;
    
    const exactMatchBonus = docLower.includes(query.toLowerCase()) ? 0.2 : 0;
    
    return Math.min(1, baseScore + exactMatchBonus);
  }

  private calculateRecency(doc: Document): number {
    if (!doc.metadata?.timestamp) {
      return 0.5;
    }

    const now = Date.now();
    const docTime = new Date(doc.metadata.timestamp).getTime();
    const ageInHours = (now - docTime) / (1000 * 60 * 60);

    if (ageInHours < 1) return 1.0;
    if (ageInHours < 24) return 0.9;
    if (ageInHours < 24 * 7) return 0.7;
    if (ageInHours < 24 * 30) return 0.5;
    return 0.3;
  }

  private calculateLengthPenalty(doc: Document): number {
    const tokens = this.tokenCounter(doc.pageContent);
    
    if (tokens < 100) return 0.8;
    if (tokens < 500) return 1.0;
    if (tokens < 1000) return 0.95;
    if (tokens < 2000) return 0.85;
    return 0.7;
  }

  private filterByRelevance(documents: Document[]): Document[] {
    return documents.filter(doc => 
      (doc.metadata?.totalScore || 0) >= this.strategy.relevanceThreshold
    );
  }

  private applyDiversification(documents: Document[]): Document[] {
    if (this.strategy.diversityWeight === 0) {
      return documents;
    }

    const selected: Document[] = [];
    const sourceGroups = new Map<string, Document[]>();

    documents.forEach(doc => {
      const source = doc.metadata?.source || 'unknown';
      if (!sourceGroups.has(source)) {
        sourceGroups.set(source, []);
      }
      sourceGroups.get(source)!.push(doc);
    });

    const maxPerSource = Math.max(
      2,
      Math.ceil(documents.length / sourceGroups.size)
    );

    let addedInRound = true;
    let round = 0;

    while (addedInRound && selected.length < documents.length) {
      addedInRound = false;
      
      for (const [source, docs] of sourceGroups) {
        const sourceSelected = selected.filter(d => d.metadata?.source === source).length;
        
        if (sourceSelected < maxPerSource && docs.length > round) {
          selected.push(docs[round]);
          addedInRound = true;
        }
      }
      
      round++;
    }

    documents.forEach(doc => {
      if (!selected.includes(doc)) {
        selected.push(doc);
      }
    });

    return selected;
  }

  private fitToWindow(
    documents: Document[],
    constraints?: {
      minDocuments?: number;
      maxDocuments?: number;
      preserveOrder?: boolean;
    }
  ): Document[] {
    const minDocs = constraints?.minDocuments || 1;
    const maxDocs = constraints?.maxDocuments || Infinity;
    const preserveOrder = constraints?.preserveOrder || false;

    const selected: Document[] = [];
    let totalTokens = 0;

    for (const doc of documents) {
      const docTokens = doc.metadata?.tokens || this.tokenCounter(doc.pageContent);
      
      if (selected.length >= maxDocs) {
        break;
      }

      if (totalTokens + docTokens <= this.strategy.maxContextSize) {
        selected.push(doc);
        totalTokens += docTokens;
      } else if (selected.length < minDocs) {
        const trimmedDoc = this.trimDocument(doc, this.strategy.maxContextSize - totalTokens);
        if (trimmedDoc) {
          selected.push(trimmedDoc);
          totalTokens += this.tokenCounter(trimmedDoc.pageContent);
        }
        break;
      }
    }

    if (preserveOrder) {
      selected.sort((a, b) => {
        const aIndex = a.metadata?.originalIndex || 0;
        const bIndex = b.metadata?.originalIndex || 0;
        return aIndex - bIndex;
      });
    }

    return selected;
  }

  private trimDocument(doc: Document, maxTokens: number): Document | null {
    const content = doc.pageContent;
    const estimatedCharsPerToken = 4;
    const maxChars = maxTokens * estimatedCharsPerToken;

    if (maxChars <= 0) {
      return null;
    }

    const trimmedContent = content.substring(0, maxChars);
    
    const lastSentenceEnd = Math.max(
      trimmedContent.lastIndexOf('.'),
      trimmedContent.lastIndexOf('!'),
      trimmedContent.lastIndexOf('?')
    );

    const finalContent = lastSentenceEnd > maxChars * 0.7
      ? trimmedContent.substring(0, lastSentenceEnd + 1)
      : trimmedContent + '...';

    return {
      ...doc,
      pageContent: finalContent,
      metadata: {
        ...doc.metadata,
        trimmed: true,
        originalLength: content.length
      }
    };
  }

  private calculateTotalTokens(documents: Document[]): number {
    return documents.reduce((total, doc) => {
      const tokens = doc.metadata?.tokens || this.tokenCounter(doc.pageContent);
      return total + tokens;
    }, 0);
  }

  public adjustStrategy(updates: Partial<ContextStrategy>) {
    this.strategy = {
      ...this.strategy,
      ...updates
    };
  }

  public getStrategy(): ContextStrategy {
    return this.strategy;
  }

  public setTokenCounter(counter: (text: string) => number) {
    this.tokenCounter = counter;
  }

  public analyzeContextUsage(window: ContextWindow): {
    utilizationRate: number;
    averageRelevance: number;
    sourceDiversity: number;
    recommendations: string[];
  } {
    const utilizationRate = window.currentTokens / window.maxTokens;
    
    const averageRelevance = window.documents.reduce((sum, doc) => 
      sum + (doc.metadata?.relevanceScore || 0), 0
    ) / window.documents.length;

    const sources = new Set(window.documents.map(d => d.metadata?.source || 'unknown'));
    const sourceDiversity = sources.size / window.documents.length;

    const recommendations: string[] = [];

    if (utilizationRate < 0.5) {
      recommendations.push('Consider increasing relevance threshold to include more context');
    }
    if (utilizationRate > 0.95) {
      recommendations.push('Context window nearly full - consider more aggressive filtering');
    }
    if (averageRelevance < 0.6) {
      recommendations.push('Low average relevance - query may need refinement');
    }
    if (sourceDiversity < 0.3) {
      recommendations.push('Low source diversity - consider adjusting diversity weight');
    }

    return {
      utilizationRate,
      averageRelevance,
      sourceDiversity,
      recommendations
    };
  }
}