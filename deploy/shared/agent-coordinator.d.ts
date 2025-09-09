interface AgentTask {
    agent: string;
    task: string;
    status: 'pending' | 'in-progress' | 'completed' | 'blocked';
    progress: number;
    blockers?: string[];
    dependencies?: string[];
    output?: any;
}
interface AgentMessage {
    from: string;
    to: string | 'all';
    type: 'task-update' | 'help-needed' | 'code-ready' | 'review-request';
    data: any;
    timestamp: Date;
}
export declare class AgentCoordinator {
    private redis;
    private projectKey;
    constructor();
    updateTaskStatus(agent: string, taskId: string, update: Partial<AgentTask>): Promise<void>;
    getAgentTasks(agent: string): Promise<AgentTask[]>;
    sendMessage(message: AgentMessage): Promise<void>;
    subscribeToMessages(agent: string, callback: (message: AgentMessage) => void): Promise<void>;
    updateOverallProgress(): Promise<number>;
    private publishUpdate;
}
export {};
