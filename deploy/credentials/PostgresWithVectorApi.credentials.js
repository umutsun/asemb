"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PostgresWithVectorApi = void 0;
class PostgresWithVectorApi {
    constructor() {
        this.name = 'postgresWithVectorApi';
        this.displayName = 'Postgres (pgvector)';
        this.properties = [
            {
                displayName: 'Host',
                name: 'host',
                type: 'string',
                default: 'localhost',
                placeholder: 'localhost',
                required: true,
            },
            {
                displayName: 'Port',
                name: 'port',
                type: 'number',
                default: 5432,
                required: true,
            },
            {
                displayName: 'Database',
                name: 'database',
                type: 'string',
                default: '',
                required: true,
            },
            {
                displayName: 'User',
                name: 'user',
                type: 'string',
                default: '',
                required: true,
            },
            {
                displayName: 'Password',
                name: 'password',
                type: 'string',
                typeOptions: { password: true },
                default: '',
            },
            {
                displayName: 'SSL',
                name: 'ssl',
                type: 'boolean',
                default: false,
                description: 'Enable SSL/TLS when connecting to Postgres',
            }
        ];
    }
}
exports.PostgresWithVectorApi = PostgresWithVectorApi;
