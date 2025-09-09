// Utility functions for Alice Semantic Bridge

export function chunkText(text: string, chunkSize: number = 512, overlap: number = 50): string[] {
  const chunks: string[] = [];
  const words = text.split(/\s+/);
  
  for (let i = 0; i < words.length; i += chunkSize - overlap) {
    const chunk = words.slice(i, i + chunkSize).join(' ');
    if (chunk.trim()) {
      chunks.push(chunk);
    }
  }
  
  return chunks;
}

export function generateEmbeddingId(source: string, sourceId: string, chunkIndex: number): string {
  return `${source}_${sourceId}_${chunkIndex}`;
}

export function estimateTokens(text: string): number {
  // Rough estimation: ~4 characters per token
  return Math.ceil(text.length / 4);
}

export function sanitizeMetadata(metadata: any): any {
  // Remove any sensitive data
  const sanitized = { ...metadata };
  delete sanitized.apiKey;
  delete sanitized.password;
  delete sanitized.secret;
  return sanitized;
}
