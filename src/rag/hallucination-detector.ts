import { Document } from 'langchain/document';

export interface HallucinationCheck {
  isPotentialHallucination: boolean;
  confidence: number;
  issues: HallucinationIssue[];
  suggestions: string[];
  score: number;
}

export interface HallucinationIssue {
  type: HallucinationType;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  location?: {
    text: string;
    position?: number;
  };
  evidence?: string;
}

export enum HallucinationType {
  UNSUPPORTED_CLAIM = 'unsupported_claim',
  CONTRADICTORY_STATEMENT = 'contradictory_statement',
  FACTUAL_ERROR = 'factual_error',
  LOGICAL_INCONSISTENCY = 'logical_inconsistency',
  TEMPORAL_INCONSISTENCY = 'temporal_inconsistency',
  NUMERICAL_ERROR = 'numerical_error',
  ENTITY_ERROR = 'entity_error',
  CONTEXT_DRIFT = 'context_drift',
  CONFIDENCE_OVERSTATEMENT = 'confidence_overstatement',
  FABRICATED_DETAIL = 'fabricated_detail'
}

export class HallucinationDetector {
  private strictMode: boolean;
  private thresholds: {
    low: number;
    medium: number;
    high: number;
    critical: number;
  };
  private knownFacts: Map<string, any>;
  private contextCache: Map<string, Document[]>;

  constructor(
    strictMode: boolean = true,
    thresholds = {
      low: 0.3,
      medium: 0.5,
      high: 0.7,
      critical: 0.9
    }
  ) {
    this.strictMode = strictMode;
    this.thresholds = thresholds;
    this.knownFacts = new Map();
    this.contextCache = new Map();
  }

  async detectHallucinations(
    generatedText: string,
    sourceDocuments: Document[],
    query?: string,
    options?: {
      checkFactualAccuracy?: boolean;
      checkLogicalConsistency?: boolean;
      checkNumericalAccuracy?: boolean;
      checkEntityAccuracy?: boolean;
      checkConfidenceLevel?: boolean;
    }
  ): Promise<HallucinationCheck> {
    const issues: HallucinationIssue[] = [];
    const checkOptions = {
      checkFactualAccuracy: true,
      checkLogicalConsistency: true,
      checkNumericalAccuracy: true,
      checkEntityAccuracy: true,
      checkConfidenceLevel: true,
      ...options
    };

    if (checkOptions.checkFactualAccuracy) {
      issues.push(...this.checkFactualAccuracy(generatedText, sourceDocuments));
    }

    if (checkOptions.checkLogicalConsistency) {
      issues.push(...this.checkLogicalConsistency(generatedText));
    }

    if (checkOptions.checkNumericalAccuracy) {
      issues.push(...this.checkNumericalAccuracy(generatedText, sourceDocuments));
    }

    if (checkOptions.checkEntityAccuracy) {
      issues.push(...this.checkEntityAccuracy(generatedText, sourceDocuments));
    }

    if (checkOptions.checkConfidenceLevel) {
      issues.push(...this.checkConfidenceStatements(generatedText, sourceDocuments));
    }

    if (query) {
      issues.push(...this.checkContextDrift(generatedText, query, sourceDocuments));
    }

    const score = this.calculateHallucinationScore(issues);
    const isPotentialHallucination = this.determineIfHallucination(score, issues);
    const suggestions = this.generateSuggestions(issues, sourceDocuments);

    return {
      isPotentialHallucination,
      confidence: this.calculateConfidence(issues, sourceDocuments),
      issues,
      suggestions,
      score
    };
  }

  private checkFactualAccuracy(text: string, sources: Document[]): HallucinationIssue[] {
    const issues: HallucinationIssue[] = [];
    const claims = this.extractClaims(text);
    const sourceContent = sources.map(s => s.pageContent).join('\n');

    for (const claim of claims) {
      const isSupported = this.isClaimSupported(claim, sourceContent);
      
      if (!isSupported) {
        const isContradicted = this.isClaimContradicted(claim, sourceContent);
        
        if (isContradicted) {
          issues.push({
            type: HallucinationType.CONTRADICTORY_STATEMENT,
            severity: 'high',
            description: `Claim contradicts source material: "${claim}"`,
            location: { text: claim },
            evidence: this.findContradictoryEvidence(claim, sourceContent)
          });
        } else if (this.isFactualClaim(claim)) {
          issues.push({
            type: HallucinationType.UNSUPPORTED_CLAIM,
            severity: 'medium',
            description: `Claim not found in source material: "${claim}"`,
            location: { text: claim }
          });
        }
      }
    }

    return issues;
  }

