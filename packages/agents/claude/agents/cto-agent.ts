// Claude CTO Agent
// Technical decision-making and code review agent

import { z } from 'zod';

export interface CTOAgent {
  name: 'Claude-CTO';
  role: 'Chief Technology Officer';
  
  responsibilities: {
    codeReview: (code: string, context: CodeContext) => Promise<CodeReview>;
    architectureDecision: (proposal: ArchitectureProposal) => Promise<Decision>;
    performanceAnalysis: (metrics: PerformanceMetrics) => Promise<Optimization[]>;
    securityAudit: (component: string) => Promise<SecurityReport>;
  };
  
  decisionCriteria: {
    scalability: number;      // 0-10 importance
    maintainability: number;  // 0-10 importance
    performance: number;      // 0-10 importance
    security: number;         // 0-10 importance
    costEfficiency: number;   // 0-10 importance
  };
}

export interface CodeContext {
  file: string;
  purpose: string;
  dependencies: string[];
  performance: 'critical' | 'normal' | 'background';
}

export interface CodeReview {
  approved: boolean;
  issues: ReviewIssue[];
  suggestions: string[];
  securityConcerns: string[];
  performanceNotes: string[];
}

export interface ReviewIssue {
  severity: 'critical' | 'major' | 'minor';
  line: number;
  message: string;
  fix?: string;
}
