/**
 * 다중 미술관 스크래핑 마스터 스크립트
 * 모든 스크래퍼를 동시에 실행
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const SCRIPTS_DIR = __dirname;
const LOG_DIR = path.join(__dirname, '../downloads');

// 실행할 스크래퍼 목록
const scrapers = [
  { name: 'Lille PBA', script: 'scrape-lille-pba.cjs', args: [] },
  { name: 'Rouen MBA', script: 'scrape-rouen-mba.cjs', args: [] },
  { name: 'MAMCS Drawings', script: 'scrape-mamcs-navigart.cjs', args: ['drawings'] },
  { name: 'MAMCS Paintings', script: 'scrape-mamcs-navigart.cjs', args: ['paintings'] },
  { name: 'MAMCS Photography', script: 'scrape-mamcs-navigart.cjs', args: ['photography'] },
  { name: 'MAMCS Graphic Design', script: 'scrape-mamcs-navigart.cjs', args: ['graphicdesign'] }
];

const results = [];
let completed = 0;

function runScraper(scraper) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    console.log(`\n🚀 [${scraper.name}] 시작...`);
    
    const scriptPath = path.join(SCRIPTS_DIR, scraper.script);
    const proc = spawn('node', [scriptPath, ...scraper.args], {
      cwd: path.join(SCRIPTS_DIR, '..'),
      stdio: ['ignore', 'pipe', 'pipe']
    });
    
    let output = '';
    let errorOutput = '';
    
    proc.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    proc.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });
    
    proc.on('close', (code) => {
      const duration = Math.round((Date.now() - startTime) / 1000);
      completed++;
      
      const result = {
        name: scraper.name,
        script: scraper.script,
        exitCode: code,
        duration: `${duration}s`,
        success: code === 0,
        timestamp: new Date().toISOString()
      };
      
      results.push(result);
      
      if (code === 0) {
        console.log(`✅ [${scraper.name}] 완료 (${duration}초) [${completed}/${scrapers.length}]`);
      } else {
        console.log(`❌ [${scraper.name}] 실패 (코드: ${code}) [${completed}/${scrapers.length}]`);
        console.log(`   오류: ${errorOutput.slice(-200)}`);
      }
      
      resolve(result);
    });
    
    proc.on('error', (err) => {
      completed++;
      const result = {
        name: scraper.name,
        script: scraper.script,
        error: err.message,
        success: false,
        timestamp: new Date().toISOString()
      };
      results.push(result);
      console.log(`❌ [${scraper.name}] 오류: ${err.message}`);
      resolve(result);
    });
  });
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('🏛️  다중 미술관 스크래핑 시작');
  console.log(`   총 ${scrapers.length}개 스크래퍼 동시 실행`);
  console.log('═══════════════════════════════════════════════════════════');
  
  const startTime = Date.now();
  
  // 모든 스크래퍼 동시 실행
  await Promise.all(scrapers.map(scraper => runScraper(scraper)));
  
  const totalDuration = Math.round((Date.now() - startTime) / 1000);
  const successful = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('📊 실행 결과 요약');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`   총 소요 시간: ${totalDuration}초`);
  console.log(`   성공: ${successful}개`);
  console.log(`   실패: ${failed}개`);
  console.log('');
  
  results.forEach(r => {
    const status = r.success ? '✅' : '❌';
    console.log(`   ${status} ${r.name}: ${r.duration || r.error}`);
  });
  
  // 결과 로그 저장
  if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
  const logPath = path.join(LOG_DIR, 'multi-scrape-results.json');
  fs.writeFileSync(logPath, JSON.stringify({
    startedAt: new Date(Date.now() - totalDuration * 1000).toISOString(),
    completedAt: new Date().toISOString(),
    totalDuration: `${totalDuration}s`,
    successful,
    failed,
    results
  }, null, 2));
  console.log(`\n💾 로그 저장: ${logPath}`);
  
  // 실패한 스크래퍼가 있으면 순차 재시도 안내
  if (failed > 0) {
    console.log('\n⚠️  실패한 스크래퍼가 있습니다. 개별 재실행을 권장합니다:');
    results.filter(r => !r.success).forEach(r => {
      const scraper = scrapers.find(s => s.name === r.name);
      console.log(`   node scripts/${scraper.script} ${scraper.args.join(' ')}`);
    });
  }
}

main().catch(console.error);