  private checkLogicalConsistency(text: string): HallucinationIssue[] {
    const issues: HallucinationIssue[] = [];
    const statements = this.splitIntoStatements(text);
    
    for (let i = 0; i < statements.length; i++) {
      for (let j = i + 1; j < statements.length; j++) {
        if (this.areContradictory(statements[i], statements[j])) {
          issues.push({
            type: HallucinationType.LOGICAL_INCONSISTENCY,
            severity: 'high',
            description: 'Contradictory statements detected',
            location: {
              text: `Statement 1: "${statements[i]}" contradicts Statement 2: "${statements[j]}"`
            }
          });
        }
      }
    }

    const temporalIssues = this.checkTemporalConsistency(text);
    issues.push(...temporalIssues);

    return issues;
  }

  private checkNumericalAccuracy(text: string, sources: Document[]): HallucinationIssue[] {
    const issues: HallucinationIssue[] = [];
    const numbers = this.extractNumbers(text);
    const sourceNumbers = this.extractNumbersFromSources(sources);

    for (const numData of numbers) {
      const { value, context } = numData;
      const sourceMatch = this.findNumberInSources(value, context, sourceNumbers);

      if (!sourceMatch.found && this.isSignificantNumber(value, context)) {
        if (sourceMatch.similar) {
          issues.push({
            type: HallucinationType.NUMERICAL_ERROR,
            severity: 'medium',
            description: `Numerical discrepancy: ${value} (similar value ${sourceMatch.similar} found in sources)`,
            location: { text: context },
            evidence: `Source contains: ${sourceMatch.similar}`
          });
        } else {
          issues.push({
            type: HallucinationType.NUMERICAL_ERROR,
            severity: 'high',
            description: `Unsupported numerical claim: ${value}`,
            location: { text: context }
          });
        }
      }
    }

    return issues;
  }

  private checkEntityAccuracy(text: string, sources: Document[]): HallucinationIssue[] {
    const issues: HallucinationIssue[] = [];
    const entities = this.extractEntities(text);
    const sourceEntities = this.extractEntitiesFromSources(sources);

    for (const entity of entities) {
      if (!this.isEntityInSources(entity, sourceEntities)) {
        const isCommon = this.isCommonEntity(entity);
        
        if (!isCommon) {
          issues.push({
            type: HallucinationType.ENTITY_ERROR,
            severity: 'medium',
            description: `Entity not found in sources: "${entity.name}"`,
            location: { text: entity.context }
          });
        }
      }

      const relationships = this.extractEntityRelationships(entity, text);
      for (const relationship of relationships) {
        if (!this.isRelationshipSupported(relationship, sources)) {
          issues.push({
            type: HallucinationType.FABRICATED_DETAIL,
            severity: 'medium',
            description: `Unsupported entity relationship: ${relationship}`,
            location: { text: relationship }
          });
        }
      }
    }

    return issues;
  }

  private checkConfidenceStatements(text: string, sources: Document[]): HallucinationIssue[] {
    const issues: HallucinationIssue[] = [];
    const confidencePatterns = [
      /definitely/gi,
      /certainly/gi,
      /absolutely/gi,
      /without a doubt/gi,
      /it is clear that/gi,
      /obviously/gi,
      /undoubtedly/gi,
      /proven/gi,
      /confirmed/gi
    ];

    const sourceContent = sources.map(s => s.pageContent).join('\n');

    for (const pattern of confidencePatterns) {
      const matches = text.matchAll(pattern);
      for (const match of matches) {
        const context = this.getContextAround(text, match.index || 0, 50);
        
        if (!this.isConfidenceJustified(context, sourceContent)) {
          issues.push({
            type: HallucinationType.CONFIDENCE_OVERSTATEMENT,
            severity: 'low',
            description: `Overconfident statement without strong evidence: "${match[0]}"`,
            location: { text: context }
          });
        }
      }
    }

    return issues;
  }

  private checkContextDrift(text: string, query: string, sources: Document[]): HallucinationIssue[] {
    const issues: HallucinationIssue[] = [];
    
    const queryKeywords = this.extractKeywords(query);
    const responseKeywords = this.extractKeywords(text);
    const sourceKeywords = new Set(
      sources.flatMap(s => this.extractKeywords(s.pageContent))
    );

    const driftKeywords = responseKeywords.filter(
      kw => !queryKeywords.includes(kw) && !sourceKeywords.has(kw)
    );

    const driftRatio = driftKeywords.length / responseKeywords.length;

    if (driftRatio > 0.3) {
      issues.push({
        type: HallucinationType.CONTEXT_DRIFT,
        severity: driftRatio > 0.5 ? 'high' : 'medium',
        description: 'Response contains significant content not related to query or sources',
        evidence: `Drift keywords: ${driftKeywords.slice(0, 5).join(', ')}`
      });
    }

    return issues;
  }

