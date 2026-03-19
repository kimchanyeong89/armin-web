#!/usr/bin/env node
/**
 * Leopold Museum 스크래핑 실시간 모니터링
 */

const fs = require('fs');
const path = require('path');

const LOG_FILE = path.join(__dirname, '../downloads/leopold-museum-continue-run.log');
const PROGRESS_FILE = path.join(__dirname, '../downloads/leopold-museum-continue-progress.json');
const OUTPUT_FILE = path.join(__dirname, '../public/data/leopold-museum-collection.json');

function formatTime(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  if (hours > 0) {
    return `${hours}시간 ${minutes % 60}분`;
  } else if (minutes > 0) {
    return `${minutes}분 ${seconds % 60}초`;
  } else {
    return `${seconds}초`;
  }
}

function getStatus() {
  console.clear();
  console.log('='.repeat(70));
  console.log('Leopold Museum 스크래핑 실시간 모니터링');
  console.log('='.repeat(70));
  console.log();
  
  // 프로세스 확인
  const { execSync } = require('child_process');
  try {
    const pid = execSync('pgrep -f "scrape-leopold-museum-continue"', { encoding: 'utf8' }).trim();
    console.log(`✅ 스크립트 실행 중 (PID: ${pid})`);
  } catch (e) {
    console.log('❌ 스크립트가 실행 중이 아닙니다');
    return;
  }
  
  console.log();
  
  // 로그 파일 확인
  if (fs.existsSync(LOG_FILE)) {
    const stats = fs.statSync(LOG_FILE);
    const lastUpdate = new Date(stats.mtime);
    const now = new Date();
    const elapsed = now - lastUpdate;
    
    console.log(`📝 로그 파일 마지막 업데이트: ${lastUpdate.toLocaleString('ko-KR')}`);
    console.log(`   경과 시간: ${formatTime(elapsed)} 전`);
    console.log();
    
    // 최근 로그 읽기
    try {
      const logContent = fs.readFileSync(LOG_FILE, 'utf8');
      const lines = logContent.split('\n').filter(l => l.trim());
      const recentLines = lines.slice(-10);
      
      console.log('📋 최근 활동:');
      recentLines.forEach(line => {
        if (line.includes('✅') || line.includes('⚠️') || line.includes('📊') || 
            line.includes('💾') || line.includes('🔍') || line.includes('⏭️')) {
          const match = line.match(/\[(.*?)\]\s*(.*)/);
          if (match) {
            console.log(`   ${match[2]}`);
          } else {
            console.log(`   ${line.substring(50)}`);
          }
        }
      });
      console.log();
    } catch (e) {
      console.log(`   로그 읽기 오류: ${e.message}`);
    }
  }
  
  // 진행 상황 파일 확인
  if (fs.existsSync(PROGRESS_FILE)) {
    try {
      const progress = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
      const artworks = progress.artworks || [];
      const processedIds = progress.processedIds || [];
      const lastId = progress.lastId || 0;
      
      console.log('💾 진행 상황:');
      console.log(`   수집된 작품: ${artworks.length}개`);
      console.log(`   처리된 ID: ${processedIds.length}개`);
      console.log(`   마지막 ID: ${lastId}`);
      console.log();
      
      // 메타데이터 완성도
      if (artworks.length > 0) {
        const complete = artworks.filter(a => 
          a.objectType && a.medium && a.dimensions && a.artist
        ).length;
        const percentage = Math.round((complete / artworks.length) * 100);
        console.log(`📊 메타데이터 완성도: ${complete}/${artworks.length} (${percentage}%)`);
        console.log();
      }
    } catch (e) {
      console.log(`   진행 상황 읽기 오류: ${e.message}`);
    }
  }
  
  // 최종 출력 파일 확인
  if (fs.existsSync(OUTPUT_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf8'));
      const artworks = data.artworks || [];
      
      console.log('📁 최종 출력 파일:');
      console.log(`   총 작품 수: ${artworks.length}개`);
      
      if (artworks.length > 0) {
        const complete = artworks.filter(a => 
          a.objectType && a.medium && a.dimensions && a.artist
        ).length;
        const percentage = Math.round((complete / artworks.length) * 100);
        console.log(`   완전한 메타데이터: ${complete}/${artworks.length} (${percentage}%)`);
        
        // 최근 수집된 작품
        console.log();
        console.log('🎨 최근 수집된 작품 (최근 3개):');
        artworks.slice(-3).forEach((art, idx) => {
          console.log(`   ${idx + 1}. ${art.name || 'N/A'}`);
          console.log(`      작가: ${art.artist || 'N/A'}`);
          console.log(`      타입: ${art.objectType || 'N/A'}`);
        });
      }
    } catch (e) {
      console.log(`   출력 파일 읽기 오류: ${e.message}`);
    }
  }
  
  console.log();
  console.log('='.repeat(70));
  console.log('Ctrl+C로 종료 | 5초마다 자동 업데이트');
}

// 주기적으로 상태 업데이트
setInterval(getStatus, 5000);
getStatus();
