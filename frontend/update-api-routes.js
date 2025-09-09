const fs = require('fs');
const path = require('path');

// Get all route.ts files
function getAllRouteFiles(dir) {
  const files = [];
  const items = fs.readdirSync(dir);
  
  for (const item of items) {
    const itemPath = path.join(dir, item);
    const stat = fs.statSync(itemPath);
    
    if (stat.isDirectory()) {
      files.push(...getAllRouteFiles(itemPath));
    } else if (item === 'route.ts') {
      files.push(itemPath);
    }
  }
  
  return files;
}

// Update ASB_API_URL in route files
function updateRouteFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let modified = false;
  
  // Update ASB_API_URL definition
  if (content.includes("process.env.ASB_API_URL || 'http://localhost:8083'")) {
    content = content.replace(
      /const ASB_API_URL = process\.env\.ASB_API_URL \|\| 'http:\/\/localhost:8083'/g,
      "const ASB_API_URL = process.env.ASB_API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'"
    );
    modified = true;
  }
  
  // Also update any standalone localhost:8083 references
  if (content.includes('localhost:8083')) {
    content = content.replace(/http:\/\/localhost:8083/g, 'http://localhost:3001');
    modified = true;
  }
  
  // Update API v2 endpoints
  if (content.includes('/api/') && !content.includes('/api/v2/')) {
    // Update fetch calls to backend
    content = content.replace(/\$\{ASB_API_URL\}\/api\//g, '${ASB_API_URL}/api/v2/');
    content = content.replace(/`\$\{ASB_API_URL\}\/api\//g, '`${ASB_API_URL}/api/v2/');
    modified = true;
  }
  
  if (modified) {
    fs.writeFileSync(filePath, content);
    console.log(`Updated: ${filePath}`);
    return true;
  }
  
  return false;
}

// Main execution
const apiDir = path.join(__dirname, 'src/app/api');
const files = getAllRouteFiles(apiDir);

console.log(`Found ${files.length} route.ts files`);

let updatedCount = 0;
for (const file of files) {
  if (updateRouteFile(file)) {
    updatedCount++;
  }
}

console.log(`\nUpdated ${updatedCount} route files`);
console.log('\nEnvironment variables configured:');
console.log('NEXT_PUBLIC_API_URL=http://localhost:3001');
console.log('ASB_API_URL=http://localhost:3001');