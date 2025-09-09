export { EmbeddingService, embedTextForNode as generateEmbedding, EmbeddingProvider, EmbeddingConfig, EmbeddingResponse as EmbeddingResult } from './embedding';
export declare function getEmbedding(text: string): Promise<number[]>;
