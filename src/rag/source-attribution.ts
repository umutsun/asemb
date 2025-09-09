import { Document } from 'langchain/document';

export interface Source {
  id: string;
  title?: string;
  url?: string;
  author?: string;
  timestamp?: Date;
  type: 'web' | 'document' | 'database' | 'api' | 'manual';
  reliability: number;
  content?: string;
  metadata?: Record<string, any>;
}

export interface Citation {
  sourceId: string;
  quote: string;
  confidence: number;
  location?: {
    start: number;
    end: number;
    page?: number;
    section?: string;
  };
  verificationStatus: 'verified' | 'unverified' | 'partial';
}

export interface AttributedAnswer {
  answer: string;
  citations: Citation[];
  sources: Source[];
  confidence: number;
  attributionMetrics: {
    coverageRate: number;
    verificationRate: number;
    sourceReliability: number;
  };
}

export class SourceAttributionSystem {
  private sources: Map<string, Source> = new Map();
  private citationThreshold: number;
  private requireVerification: boolean;

  constructor(
    citationThreshold: number = 0.8,
    requireVerification: boolean = true
  ) {
    this.citationThreshold = citationThreshold;
    this.requireVerification = requireVerification;
  }

  registerSource(source: Source): void {
    this.sources.set(source.id, source);
  }

  registerSources(sources: Source[]): void {
    sources.forEach(source => this.registerSource(source));
  }

  async attributeAnswer(
    answer: string,
    contextDocuments: Document[],
    options?: {
      minCitations?: number;
      maxCitations?: number;
      verbatimOnly?: boolean;
    }
  ): Promise<AttributedAnswer> {
    const citations = await this.extractCitations(answer, contextDocuments, options);
    const usedSourceIds = new Set(citations.map(c => c.sourceId));
    const usedSources = Array.from(usedSourceIds)
      .map(id => this.sources.get(id))
      .filter((s): s is Source => s !== undefined);

    const metrics = this.calculateAttributionMetrics(answer, citations, usedSources);

    return {
      answer: this.formatAnswerWithCitations(answer, citations),
      citations,
      sources: usedSources,
      confidence: this.calculateConfidence(citations, metrics),
      attributionMetrics: metrics
    };
  }

  private async extractCitations(
    answer: string,
    documents: Document[],
    options?: {
      minCitations?: number;
      maxCitations?: number;
      verbatimOnly?: boolean;
    }
  ): Promise<Citation[]> {
    const citations: Citation[] = [];
    const sentences = this.splitIntoSentences(answer);
    const minCitations = options?.minCitations || 0;
    const maxCitations = options?.maxCitations || Infinity;
    const verbatimOnly = options?.verbatimOnly || false;

    for (const sentence of sentences) {
      if (citations.length >= maxCitations) break;

      const matches = this.findMatches(sentence, documents, verbatimOnly);
      
      if (matches.length > 0) {
        const bestMatch = matches[0];
        
        if (bestMatch.confidence >= this.citationThreshold) {
          citations.push({
            sourceId: bestMatch.sourceId,
            quote: sentence,
            confidence: bestMatch.confidence,
            location: bestMatch.location,
            verificationStatus: this.verifyMatch(bestMatch)
          });
        }
      }
    }

    while (citations.length < minCitations && documents.length > 0) {
      const fallbackCitation = this.createFallbackCitation(
        answer,
        documents[citations.length % documents.length]
      );
      citations.push(fallbackCitation);
    }

    return citations;
  }

  private findMatches(
    sentence: string,
    documents: Document[],
    verbatimOnly: boolean
  ): Array<{
    sourceId: string;
    confidence: number;
    location?: any;
    content: string;
  }> {
    const matches: Array<{
      sourceId: string;
      confidence: number;
      location?: any;
      content: string;
    }> = [];

    for (const doc of documents) {
      const sourceId = doc.metadata?.sourceId || doc.metadata?.id || this.generateSourceId(doc);
      
      if (!this.sources.has(sourceId)) {
        this.registerSource({
          id: sourceId,
          type: doc.metadata?.type || 'document',
          title: doc.metadata?.title,
          url: doc.metadata?.url,
          author: doc.metadata?.author,
          timestamp: doc.metadata?.timestamp,
          reliability: doc.metadata?.reliability || 0.7,
          content: doc.pageContent,
          metadata: doc.metadata
        });
      }

      const confidence = verbatimOnly
        ? this.calculateVerbatimMatch(sentence, doc.pageContent)
        : this.calculateSemanticMatch(sentence, doc.pageContent);

      if (confidence > 0) {
        const location = this.findLocation(sentence, doc.pageContent);
        matches.push({
          sourceId,
          confidence,
          location,
          content: doc.pageContent
        });
      }
    }

    return matches.sort((a, b) => b.confidence - a.confidence);
  }

  private calculateVerbatimMatch(sentence: string, content: string): number {
    const normalizedSentence = this.normalize(sentence);
    const normalizedContent = this.normalize(content);

    if (normalizedContent.includes(normalizedSentence)) {
      return 1.0;
    }

    const words = normalizedSentence.split(/\s+/);
    const matchedWords = words.filter(word => normalizedContent.includes(word));
    
    return matchedWords.length / words.length;
  }

  private calculateSemanticMatch(sentence: string, content: string): number {
    const sentenceKeywords = this.extractKeywords(sentence);
    const contentKeywords = this.extractKeywords(content);

    const intersection = sentenceKeywords.filter(kw => contentKeywords.includes(kw));
    const union = new Set([...sentenceKeywords, ...contentKeywords]);

    const jaccardSimilarity = intersection.length / union.size;

    const ngramSimilarity = this.calculateNgramSimilarity(sentence, content, 3);

    return (jaccardSimilarity * 0.6) + (ngramSimilarity * 0.4);
  }

