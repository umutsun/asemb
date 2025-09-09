// Shared types for Alice Semantic Bridge
import { z } from 'zod';

// Embedding source types
export type EmbeddingSource = 'google_docs' | 'web_scrape' | 'postgres' | 'file_upload';

// Embedding metadata schema
export const EmbeddingMetadataSchema = z.object({
  source: z.enum(['google_docs', 'web_scrape', 'postgres', 'file_upload']),
  sourceId: z.string(),
  sourceUrl: z.string().optional(),
  title: z.string(),
  chunkIndex: z.number(),
  totalChunks: z.number(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  tags: z.array(z.string()).optional(),
  customFields: z.record(z.any()).optional()
});

export type EmbeddingMetadata = z.infer<typeof EmbeddingMetadataSchema>;

// Operation types for N8N node
export const OperationSchema = z.enum([
  'embedDocument',
  'embedWebpage', 
  'embedDatabase',
  'searchSimilar',
  'updateEmbedding',
  'deleteEmbedding',
  'syncSource',
  'getStats'
]);

export type Operation = z.infer<typeof OperationSchema>;
