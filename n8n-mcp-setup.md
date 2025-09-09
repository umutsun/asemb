# n8n MCP Setup for Claude Code

## Overview
n8n MCP (Model Context Protocol) enables Claude Code to manage n8n workflows directly from CLI, eliminating manual JSON editing and providing seamless Redis coordination.

## Installation Steps

### 1. Create Project Structure
```bash
mkdir -p ~/n8n-mcp/{src/{commands,redis,validators},templates,config}
cd ~/n8n-mcp
npm init -y
```

### 2. Install Dependencies
```bash
npm install @n8n/client redis ioredis zod commander typescript @types/node
npm install -D @types/redis tsx nodemon
```

### 3. Create MCP Configuration
```json
// mcp-config.json
{
  "name": "n8n-mcp",
  "version": "1.0.0",
  "description": "n8n workflow management via MCP",
  "commands": [
    {
      "name": "create-workflow",
      "description": "Create a new n8n workflow",
      "parameters": {
        "name": "string",
        "template": "string?",
        "description": "string?"
      }
    },
    {
      "name": "update-workflow", 
      "description": "Update existing workflow",
      "parameters": {
        "id": "string",
        "operation": "add-node|remove-node|update-node",
        "data": "object"
      }
    },
    {
      "name": "execute-workflow",
      "description": "Execute a workflow",
      "parameters": {
        "id": "string",
        "data": "object?"
      }
    },
    {
      "name": "list-workflows",
      "description": "List all workflows",
      "parameters": {
        "active": "boolean?"
      }
    },
    {
      "name": "share-template",
      "description": "Share workflow template via Redis",
      "parameters": {
        "workflow": "string",
        "agent": "string",
        "message": "string?"
      }
    }
  ]
}
```

### 4. TypeScript Configuration
```json
// tsconfig.json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules"]
}
```

### 5. Main MCP Server Implementation
```typescript
// src/index.ts
import { createServer } from '@modelcontextprotocol/server';
import { WorkflowCommands } from './commands/workflow';
import { RedisCoordinator } from './redis/coordinator';

const server = createServer({
  name: 'n8n-mcp',
  version: '1.0.0'
});

const redis = new RedisCoordinator();
const commands = new WorkflowCommands(redis);

// Register all commands
server.registerCommand('create-workflow', commands.createWorkflow);
server.registerCommand('update-workflow', commands.updateWorkflow);
server.registerCommand('execute-workflow', commands.executeWorkflow);
server.registerCommand('list-workflows', commands.listWorkflows);
server.registerCommand('share-template', commands.shareTemplate);

server.start();
```

### 6. Configure Claude Code
Add to Claude Code settings:
```json
{
  "mcpServers": {
    "n8n-mcp": {
      "command": "node",
      "args": ["~/n8n-mcp/dist/index.js"],
      "env": {
        "N8N_API_URL": "http://localhost:5678",
        "N8N_API_KEY": "${N8N_API_KEY}",
        "REDIS_URL": "redis://localhost:6379/2"
      }
    }
  }
}
```

## Usage Examples

### Creating a Workflow
```bash
# Claude Code CLI
n8n:create-workflow --name "Semantic Search Pipeline" --template "semantic-search"
```

### Updating a Workflow
```bash
n8n:update-workflow --id "abc123" --operation "add-node" --data '{"type": "n8n-nodes-base.httpRequest", "position": [250, 300]}'
```

### Sharing with Other Agents
```bash
n8n:share-template --workflow "abc123" --agent "gemini" --message "Check this search workflow"
```

## Redis Coordination

### Event Channels
- `n8n:workflow:created` - New workflow notifications
- `n8n:workflow:updated` - Update notifications  
- `n8n:workflow:executed` - Execution results
- `n8n:template:shared` - Template sharing between agents
- `n8n:error:{agent}` - Error notifications

### Storage Keys
- `n8n:workflows:{id}` - Workflow definitions
- `n8n:templates:{name}` - Reusable templates
- `n8n:executions:{id}` - Execution history
- `n8n:agent:tasks:{agent}` - Agent-specific tasks

## Benefits

1. **No Manual JSON Editing**: Direct CLI commands
2. **Validation**: Automatic workflow validation
3. **Collaboration**: Share via Redis
4. **Monitoring**: Real-time execution tracking
5. **Templates**: Reusable workflow patterns

## Workflow Templates

### Semantic Search Template
```json
{
  "name": "Semantic Search",
  "nodes": [
    {
      "type": "n8n-nodes-base.webhook",
      "name": "Search Webhook",
      "position": [250, 300]
    },
    {
      "type": "n8n-nodes-custom.AsembSearch", 
      "name": "Vector Search",
      "position": [450, 300]
    }
  ]
}
```

## Next Steps

1. Claude Code implements the MCP server
2. Create initial workflow templates
3. Test Redis coordination
4. Share templates with Gemini and Codex
5. Monitor via ASB Dashboard
