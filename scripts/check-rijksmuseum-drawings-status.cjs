#!/usr/bin/env node

/**
 * Rijksmuseum Drawings 컬렉션 수집 현황 확인 스크립트
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const PROGRESS_FILE = path.join(__dirname, '../downloads/rijksmuseum-drawings-progress.json');
const OUTPUT_FILE = path.join(__dirname, '../public/data/rijksmuseum-drawings-collection.json');
const LOG_FILE = path.join(__dirname, '../downloads/rijksmuseum-drawings-run.log');

const TARGET_COUNT = 46334;

function formatNumber(num) {
  return num.toLocaleString('ko-KR');
}

function getFileSize(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const stats = fs.statSync(filePath);
  return stats.size;
}

function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function checkProcess() {
  try {
    const result = execSync('pgrep -f "scrape-rijksmuseum-drawings.cjs"', { encoding: 'utf8' }).trim();
    return result ? result.split('\n') : [];
  } catch (e) {
    return [];
  }
}

console.log('='.repeat(70));
console.log('Rijksmuseum Drawings 컬렉션 수집 현황');
console.log('='.repeat(70));
console.log(`\n⏰ 확인 시간: ${new Date().toLocaleString('ko-KR')}\n`);

// Progress 파일 확인
if (fs.existsSync(PROGRESS_FILE)) {
  const progress = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
  
  const artworksCount = progress.artworks ? progress.artworks.length : 0;
  const allSearchResults = progress.allSearchResults || [];
  const searchCount = allSearchResults.length;
  const lastPage = progress.lastPage || 0;
  const processedNodeIds = progress.processedNodeIds ? progress.processedNodeIds.length : 0;
  
  console.log('📊 검색 결과 수집:');
  console.log(`   현재 수집된 검색 결과: ${formatNumber(searchCount)}개`);
  console.log(`   목표: ${formatNumber(TARGET_COUNT)}개`);
  if (searchCount > 0) {
    const progressPct = (searchCount / TARGET_COUNT) * 100;
    console.log(`   진행률: ${progressPct.toFixed(1)}%`);
    const remaining = TARGET_COUNT - searchCount;
    console.log(`   남은 검색 결과: ${formatNumber(remaining)}개`);
  }
  console.log(`   마지막 페이지: ${lastPage}`);
  
  console.log(`\n📄 상세 정보 수집:`);
  console.log(`   현재 수집된 작품: ${formatNumber(artworksCount)}개`);
  if (searchCount > artworksCount) {
    const remainingDetails = searchCount - artworksCount;
    console.log(`   남은 상세 정보 수집: ${formatNumber(remainingDetails)}개`);
  }
  console.log(`   처리된 노드 ID: ${formatNumber(processedNodeIds)}개`);
  
  // Output 파일 확인
  if (fs.existsSync(OUTPUT_FILE)) {
    const fileSize = getFileSize(OUTPUT_FILE);
    console.log(`\n💾 출력 파일:`);
    console.log(`   파일 크기: ${formatFileSize(fileSize)}`);
    
    try {
      const outputData = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf8'));
      const outputArtworks = outputData.artworks ? outputData.artworks.length : 0;
      console.log(`   저장된 작품 수: ${formatNumber(outputArtworks)}개`);
    } catch (e) {
      console.log(`   (파일 읽기 오류: ${e.message})`);
    }
  } else {
    console.log(`\n💾 출력 파일: 없음`);
  }
} else {
  console.log('❌ Progress 파일 없음');
}

// 로그 파일 및 프로세스 확인
const pids = checkProcess();
if (pids.length > 0) {
  console.log(`\n📝 스크립트 상태:`);
  console.log(`   ✅ 실행 중 (PID: ${pids.join(', ')})`);
  
  if (fs.existsSync(LOG_FILE)) {
    const fileSize = getFileSize(LOG_FILE);
    console.log(`   로그 파일 크기: ${formatFileSize(fileSize)}`);
    
    try {
      const logContent = fs.readFileSync(LOG_FILE, 'utf8');
      const lines = logContent.split('\n').filter(l => l.trim());
      const recentLines = lines.slice(-10);
      
      if (recentLines.length > 0) {
        console.log(`\n   최근 로그 (마지막 10줄):`);
        recentLines.forEach(line => {
          console.log(`   ${line}`);
        });
      }
    } catch (e) {
      console.log(`   (로그 읽기 오류: ${e.message})`);
    }
  }
} else {
  console.log(`\n📝 스크립트 상태:`);
  console.log(`   ❌ 실행 중이 아님`);
}

console.log('\n' + '='.repeat(70));
