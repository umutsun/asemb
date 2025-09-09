#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createClient } from 'redis';
import pg from 'pg';

const { Client } = pg;

class ASBMCPServer {
  constructor() {
    this.server = new Server(
      {
        name: 'asb-cli',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );
  }

  async init() {
    await this.setupConnections();
    this.setupHandlers();
  }

  async setupConnections() {
    // Redis connection
    this.redisClient = createClient({
      socket: {
        host: process.env.REDIS_HOST || '127.0.0.1',
        port: parseInt(process.env.REDIS_PORT || '6379'),
      },
      database: parseInt(process.env.REDIS_DB || '2'),
    });

    this.redisClient.on('error', (err) => console.error('Redis Error:', err));
    await this.redisClient.connect();

    // PostgreSQL connection
    this.pgClient = new Client({
      host: process.env.PG_HOST || '91.99.229.96',
      port: parseInt(process.env.PG_PORT || '5432'),
      database: process.env.PG_DATABASE || 'postgres',
      user: process.env.PG_USER || 'postgres',
      password: process.env.PG_PASSWORD || 'postgres',
    });

    await this.pgClient.connect();
  }

  setupHandlers() {
    this.server.setRequestHandler('listTools', async () => ({
      tools: [
        {
          name: 'asb_status',
          description: 'Get ASB project status',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },
        {
          name: 'asb_search',
          description: 'Search in pgvector database',
          inputSchema: {
            type: 'object',
            properties: {
              query: { type: 'string', description: 'Search query' },
              limit: { type: 'number', default: 5 },
            },
            required: ['query'],
          },
        },
        {
          name: 'asb_redis_get',
          description: 'Get value from Redis',
          inputSchema: {
            type: 'object',
            properties: {
              key: { type: 'string', description: 'Redis key' },
            },
            required: ['key'],
          },
        },
        {
          name: 'asb_redis_set',
          description: 'Set value in Redis',
          inputSchema: {
            type: 'object',
            properties: {
              key: { type: 'string', description: 'Redis key' },
              value: { type: 'string', description: 'Value to set' },
              ttl: { type: 'number', description: 'TTL in seconds' },
            },
            required: ['key', 'value'],
          },
        },
      ],
    }));

    this.server.setRequestHandler('callTool', async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'asb_status': {
            const status = {
              project: 'Alice Semantic Bridge',
              version: '1.0.0',
              connections: {
                redis: this.redisClient.isOpen,
                postgres: this.pgClient._connected,
              },
              timestamp: new Date().toISOString(),
            };
            return {
              content: [{ type: 'text', text: JSON.stringify(status, null, 2) }],
            };
          }

          case 'asb_redis_get': {
            const value = await this.redisClient.get(args.key);
            return {
              content: [{ type: 'text', text: value || 'null' }],
            };
          }

          case 'asb_redis_set': {
            if (args.ttl) {
              await this.redisClient.setEx(args.key, args.ttl, args.value);
            } else {
              await this.redisClient.set(args.key, args.value);
            }
            return {
              content: [{ type: 'text', text: 'Value set successfully' }],
            };
          }

          case 'asb_search': {
            const query = `
              SELECT content, metadata
              FROM embeddings
              ORDER BY embedding <=> $1
              LIMIT $2
            `;
            const result = await this.pgClient.query(query, [args.query, args.limit || 5]);
            return {
              content: [{ type: 'text', text: JSON.stringify(result.rows, null, 2) }],
            };
          }

          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        return {
          content: [{ type: 'text', text: `Error: ${error.message}` }],
        };
      }
    });
  }

  async run() {
    await this.init();
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('ASB MCP Server started');
  }
}

// Start server
const server = new ASBMCPServer();
server.run().catch(console.error);
