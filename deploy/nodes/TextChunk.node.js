"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TextChunk = void 0;
const n8n_workflow_1 = require("n8n-workflow");
const chunk_1 = require("../shared/chunk");
class TextChunk {
    constructor() {
        this.description = {
            displayName: 'Text Chunk',
            name: 'textChunk',
            group: ['transform'],
            version: 2.0,
            description: 'Split long text into overlapping chunks',
            defaults: { name: 'Text Chunk' },
            inputs: ["main" /* NodeConnectionType.Main */],
            outputs: ["main" /* NodeConnectionType.Main */],
            properties: [
                { displayName: 'Text Field (from item)', name: 'textField', type: 'string', default: 'content' },
                { displayName: 'Max Characters', name: 'maxChars', type: 'number', default: 1000 },
                { displayName: 'Overlap', name: 'overlap', type: 'number', default: 100 },
                { displayName: 'Output Field', name: 'outputField', type: 'string', default: 'chunk' },
            ],
        };
    }
    async execute() {
        const items = this.getInputData();
        const promises = items.map(async (item, i) => {
            var _a;
            try {
                const textField = this.getNodeParameter('textField', i) || 'content';
                const maxChars = this.getNodeParameter('maxChars', i);
                const overlap = this.getNodeParameter('overlap', i);
                const outputField = this.getNodeParameter('outputField', i) || 'chunk';
                const json = (_a = item.json) !== null && _a !== void 0 ? _a : {};
                // Helper to safely access nested properties
                const getText = (obj, path) => path.split('.').reduce((acc, k) => acc === null || acc === void 0 ? void 0 : acc[k], obj);
                const text = getText(json, textField);
                if (typeof text !== 'string') {
                    // If the text is not found, we can either skip or return an error.
                    // Returning the original item with an error property is more informative.
                    const errorJson = { ...json, error: `Text not found at field "${textField}"` };
                    return [{ json: errorJson, error: new n8n_workflow_1.NodeOperationError(this.getNode(), `Text not found on item ${i}`, { itemIndex: i }) }];
                }
                const chunks = (0, chunk_1.chunkText)(text, { maxChars, overlap });
                // Create a new n8n item for each chunk, preserving the original data.
                return chunks.map(chunk => {
                    const newItemJson = { ...json };
                    // Helper to safely set nested properties
                    const setChunk = (obj, path, value) => {
                        const keys = path.split('.');
                        const lastKey = keys.pop();
                        const target = keys.reduce((acc, k) => acc[k] = acc[k] || {}, obj);
                        target[lastKey] = value;
                    };
                    setChunk(newItemJson, outputField, chunk);
                    return { json: newItemJson };
                });
            }
            catch (err) {
                const error = new n8n_workflow_1.NodeOperationError(this.getNode(), err.message, { itemIndex: i });
                return [{ json: item.json, error }];
            }
        });
        const results = await Promise.all(promises);
        // Flatten the array of arrays into a single array of items.
        const allNewItems = results.flat();
        return [allNewItems];
    }
}
exports.TextChunk = TextChunk;
