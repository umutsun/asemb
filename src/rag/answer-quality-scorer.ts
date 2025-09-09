import { Document } from 'langchain/document';
import { HallucinationDetector, HallucinationCheck } from './hallucination-detector';
import { SourceAttributionSystem, AttributedAnswer } from './source-attribution';

export interface QualityScore {
  overall: number;
  dimensions: {
    relevance: number;
    accuracy: number;
    completeness: number;
    coherence: number;
    conciseness: number;
    sourceAlignment: number;
  };
  metrics: QualityMetrics;
  feedback: QualityFeedback;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
}

export interface QualityMetrics {
  wordCount: number;
  sentenceCount: number;
  averageSentenceLength: number;
  readabilityScore: number;
  citationDensity: number;
  confidenceLevel: number;
  hallucinationRisk: number;
  responseTime?: number;
}

export interface QualityFeedback {
  strengths: string[];
  weaknesses: string[];
  improvements: string[];
  examples?: string[];
}

export interface ScoringConfig {
  weights: {
    relevance: number;
    accuracy: number;
    completeness: number;
    coherence: number;
    conciseness: number;
    sourceAlignment: number;
  };
  thresholds: {
    excellent: number;
    good: number;
    satisfactory: number;
    needsImprovement: number;
  };
  penalties: {
    hallucination: number;
    lengthDeviation: number;
    lowCitation: number;
  };
}

export class AnswerQualityScorer {
  private config: ScoringConfig;
  private hallucinationDetector: HallucinationDetector;
  private attributionSystem: SourceAttributionSystem;

  constructor(config?: Partial<ScoringConfig>) {
    this.config = {
      weights: {
        relevance: 0.25,
        accuracy: 0.25,
        completeness: 0.15,
        coherence: 0.15,
        conciseness: 0.1,
        sourceAlignment: 0.1
      },
      thresholds: {
        excellent: 0.9,
        good: 0.75,
        satisfactory: 0.6,
        needsImprovement: 0.4
      },
      penalties: {
        hallucination: 0.3,
        lengthDeviation: 0.1,
        lowCitation: 0.15
      },
      ...config
    };

    this.hallucinationDetector = new HallucinationDetector();
    this.attributionSystem = new SourceAttributionSystem();
  }

  async scoreAnswer(
    answer: string,
    query: string,
    sourceDocuments: Document[],
    options?: {
      expectedLength?: number;
      requireCitations?: boolean;
      checkHallucination?: boolean;
      responseTime?: number;
    }
  ): Promise<QualityScore> {
    const relevanceScore = await this.scoreRelevance(answer, query);
    const accuracyScore = await this.scoreAccuracy(answer, sourceDocuments, options?.checkHallucination);
    const completenessScore = await this.scoreCompleteness(answer, query, sourceDocuments);
    const coherenceScore = this.scoreCoherence(answer);
    const concisenessScore = this.scoreConciseness(answer, options?.expectedLength);
    const sourceAlignmentScore = await this.scoreSourceAlignment(answer, sourceDocuments);

    const dimensions = {
      relevance: relevanceScore,
      accuracy: accuracyScore,
      completeness: completenessScore,
      coherence: coherenceScore,
      conciseness: concisenessScore,
      sourceAlignment: sourceAlignmentScore
    };

    const overallScore = this.calculateOverallScore(dimensions);
    const metrics = await this.calculateMetrics(answer, sourceDocuments, options);
    const feedback = this.generateFeedback(dimensions, metrics, answer, query);
    const grade = this.assignGrade(overallScore);

    return {
      overall: overallScore,
      dimensions,
      metrics,
      feedback,
      grade
    };
  }

  private async scoreRelevance(answer: string, query: string): Promise<number> {
    const queryKeywords = this.extractKeywords(query);
    const answerKeywords = this.extractKeywords(answer);

    const keywordOverlap = this.calculateOverlap(queryKeywords, answerKeywords);

    const queryIntent = this.identifyQueryIntent(query);
    const answerAlignment = this.checkIntentAlignment(answer, queryIntent);

    const directness = this.measureDirectness(answer, query);

    return (keywordOverlap * 0.3) + (answerAlignment * 0.5) + (directness * 0.2);
  }

