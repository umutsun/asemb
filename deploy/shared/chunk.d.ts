export interface ChunkOptions {
    maxChars?: number;
    overlap?: number;
}
export declare function chunkText(text: string, options?: ChunkOptions): string[];
