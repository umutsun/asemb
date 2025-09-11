// Gerekli kütüphaneleri içe aktar
const playwright = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth')();
const fs = require('fs');

// Stealth eklentisini playwright'e ekle
playwright.chromium.use(stealth);

async function fetchLawContent() {
  let browser;
  console.log('Stealth tarayıcı başlatılıyor...');

  try {
    // Gelişmiş gizlilik seçenekleriyle tarayıcıyı başlat
    browser = await playwright.chromium.launch({
      headless: false, // Görünür mod, insan davranışını daha iyi taklit eder
      slowMo: 50,      // İşlemleri insan hızına yaklaştırmak için yavaşlat
    });

    const context = await browser.newContext({
      // Gerçekçi bir tarayıcı profili taklit et
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/98.0.4758.102 Safari/537.36',
      viewport: { width: 1280, height: 800 },
      locale: 'tr-TR',
    });

    const page = await context.newPage();

    // 1. Adım: Oturum başlatmak için ana sayfayı ziyaret et
    console.log('İnsan taklidi: Oturum ve çerezler için ana sayfa ziyaret ediliyor...');
    await page.goto('https://www.gib.gov.tr/', { waitUntil: 'networkidle', timeout: 60000 });
    // Bir insanın sayfaya bakması gibi rastgele bir süre bekle
    await page.waitForTimeout(Math.random() * 3000 + 2000);

    // 2. Adım: Hedef sayfaya git
    console.log('Hedef kanun sayfasına yönlendiriliyor...');
    await page.goto('https://www.gib.gov.tr/mevzuat/kanun/433', { waitUntil: 'networkidle', timeout: 60000 });

    // 3. Adım: İçeriğin yüklenmesini bekle
    const contentSelector = 'div.WordSection1';
    console.log(`Ana içerik bekleniyor ('${contentSelector}')... Bu işlem biraz sürebilir.`);
    await page.waitForSelector(contentSelector, { state: 'visible', timeout: 120000 }); // 2 dakika bekle

    // 4. Adım: Veriyi çek
    console.log('İçerik bulundu! Metin çıkarılıyor...');
    const lawText = await page.locator(contentSelector).innerText();

    if (lawText && lawText.trim().length > 200) {
      // 5. Adım: Dosyaya kaydet
      fs.writeFileSync('kanun_metni.txt', lawText.trim());
      console.log('\n--- GÖREV BAŞARIYLA TAMAMLANDI ---');
      console.log('Tüm kanun metni "kanun_metni.txt" dosyasına kaydedildi.');
    } else {
      throw new Error('İçerik alanı bulundu ancak içi boştu.');
    }

  } catch (error) {
    console.error('\n--- BİR HATA OLUŞTU ---');
    console.error(error.message);
    if (browser) {
        console.log('Hata ayıklama için ekran görüntüsü alınıyor...');
        const page = (await browser.contexts())[0].pages()[0];
        if(page) await page.screenshot({ path: 'hata_ekran_goruntusu.png' });
    }
  } finally {
    if (browser) {
      console.log('Tarayıcı kapatılıyor...');
      await browser.close();
    }
  }
}

fetchLawContent();