  private async scoreAccuracy(
    answer: string,
    sources: Document[],
    checkHallucination: boolean = true
  ): Promise<number> {
    let baseScore = 1.0;

    if (checkHallucination) {
      const hallucinationCheck = await this.hallucinationDetector.detectHallucinations(
        answer,
        sources
      );

      if (hallucinationCheck.isPotentialHallucination) {
        baseScore -= this.config.penalties.hallucination;
      }

      baseScore -= hallucinationCheck.score * 0.5;
    }

    const factualClaims = this.extractFactualClaims(answer);
    const verifiedClaims = this.verifyClaims(factualClaims, sources);
    const verificationRate = factualClaims.length > 0 
      ? verifiedClaims / factualClaims.length 
      : 1.0;

    return Math.max(0, Math.min(1, baseScore * verificationRate));
  }

  private async scoreCompleteness(
    answer: string,
    query: string,
    sources: Document[]
  ): Promise<number> {
    const queryAspects = this.identifyQueryAspects(query);
    const addressedAspects = this.checkAddressedAspects(answer, queryAspects);
    const aspectCoverage = queryAspects.length > 0 
      ? addressedAspects / queryAspects.length 
      : 1.0;

    const keyInformation = this.extractKeyInformation(sources);
    const includedInfo = this.checkIncludedInformation(answer, keyInformation);
    const infoCoverage = keyInformation.length > 0 
      ? includedInfo / keyInformation.length 
      : 1.0;

    const hasConclusion = this.hasConclusion(answer);
    const hasIntroduction = this.hasIntroduction(answer);
    const structureBonus = (hasIntroduction ? 0.05 : 0) + (hasConclusion ? 0.05 : 0);

    return Math.min(1, (aspectCoverage * 0.6) + (infoCoverage * 0.3) + structureBonus);
  }

  private scoreCoherence(answer: string): number {
    const sentences = this.splitIntoSentences(answer);
    
    let transitionScore = 0;
    for (let i = 1; i < sentences.length; i++) {
      transitionScore += this.scoreTransition(sentences[i - 1], sentences[i]);
    }
    const avgTransition = sentences.length > 1 
      ? transitionScore / (sentences.length - 1) 
      : 1.0;

    const topicConsistency = this.measureTopicConsistency(sentences);

    const logicalFlow = this.assessLogicalFlow(answer);

    const readability = this.calculateReadability(answer);

    return (avgTransition * 0.25) + (topicConsistency * 0.25) + 
           (logicalFlow * 0.25) + (readability * 0.25);
  }

  private scoreConciseness(answer: string, expectedLength?: number): number {
    const wordCount = answer.split(/\s+/).length;
    
    let lengthScore = 1.0;
    if (expectedLength) {
      const deviation = Math.abs(wordCount - expectedLength) / expectedLength;
      lengthScore = Math.max(0, 1 - (deviation * this.config.penalties.lengthDeviation));
    }

    const redundancy = this.detectRedundancy(answer);
    const redundancyScore = 1 - redundancy;

    const clarity = this.measureClarity(answer);

    const efficiency = this.measureInformationDensity(answer);

    return (lengthScore * 0.3) + (redundancyScore * 0.3) + 
           (clarity * 0.2) + (efficiency * 0.2);
  }

  private async scoreSourceAlignment(answer: string, sources: Document[]): Promise<number> {
    const attribution = await this.attributionSystem.attributeAnswer(answer, sources);
    
    const citationScore = Math.min(1, attribution.citations.length / 3);

    const coverageScore = attribution.attributionMetrics.coverageRate;

    const reliabilityScore = attribution.attributionMetrics.sourceReliability;

    const verificationScore = attribution.attributionMetrics.verificationRate;

    return (citationScore * 0.2) + (coverageScore * 0.3) + 
           (reliabilityScore * 0.2) + (verificationScore * 0.3);
  }

  private calculateOverallScore(dimensions: QualityScore['dimensions']): number {
    const weightedSum = Object.entries(dimensions).reduce((sum, [key, value]) => {
      const weight = this.config.weights[key as keyof typeof dimensions];
      return sum + (value * weight);
    }, 0);

    return Math.min(1, Math.max(0, weightedSum));
  }

