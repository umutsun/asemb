"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RedisPublish = void 0;
const n8n_workflow_1 = require("n8n-workflow");
const ioredis_1 = __importDefault(require("ioredis"));
// Simple in-memory cache for Redis clients
const redisClients = new Map();
function getRedisClient(creds) {
    const key = `${creds.host}:${creds.port}:${creds.db || 0}`;
    let client = redisClients.get(key);
    if (!client) {
        client = new ioredis_1.default({
            host: creds.host,
            port: creds.port,
            password: creds.password,
            db: creds.db,
            // Add some resilience
            retryStrategy: times => Math.min(times * 50, 2000),
        });
        redisClients.set(key, client);
    }
    return client;
}
class RedisPublish {
    constructor() {
        this.description = {
            displayName: 'Redis Publish',
            name: 'redisPublish',
            group: ['transform'],
            version: 1,
            description: 'Publish a message to a Redis channel',
            defaults: { name: 'Redis Publish' },
            inputs: ["main" /* NodeConnectionType.Main */],
            outputs: ["main" /* NodeConnectionType.Main */],
            credentials: [{ name: 'redisApi', required: true }],
            properties: [
                { displayName: 'Channel', name: 'channel', type: 'string', default: '', required: true },
                { displayName: 'Message Field (from item)', name: 'messageField', type: 'string', default: 'message', description: 'Path to message in item JSON' }
            ],
        };
    }
    async execute() {
        var _a;
        const items = this.getInputData();
        const channel = this.getNodeParameter('channel', 0);
        const messageField = this.getNodeParameter('messageField', 0) || 'message';
        const creds = (await this.getCredentials('redisApi'));
        const redis = getRedisClient(creds);
        try {
            for (let i = 0; i < items.length; i++) {
                const item = ((_a = items[i]) === null || _a === void 0 ? void 0 : _a.json) || {};
                const message = messageField.split('.').reduce((acc, k) => acc === null || acc === void 0 ? void 0 : acc[k], item);
                if (typeof message === 'undefined')
                    throw new n8n_workflow_1.NodeOperationError(this.getNode(), 'Message not found on item', { itemIndex: i });
                await redis.publish(channel, typeof message === 'string' ? message : JSON.stringify(message));
            }
            // Note: We are not disconnecting the client anymore, as it's cached and reused.
            // n8n will handle the process exit.
            return [items];
        }
        catch (err) {
            throw new n8n_workflow_1.NodeOperationError(this.getNode(), err.message);
        }
    }
}
exports.RedisPublish = RedisPublish;
