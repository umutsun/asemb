const fs = require('fs');
const path = require('path');

// API endpoint mappings
const apiMappings = {
  '/api/migration/': '/api/v2/migration/',
  '/api/embeddings/': '/api/v2/embeddings/',
  '/api/embeddings': '/api/v2/embeddings',
  '/api/lightrag/': '/api/v2/lightrag/',
  '/api/documents/': '/api/v2/documents/',
  '/api/documents': '/api/v2/documents',
  '/api/activity/': '/api/v2/activity/',
  '/api/cache/': '/api/v2/cache/',
  '/api/config/': '/api/v2/config/',
  '/api/workflows/': '/api/v2/workflows/',
  '/api/workflows': '/api/v2/workflows',
  '/api/services/': '/api/v2/services/',
  '/api/config': '/api/v2/config',
  '/api/scraper/': '/api/v2/scraper/',
  '/api/scraper': '/api/v2/scraper',
  '/api/query': '/api/v2/query',
  '/api/search': '/api/v2/search'
};

// Get all .tsx files in dashboard directory
function getAllTsxFiles(dir) {
  const files = [];
  const items = fs.readdirSync(dir);
  
  for (const item of items) {
    const itemPath = path.join(dir, item);
    const stat = fs.statSync(itemPath);
    
    if (stat.isDirectory()) {
      files.push(...getAllTsxFiles(itemPath));
    } else if (item.endsWith('.tsx')) {
      files.push(itemPath);
    }
  }
  
  return files;
}

// Update fetch calls in a file
function updateFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let modified = false;
  
  // Check if file already imports config
  const hasConfigImport = content.includes("import { getApiUrl } from '@/lib/config'") ||
                         content.includes("import { API_CONFIG") ||
                         content.includes("from '@/lib/config'");
  
  // Update all fetch calls with string literals
  for (const [oldPath, newPath] of Object.entries(apiMappings)) {
    const regex = new RegExp(`fetch\\(['"\`]${oldPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'g');
    if (content.match(regex)) {
      content = content.replace(regex, `fetch('${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}${newPath}`);
      modified = true;
    }
  }
  
  // Also update fetch calls with template literals
  content = content.replace(/fetch\(`\/api\//g, `fetch(\`\${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/v2/`);
  
  if (modified) {
    // Add import if not present and file uses fetch
    if (!hasConfigImport && content.includes('fetch(')) {
      // Find the first import statement
      const importMatch = content.match(/^import .* from .*/m);
      if (importMatch) {
        const insertPosition = importMatch.index + importMatch[0].length;
        content = content.slice(0, insertPosition) + 
                 "\nimport { getApiUrl, API_CONFIG } from '@/lib/config';" + 
                 content.slice(insertPosition);
      }
    }
    
    fs.writeFileSync(filePath, content);
    console.log(`Updated: ${filePath}`);
    return true;
  }
  
  return false;
}

// Main execution
const dashboardDir = path.join(__dirname, 'src/app/dashboard');
const files = getAllTsxFiles(dashboardDir);

console.log(`Found ${files.length} .tsx files`);

let updatedCount = 0;
for (const file of files) {
  if (updateFile(file)) {
    updatedCount++;
  }
}

console.log(`\nUpdated ${updatedCount} files with new API URLs`);
console.log('\nMake sure to set NEXT_PUBLIC_API_URL in your .env.local file');
console.log('Default value is: http://localhost:3001');