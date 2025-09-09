"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AgentCoordinator = void 0;
const ioredis_1 = __importDefault(require("ioredis"));
class AgentCoordinator {
    constructor() {
        this.projectKey = 'asemb:phase3';
        this.redis = new ioredis_1.default({
            host: 'localhost',
            port: 6379,
            db: 2
        });
    }
    // Task Management
    async updateTaskStatus(agent, taskId, update) {
        const key = `${this.projectKey}:tasks:${agent}:${taskId}`;
        await this.redis.hmset(key, update);
        await this.publishUpdate(agent, 'task-update', { taskId, ...update });
    }
    async getAgentTasks(agent) {
        const pattern = `${this.projectKey}:tasks:${agent}:*`;
        const keys = await this.redis.keys(pattern);
        const tasks = [];
        for (const key of keys) {
            const task = await this.redis.hgetall(key);
            tasks.push(task);
        }
        return tasks;
    }
    // Inter-agent Communication
    async sendMessage(message) {
        const channel = message.to === 'all'
            ? `${this.projectKey}:broadcast`
            : `${this.projectKey}:${message.to}`;
        await this.redis.publish(channel, JSON.stringify(message));
        await this.redis.lpush(`${this.projectKey}:messages`, JSON.stringify(message));
    }
    async subscribeToMessages(agent, callback) {
        const subscriber = new ioredis_1.default();
        // Subscribe to direct messages and broadcasts
        await subscriber.subscribe(`${this.projectKey}:${agent}`, `${this.projectKey}:broadcast`);
        subscriber.on('message', (channel, message) => {
            callback(JSON.parse(message));
        });
    }
    // Progress Tracking
    async updateOverallProgress() {
        const agents = ['claude', 'gemini', 'codex', 'deepseek'];
        let totalProgress = 0;
        for (const agent of agents) {
            const tasks = await this.getAgentTasks(agent);
            const agentProgress = tasks.reduce((sum, task) => sum + task.progress, 0) / tasks.length;
            totalProgress += agentProgress;
        }
        const overallProgress = totalProgress / agents.length;
        await this.redis.set(`${this.projectKey}:progress`, overallProgress);
        return overallProgress;
    }
    // Helper method
    async publishUpdate(agent, type, data) {
        await this.redis.publish(`${this.projectKey}:updates`, JSON.stringify({
            agent,
            type,
            data,
            timestamp: new Date()
        }));
    }
}
exports.AgentCoordinator = AgentCoordinator;
