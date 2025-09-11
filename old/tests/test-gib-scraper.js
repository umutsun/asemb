const puppeteer = require('puppeteer');
const fs = require('fs');

async function testGibScraper() {
  let browser;
  
  try {
    console.log('Launching browser...');
    browser = await puppeteer.launch({
      headless: false,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox'
      ]
    });

    const page = await browser.newPage();
    
    console.log('Navigating to GIB page...');
    await page.goto('https://www.gib.gov.tr/mevzuat/kanun/433', {
      waitUntil: 'networkidle2',
      timeout: 60000
    });
    
    console.log('Waiting for content...');
    await page.waitForTimeout(5000);
    
    // Try different extraction methods
    console.log('\n=== Method 1: innerText ===');
    const innerText = await page.evaluate(() => document.body.innerText);
    console.log('Length:', innerText.length);
    console.log('Preview:', innerText.substring(0, 500));
    
    console.log('\n=== Method 2: textContent ===');
    const textContent = await page.evaluate(() => document.body.textContent);
    console.log('Length:', textContent.length);
    console.log('Preview:', textContent.substring(0, 500));
    
    console.log('\n=== Method 3: Specific selectors ===');
    const selectors = [
      'iframe',
      'frame',
      'embed',
      'object',
      '.content',
      '#content',
      'main',
      'article',
      'div[class*="content"]',
      'div[id*="content"]',
      'div[class*="icerik"]',
      'div[id*="icerik"]'
    ];
    
    for (const selector of selectors) {
      const elements = await page.$$(selector);
      if (elements.length > 0) {
        console.log(`Found ${elements.length} elements with selector: ${selector}`);
        
        for (let i = 0; i < Math.min(3, elements.length); i++) {
          const text = await page.evaluate(el => el.textContent || el.innerText || '', elements[i]);
          if (text && text.trim().length > 50) {
            console.log(`  Element ${i + 1} text length: ${text.length}`);
            console.log(`  Preview: ${text.substring(0, 200)}...`);
          }
        }
      }
    }
    
    // Check for iframes
    console.log('\n=== Checking iframes ===');
    const frames = page.frames();
    console.log(`Found ${frames.length} frames`);
    
    for (let i = 0; i < frames.length; i++) {
      const frame = frames[i];
      if (frame !== page.mainFrame()) {
        console.log(`\nFrame ${i}: ${frame.url()}`);
        try {
          const frameContent = await frame.evaluate(() => document.body?.innerText || '');
          if (frameContent.length > 0) {
            console.log(`  Content length: ${frameContent.length}`);
            console.log(`  Preview: ${frameContent.substring(0, 200)}...`);
            
            // Save frame content
            fs.writeFileSync(`frame-${i}-content.txt`, frameContent);
            console.log(`  Saved to frame-${i}-content.txt`);
          }
        } catch (err) {
          console.log(`  Could not access frame: ${err.message}`);
        }
      }
    }
    
    // Save page HTML
    const html = await page.content();
    fs.writeFileSync('gib-page.html', html);
    console.log('\nPage HTML saved to gib-page.html');
    
    // Take screenshot
    await page.screenshot({ path: 'gib-page.png', fullPage: true });
    console.log('Screenshot saved to gib-page.png');
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

testGibScraper();