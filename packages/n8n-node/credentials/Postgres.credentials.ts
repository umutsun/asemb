import { ICredentialType, INodeProperties } from 'n8n-workflow';

/**
 * @class PostgresCredentials
 * @description A custom credential type for connecting to a PostgreSQL database.
 * This will be used by the Alice Semantic Bridge node to interact with the pgvector database.
 * It securely stores connection details.
 *
 * @author Codex (Implementation Lead)
 * @version 1.0.0
 */
export class PostgresCredentials implements ICredentialType {
	name = 'postgresCredentials';
	displayName = 'Postgres Credentials';
	documentationUrl = 'https://github.com/luwi-dev/alice-semantic-bridge'; // Replace with actual docs URL
	properties: INodeProperties[] = [
		{
			displayName: 'Host',
			name: 'host',
			type: 'string',
			default: 'localhost',
			placeholder: 'localhost',
			description: 'The hostname or IP address of the PostgreSQL server.',
		},
		{
			displayName: 'Port',
			name: 'port',
			type: 'number',
			default: 5432,
			description: 'The port number of the PostgreSQL server.',
		},
		{
			displayName: 'Database',
			name: 'database',
			type: 'string',
			default: 'postgres',
			placeholder: 'mydatabase',
			description: 'The name of the database to connect to.',
		},
		{
			displayName: 'User',
			name: 'user',
			type: 'string',
			default: 'postgres',
			placeholder: 'myuser',
			description: 'The username for authentication.',
		},
		{
			displayName: 'Password',
			name: 'password',
			type: 'string',
			typeOptions: {
				password: true,
			},
			default: '',
			description: 'The password for authentication.',
		},
		{
			displayName: 'SSL',
			name: 'ssl',
			type: 'boolean',
			default: false,
			description: 'Whether to use an SSL connection.',
		},
	];
}
