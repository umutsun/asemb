"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PostgresDb = void 0;
class PostgresDb {
    constructor() {
        this.name = 'postgresDb';
        this.displayName = 'Postgres (ASEMB)';
        this.documentationUrl = 'postgres';
        this.properties = [
            {
                displayName: 'Host',
                name: 'host',
                type: 'string',
                default: 'localhost',
                placeholder: 'n8n.luwi.dev',
            },
            {
                displayName: 'Database',
                name: 'database',
                type: 'string',
                default: 'asemb',
            },
            {
                displayName: 'User',
                name: 'user',
                type: 'string',
                default: 'asemb_user',
            },
            {
                displayName: 'Password',
                name: 'password',
                type: 'string',
                typeOptions: {
                    password: true,
                },
                default: '',
            },
            {
                displayName: 'Port',
                name: 'port',
                type: 'number',
                default: 5432,
            },
            {
                displayName: 'SSL',
                name: 'ssl',
                type: 'options',
                options: [
                    {
                        name: 'Disable',
                        value: 'disable',
                    },
                    {
                        name: 'Allow',
                        value: 'allow',
                    },
                    {
                        name: 'Require',
                        value: 'require',
                    },
                    {
                        name: 'Verify CA',
                        value: 'verify-ca',
                    },
                    {
                        name: 'Verify Full',
                        value: 'verify-full',
                    },
                ],
                default: 'disable',
            },
            {
                displayName: 'SSL Configuration',
                name: 'sslConfig',
                type: 'json',
                displayOptions: {
                    show: {
                        ssl: [
                            'verify-ca',
                            'verify-full',
                        ],
                    },
                },
                placeholder: '{"ca": "-----BEGIN CERTIFICATE-----\\n..."}',
                default: '',
                description: 'SSL certificate configuration in JSON format',
            },
        ];
    }
}
exports.PostgresDb = PostgresDb;
