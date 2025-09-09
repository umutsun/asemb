"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.EmbeddingProvider = exports.generateEmbedding = exports.EmbeddingService = void 0;
exports.getEmbedding = getEmbedding;
// Re-export from embedding.ts for backward compatibility
var embedding_1 = require("./embedding");
Object.defineProperty(exports, "EmbeddingService", { enumerable: true, get: function () { return embedding_1.EmbeddingService; } });
Object.defineProperty(exports, "generateEmbedding", { enumerable: true, get: function () { return embedding_1.embedTextForNode; } });
Object.defineProperty(exports, "EmbeddingProvider", { enumerable: true, get: function () { return embedding_1.EmbeddingProvider; } });
// Helper function for getting embeddings
async function getEmbedding(text) {
    const { EmbeddingService } = await Promise.resolve().then(() => __importStar(require('./embedding')));
    const service = EmbeddingService.getInstance();
    const response = await service.generateEmbedding(text);
    return response.embedding;
}