  private extractClaims(text: string): string[] {
    const sentences = text.split(/[.!?]+/).filter(s => s.trim());
    return sentences.filter(s => 
      !s.toLowerCase().startsWith('i think') &&
      !s.toLowerCase().startsWith('maybe') &&
      !s.toLowerCase().startsWith('perhaps') &&
      !s.toLowerCase().includes('might be') &&
      !s.toLowerCase().includes('could be')
    );
  }

  private isClaimSupported(claim: string, sourceContent: string): boolean {
    const claimKeywords = this.extractKeywords(claim);
    const sourceKeywords = this.extractKeywords(sourceContent);
    
    const matchCount = claimKeywords.filter(kw => 
      sourceContent.toLowerCase().includes(kw.toLowerCase())
    ).length;

    return matchCount >= claimKeywords.length * 0.6;
  }

  private isClaimContradicted(claim: string, sourceContent: string): boolean {
    const negationPatterns = [
      /not/gi,
      /never/gi,
      /no/gi,
      /false/gi,
      /incorrect/gi,
      /wrong/gi
    ];

    for (const pattern of negationPatterns) {
      const claimWithoutNegation = claim.replace(pattern, '');
      const claimWithNegation = claim.replace(pattern, 'NEGATION');
      
      if (sourceContent.toLowerCase().includes(claimWithoutNegation.toLowerCase()) &&
          !sourceContent.toLowerCase().includes(claimWithNegation.toLowerCase())) {
        return true;
      }
    }

    return false;
  }

  private isFactualClaim(claim: string): boolean {
    const factualIndicators = [
      /is|are|was|were/i,
      /\d+/,
      /[A-Z][a-z]+/,
      /in \d{4}/i,
      /percent|%/i,
      /million|billion|thousand/i
    ];

    return factualIndicators.some(pattern => pattern.test(claim));
  }

  private findContradictoryEvidence(claim: string, sourceContent: string): string {
    const sentences = sourceContent.split(/[.!?]+/);
    const claimKeywords = this.extractKeywords(claim);
    
    for (const sentence of sentences) {
      const sentKeywords = this.extractKeywords(sentence);
      const overlap = claimKeywords.filter(kw => sentKeywords.includes(kw));
      
      if (overlap.length >= 2 && this.areContradictory(claim, sentence)) {
        return sentence.trim();
      }
    }

    return '';
  }

  private splitIntoStatements(text: string): string[] {
    return text.split(/[.!?]+/).map(s => s.trim()).filter(s => s.length > 0);
  }

  private areContradictory(stmt1: string, stmt2: string): boolean {
    const contradictionPairs = [
      ['increase', 'decrease'],
      ['rise', 'fall'],
      ['up', 'down'],
      ['more', 'less'],
      ['higher', 'lower'],
      ['positive', 'negative'],
      ['success', 'failure'],
      ['true', 'false'],
      ['yes', 'no']
    ];

    for (const [word1, word2] of contradictionPairs) {
      if ((stmt1.includes(word1) && stmt2.includes(word2)) ||
          (stmt1.includes(word2) && stmt2.includes(word1))) {
        const sharedKeywords = this.getSharedKeywords(stmt1, stmt2);
        if (sharedKeywords.length >= 2) {
          return true;
        }
      }
    }

    return false;
  }

  private checkTemporalConsistency(text: string): HallucinationIssue[] {
    const issues: HallucinationIssue[] = [];
    const temporalRefs = this.extractTemporalReferences(text);
    
    for (let i = 0; i < temporalRefs.length - 1; i++) {
      for (let j = i + 1; j < temporalRefs.length; j++) {
        if (this.areTemporallyInconsistent(temporalRefs[i], temporalRefs[j])) {
          issues.push({
            type: HallucinationType.TEMPORAL_INCONSISTENCY,
            severity: 'medium',
            description: 'Temporal inconsistency detected',
            location: {
              text: `"${temporalRefs[i].context}" conflicts with "${temporalRefs[j].context}"`
            }
          });
        }
      }
    }

    return issues;
  }

  private extractNumbers(text: string): Array<{value: number, context: string}> {
    const numbers: Array<{value: number, context: string}> = [];
    const pattern = /\b\d+(?:,\d{3})*(?:\.\d+)?(?:\s*(?:million|billion|thousand|hundred))?\b/gi;
    
    const matches = text.matchAll(pattern);
    for (const match of matches) {
      const context = this.getContextAround(text, match.index || 0, 30);
      const value = this.parseNumber(match[0]);
      if (!isNaN(value)) {
        numbers.push({ value, context });
      }
    }

    return numbers;
  }