  private async calculateMetrics(
    answer: string,
    sources: Document[],
    options?: any
  ): Promise<QualityMetrics> {
    const words = answer.split(/\s+/);
    const sentences = this.splitIntoSentences(answer);
    
    const attribution = await this.attributionSystem.attributeAnswer(answer, sources);
    const hallucinationCheck = await this.hallucinationDetector.detectHallucinations(
      answer,
      sources
    );

    return {
      wordCount: words.length,
      sentenceCount: sentences.length,
      averageSentenceLength: words.length / Math.max(1, sentences.length),
      readabilityScore: this.calculateReadability(answer),
      citationDensity: attribution.citations.length / Math.max(1, sentences.length),
      confidenceLevel: attribution.confidence,
      hallucinationRisk: hallucinationCheck.score,
      responseTime: options?.responseTime
    };
  }

  private generateFeedback(
    dimensions: QualityScore['dimensions'],
    metrics: QualityMetrics,
    answer: string,
    query: string
  ): QualityFeedback {
    const strengths: string[] = [];
    const weaknesses: string[] = [];
    const improvements: string[] = [];

    if (dimensions.relevance >= 0.8) {
      strengths.push('Answer directly addresses the query');
    } else if (dimensions.relevance < 0.6) {
      weaknesses.push('Answer lacks relevance to the query');
      improvements.push('Focus more directly on answering the specific question asked');
    }

    if (dimensions.accuracy >= 0.9) {
      strengths.push('High factual accuracy with good source alignment');
    } else if (dimensions.accuracy < 0.7) {
      weaknesses.push('Potential accuracy issues detected');
      improvements.push('Verify all claims against source documents');
    }

    if (dimensions.completeness >= 0.85) {
      strengths.push('Comprehensive coverage of the topic');
    } else if (dimensions.completeness < 0.6) {
      weaknesses.push('Answer may be incomplete');
      improvements.push('Address all aspects of the query');
    }

    if (dimensions.coherence >= 0.8) {
      strengths.push('Well-structured and coherent response');
    } else if (dimensions.coherence < 0.6) {
      weaknesses.push('Answer lacks coherence and logical flow');
      improvements.push('Improve transitions between ideas and maintain logical flow');
    }

    if (metrics.readabilityScore < 50) {
      weaknesses.push('Complex sentence structures may hinder understanding');
      improvements.push('Use simpler sentence structures for better readability');
    }

    if (metrics.citationDensity < 0.2) {
      weaknesses.push('Insufficient citations for claims made');
      improvements.push('Add more citations to support factual statements');
    }

    if (metrics.hallucinationRisk > 0.3) {
      weaknesses.push('Risk of hallucinated content detected');
      improvements.push('Stick closer to source material and avoid unsupported claims');
    }

    if (metrics.averageSentenceLength > 25) {
      improvements.push('Consider breaking long sentences for better readability');
    }

    return {
      strengths,
      weaknesses,
      improvements
    };
  }

  private assignGrade(score: number): 'A' | 'B' | 'C' | 'D' | 'F' {
    if (score >= this.config.thresholds.excellent) return 'A';
    if (score >= this.config.thresholds.good) return 'B';
    if (score >= this.config.thresholds.satisfactory) return 'C';
    if (score >= this.config.thresholds.needsImprovement) return 'D';
    return 'F';
  }

  private extractKeywords(text: string): string[] {
    const stopWords = new Set([
      'the', 'is', 'at', 'which', 'on', 'a', 'an', 'as', 'are', 'was',
      'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does'
    ]);

    return text
      .toLowerCase()
      .split(/\s+/)
      .filter(word => word.length > 2 && !stopWords.has(word));
  }

  private calculateOverlap(set1: string[], set2: string[]): number {
    const intersection = set1.filter(item => set2.includes(item));
    const union = new Set([...set1, ...set2]);
    return union.size > 0 ? intersection.length / union.size : 0;
  }

  private identifyQueryIntent(query: string): string {
    if (query.match(/\b(what|which|who|where|when)\b/i)) return 'factual';
    if (query.match(/\b(how|why)\b/i)) return 'explanatory';
    if (query.match(/\b(compare|contrast|difference)\b/i)) return 'comparative';
    if (query.match(/\b(should|would|could|recommend)\b/i)) return 'advisory';
    return 'general';
  }

  private checkIntentAlignment(answer: string, intent: string): number {
    switch (intent) {
      case 'factual':
        return answer.match(/\b(is|are|was|were|located|named)\b/gi) ? 1.0 : 0.5;
      case 'explanatory':
        return answer.match(/\b(because|therefore|thus|consequently|reason)\b/gi) ? 1.0 : 0.5;
      case 'comparative':
        return answer.match(/\b(while|whereas|unlike|similar|different)\b/gi) ? 1.0 : 0.5;
      case 'advisory':
        return answer.match(/\b(recommend|suggest|should|advise|best)\b/gi) ? 1.0 : 0.5;
      default:
        return 0.8;
    }
  }

