import { Document } from 'langchain/document';

export interface ChunkingStrategy {
  name: string;
  chunkSize: number;
  chunkOverlap: number;
  preserveStructure?: boolean;
  smartBoundaries?: boolean;
}

export const CHUNKING_STRATEGIES: Record<string, ChunkingStrategy> = {
  sentence: {
    name: 'sentence',
    chunkSize: 1000,
    chunkOverlap: 200,
    preserveStructure: true,
    smartBoundaries: true
  },
  paragraph: {
    name: 'paragraph',
    chunkSize: 1500,
    chunkOverlap: 300,
    preserveStructure: true,
    smartBoundaries: true
  },
  fixed: {
    name: 'fixed',
    chunkSize: 1000,
    chunkOverlap: 100,
    preserveStructure: false,
    smartBoundaries: false
  },
  semantic: {
    name: 'semantic',
    chunkSize: 1200,
    chunkOverlap: 200,
    preserveStructure: true,
    smartBoundaries: true
  },
  recursive: {
    name: 'recursive',
    chunkSize: 1000,
    chunkOverlap: 200,
    preserveStructure: true,
    smartBoundaries: true
  }
};

export class DocumentChunker {
  private strategy: ChunkingStrategy;

  constructor(strategy: ChunkingStrategy = CHUNKING_STRATEGIES.recursive) {
    this.strategy = strategy;
  }

  async chunkDocument(content: string, metadata?: Record<string, any>): Promise<Document[]> {
    const chunks: Document[] = [];
    
    switch (this.strategy.name) {
      case 'sentence':
        return this.chunkBySentence(content, metadata);
      case 'paragraph':
        return this.chunkByParagraph(content, metadata);
      case 'semantic':
        return this.chunkBySemantic(content, metadata);
      case 'recursive':
        return this.chunkRecursively(content, metadata);
      default:
        return this.chunkFixed(content, metadata);
    }
  }

  private chunkBySentence(content: string, metadata?: Record<string, any>): Document[] {
    const sentences = content.match(/[^.!?]+[.!?]+/g) || [content];
    const chunks: Document[] = [];
    let currentChunk = '';
    let chunkIndex = 0;

    for (const sentence of sentences) {
      if ((currentChunk + sentence).length > this.strategy.chunkSize) {
        if (currentChunk) {
          chunks.push(new Document({
            pageContent: currentChunk.trim(),
            metadata: {
              ...metadata,
              chunkIndex,
              chunkingStrategy: 'sentence',
              chunkSize: currentChunk.length
            }
          }));
          chunkIndex++;
        }
        
        const overlap = this.getOverlapText(currentChunk, this.strategy.chunkOverlap);
        currentChunk = overlap + sentence;
      } else {
        currentChunk += sentence;
      }
    }

    if (currentChunk) {
      chunks.push(new Document({
        pageContent: currentChunk.trim(),
        metadata: {
          ...metadata,
          chunkIndex,
          chunkingStrategy: 'sentence',
          chunkSize: currentChunk.length
        }
      }));
    }

    return chunks;
  }

  private chunkByParagraph(content: string, metadata?: Record<string, any>): Document[] {
    const paragraphs = content.split(/\n\n+/).filter(p => p.trim());
    const chunks: Document[] = [];
    let currentChunk = '';
    let chunkIndex = 0;

    for (const paragraph of paragraphs) {
      if ((currentChunk + '\n\n' + paragraph).length > this.strategy.chunkSize) {
        if (currentChunk) {
          chunks.push(new Document({
            pageContent: currentChunk.trim(),
            metadata: {
              ...metadata,
              chunkIndex,
              chunkingStrategy: 'paragraph',
              chunkSize: currentChunk.length
            }
          }));
          chunkIndex++;
        }
        
        const overlap = this.getOverlapText(currentChunk, this.strategy.chunkOverlap);
        currentChunk = overlap ? overlap + '\n\n' + paragraph : paragraph;
      } else {
        currentChunk = currentChunk ? currentChunk + '\n\n' + paragraph : paragraph;
      }
    }

    if (currentChunk) {
      chunks.push(new Document({
        pageContent: currentChunk.trim(),
        metadata: {
          ...metadata,
          chunkIndex,
          chunkingStrategy: 'paragraph',
          chunkSize: currentChunk.length
        }
      }));
    }

    return chunks;
  }

