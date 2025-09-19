import * as dotenv from 'dotenv';
import { ClaudeCodeMCPServer } from './claude-code-mcp-server';
import { ClaudeCodeMCPDemo } from './claude-code-mcp-demo';

// .env dosyasını yükle
dotenv.config();

/**
 * Multi-Agent Sistem Başlangıç Betiği
 * Bu betik, Claude Code CLI ile entegre çalışan multi-agent sistemini başlatır.
 */

async function startMCPServer(): Promise<ClaudeCodeMCPServer> {
  console.log('🚀 MCP Sunucusu Başlatılıyor...\n');
  
  const server = new ClaudeCodeMCPServer(3000);
  server.start();
  
  // Sunucunun başlamasını bekle
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  console.log('✅ MCP Sunucusu http://localhost:3000/mcp adresinde çalışıyor\n');
  
  return server;
}

async function runDemo(): Promise<void> {
  console.log('🎬 Multi-Agent Sistem Demo Başlatılıyor...\n');
  
  const demo = new ClaudeCodeMCPDemo({ 
    serverUrl: 'http://localhost:3000/mcp',
    verbose: true 
  });
  
  await demo.runFullDemo();
}

async function runInteractive(): Promise<void> {
  console.log('🤖 Multi-Agent Sistem Interactive Mod Başlatılıyor...\n');
  
  const demo = new ClaudeCodeMCPDemo({ 
    serverUrl: 'http://localhost:3000/mcp',
    verbose: true 
  });
  
  await demo.runInteractive();
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  
  if (args.includes('--help') || args.includes('-h')) {
    showHelp();
    return;
  }
  
  if (args.includes('--demo')) {
    const server = await startMCPServer();
    await runDemo();
    server.stop();
    return;
  }
  
  if (args.includes('--interactive')) {
    const server = await startMCPServer();
    await runInteractive();
    server.stop();
    return;
  }
  
  // Varsayılan olarak sadece MCP sunucusunu başlat
  await startMCPServer();
  
  console.log('📝 Kullanım Seçenekleri:');
  console.log('  npm run start:demo     - Demo çalıştırır');
  console.log('  npm run start:interactive - Interactive mod başlatır');
  console.log('  Ctrl+C                 - Sunucuyu durdurur\n');
  
  // Programı sonlandırmama
  process.on('SIGINT', () => {
    console.log('\n🔄 MCP Sunucusu durduruluyor...');
    process.exit(0);
  });
}

function showHelp(): void {
  console.log('📖 Multi-Agent Sistem Başlangıç Betiği\n');
  console.log('Kullanım:');
  console.log('  npx tsx start-multi-agent-system.ts [seçenekler]\n');
  console.log('Seçenekler:');
  console.log('  --demo, -d        - Demo çalıştırır');
  console.log('  --interactive, -i - Interactive mod başlatır');
  console.log('  --help, -h        - Bu yardım mesajını gösterir\n');
  console.log('Örnekler:');
  console.log('  npx tsx start-multi-agent-system.ts');
  console.log('  npx tsx start-multi-agent-system.ts --demo');
  console.log('  npx tsx start-multi-agent-system.ts --interactive\n');
}

// Doğrudan kullanım için
if (require.main === module) {
  main().catch(console.error);
}