  private extractNumbersFromSources(sources: Document[]): Array<{value: number, context: string}> {
    return sources.flatMap(source => this.extractNumbers(source.pageContent));
  }

  private findNumberInSources(
    value: number,
    context: string,
    sourceNumbers: Array<{value: number, context: string}>
  ): {found: boolean, similar?: number} {
    for (const sourceNum of sourceNumbers) {
      if (Math.abs(sourceNum.value - value) < 0.01) {
        return { found: true };
      }
    }

    const tolerance = value * 0.1;
    for (const sourceNum of sourceNumbers) {
      if (Math.abs(sourceNum.value - value) <= tolerance) {
        return { found: false, similar: sourceNum.value };
      }
    }

    return { found: false };
  }

  private isSignificantNumber(value: number, context: string): boolean {
    const trivialContexts = ['page', 'line', 'item', 'step', 'point'];
    return !trivialContexts.some(tc => context.toLowerCase().includes(tc));
  }

  private extractEntities(text: string): Array<{name: string, type: string, context: string}> {
    const entities: Array<{name: string, type: string, context: string}> = [];
    
    const capitalizedWords = text.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*/g) || [];
    
    for (const word of capitalizedWords) {
      const context = this.getContextAround(text, text.indexOf(word), 30);
      const type = this.classifyEntity(word, context);
      entities.push({ name: word, type, context });
    }

