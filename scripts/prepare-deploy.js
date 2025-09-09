const fs = require('fs');
const path = require('path');

console.log('🚀 ASEMB Deployment Preparation Script\n');

// Create deployment directory
const deployDir = path.join(__dirname, '..', 'deploy');
if (fs.existsSync(deployDir)) {
    fs.rmSync(deployDir, { recursive: true });
}
fs.mkdirSync(deployDir);

// Copy dist folder
const distSource = path.join(__dirname, '..', 'dist');
const distDest = path.join(deployDir, 'dist');
if (fs.existsSync(distSource)) {
    copyFolderRecursiveSync(distSource, deployDir);
}

// Copy essential files
const filesToCopy = ['package.json', 'README.md', 'LICENSE'];
filesToCopy.forEach(file => {
    const source = path.join(__dirname, '..', file);
    const dest = path.join(deployDir, file);
    if (fs.existsSync(source)) {
        fs.copyFileSync(source, dest);
    }
});

// Create deployment info
const deploymentInfo = `# ASEMB Node Deployment Information

## Version: ${require('../package.json').version}
## Build Date: ${new Date().toISOString()}

## Included Nodes:
1. ASEMBWorkflow - All-in-one workflow operations
2. AliceSemanticBridgeV2 - Advanced semantic operations with error handling
3. PgHybridQuery - Hybrid search (vector + keyword)
4. WebScrapeEnhanced - Advanced web scraping
5. TextChunk - Intelligent text chunking
6. DocumentProcessor - Multi-format document processing
7. SitemapFetch - Bulk website ingestion

## Credentials Required:
1. PostgresDb - PostgreSQL with pgvector
2. OpenAiApi - For embeddings generation
3. RedisApi - Optional, for caching

## Database Setup:
\`\`\`sql
CREATE DATABASE asemb;
CREATE EXTENSION vector;
CREATE EXTENSION pg_trgm;
\`\`\`

## Quick Test:
1. Install in n8n
2. Create credentials
3. Import example workflow
4. Test with a simple URL

## Support:
- GitHub: https://github.com/yourusername/alice-semantic-bridge
- Issues: https://github.com/yourusername/alice-semantic-bridge/issues
`;

fs.writeFileSync(path.join(deployDir, 'DEPLOYMENT.md'), deploymentInfo);

// Create example workflow
const exampleWorkflow = {
    "name": "ASEMB Quick Start",
    "nodes": [
        {
            "parameters": {
                "workflow": "webToVector",
                "url": "https://example.com",
                "sourceId": "example-{{$now.toUnix()}}",
                "chunkSize": 512,
                "chunkOverlap": 64
            },
            "name": "Ingest Web Content",
            "type": "n8n-nodes-alice-semantic-bridge.asembWorkflow",
            "position": [450, 300],
            "typeVersion": 1,
            "credentials": {
                "postgresDb": {
                    "id": "1",
                    "name": "PostgreSQL ASEMB"
                },
                "openAiApi": {
                    "id": "2",
                    "name": "OpenAI"
                }
            }
        },
        {
            "parameters": {
                "workflow": "semanticSearch",
                "query": "{{$json.query}}",
                "limit": 5,
                "minSimilarity": 0.7
            },
            "name": "Search Content",
            "type": "n8n-nodes-alice-semantic-bridge.asembWorkflow",
            "position": [650, 300],
            "typeVersion": 1,
            "credentials": {
                "postgresDb": {
                    "id": "1",
                    "name": "PostgreSQL ASEMB"
                },
                "openAiApi": {
                    "id": "2",
                    "name": "OpenAI"
                }
            }
        }
    ],
    "connections": {
        "Ingest Web Content": {
            "main": [
                [
                    {
                        "node": "Search Content",
                        "type": "main",
                        "index": 0
                    }
                ]
            ]
        }
    }
};

fs.writeFileSync(
    path.join(deployDir, 'example-workflow.json'),
    JSON.stringify(exampleWorkflow, null, 2)
);

console.log('✅ Deployment package created in:', deployDir);
console.log('\nNext steps:');
console.log('1. Create archive: tar -czf asemb-node.tar.gz -C deploy .');
console.log('2. Upload to n8n.luwi.dev');
console.log('3. Extract and install');
console.log('4. Configure credentials');
console.log('5. Import example-workflow.json\n');

// Helper function to copy folder recursively
function copyFolderRecursiveSync(source, target) {
    let files = [];
    const targetFolder = path.join(target, path.basename(source));
    
    if (!fs.existsSync(targetFolder)) {
        fs.mkdirSync(targetFolder, { recursive: true });
    }

    if (fs.lstatSync(source).isDirectory()) {
        files = fs.readdirSync(source);
        files.forEach(file => {
            const curSource = path.join(source, file);
            const curTarget = path.join(targetFolder, file);
            if (fs.lstatSync(curSource).isDirectory()) {
                copyFolderRecursiveSync(curSource, target);
            } else {
                fs.copyFileSync(curSource, curTarget);
            }
        });
    }
}
