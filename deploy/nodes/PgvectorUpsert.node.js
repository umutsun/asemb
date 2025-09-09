"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PgvectorUpsert = void 0;
const db_1 = require("../shared/db");
const embedding_1 = require("../shared/embedding");
const AsembError_1 = require("../src/errors/AsembError");
class PgvectorUpsert {
    constructor() {
        this.description = {
            displayName: 'PGVector Upsert',
            name: 'pgvectorUpsert',
            group: ['transform'],
            version: 1,
            description: 'Create embeddings and upsert rows into a Postgres table with pgvector',
            defaults: { name: 'PGVector Upsert' },
            inputs: ["main" /* NodeConnectionType.Main */],
            outputs: ["main" /* NodeConnectionType.Main */],
            credentials: [
                { name: 'postgresWithVectorApi', required: true },
                { name: 'openAIApi', required: true },
            ],
            properties: [
                { displayName: 'Table', name: 'table', type: 'string', default: '', required: true },
                { displayName: 'Text Field (from item)', name: 'textField', type: 'string', default: 'text', description: 'Path to text in item JSON (e.g. "content")' },
                { displayName: 'ID Column', name: 'idColumn', type: 'string', default: 'id', description: 'Column to use for upsert conflict' },
                { displayName: 'ID Value (from item)', name: 'idField', type: 'string', default: '', description: 'Path to ID in item JSON; if empty, a hash of text is used' },
                { displayName: 'Text Column', name: 'textColumn', type: 'string', default: 'text', description: 'Target column to store raw text' },
                { displayName: 'Embedding Column', name: 'embeddingColumn', type: 'string', default: 'embedding' },
                { displayName: 'Additional Columns JSON', name: 'extraColumnsJson', type: 'string', default: '', description: 'Optional JSON object mapping column names to item JSON paths' }
            ],
        };
    }
    async execute() {
        var _a;
        const items = this.getInputData();
        const table = this.getNodeParameter('table', 0);
        const idColumn = this.getNodeParameter('idColumn', 0) || 'id';
        const textColumn = this.getNodeParameter('textColumn', 0) || 'text';
        const embeddingColumn = this.getNodeParameter('embeddingColumn', 0) || 'embedding';
        const textField = this.getNodeParameter('textField', 0) || 'text';
        const idField = this.getNodeParameter('idField', 0) || '';
        const extraColumnsJson = this.getNodeParameter('extraColumnsJson', 0) || '';
        let extraMap = {};
        if (extraColumnsJson) {
            try {
                extraMap = JSON.parse(extraColumnsJson);
            }
            catch (error) {
                throw new AsembError_1.AsembError(AsembError_1.ErrorCode.INVALID_INPUT, 'Invalid Additional Columns JSON', { context: { extraColumnsJson } }).toNodeError(this.getNode());
            }
        }
        const creds = (await this.getCredentials('postgresWithVectorApi'));
        const pool = (0, db_1.getPool)(this.getNode(), creds);
        const returnData = [];
        try {
            for (let i = 0; i < items.length; i++) {
                const item = ((_a = items[i]) === null || _a === void 0 ? void 0 : _a.json) || {};
                const textValue = this.getNodeParameter('textField', i) ? this.getNodeParameter('textField', i).split('.').reduce((acc, k) => acc === null || acc === void 0 ? void 0 : acc[k], item) : item['text'];
                const idValue = idField ? idField.split('.').reduce((acc, k) => acc === null || acc === void 0 ? void 0 : acc[k], item) : undefined;
                if (!textValue || typeof textValue !== 'string') {
                    throw new AsembError_1.AsembError(AsembError_1.ErrorCode.MISSING_REQUIRED_FIELD, 'Text not found on item', { context: { itemIndex: i, textField } }).toNodeError(this.getNode());
                }
                const embedding = await (0, embedding_1.embedText)(this, i, textValue);
                const embeddingSql = (0, embedding_1.vectorToSqlArray)(embedding);
                const extras = {};
                for (const [col, path] of Object.entries(extraMap)) {
                    const val = path.split('.').reduce((acc, k) => acc === null || acc === void 0 ? void 0 : acc[k], item);
                    extras[col] = val;
                }
                // Build dynamic query
                const cols = [idColumn, textColumn, embeddingColumn, ...Object.keys(extras)];
                const placeholders = cols.map((c, idx) => c === embeddingColumn ? `${idx + 1}::vector` : `${idx + 1}`);
                const updates = cols.filter(c => c !== idColumn).map((c) => `${escapeIdent(c)}=EXCLUDED.${escapeIdent(c)}`);
                const values = [idValue !== null && idValue !== void 0 ? idValue : hashString(textValue), textValue, embeddingSql, ...Object.values(extras)];
                const query = `INSERT INTO ${escapeIdent(table)} (${cols.map(escapeIdent).join(',')}) VALUES (${placeholders.join(',')})
          ON CONFLICT (${escapeIdent(idColumn)}) DO UPDATE SET ${updates.join(', ')} RETURNING *`;
                const client = await pool.connect();
                try {
                    const res = await client.query(query, values);
                    returnData.push({ json: res.rows[0] });
                }
                finally {
                    client.release();
                }
            }
        }
        catch (err) {
            if (err instanceof AsembError_1.AsembError) {
                throw err.toNodeError(this.getNode());
            }
            throw AsembError_1.ErrorHandler.wrapError(err, AsembError_1.ErrorCode.DATABASE_QUERY_FAILED, { table, operation: 'upsert' }).toNodeError(this.getNode());
        }
        return [returnData];
    }
}
exports.PgvectorUpsert = PgvectorUpsert;
function escapeIdent(name) { return '"' + name.replace(/"/g, '""') + '"'; }
function hashString(s) {
    let h = 0;
    for (let i = 0; i < s.length; i++) {
        h = ((h << 5) - h) + s.charCodeAt(i);
        h |= 0;
    }
    // Convert to positive 32-bit
    return Math.abs(h).toString();
}
