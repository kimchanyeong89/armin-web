/**
 * emuseum 코드 테이블 수집
 * 재질, 시대, 분류, 출토지 코드를 이름으로 변환하기 위한 매핑 테이블
 */

const fs = require('fs');
const path = require('path');

const API_KEY = 'd44723b6b598e8f13c9a93d5bcb488219b58fe60bec8d9c7af4ef7fcc199b349';
const BASE_URL = 'http://www.emuseum.go.kr/openapi';

const OUTPUT_FILE = path.join(__dirname, '../public/data/emuseum-codes.json');

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchCodes(parentCode, numOfRows = 1000) {
  const url = `${BASE_URL}/code?serviceKey=${API_KEY}&parentCode=${parentCode}&numOfRows=${numOfRows}`;
  const response = await fetch(url);
  const text = await response.text();
  
  // XML 파싱
  const codes = {};
  const regex = /<data>(.*?)<\/data>/gs;
  let match;
  
  while ((match = regex.exec(text)) !== null) {
    const dataContent = match[1];
    const codeMatch = /<item key="code" value="([^"]+)"/.exec(dataContent);
    const nameMatch = /<item key="nameKr" value="([^"]+)"/.exec(dataContent);
    
    if (codeMatch && nameMatch) {
      codes[codeMatch[1]] = nameMatch[1];
    }
  }
  
  return codes;
}

async function fetchAllCodes(parentCode, depth = 0) {
  if (depth > 4) return {}; // 최대 깊이 제한
  
  const codes = await fetchCodes(parentCode);
  const allCodes = { ...codes };
  
  // 하위 코드도 재귀적으로 수집
  for (const code of Object.keys(codes)) {
    await sleep(100);
    const subCodes = await fetchAllCodes(code, depth + 1);
    Object.assign(allCodes, subCodes);
  }
  
  return allCodes;
}

async function main() {
  console.log('=== emuseum 코드 테이블 수집 ===\n');
  
  const codeTable = {};
  
  // 주요 코드 카테고리
  const categories = [
    { code: 'PS08', name: '재질' },
    { code: 'PS06', name: '시대/국적' },
    { code: 'PS09', name: '용도/분류' },
    { code: 'PS15', name: '크기범위' },
    { code: 'GL05', name: '출토지' },
  ];
  
  for (const cat of categories) {
    console.log(`📂 ${cat.name} (${cat.code}) 수집 중...`);
    const codes = await fetchAllCodes(cat.code);
    Object.assign(codeTable, codes);
    console.log(`  → ${Object.keys(codes).length}개 코드 수집됨`);
    await sleep(500);
  }
  
  // 저장
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(codeTable, null, 2));
  console.log(`\n✅ 총 ${Object.keys(codeTable).length}개 코드 저장됨`);
  console.log(`📁 ${OUTPUT_FILE}`);
  
  // 샘플 출력
  console.log('\n--- 샘플 ---');
  console.log('PS08001005:', codeTable['PS08001005']);
  console.log('PS06001:', codeTable['PS06001']);
}

main().catch(console.error);
