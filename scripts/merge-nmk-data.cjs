/**
 * 국립중앙박물관 데이터 병합
 * 기존 데이터와 누락 페이지 데이터를 합침
 */

const fs = require('fs');
const path = require('path');

const MAIN_FILE = path.join(__dirname, '../public/data/national-museum-korea.json');
const MISSING_FILE = path.join(__dirname, '../public/data/national-museum-korea-missing.json');
const OUTPUT_FILE = path.join(__dirname, '../public/data/national-museum-korea.json');

console.log('📂 기존 데이터 로드 중...');
const mainData = JSON.parse(fs.readFileSync(MAIN_FILE, 'utf8'));
console.log(`  기존 작품 수: ${mainData.length}`);

console.log('📂 누락 페이지 데이터 로드 중...');
const missingData = JSON.parse(fs.readFileSync(MISSING_FILE, 'utf8'));
console.log(`  추가 작품 수: ${missingData.length}`);

// ID 기준 중복 제거
const existingIds = new Set(mainData.map(item => item.id));
const newItems = missingData.filter(item => !existingIds.has(item.id));

console.log(`  신규 작품 수 (중복 제외): ${newItems.length}`);

// 병합
const merged = [...mainData, ...newItems];
console.log(`✅ 병합 완료: ${merged.length}개`);

// 저장
fs.writeFileSync(OUTPUT_FILE, JSON.stringify(merged, null, 2));
console.log(`💾 저장 완료: ${OUTPUT_FILE}`);

// 통계
console.log('\n📊 최종 통계:');
console.log(`  총 작품 수: ${merged.length}`);
console.log(`  추가된 작품: ${newItems.length}`);
