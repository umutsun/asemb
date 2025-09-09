/**
 * Alice Semantic Bridge - Intelligent Chunking Strategies
 * @author Gemini (AI Integration Lead)
 */
export interface IIntelligentChunker {
    chunk(text: string): Promise<string[]>;
}
export declare class SemanticChunker implements IIntelligentChunker {
    private openai;
    constructor(apiKey: string);
    chunk(text: string): Promise<string[]>;
}
export declare class TopicChunker implements IIntelligentChunker {
    private openai;
    constructor(apiKey: string);
    identifyTopics(text: string): Promise<string[]>;
    chunk(text: string): Promise<string[]>;
}
export declare class HierarchicalChunker implements IIntelligentChunker {
    private openai;
    private maxDepth;
    constructor(apiKey: string, maxDepth?: number);
    chunk(text: string): Promise<string[]>;
    private recursiveChunk;
}
export declare class DynamicChunker implements IIntelligentChunker {
    private openai;
    constructor(apiKey: string);
    analyzeComplexity(text: string): Promise<number>;
    chunk(text: string): Promise<string[]>;
}
