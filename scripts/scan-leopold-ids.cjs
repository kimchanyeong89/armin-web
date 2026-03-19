/**
 * Leopold Museum High-Speed ID Scanner
 * 빠르게 유효한 ID만 식별하여 목록 생성
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const https = require('https');

const OUTPUT_FILE = path.join(__dirname, '../downloads/leopold-valid-ids.json');
const LOG_FILE = path.join(__dirname, '../downloads/leopold-scan.log');

// 로깅 설정
function log(message) {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] ${message}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + '\n');
}

// Axios 인스턴스 설정 (타임아웃, 리다이렉트 금지)
const client = axios.create({
  timeout: 5000,
  maxRedirects: 0, // 리다이렉트를 따라가지 않음 (301/302 감지 위해)
  validateStatus: status => status < 500, // 404 등도 에러로 처리하지 않음
  httpsAgent: new https.Agent({ keepAlive: true })
});

const MAX_ID = 100000; // 범위를 10만까지 확장
const CONCURRENCY = 50; // 동시 요청 수
const validIds = [];
let checkedCount = 0;

// 기존 데이터 로드 (중단된 경우 이어하기)
if (fs.existsSync(OUTPUT_FILE)) {
  try {
    const data = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf8'));
    validIds.push(...data.ids);
    log(`🔄 기존 데이터 로드: ${validIds.length}개 유효 ID`);
  } catch (e) {
    log('⚠️ 기존 데이터 로드 실패');
  }
}

async function checkId(id) {
  const url = `https://onlinecollection.leopoldmuseum.org/en/object/${id}`;
  try {
    const response = await client.get(url);
    
    // 301/302 리다이렉트: 유효한 ID (상세 페이지로 이동됨)
    if (response.status === 301 || response.status === 302) {
      return { id, valid: true, status: response.status, url: response.headers.location };
    }
    
    // 200 OK: 내용을 확인해야 함
    if (response.status === 200) {
      const data = response.data;
      if (typeof data === 'string') {
        if (data.includes('Seite nicht gefunden') || data.includes('Page not found')) {
          return { id, valid: false, status: 200, reason: 'Not Found Content' };
        }
        // "Object data"가 있거나 h1이 유효한지 체크
        if (data.includes('Object data') || data.includes('h1')) {
           return { id, valid: true, status: 200 };
        }
      }
    }
    
    return { id, valid: false, status: response.status };
    
  } catch (error) {
    // 타임아웃 등 에러
    return { id, valid: false, error: error.message };
  }
}

async function worker(idIterator) {
  for (const id of idIterator) {
    const result = await checkId(id);
    checkedCount++;
    
    if (result.valid) {
      validIds.push(result.id);
      process.stdout.write(`\r✅ 발견: ${validIds.length}개 / 진행: ${checkedCount} (ID: ${result.id})   `);
    } else {
      if (checkedCount % 100 === 0) {
        process.stdout.write(`\r🔍 스캔 중... 발견: ${validIds.length}개 / 진행: ${checkedCount} (ID: ${id})   `);
      }
    }
    
    // 주기적 저장
    if (validIds.length % 50 === 0) {
      save();
    }
  }
}

function save() {
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify({
    timestamp: new Date().toISOString(),
    count: validIds.length,
    ids: validIds.sort((a, b) => a - b)
  }, null, 2));
}

async function main() {
  log('🚀 Leopold Museum 고속 ID 스캔 시작...');
  log(`목표 범위: 1 ~ ${MAX_ID}`);
  
  const idsToScan = [];
  const existingIds = new Set(validIds);
  
  for (let i = 1; i <= MAX_ID; i++) {
    if (!existingIds.has(i)) {
      idsToScan.push(i);
    }
  }
  
  log(`스캔 대상: ${idsToScan.length}개 ID`);
  
  // 제너레이터 생성
  function* idGenerator() {
    for (const id of idsToScan) {
      yield id;
    }
  }
  
  const iterator = idGenerator();
  const workers = [];
  
  for (let i = 0; i < CONCURRENCY; i++) {
    workers.push(worker(iterator));
  }
  
  await Promise.all(workers);
  
  save();
  log(`\n✨ 스캔 완료! 총 ${validIds.length}개 유효 ID 발견`);
}

main().catch(console.error);