  private chunkBySemantic(content: string, metadata?: Record<string, any>): Document[] {
    const sections = this.identifySemanticSections(content);
    const chunks: Document[] = [];
    let chunkIndex = 0;

    for (const section of sections) {
      if (section.length > this.strategy.chunkSize) {
        const subChunks = this.chunkFixed(section, metadata);
        subChunks.forEach((chunk, idx) => {
          chunk.metadata = {
            ...chunk.metadata,
            chunkIndex: chunkIndex++,
            chunkingStrategy: 'semantic-subdivided'
          };
          chunks.push(chunk);
        });
      } else {
        chunks.push(new Document({
          pageContent: section,
          metadata: {
            ...metadata,
            chunkIndex: chunkIndex++,
            chunkingStrategy: 'semantic',
            chunkSize: section.length
          }
        }));
      }
    }

    return chunks;
  }

  private chunkRecursively(content: string, metadata?: Record<string, any>): Document[] {
    const separators = ['\n\n', '\n', '. ', ', ', ' '];
    return this.recursiveSplit(content, separators, 0, metadata);
  }

  private recursiveSplit(
    text: string,
    separators: string[],
    separatorIndex: number,
    metadata?: Record<string, any>
  ): Document[] {
    if (separatorIndex >= separators.length) {
      return this.chunkFixed(text, metadata);
    }

    const separator = separators[separatorIndex];
    const parts = text.split(separator);
    const chunks: Document[] = [];
    let currentChunk = '';
    let chunkIndex = 0;

    for (const part of parts) {
      const potentialChunk = currentChunk ? currentChunk + separator + part : part;
      
      if (potentialChunk.length > this.strategy.chunkSize) {
        if (currentChunk) {
          if (currentChunk.length > this.strategy.chunkSize) {
            const subChunks = this.recursiveSplit(
              currentChunk,
              separators,
              separatorIndex + 1,
              metadata
            );
            chunks.push(...subChunks);
          } else {
            chunks.push(new Document({
              pageContent: currentChunk,
              metadata: {
                ...metadata,
                chunkIndex: chunkIndex++,
                chunkingStrategy: 'recursive',
                chunkSize: currentChunk.length,
                separatorLevel: separatorIndex
              }
            }));
          }
        }
        currentChunk = part;
      } else {
        currentChunk = potentialChunk;
      }
    }

    if (currentChunk) {
      if (currentChunk.length > this.strategy.chunkSize) {
        const subChunks = this.recursiveSplit(
          currentChunk,
          separators,
          separatorIndex + 1,
          metadata
        );
        chunks.push(...subChunks);
      } else {
        chunks.push(new Document({
          pageContent: currentChunk,
          metadata: {
            ...metadata,
            chunkIndex: chunkIndex++,
            chunkingStrategy: 'recursive',
            chunkSize: currentChunk.length,
            separatorLevel: separatorIndex
          }
        }));
      }
    }

    return chunks;
  }

  private chunkFixed(content: string, metadata?: Record<string, any>): Document[] {
    const chunks: Document[] = [];
    const { chunkSize, chunkOverlap } = this.strategy;
    let start = 0;
    let chunkIndex = 0;

    while (start < content.length) {
      const end = Math.min(start + chunkSize, content.length);
      const chunk = content.slice(start, end);
      
      chunks.push(new Document({
        pageContent: chunk,
        metadata: {
          ...metadata,
          chunkIndex: chunkIndex++,
          chunkingStrategy: 'fixed',
          chunkSize: chunk.length,
          startOffset: start,
          endOffset: end
        }
      }));

      start = end - chunkOverlap;
      if (start < 0) start = end;
    }

    return chunks;
  }

  private identifySemanticSections(content: string): string[] {
    const sections: string[] = [];
    
    const headingPattern = /^(#{1,6}|\n={3,}|\n-{3,})/gm;
    const parts = content.split(headingPattern);
    
    let currentSection = '';
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      
      if (part.match(headingPattern)) {
        if (currentSection) {
          sections.push(currentSection.trim());
        }
        currentSection = part + (parts[i + 1] || '');
        i++;
      } else {
        currentSection += part;
      }
    }
    
    if (currentSection) {
      sections.push(currentSection.trim());
    }

    return sections.length > 0 ? sections : [content];
  }

  private getOverlapText(text: string, overlapSize: number): string {
    if (!text || overlapSize <= 0) return '';
    
    const startIndex = Math.max(0, text.length - overlapSize);
    let overlap = text.slice(startIndex);
    
    if (this.strategy.smartBoundaries) {
      const sentenceEnd = overlap.search(/[.!?]\s/);
      if (sentenceEnd > 0 && sentenceEnd < overlap.length - 1) {
        overlap = overlap.slice(sentenceEnd + 2);
      }
    }
    
    return overlap;
  }

  public setStrategy(strategy: ChunkingStrategy | string) {
    if (typeof strategy === 'string') {
      this.strategy = CHUNKING_STRATEGIES[strategy] || CHUNKING_STRATEGIES.recursive;
    } else {
      this.strategy = strategy;
    }
  }

  public getStrategy(): ChunkingStrategy {
    return this.strategy;
  }
}