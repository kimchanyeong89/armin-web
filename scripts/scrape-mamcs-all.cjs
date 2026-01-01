/**
 * MAMCS 전체 카테고리 스크래핑 (4개 동시 실행)
 */
const { spawn } = require('child_process');
const path = require('path');

const categories = ['drawings', 'paintings', 'photography', 'graphicdesign'];

console.log('═'.repeat(60));
console.log('  🏛️  MAMCS 전체 카테고리 스크래핑 시작');
console.log('═'.repeat(60));

const processes = categories.map(cat => {
  console.log(`\n🚀 ${cat} 시작...`);
  
  const proc = spawn('node', ['scripts/scrape-mamcs-v3.cjs', cat], {
    cwd: '/Users/kietzsche/armin-web-main',
    stdio: 'inherit'
  });
  
  proc.on('close', code => {
    console.log(`\n✅ ${cat} 완료 (exit: ${code})`);
  });
  
  return proc;
});

process.on('SIGINT', () => {
  console.log('\n중단...');
  processes.forEach(p => p.kill());
  process.exit();
});
