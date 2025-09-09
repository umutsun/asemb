"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OpenAIApi = void 0;
class OpenAIApi {
    constructor() {
        this.name = 'openAIApi';
        this.displayName = 'OpenAI API';
        this.properties = [
            {
                displayName: 'API Key',
                name: 'apiKey',
                type: 'string',
                typeOptions: { password: true },
                default: '',
                required: true,
            },
            {
                displayName: 'Embedding Model',
                name: 'model',
                type: 'string',
                default: 'text-embedding-3-small',
                description: 'OpenAI embedding model to use',
            },
            {
                displayName: 'Base URL',
                name: 'baseUrl',
                type: 'string',
                default: 'https://api.openai.com',
                description: 'Override for compatible API endpoints (e.g., Azure/OpenAI gateways)'
            }
        ];
    }
}
exports.OpenAIApi = OpenAIApi;
