"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PgHybridQuery = void 0;
const n8n_workflow_1 = require("n8n-workflow");
const pg_1 = require("pg");
const embedding_1 = require("../shared/embedding");
class PgHybridQuery {
    constructor() {
        this.description = {
            displayName: 'PG Hybrid Query',
            name: 'pgHybridQuery',
            group: ['transform'],
            version: 1,
            description: 'Combine BM25 (tsvector) and vector similarity scores',
            defaults: { name: 'PG Hybrid Query' },
            inputs: ["main" /* NodeConnectionType.Main */],
            outputs: ["main" /* NodeConnectionType.Main */],
            credentials: [
                { name: 'postgresWithVectorApi', required: true },
                { name: 'openAIApi', required: true },
            ],
            properties: [
                { displayName: 'Table', name: 'table', type: 'string', default: '', required: true },
                { displayName: 'TSVector Column', name: 'tsvColumn', type: 'string', default: 'tsv' },
                { displayName: 'Embedding Column', name: 'embeddingColumn', type: 'string', default: 'embedding' },
                { displayName: 'Language', name: 'language', type: 'string', default: 'english' },
                { displayName: 'Query Text', name: 'queryText', type: 'string', default: '', required: true },
                { displayName: 'Return Columns (CSV)', name: 'returnColumnsCsv', type: 'string', default: '*' },
                { displayName: 'Top K', name: 'topK', type: 'number', default: 5 },
                { displayName: 'Vector Operator', name: 'distanceOp', type: 'options', default: '<->', options: [
                        { name: 'Euclidean (<->)', value: '<->' },
                        { name: 'Inner Product (<#>)', value: '<#>' },
                        { name: 'Cosine (<=>)', value: '<=>' },
                    ] },
                { displayName: 'BM25 Weight', name: 'bm25Weight', type: 'number', default: 0.5 },
                { displayName: 'Vector Weight', name: 'vecWeight', type: 'number', default: 0.5 },
            ],
        };
    }
    async execute() {
        const table = this.getNodeParameter('table', 0);
        const tsvColumn = this.getNodeParameter('tsvColumn', 0) || 'tsv';
        const embeddingColumn = this.getNodeParameter('embeddingColumn', 0) || 'embedding';
        const language = this.getNodeParameter('language', 0) || 'english';
        const queryText = this.getNodeParameter('queryText', 0);
        const returnColumnsCsv = this.getNodeParameter('returnColumnsCsv', 0) || '*';
        const topK = this.getNodeParameter('topK', 0);
        const distanceOp = this.getNodeParameter('distanceOp', 0);
        const bm25Weight = Number(this.getNodeParameter('bm25Weight', 0));
        const vecWeight = Number(this.getNodeParameter('vecWeight', 0));
        const creds = (await this.getCredentials('postgresWithVectorApi'));
        const client = new pg_1.Client({
            host: creds.host,
            port: creds.port,
            database: creds.database,
            user: creds.user,
            password: creds.password,
            ssl: creds.ssl ? { rejectUnauthorized: false } : undefined,
        });
        await client.connect();
        try {
            const embedding = await (0, embedding_1.embedText)(this, 0, queryText);
            const vec = (0, embedding_1.vectorToSqlArray)(embedding);
            // Normalize vector distance to similarity (smaller distance => higher score)
            // Use 1 / (1 + distance) as a simple transform; combine with ts_rank_cd
            const sql = `SELECT ${returnColumnsCsv},
        ts_rank_cd(${PgHybridQuery.escapeIdent(tsvColumn)}, plainto_tsquery($1, $2)) AS bm25,
        (1.0 / (1.0 + (${PgHybridQuery.escapeIdent(embeddingColumn)} ${distanceOp} $3::vector))) AS vecsim,
        (ts_rank_cd(${PgHybridQuery.escapeIdent(tsvColumn)}, plainto_tsquery($1, $2)) * $4
          + (1.0 / (1.0 + (${PgHybridQuery.escapeIdent(embeddingColumn)} ${distanceOp} $3::vector))) * $5) AS score
        FROM ${PgHybridQuery.escapeIdent(table)}
        WHERE ${PgHybridQuery.escapeIdent(tsvColumn)} @@ plainto_tsquery($1, $2)
        ORDER BY score DESC
        LIMIT $6`;
            const res = await client.query(sql, [language, queryText, vec, bm25Weight, vecWeight, topK]);
            const out = res.rows.map((row) => ({ json: row }));
            return [out];
        }
        catch (err) {
            throw new n8n_workflow_1.NodeOperationError(this.getNode(), err.message);
        }
        finally {
            await client.end().catch(() => { });
        }
    }
    static escapeIdent(name) { return '"' + name.replace(/"/g, '""') + '"'; }
}
exports.PgHybridQuery = PgHybridQuery;
