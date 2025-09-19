const express = require('express');
const router = express.Router();
const { Client, Pool } = require('pg');
const OpenAI = require('openai');
const Anthropic = require('@anthropic-ai/sdk');
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

// --- Model İstemcilerini Başlatma ---

// OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Anthropic (Claude)
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Google (Gemini)
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);

// --- Veritabanı Bağlantısı ---
const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:Semsiye!22@91.99.229.96:5432/asemb'
});

// --- Ana Chat Mantığı ---

// RAG için benzer dokümanları arama
async function searchDocuments(query, limit = 5) {
  const client = await pool.connect();
  try {
    const queryEmbeddingResponse = await openai.embeddings.create({
      model: "text-embedding-ada-002",
      input: query,
    });
    const queryEmbedding = queryEmbeddingResponse.data[0].embedding;

    const searchQuery = `
      SELECT id, title, content, metadata, 1 - (embedding <=> $1::vector) as similarity
      FROM rag_data.documents
      WHERE embedding IS NOT NULL
      ORDER BY embedding <=> $1::vector
      LIMIT $2
    `;
    const result = await client.query(searchQuery, [JSON.stringify(queryEmbedding), limit]);
    return result.rows.map(row => ({ ...row, score: row.similarity }));
  } finally {
    client.release();
  }
}

// Ayarları veritabanından çekme
async function getChatSettings() {
    const client = await pool.connect();
    try {
        const result = await client.query("SELECT value FROM settings WHERE key = 'ai_settings'");
        if (result.rows.length > 0) {
            return result.rows[0].value;
        }
        // Varsayılan ayarlar
        return {
            primaryModel: "openai",
            fallbackOrder: ["anthropic", "gemini"],
            models: {
                openai: { modelName: "gpt-3.5-turbo", systemPrompt: "You are a helpful OpenAI assistant." },
                anthropic: { modelName: "claude-3-haiku-20240307", systemPrompt: "You are a helpful Anthropic assistant." },
                gemini: { modelName: "gemini-1.5-flash-latest", systemPrompt: "You are a helpful Gemini assistant." }
            },
            enableJsonOutput: true
        };
    } finally {
        client.release();
    }
}

// JSON formatını zorunlu kılan prompt oluşturucu
function createJsonSystemPrompt(basePrompt) {
    return `${basePrompt}\n\nALWAYS provide your response in the following JSON format. Do not include any text outside of this JSON structure:\n{\n  \