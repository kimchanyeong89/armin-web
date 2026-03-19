#!/usr/bin/env node

/**
 * 모든 Rijksmuseum 컬렉션 수집 현황 확인 스크립트
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const COLLECTIONS = [
  {
    id: 'paintings',
    name: 'Paintings',
    progressFile: 'downloads/rijksmuseum-paintings-progress.json',
    outputFile: 'public/data/rijksmuseum-paintings-collection.json',
    logFile: 'downloads/rijksmuseum-paintings-run.log',
    scriptName: 'scrape-rijksmuseum-paintings.cjs'
  },
  {
    id: 'photography',
    name: 'Photography',
    progressFile: 'downloads/rijksmuseum-photography-progress.json',
    outputFile: 'public/data/rijksmuseum-photography-collection.json',
    logFile: 'downloads/rijksmuseum-photography-run.log',
    scriptName: 'scrape-rijksmuseum-photography.cjs'
  },
  {
    id: 'drawings',
    name: 'Drawings',
    progressFile: 'downloads/rijksmuseum-drawings-progress.json',
    outputFile: 'public/data/rijksmuseum-drawings-collection.json',
    logFile: 'downloads/rijksmuseum-drawings-run.log',
    scriptName: 'scrape-rijksmuseum-drawings.cjs',
    targetCount: 46334
  },
  {
    id: 'prints',
    name: 'Prints',
    progressFile: 'downloads/rijksmuseum-prints-progress.json',
    outputFile: 'public/data/rijksmuseum-prints-collection.json',
    logFile: 'downloads/rijksmuseum-prints-run.log',
    scriptName: 'scrape-rijksmuseum-prints.cjs'
  },
  {
    id: 'prints2',
    name: 'Prints 2',
    progressFile: 'downloads/rijksmuseum-prints2-progress.json',
    outputFile: 'public/data/rijksmuseum-prints2-collection.json',
    logFile: 'downloads/rijksmuseum-prints2-run.log',
    scriptName: 'scrape-rijksmuseum-prints2.cjs'
  }
];

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

function checkProcess(scriptName) {
  try {
    const result = execSync(`pgrep -f "${scriptName}"`, { encoding: 'utf8' }).trim();
    return result ? result.split('\n') : [];
  } catch (e) {
    return [];
  }
}

console.log('='.repeat(70));
console.log('Rijksmuseum 모든 컬렉션 수집 현황');
console.log('='.repeat(70));
console.log(`\n⏰ 확인 시간: ${new Date().toLocaleString('ko-KR')}\n`);

COLLECTIONS.forEach((collection, index) => {
  const progressPath = path.join(__dirname, '..', collection.progressFile);
  const outputPath = path.join(__dirname, '..', collection.outputFile);
  
  console.log(`${index + 1}. ${collection.name}`);
  console.log('-'.repeat(70));
  
  if (fs.existsSync(progressPath)) {
    try {
      const progress = JSON.parse(fs.readFileSync(progressPath, 'utf8'));
      
      const artworksCount = progress.artworks ? progress.artworks.length : 0;
      const allSearchResults = progress.allSearchResults || [];
      const searchCount = allSearchResults.length;
      const lastPage = progress.lastPage || 0;
      
      console.log(`   📊 검색 결과: ${formatNumber(searchCount)}개`);
      if (collection.targetCount) {
        const progressPct = (searchCount / collection.targetCount) * 100;
        console.log(`   🎯 목표: ${formatNumber(collection.targetCount)}개 (${progressPct.toFixed(1)}%)`);
        const remaining = collection.targetCount - searchCount;
        if (remaining > 0) {
          console.log(`   ⏳ 남은 검색 결과: ${formatNumber(remaining)}개`);
        }
      }
      console.log(`   📄 수집된 작품: ${formatNumber(artworksCount)}개`);
      console.log(`   📍 마지막 페이지: ${lastPage}`);
      
      if (fs.existsSync(outputPath)) {
        const fileSize = getFileSize(outputPath);
        console.log(`   💾 출력 파일: ${formatFileSize(fileSize)}`);
      }
    } catch (e) {
      console.log(`   ❌ Progress 파일 읽기 오류: ${e.message}`);
    }
  } else {
    console.log(`   ❌ Progress 파일 없음`);
  }
  
  const pids = checkProcess(collection.scriptName);
  if (pids.length > 0) {
    console.log(`   ✅ 실행 중 (PID: ${pids.join(', ')})`);
  } else {
    console.log(`   ⏸️  실행 중이 아님`);
  }
  
  console.log();
});

console.log('='.repeat(70));
console.log('\n개별 컬렉션 상세 확인:');
console.log('  node scripts/check-rijksmuseum-drawings-status.cjs');
console.log('='.repeat(70));
