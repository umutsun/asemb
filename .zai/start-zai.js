#!/usr/bin/env node

/**
 * Z.AI GLM-4.5 Claude Code Başlangıç Scripti
 * Bu script, Z.AI GLM-4.5 modelini kullanarak Claude Code benzeri bir deneyim sunar.
 */

const { exec } = require('child_process');
const readline = require('readline');
const fs = require('fs');
const path = require('path');

// Renkli çıktı için
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  bright: '\x1b[1m'
};

// CLI arayüzü
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Başlık
console.log(`${colors.bright}${colors.cyan}
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║  🤖 Z.AI GLM-4.5 Claude Code Entegrasyonu                    ║
║                                                              ║
║  Claude Code CLI arayüzünü kullanarak Z.AI'nin GLM-4.5       ║
║  modeliyle kod oluşturmanızı sağlayan bir entegrasyondur.    ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
${colors.reset}`);

// Menü
function showMenu() {
  console.log(`\n${colors.bright}${colors.yellow}📋 Seçenekler:${colors.reset}`);
  console.log(`${colors.green}1.${colors.reset} Temel Z.AI Kullanımı`);
  console.log(`${colors.green}2.${colors.reset} Claude Code Benzeri Arayüz`);
  console.log(`${colors.green}3.${colors.reset} Z.AI Agent Kullanımı`);
  console.log(`${colors.green}4.${colors.reset} Interactive Demo`);
  console.log(`${colors.green}5.${colors.reset} Interactive CLI Modu`);
  console.log(`${colors.green}6.${colors.reset} API Testi`);
  console.log(`${colors.green}7.${colors.reset} Dokümantasyonu Görüntüle`);
  console.log(`${colors.red}0.${colors.reset} Çıkış`);
  
  // readline arayüzünü yeniden oluştur
  const newRl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  newRl.question(`\n${colors.cyan}Seçiminiz (0-7): ${colors.reset}`, (answer) => {
    newRl.close();
    handleMenuChoice(answer);
  });
}

// Menü seçeneklerini işleme
function handleMenuChoice(choice) {
  switch (choice) {
    case '1':
      runCommand('npx tsx zai-example.ts');
      break;
    case '2':
      runCommand('npx tsx claude-code-example.ts');
      break;
    case '3':
      runCommand('npx tsx zai-agent-example.ts');
      break;
    case '4':
      runCommand('npx tsx zai-claude-code-demo.ts');
      break;
    case '5':
      runCommand('npx tsx zai-claude-code-demo.ts --interactive');
      break;
    case '6':
      runCommand('npx tsx test-zai-api.ts');
      break;
    case '7':
      showDocumentation();
      break;
    case '0':
      console.log(`\n${colors.green}👋 Görüşürüz!${colors.reset}`);
      rl.close();
      process.exit(0);
      break;
    default:
      console.log(`\n${colors.red}❌ Geçersiz seçenek!${colors.reset}`);
      setTimeout(showMenu, 1000);
      break;
  }
}

// Komut çalıştırma
function runCommand(command) {
  console.log(`\n${colors.blue}🔄 Çalıştırılıyor: ${command}${colors.reset}`);
  
  const child = exec(command, { stdio: 'inherit' });
  
  child.on('close', (code) => {
    console.log(`\n${colors.green}✅ Komut tamamlandı (Çıkış kodu: ${code})${colors.reset}`);
    setTimeout(showMenu, 1000);
  });
  
  child.on('error', (error) => {
    console.error(`\n${colors.red}❌ Hata: ${error.message}${colors.reset}`);
    setTimeout(showMenu, 1000);
  });
}

// Dokümantasyonu göster
function showDocumentation() {
  console.log(`\n${colors.bright}${colors.yellow}📚 Dokümantasyon:${colors.reset}`);
  console.log(`${colors.cyan}README-ZAI-CLAUDE-CODE.md${colors.reset} dosyasını görüntülüyorsunuz...\n`);
  
  try {
    const readmePath = path.join(__dirname, 'README-ZAI-CLAUDE-CODE.md');
    const readmeContent = fs.readFileSync(readmePath, 'utf8');
    
    // İlk 50 satırı göster
    const lines = readmeContent.split('\n');
    const preview = lines.slice(0, 50).join('\n');
    
    console.log(preview);
    console.log(`\n${colors.yellow}... (devamı için README-ZAI-CLAUDE-CODE.md dosyasını açın)${colors.reset}`);
  } catch (error) {
    console.error(`\n${colors.red}❌ Dokümantasyon okunamadı: ${error.message}${colors.reset}`);
  }
  
  setTimeout(showMenu, 3000);
}

// Başlangıç kontrolü
function checkSetup() {
  console.log(`\n${colors.blue}🔍 Kurulum kontrol ediliyor...${colors.reset}`);
  
  // .env dosyasını kontrol et
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) {
    console.log(`\n${colors.yellow}⚠️ .env dosyası bulunamadı!${colors.reset}`);
    console.log(`${colors.cyan}📝 .env.example dosyasını kopyalayın ve API anahtarınızı ekleyin:${colors.reset}`);
    console.log(`${colors.green}cp .env.example .env${colors.reset}\n`);
    
    const newRl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    newRl.question(`${colors.cyan}.env dosyasını oluşturmak ister misiniz? (e/h): ${colors.reset}`, (answer) => {
      newRl.close();
      if (answer.toLowerCase() === 'e' || answer.toLowerCase() === 'y') {
        try {
          fs.copyFileSync(path.join(__dirname, '.env.example'), envPath);
          console.log(`\n${colors.green}✅ .env dosyası oluşturuldu!${colors.reset}`);
          console.log(`${colors.yellow}⚠️ Lütfen .env dosyasını düzenleyip Z.AI API anahtarınızı ekleyin!${colors.reset}`);
        } catch (error) {
          console.error(`\n${colors.red}❌ .env dosyası oluşturulamadı: ${error.message}${colors.reset}`);
        }
      }
      setTimeout(showMenu, 2000);
    });
  } else {
    console.log(`${colors.green}✅ .env dosyası bulundu.${colors.reset}`);
    
    // API anahtarını kontrol et
    try {
      const envContent = fs.readFileSync(envPath, 'utf8');
      const apiKeyMatch = envContent.match(/ZAI_API_KEY=(.+)/);
      
      if (apiKeyMatch && apiKeyMatch[1] && !apiKeyMatch[1].includes('your_zai_api_key_here')) {
        console.log(`${colors.green}✅ Z.AI API anahtarı yapılandırıldı.${colors.reset}`);
        setTimeout(showMenu, 1000);
      } else {
        console.log(`${colors.yellow}⚠️ Z.AI API anahtarı yapılandırılmamış!${colors.reset}`);
        console.log(`${colors.cyan}📝 Lütfen .env dosyasını düzenleyip Z.AI API anahtarınızı ekleyin.${colors.reset}`);
        setTimeout(showMenu, 2000);
      }
    } catch (error) {
      console.error(`\n${colors.red}❌ .env dosyası okunamadı: ${error.message}${colors.reset}`);
      setTimeout(showMenu, 2000);
    }
  }
}

// Programı başlat
checkSetup();