  private measureDirectness(answer: string, query: string): number {
    const firstSentence = answer.split(/[.!?]/)[0];
    const queryKeywords = this.extractKeywords(query);
    const firstSentKeywords = this.extractKeywords(firstSentence);
    
    return this.calculateOverlap(queryKeywords, firstSentKeywords);
  }

  private extractFactualClaims(text: string): string[] {
    const sentences = this.splitIntoSentences(text);
    return sentences.filter(s => 
      s.match(/\b(is|are|was|were|has|have|had)\b/i) &&
      !s.match(/\b(might|maybe|perhaps|possibly|probably)\b/i)
    );
  }

  private verifyClaims(claims: string[], sources: Document[]): number {
    const sourceContent = sources.map(s => s.pageContent).join('\n').toLowerCase();
    let verified = 0;

    for (const claim of claims) {
      const claimKeywords = this.extractKeywords(claim);
      const matches = claimKeywords.filter(kw => sourceContent.includes(kw.toLowerCase()));
      if (matches.length >= claimKeywords.length * 0.5) {
        verified++;
      }
    }

    return verified;
  }

  private identifyQueryAspects(query: string): string[] {
    const aspects: string[] = [];
    
    if (query.includes(' and ')) {
      aspects.push(...query.split(' and ').map(a => a.trim()));
    }

    const questions = query.match(/[^.!?]*\?/g);
    if (questions) {
      aspects.push(...questions);
    }

    if (aspects.length === 0) {
      aspects.push(query);
    }

    return aspects;
  }

  private checkAddressedAspects(answer: string, aspects: string[]): number {
    const answerLower = answer.toLowerCase();
    let addressed = 0;

    for (const aspect of aspects) {
      const aspectKeywords = this.extractKeywords(aspect);
      const matches = aspectKeywords.filter(kw => answerLower.includes(kw.toLowerCase()));
      if (matches.length >= aspectKeywords.length * 0.3) {
        addressed++;
      }
    }

    return addressed;
  }

  private extractKeyInformation(sources: Document[]): string[] {
    const allContent = sources.map(s => s.pageContent).join('\n');
    const sentences = this.splitIntoSentences(allContent);
    
    return sentences
      .filter(s => s.length > 20 && s.length < 200)
      .slice(0, 10);
  }

  private checkIncludedInformation(answer: string, keyInfo: string[]): number {
    const answerLower = answer.toLowerCase();
    let included = 0;

    for (const info of keyInfo) {
      const infoKeywords = this.extractKeywords(info);
      const matches = infoKeywords.filter(kw => answerLower.includes(kw.toLowerCase()));
      if (matches.length >= infoKeywords.length * 0.3) {
        included++;
      }
    }

    return included;
  }

  private hasIntroduction(text: string): boolean {
    const firstSentence = this.splitIntoSentences(text)[0];
    return firstSentence.match(/\b(this|these|following|below)\b/i) !== null;
  }

  private hasConclusion(text: string): boolean {
    const sentences = this.splitIntoSentences(text);
    const lastSentence = sentences[sentences.length - 1];
    return lastSentence.match(/\b(conclusion|summary|overall|therefore|thus)\b/i) !== null;
  }

  private splitIntoSentences(text: string): string[] {
    return text
      .split(/[.!?]+/)
      .map(s => s.trim())
      .filter(s => s.length > 0);
  }

  private scoreTransition(sent1: string, sent2: string): number {
    const transitionWords = [
      'however', 'therefore', 'moreover', 'furthermore', 'additionally',
      'consequently', 'nevertheless', 'meanwhile', 'subsequently', 'finally'
    ];

    const sent2Lower = sent2.toLowerCase();
    const hasTransition = transitionWords.some(word => sent2Lower.startsWith(word));

    const sharedKeywords = this.getSharedKeywords(sent1, sent2);
    const continuity = sharedKeywords.length > 0 ? 0.5 : 0;

    return hasTransition ? 1.0 : continuity;
  }

