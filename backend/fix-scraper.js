const fs = require('fs');
const path = require('path');

// Read the scraper.routes.ts file
const filePath = path.join(__dirname, 'src/routes/scraper.routes.ts');
let content = fs.readFileSync(filePath, 'utf8');

// Fix the window/document issue in page.evaluate
const oldCode = `          await page.evaluate(() => {
            // Using window in browser context is fine
            (window as any).scrollTo(0, (document as any).body.scrollHeight);
          });`;

const newCode = `          await page.evaluate(() => {
            // This runs in browser context where window/document are available
            const win = window as any;
            const doc = document as any;
            win.scrollTo(0, doc.body.scrollHeight);
          });`;

content = content.replace(oldCode, newCode);

// Write the fixed content back
fs.writeFileSync(filePath, content);
console.log('Fixed scraper.routes.ts');