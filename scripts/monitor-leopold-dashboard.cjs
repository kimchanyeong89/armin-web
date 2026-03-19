#!/usr/bin/env node
/**
 * Leopold Museum 통합 모니터링 대시보드 (v2)
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const SCAN_OUTPUT = path.join(__dirname, '../downloads/leopold-valid-ids.json');
const FINAL_OUTPUT = path.join(__dirname, '../public/data/leopold-museum-collection.json');

function clearScreen() {
  process.stdout.write('\x1Bc');
}

function getProcessStatus(name) {
  try {
    const pid = execSync(`pgrep -f "${name}"`, { encoding: 'utf8' }).trim().split('\n')[0];
    return { running: true, pid };
  } catch (e) {
    return { running: false };
  }
}

function updateDashboard() {
  clearScreen();
  const now = new Date();
  
  console.log('='.repeat(60));
  console.log('🎨 Leopold Museum 복구 및 추가 수집 현황판');
  console.log(`🕒 현재 시간: ${now.toLocaleTimeString('ko-KR')}`);
  console.log('='.repeat(60));
  console.log();

  // 1. ID 스캔 (누락분 찾기)
  const scannerStatus = getProcessStatus('scan-leopold-ids');
  const scanStatusIcon = scannerStatus.running ? '🟢 실행 중' : '⚪️ 대기/완료';
  
  let validIdCount = 0;
  if (fs.existsSync(SCAN_OUTPUT)) {
    try {
      const scanData = JSON.parse(fs.readFileSync(SCAN_OUTPUT, 'utf8'));
      validIdCount = scanData.count || (scanData.ids ? scanData.ids.length : 0);
      const lastId = scanData.ids ? scanData.ids[scanData.ids.length - 1] : 0;
      
      console.log(`1️⃣ ID 추가 스캔 (${scanStatusIcon})`);
      console.log(`   - 확보된 ID 총계: ${validIdCount}개`);
      console.log(`   - 현재 탐색 범위: ~ ${lastId}번`);
    } catch (e) {}
  }

  console.log();

  // 2. 상세 정보 복구 (모달 데이터)
  const scraperStatus = getProcessStatus('scrape-leopold-parallel');
  const scrapeStatusIcon = scraperStatus.running ? '🟢 실행 중' : '🔴 중단됨 (확인 필요)';
  
  console.log(`2️⃣ 데이터 복구 및 상세 수집 (${scrapeStatusIcon})`);
  
  if (fs.existsSync(FINAL_OUTPUT)) {
    try {
      const collection = JSON.parse(fs.readFileSync(FINAL_OUTPUT, 'utf8'));
      const artworks = collection.artworks || [];
      const total = artworks.length;
      
      // 진행률
      const progress = validIdCount > 0 ? Math.round((total / validIdCount) * 100) : 0;
      const barLength = 20;
      const filled = Math.round((progress / 100) * barLength);
      const bar = '█'.repeat(filled) + '░'.repeat(barLength - filled);
      
      console.log(`   - 복구된 작품: ${total} / ${validIdCount}개`);
      console.log(`   - 진행률: [${bar}] ${progress}%`);
      
      if (artworks.length > 0) {
        const last = artworks[artworks.length - 1];
        console.log(`   - 최근 저장: "${last.name.substring(0, 30)}..." (ID: ${last.id})`);
      }
    } catch (e) { console.log('   - 데이터 읽는 중...'); }
  } else {
    console.log('   - 데이터 파일 없음 (생성 대기 중)');
  }
  
  console.log();
  console.log('='.repeat(60));
  console.log('Ctrl+C로 종료');
}

setInterval(updateDashboard, 1000);
updateDashboard();