  private getSharedKeywords(text1: string, text2: string): string[] {
    const kw1 = this.extractKeywords(text1);
    const kw2 = this.extractKeywords(text2);
    return kw1.filter(kw => kw2.includes(kw));
  }

  private measureTopicConsistency(sentences: string[]): number {
    if (sentences.length < 2) return 1.0;

    const allKeywords = sentences.flatMap(s => this.extractKeywords(s));
    const uniqueKeywords = new Set(allKeywords);
    const frequency = new Map<string, number>();

    allKeywords.forEach(kw => {
      frequency.set(kw, (frequency.get(kw) || 0) + 1);
    });

    const consistentKeywords = Array.from(frequency.entries())
      .filter(([_, count]) => count >= sentences.length * 0.3)
      .length;

    return uniqueKeywords.size > 0 ? consistentKeywords / uniqueKeywords.size : 0;
  }

  private assessLogicalFlow(text: string): number {
    const logicalConnectors = [
      'because', 'therefore', 'thus', 'hence', 'consequently',
      'as a result', 'for this reason', 'accordingly', 'so'
    ];

    const textLower = text.toLowerCase();
    const connectorCount = logicalConnectors.filter(conn => 
      textLower.includes(conn)
    ).length;

    const sentences = this.splitIntoSentences(text);
    const expectedConnectors = Math.floor(sentences.length / 3);

    return Math.min(1, connectorCount / Math.max(1, expectedConnectors));
  }

  private calculateReadability(text: string): number {
    const sentences = this.splitIntoSentences(text);
    const words = text.split(/\s+/);
    const syllables = words.reduce((sum, word) => sum + this.countSyllables(word), 0);

    if (sentences.length === 0 || words.length === 0) return 50;

    const avgWordsPerSentence = words.length / sentences.length;
    const avgSyllablesPerWord = syllables / words.length;

    const fleschScore = 206.835 - 1.015 * avgWordsPerSentence - 84.6 * avgSyllablesPerWord;

    return Math.max(0, Math.min(100, fleschScore));
  }

  private countSyllables(word: string): number {
    word = word.toLowerCase();
    let count = 0;
    let previousWasVowel = false;

    for (let i = 0; i < word.length; i++) {
      const isVowel = 'aeiou'.includes(word[i]);
      if (isVowel && !previousWasVowel) {
        count++;
      }
      previousWasVowel = isVowel;
    }

    if (word.endsWith('e')) {
      count--;
    }

    return Math.max(1, count);
  }

  private detectRedundancy(text: string): number {
    const sentences = this.splitIntoSentences(text);
    const uniquePhrases = new Set<string>();
    const phrases: string[] = [];

    sentences.forEach(sentence => {
      const words = sentence.split(/\s+/);
      for (let i = 0; i < words.length - 2; i++) {
        const phrase = words.slice(i, i + 3).join(' ').toLowerCase();
        phrases.push(phrase);
        uniquePhrases.add(phrase);
      }
    });

    if (phrases.length === 0) return 0;

    const redundancy = 1 - (uniquePhrases.size / phrases.length);
    return redundancy;
  }

  private measureClarity(text: string): number {
    const unclearPhrases = [
      'it seems', 'might be', 'possibly', 'perhaps', 'maybe',
      'sort of', 'kind of', 'somewhat', 'relatively', 'fairly'
    ];

    const textLower = text.toLowerCase();
    const unclearCount = unclearPhrases.filter(phrase => 
      textLower.includes(phrase)
    ).length;

    const words = text.split(/\s+/).length;
    const unclearDensity = unclearCount / Math.max(1, words / 100);

    return Math.max(0, 1 - (unclearDensity * 0.2));
  }

  private measureInformationDensity(text: string): number {
    const words = text.split(/\s+/);
    const contentWords = words.filter(word => 
      word.length > 3 && !this.isStopWord(word.toLowerCase())
    );

    return contentWords.length / Math.max(1, words.length);
  }

  private isStopWord(word: string): boolean {
    const stopWords = [
      'the', 'is', 'at', 'which', 'on', 'a', 'an', 'as', 'are', 'was',
      'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does',
      'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must',
      'can', 'this', 'that', 'these', 'those', 'very', 'just', 'also'
    ];
    return stopWords.includes(word);
  }

  public updateConfig(updates: Partial<ScoringConfig>): void {
    this.config = { ...this.config, ...updates };
  }

  public getConfig(): ScoringConfig {
    return this.config;
  }
}