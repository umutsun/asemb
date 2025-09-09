"use strict";
/**
 * Alice Semantic Bridge - Core TypeScript Interfaces
 * @author Claude (Architecture Lead)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.REDIS_KEYS = exports.WorkflowStatus = exports.MessagePriority = exports.MessageType = exports.AgentType = exports.SearchMode = exports.ChunkingStrategy = void 0;
// Chunking Strategy Types
var ChunkingStrategy;
(function (ChunkingStrategy) {
    ChunkingStrategy["AUTO"] = "auto";
    ChunkingStrategy["PROSE"] = "prose";
    ChunkingStrategy["CODE"] = "code";
    ChunkingStrategy["SEMANTIC"] = "semantic";
    ChunkingStrategy["CUSTOM"] = "custom";
})(ChunkingStrategy || (exports.ChunkingStrategy = ChunkingStrategy = {}));
var SearchMode;
(function (SearchMode) {
    SearchMode["SEMANTIC"] = "semantic";
    SearchMode["KEYWORD"] = "keyword";
    SearchMode["HYBRID"] = "hybrid";
})(SearchMode || (exports.SearchMode = SearchMode = {}));
var AgentType;
(function (AgentType) {
    AgentType["CLAUDE"] = "claude";
    AgentType["GEMINI"] = "gemini";
    AgentType["CODEX"] = "codex";
    AgentType["DEEPSEEK"] = "deepseek";
    AgentType["N8N_WORKFLOW"] = "n8n-workflow";
    AgentType["API_SERVER"] = "api-server";
    AgentType["DASHBOARD"] = "dashboard";
})(AgentType || (exports.AgentType = AgentType = {}));
var MessageType;
(function (MessageType) {
    MessageType["TASK"] = "task";
    MessageType["UPDATE"] = "update";
    MessageType["REVIEW"] = "review";
    MessageType["DECISION"] = "decision";
    MessageType["ERROR"] = "error";
    MessageType["SUCCESS"] = "success";
    MessageType["METRIC"] = "metric";
})(MessageType || (exports.MessageType = MessageType = {}));
var MessagePriority;
(function (MessagePriority) {
    MessagePriority["LOW"] = "low";
    MessagePriority["MEDIUM"] = "medium";
    MessagePriority["HIGH"] = "high";
    MessagePriority["CRITICAL"] = "critical";
})(MessagePriority || (exports.MessagePriority = MessagePriority = {}));
var WorkflowStatus;
(function (WorkflowStatus) {
    WorkflowStatus["PENDING"] = "pending";
    WorkflowStatus["RUNNING"] = "running";
    WorkflowStatus["SUCCESS"] = "success";
    WorkflowStatus["ERROR"] = "error";
    WorkflowStatus["CANCELLED"] = "cancelled";
})(WorkflowStatus || (exports.WorkflowStatus = WorkflowStatus = {}));
exports.REDIS_KEYS = {
    context: (pk, ck) => `asb:${pk}:context:${ck}`,
    contextList: (pk) => `asb:${pk}:contexts`,
    chunk: (pk, sid, ci) => `asb:${pk}:chunk:${sid}:${ci}`,
    chunkPattern: (pk, sid) => `asb:${pk}:chunk:${sid ? sid + ':' : ''}*`,
    contentHash: (pk, h) => `asb:${pk}:hash:${h}`,
    searchCache: (pk, qh) => `asb:${pk}:cache:search:${qh}`,
    embeddingCache: (pk, ch) => `asb:${pk}:cache:embedding:${ch}`,
    upsertQueue: (pk) => `asb:${pk}:queue:upsert`,
    searchQueue: (pk) => `asb:${pk}:queue:search`,
    agentStatus: (pk, an) => `asb:${pk}:agent:${an}`,
    agentList: (pk) => `asb:${pk}:agents`,
    workflowMetrics: (pk, wid) => `asb:${pk}:workflow:${wid}`,
    projectMetrics: (pk) => `asb:${pk}:metrics`,
    metricsChannel: (pk) => `asb:${pk}:metrics`,
    workflowChannel: (pk) => `asb:${pk}:workflow`,
    agentChannel: (pk, an) => `asb:${pk}:channel:${an || 'broadcast'}`,
};
