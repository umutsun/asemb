import { createHash } from 'crypto';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';

/**
 * @module TextProcessor
 * @description Provides utility functions for text processing, including hashing and chunking.
 * @author Gemini (Performance Engineer)
 * @version 1.0.0
 */

/**
 * Creates a SHA-256 hash of the given content.
 * This is used to uniquely identify content and prevent processing duplicates,
 * saving on API costs and database storage.
 *
 * @param {string} content The text content to hash.
 * @returns {string} A 64-character SHA-256 hash.
 */
export function createContentHash(content: string): string {
	return createHash('sha256').update(content).digest('hex');
}

/**
 * @interface ChunkingOptions
 * @description Defines the options for the chunkText function.
 */
export interface ChunkingOptions {
	/**
	 * The maximum size of each chunk in characters.
	 * @default 1500
	 */
	chunkSize?: number;
	/**
	 * The number of characters to overlap between chunks.
	 * This helps maintain context between chunks.
	 * @default 200
	 */
	chunkOverlap?: number;
	/**
	 * The separators to use for splitting the text, in order of priority.
	 * The default is optimized for general prose.
	 * @default ['\n\n', '\n', '. ', ', ', ' ']
	 */
	separators?: string[];
}

/**
 * Splits a given text into smaller, semantically coherent chunks using a recursive strategy.
 * This function is a core part of the ingestion pipeline, ensuring that large texts
 * are broken down in a way that preserves context for accurate embeddings.
 *
 * It leverages the RecursiveCharacterTextSplitter from LangChain for robust performance.
 *
 * @param {string} text The full text to be chunked.
 * @param {ChunkingOptions} [options={}] Options to configure the chunking process.
 * @returns {Promise<string[]>} A promise that resolves to an array of text chunks.
 */
export async function chunkText(text: string, options: ChunkingOptions = {}): Promise<string[]> {
	const {
		chunkSize = 1500,
		chunkOverlap = 200,
		separators = ['\n\n', '\n', '. ', ', ', ' '],
	} = options;

	const splitter = new RecursiveCharacterTextSplitter({
		chunkSize,
		chunkOverlap,
		separators,
	});

	const output = await splitter.splitText(text);
	return output;
}
