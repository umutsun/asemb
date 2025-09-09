"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PgvectorQuery = void 0;
const embedding_1 = require("../shared/embedding");
const db_1 = require("../shared/db");
const AsembError_1 = require("../src/errors/AsembError");
class PgvectorQuery {
    constructor() {
        this.description = {
            displayName: 'PGVector Query',
            name: 'pgvectorQuery',
            group: ['transform'],
            version: 1,
            description: 'Similarity search with pgvector',
            defaults: { name: 'PGVector Query' },
            inputs: ["main" /* NodeConnectionType.Main */],
            outputs: ["main" /* NodeConnectionType.Main */],
            credentials: [
                { name: 'postgresWithVectorApi', required: true },
                { name: 'openAIApi', required: true },
            ],
            properties: [
                { displayName: 'Table', name: 'table', type: 'string', default: '', required: true },
                { displayName: 'Embedding Column', name: 'embeddingColumn', type: 'string', default: 'embedding' },
                { displayName: 'Query Text', name: 'queryText', type: 'string', default: '', required: true },
                { displayName: 'Return Columns (CSV)', name: 'returnColumnsCsv', type: 'string', default: '*', description: 'Columns to return, e.g. id,text,metadata' },
                { displayName: 'Top K', name: 'topK', type: 'number', default: 5 },
                { displayName: 'Distance Operator', name: 'distanceOp', type: 'options', default: '<->', options: [
                        { name: 'Euclidean (<->)', value: '<->' },
                        { name: 'Inner Product (<#>)', value: '<#>' },
                        { name: 'Cosine (<=>)', value: '<=>' },
                    ] }
            ],
        };
    }
    async execute() {
        const items = this.getInputData();
        const table = this.getNodeParameter('table', 0);
        const embeddingColumn = this.getNodeParameter('embeddingColumn', 0) || 'embedding';
        const queryText = this.getNodeParameter('queryText', 0);
        const returnColumnsCsv = this.getNodeParameter('returnColumnsCsv', 0) || '*';
        const topK = this.getNodeParameter('topK', 0);
        const distanceOp = this.getNodeParameter('distanceOp', 0);
        const creds = (await this.getCredentials('postgresWithVectorApi'));
        const pool = (0, db_1.getPool)(this.getNode(), creds);
        try {
            const embedding = await (0, embedding_1.embedText)(this, 0, queryText);
            const embeddingSql = (0, embedding_1.vectorToSqlArray)(embedding);
            const query = `EXPLAIN ANALYZE SELECT ${returnColumnsCsv} FROM ${escapeIdent(table)} ORDER BY ${escapeIdent(embeddingColumn)} ${distanceOp} ${embeddingSql}::vector LIMIT $1`;
            const client = await pool.connect();
            try {
                const res = await client.query(query, [topK]);
                console.log(res.rows.map(row => row['QUERY PLAN']).join('\n'));
                const out = res.rows.map((row) => ({ json: row }));
                return [out];
            }
            finally {
                client.release();
            }
        }
        catch (err) {
            if (err instanceof AsembError_1.AsembError) {
                throw err.toNodeError(this.getNode());
            }
            throw AsembError_1.ErrorHandler.wrapError(err, AsembError_1.ErrorCode.SEARCH_FAILED, { table, topK, queryText }).toNodeError(this.getNode());
        }
    }
}
exports.PgvectorQuery = PgvectorQuery;
function escapeIdent(name) { return '"' + name.replace(/"/g, '""') + '"'; }
