const fs = require('fs');
const path = require('path');
const glob = require('glob');

// Find all dashboard page files
const dashboardPath = path.join(__dirname, '../frontend/src/app/dashboard');
const files = glob.sync('**/*.tsx', { cwd: dashboardPath, absolute: true });

console.log(`Found ${files.length} dashboard files to update`);

files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  let modified = false;
  const originalContent = content;
  
  // Fix title sizes - change text-3xl and text-2xl in h1 tags to text-xl
  content = content.replace(/<h1 className="text-3xl font-bold([^"]*)">/g, '<h1 className="text-xl font-semibold$1">');
  content = content.replace(/<h1 className="text-2xl font-bold([^"]*)">/g, '<h1 className="text-xl font-semibold$1">');
  
  // Fix description text sizes
  content = content.replace(/<p className="text-muted-foreground mt-2">/g, '<p className="text-sm text-muted-foreground mt-1">');
  
  // Add consistent padding to main containers
  // Look for main divs at the start of return statements
  content = content.replace(/return \(\s*<div className="space-y-6">/g, 'return (\n    <div className="p-6 lg:p-8 space-y-6">');
  content = content.replace(/return \(\s*<div className="container mx-auto([^"]*)">/g, 'return (\n    <div className="p-6 lg:p-8 container mx-auto$1">');
  
  // Check if file was modified
  if (content !== originalContent) {
    modified = true;
    fs.writeFileSync(file, content, 'utf8');
    console.log(`✅ Updated: ${path.relative(dashboardPath, file)}`);
  }
});

console.log('Dashboard UI consistency fixes completed!');