    return entities;
  }

  private extractEntitiesFromSources(sources: Document[]): Set<string> {
    const entities = new Set<string>();
    sources.forEach(source => {
      const sourceEntities = this.extractEntities(source.pageContent);
      sourceEntities.forEach(e => entities.add(e.name.toLowerCase()));
    });
    return entities;
  }

  private isEntityInSources(entity: {name: string}, sourceEntities: Set<string>): boolean {
    return sourceEntities.has(entity.name.toLowerCase());
  }

  private isCommonEntity(entity: {name: string, type: string}): boolean {
    const commonWords = ['The', 'This', 'That', 'These', 'Those', 'A', 'An'];
    return commonWords.includes(entity.name) || entity.type === 'common';
  }

  private classifyEntity(name: string, context: string): string {
    if (context.match(/company|corporation|inc\.|ltd\.|llc/i)) return 'organization';
    if (context.match(/mr\.|ms\.|dr\.|prof\./i)) return 'person';
    if (context.match(/city|country|state|province/i)) return 'location';
    if (context.match(/january|february|march|april|may|june|july|august|september|october|november|december/i)) return 'date';
    return 'unknown';
  }

  private extractEntityRelationships(entity: any, text: string): string[] {
    const relationships: string[] = [];
    const sentences = text.split(/[.!?]+/);
    
    for (const sentence of sentences) {
      if (sentence.includes(entity.name)) {
        relationships.push(sentence.trim());
      }
    }

    return relationships;
  }

  private isRelationshipSupported(relationship: string, sources: Document[]): boolean {
    const sourceContent = sources.map(s => s.pageContent).join('\n');
    const keywords = this.extractKeywords(relationship);
    
    const matchCount = keywords.filter(kw => 
      sourceContent.toLowerCase().includes(kw.toLowerCase())
    ).length;

    return matchCount >= keywords.length * 0.5;
  }

  private getContextAround(text: string, position: number, radius: number): string {
    const start = Math.max(0, position - radius);
    const end = Math.min(text.length, position + radius);
    return text.substring(start, end).trim();
  }

  private isConfidenceJustified(context: string, sourceContent: string): boolean {
    const contextKeywords = this.extractKeywords(context);
    const matchCount = contextKeywords.filter(kw => 
      sourceContent.toLowerCase().includes(kw.toLowerCase())
    ).length;

    return matchCount >= contextKeywords.length * 0.8;
  }

  private extractKeywords(text: string): string[] {
    const stopWords = new Set([
      'the', 'is', 'at', 'which', 'on', 'a', 'an', 'as', 'are', 'was',
      'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does',
      'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must'
    ]);

    return text
      .toLowerCase()
      .split(/\s+/)
      .filter(word => word.length > 2 && !stopWords.has(word));
  }

  private getSharedKeywords(text1: string, text2: string): string[] {
    const kw1 = this.extractKeywords(text1);
    const kw2 = this.extractKeywords(text2);
    return kw1.filter(kw => kw2.includes(kw));
  }

  private extractTemporalReferences(text: string): Array<{date?: Date, relative?: string, context: string}> {
    const refs: Array<{date?: Date, relative?: string, context: string}> = [];
    
    const datePattern = /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b|\b\d{4}-\d{2}-\d{2}\b/g;
    const relativePattern = /\b(yesterday|today|tomorrow|last\s+\w+|next\s+\w+)\b/gi;

    const dateMatches = text.matchAll(datePattern);
    for (const match of dateMatches) {
      const context = this.getContextAround(text, match.index || 0, 30);
      refs.push({ date: new Date(match[0]), context });
    }

    const relativeMatches = text.matchAll(relativePattern);
    for (const match of relativeMatches) {
      const context = this.getContextAround(text, match.index || 0, 30);
      refs.push({ relative: match[0], context });
    }

    return refs;
  }

  private areTemporallyInconsistent(ref1: any, ref2: any): boolean {
    if (ref1.date && ref2.date) {
      return false;
    }

    if (ref1.relative && ref2.relative) {
      const order1 = this.getTemporalOrder(ref1.relative);
      const order2 = this.getTemporalOrder(ref2.relative);
      
      if (order1 && order2 && Math.abs(order1 - order2) > 7) {
        return true;
      }
    }

    return false;
  }

  private getTemporalOrder(relative: string): number | null {
    const orders: Record<string, number> = {
      'yesterday': -1,
      'today': 0,
      'tomorrow': 1,
      'last week': -7,
      'next week': 7,
      'last month': -30,
      'next month': 30
    };

    return orders[relative.toLowerCase()] || null;
  }

  private parseNumber(text: string): number {
    let value = parseFloat(text.replace(/,/g, ''));
    
    if (text.includes('thousand')) value *= 1000;
    if (text.includes('million')) value *= 1000000;
    if (text.includes('billion')) value *= 1000000000;

    return value;
  }

  private calculateHallucinationScore(issues: HallucinationIssue[]): number {
    if (issues.length === 0) return 0;

    const severityWeights = {
      low: 0.1,
      medium: 0.3,
      high: 0.6,
      critical: 1.0
    };

    const totalWeight = issues.reduce((sum, issue) => 
      sum + severityWeights[issue.severity], 0
    );

    return Math.min(1, totalWeight / 5);
  }

  private determineIfHallucination(score: number, issues: HallucinationIssue[]): boolean {
    if (this.strictMode) {
      return score > this.thresholds.low || issues.some(i => i.severity === 'critical');
    }

    return score > this.thresholds.medium || issues.filter(i => i.severity === 'critical').length > 1;
  }

  private calculateConfidence(issues: HallucinationIssue[], sources: Document[]): number {
    if (sources.length === 0) return 0.3;

    const baseCo confid = 1.0;
    const deduction = issues.reduce((sum, issue) => {
      const severityDeduction = {
        low: 0.05,
        medium: 0.15,
        high: 0.3,
        critical: 0.5
      };
      return sum + severityDeduction[issue.severity];
    }, 0);

    return Math.max(0, Math.min(1, baseConfidence - deduction));
  }

  private generateSuggestions(issues: HallucinationIssue[], sources: Document[]): string[] {
    const suggestions: string[] = [];

    const issueTypes = new Set(issues.map(i => i.type));

    if (issueTypes.has(HallucinationType.UNSUPPORTED_CLAIM)) {
      suggestions.push('Consider adding qualifiers like "based on the sources" or "according to the documents"');
    }

    if (issueTypes.has(HallucinationType.CONTRADICTORY_STATEMENT)) {
      suggestions.push('Review and resolve contradictory statements in the response');
    }

    if (issueTypes.has(HallucinationType.NUMERICAL_ERROR)) {
      suggestions.push('Verify all numerical claims against source documents');
    }

    if (issueTypes.has(HallucinationType.CONFIDENCE_OVERSTATEMENT)) {
      suggestions.push('Use more measured language and avoid absolute statements without strong evidence');
    }

    if (issueTypes.has(HallucinationType.CONTEXT_DRIFT)) {
      suggestions.push('Focus the response more closely on the original query and source material');
    }

    if (issues.filter(i => i.severity === 'high' || i.severity === 'critical').length > 2) {
      suggestions.push('Consider regenerating the response with stricter adherence to source material');
    }

    return suggestions;
  }

  public registerFact(key: string, value: any): void {
    this.knownFacts.set(key, value);
  }

  public clearFacts(): void {
    this.knownFacts.clear();
  }

  public setStrictMode(strict: boolean): void {
    this.strictMode = strict;
  }

  public updateThresholds(thresholds: Partial<typeof this.thresholds>): void {
    this.thresholds = { ...this.thresholds, ...thresholds };
  }
}