  private calculateNgramSimilarity(text1: string, text2: string, n: number): number {
    const ngrams1 = this.generateNgrams(text1, n);
    const ngrams2 = this.generateNgrams(text2, n);

    const intersection = ngrams1.filter(ng => ngrams2.includes(ng));
    
    if (ngrams1.length === 0) return 0;
    
    return intersection.length / ngrams1.length;
  }

  private generateNgrams(text: string, n: number): string[] {
    const words = text.toLowerCase().split(/\s+/);
    const ngrams: string[] = [];

    for (let i = 0; i <= words.length - n; i++) {
      ngrams.push(words.slice(i, i + n).join(' '));
    }

    return ngrams;
  }

  private extractKeywords(text: string): string[] {
    const stopWords = new Set([
      'the', 'is', 'at', 'which', 'on', 'a', 'an', 'as', 'are', 'was',
      'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does',
      'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must',
      'can', 'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she',
      'it', 'we', 'they', 'what', 'which', 'who', 'when', 'where', 'why',
      'how', 'all', 'each', 'every', 'both', 'few', 'more', 'most', 'other',
      'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so',
      'than', 'too', 'very', 'just', 'but', 'for', 'with', 'about'
    ]);

    return text
      .toLowerCase()
      .split(/\s+/)
      .filter(word => word.length > 2 && !stopWords.has(word));
  }

  private findLocation(sentence: string, content: string): any {
    const index = content.toLowerCase().indexOf(sentence.toLowerCase());
    
    if (index === -1) {
      return undefined;
    }

    const lines = content.substring(0, index).split('\n');
    const lineNumber = lines.length;
    
    return {
      start: index,
      end: index + sentence.length,
      line: lineNumber,
      section: this.identifySection(content, index)
    };
  }

  private identifySection(content: string, position: number): string | undefined {
    const beforeContent = content.substring(0, position);
    const headingMatch = beforeContent.match(/(?:^|\n)(#{1,6}|[A-Z][^.!?]*:)\s*([^\n]+)/g);
    
    if (headingMatch && headingMatch.length > 0) {
      const lastHeading = headingMatch[headingMatch.length - 1];
      return lastHeading.replace(/^[\n#:\s]+/, '').trim();
    }

    return undefined;
  }

  private verifyMatch(match: any): 'verified' | 'unverified' | 'partial' {
    if (!this.requireVerification) {
      return 'unverified';
    }

    if (match.confidence >= 0.95) {
      return 'verified';
    } else if (match.confidence >= this.citationThreshold) {
      return 'partial';
    }

    return 'unverified';
  }

  private createFallbackCitation(answer: string, document: Document): Citation {
    const sourceId = document.metadata?.sourceId || 
                    document.metadata?.id || 
                    this.generateSourceId(document);

    return {
      sourceId,
      quote: answer.substring(0, 100) + '...',
      confidence: 0.5,
      verificationStatus: 'unverified'
    };
  }

  private formatAnswerWithCitations(answer: string, citations: Citation[]): string {
    let formattedAnswer = answer;
    let citationIndex = 1;

    citations.forEach(citation => {
      const citationMark = `[${citationIndex}]`;
      const quoteIndex = formattedAnswer.indexOf(citation.quote);
      
      if (quoteIndex !== -1) {
        const insertPosition = quoteIndex + citation.quote.length;
        formattedAnswer = 
          formattedAnswer.slice(0, insertPosition) + 
          citationMark + 
          formattedAnswer.slice(insertPosition);
        citationIndex++;
      }
    });

    return formattedAnswer;
  }

  private calculateAttributionMetrics(
    answer: string,
    citations: Citation[],
    sources: Source[]
  ): {
    coverageRate: number;
    verificationRate: number;
    sourceReliability: number;
  } {
    const sentences = this.splitIntoSentences(answer);
    const citedSentences = citations.map(c => c.quote);
    const coverageRate = citedSentences.length / sentences.length;

    const verifiedCitations = citations.filter(c => c.verificationStatus === 'verified');
    const verificationRate = citations.length > 0 
      ? verifiedCitations.length / citations.length 
      : 0;

    const sourceReliability = sources.length > 0
      ? sources.reduce((sum, s) => sum + s.reliability, 0) / sources.length
      : 0;

    return {
      coverageRate,
      verificationRate,
      sourceReliability
    };
  }

  private calculateConfidence(
    citations: Citation[],
    metrics: {
      coverageRate: number;
      verificationRate: number;
      sourceReliability: number;
    }
  ): number {
    if (citations.length === 0) {
      return 0.3;
    }

    const avgCitationConfidence = citations.reduce((sum, c) => sum + c.confidence, 0) / citations.length;

    const confidence = 
      (avgCitationConfidence * 0.4) +
      (metrics.coverageRate * 0.2) +
      (metrics.verificationRate * 0.2) +
      (metrics.sourceReliability * 0.2);

    return Math.min(1, Math.max(0, confidence));
  }

  private splitIntoSentences(text: string): string[] {
    return text
      .split(/[.!?]+/)
      .map(s => s.trim())
      .filter(s => s.length > 0);
  }

  private normalize(text: string): string {
    return text.toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  private generateSourceId(document: Document): string {
    const content = document.pageContent.substring(0, 50);
    const hash = this.simpleHash(content);
    return `doc_${hash}_${Date.now()}`;
  }

  private simpleHash(text: string): string {
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      const char = text.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
  }

  public getSource(sourceId: string): Source | undefined {
    return this.sources.get(sourceId);
  }

  public getAllSources(): Source[] {
    return Array.from(this.sources.values());
  }

  public clearSources(): void {
    this.sources.clear();
  }
}