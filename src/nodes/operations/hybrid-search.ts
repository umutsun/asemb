
import { Pool } from "pg";
import { SearchOptions, SearchResult, HybridSearchEngine } from "../../../shared/hybrid-search";

export class HybridSearch {
  private hybridSearchEngine: HybridSearchEngine;

  constructor(pool: Pool, apiKey: string) {
    this.hybridSearchEngine = new HybridSearchEngine(pool, apiKey);
  }

  async search(query: string, options: SearchOptions): Promise<SearchResult[]> {
    const [vectorResults, keywordResults] = await Promise.all([
      this.vectorSearch(query, options),
      this.keywordSearch(query, options)
    ]);
    
    return this.rankResults(vectorResults, keywordResults, options);
  }

  private async vectorSearch(query: string, options: SearchOptions): Promise<SearchResult[]> {
    return this.hybridSearchEngine.semanticSearch(query, options);
  }

  private async keywordSearch(query: string, options: SearchOptions): Promise<SearchResult[]> {
    return this.hybridSearchEngine.keywordSearch(query, options);
  }

  private rankResults(vectorResults: SearchResult[], keywordResults: SearchResult[], options: SearchOptions): SearchResult[] {
    const weightVector = options.weightVector || 0.7;
    const weightKeyword = options.weightKeyword || 0.3;

    const resultMap = new Map<string, SearchResult>();
    
    // Process vector results
    vectorResults.forEach(result => {
      resultMap.set(result.id, {
        ...result,
        score: result.score * weightVector,
        source: 'hybrid' as const
      });
    });
    
    // Process keyword results
    keywordResults.forEach(result => {
      const existing = resultMap.get(result.id);
      if (existing) {
        // Combine scores
        existing.score += result.score * weightKeyword;
        existing.keywordScore = result.keywordScore;
      } else {
        resultMap.set(result.id, {
          ...result,
          score: result.score * weightKeyword,
          source: 'hybrid' as const
        });
      }
    });
    
    // Sort by combined score
    return Array.from(resultMap.values())
      .sort((a, b) => b.score - a.score);
  }
}
