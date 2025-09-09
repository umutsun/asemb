# n8n-nodes-asemb

Isolated n8n community node package for Alice Semantic Bridge (ASEMB).

- Build: `npm run build`
- Output: `dist/`
- Install into n8n: copy `dist` to `~/.n8n/custom/n8n-nodes-asemb` or publish to npm.

This package includes:
- Nodes: AliceSemanticBridge, PgvectorUpsert, PgvectorQuery, WebScrape, RedisPublish, TextChunk, SitemapFetch, PgHybridQuery, AsembSearch, ASEMBWorkflow
- Credentials: OpenAI, PostgresDb, PostgresWithVectorApi, RedisApi, AliceSemanticBridgeApi

Note: Imports were adjusted to use local `shared/`. If you add new imports from the monorepo, keep this isolation by copying needed helpers into `shared/`.