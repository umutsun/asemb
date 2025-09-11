const playwright = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth')();
const fs = require('fs');

playwright.chromium.use(stealth);

async function interactiveScraper() {
  let browser;
  console.log('Etkileşimli ve gizli tarayıcı başlatılıyor...');

  try {
    browser = await playwright.chromium.launch({
      headless: false,
      slowMo: 100, // İnsan etkileşimini taklit etmek için biraz daha yavaş
    });

    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/98.0.4758.102 Safari/537.36',
      viewport: { width: 1366, height: 768 },
    });

    const page = await context.newPage();

    console.log('Hedef kanun sayfasına gidiliyor...');
    await page.goto('https://www.gib.gov.tr/mevzuat/kanun/433', { waitUntil: 'domcontentloaded', timeout: 60000 });

    // 1. Adım: Dropdown menüsünü bul ve tıkla
    console.log('Madde seçimi dropdown menüsü bekleniyor...');
    // Strateji Değişikliği: Doğrudan "Tümü" metnini içeren tıklanabilir elementi hedefle
    const dropdownSelector = 'text="Tümü"';
    await page.waitForSelector(dropdownSelector, { state: 'visible', timeout: 30000 });
    console.log('Dropdown bulundu. Açmak için tıklanıyor...');
    await page.click(dropdownSelector);

    // 2. Adım: "Tümü" seçeneğini bul ve tıkla
    console.log('"Tümü" seçeneği aranıyor...');
    // Seçenekler genellikle farklı bir yerde render edilir, bu yüzden global olarak arıyoruz
    const optionSelector = 'li[data-value="Tümü"]';
    await page.waitForSelector(optionSelector, { state: 'visible', timeout: 10000 });
    console.log('"Tümü" seçeneği bulundu ve seçiliyor...');
    await page.click(optionSelector);

    // 3. Adım: İçeriğin yüklenmesini bekle
    console.log('Seçim yapıldı. Ana içeriğin yüklenmesi bekleniyor...');
    const contentSelector = 'div.WordSection1';
    await page.waitForSelector(contentSelector, { state: 'visible', timeout: 60000 });

    // 4. Adım: Veriyi çek ve kaydet
    console.log('İçerik yüklendi! Metin çıkarılıyor...');
    const lawText = await page.locator(contentSelector).innerText();

    if (lawText && lawText.trim().length > 500) {
      fs.writeFileSync('kanun_metni_TUMU.txt', lawText.trim());
      console.log('\n--- NİHAYET BAŞARDIK! ---');
      console.log('Tüm kanun metni "kanun_metni_TUMU.txt" dosyasına kaydedildi.');
    } else {
      throw new Error('İçerik alanı yüklendi ancak metin boştu.');
    }

  } catch (error) {
    console.error('\n--- SON DENEMEDE HATA OLUŞTU ---');
    console.error(error.message);
    if (browser) {
        const page = (await browser.contexts())[0].pages()[0];
        if(page) await page.screenshot({ path: 'son_hata.png' });
    }
  } finally {
    if (browser) {
      console.log('Tarayıcı kapatılıyor...');
      await browser.close();
    }
  }
}

interactiveScraper();
