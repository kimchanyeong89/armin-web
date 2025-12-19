/**
 * British Museum 스크래핑 결과 검증
 * 실행: node scripts/verify-british-museum.cjs
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const JSON_PATH = path.join(__dirname, '../public/data/british-museum-gac-collection.json');

async function checkImageUrl(url) {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => resolve(false), 5000);
    https.get(url, (res) => {
      clearTimeout(timeout);
      resolve(res.statusCode === 200);
    }).on('error', () => {
      clearTimeout(timeout);
      resolve(false);
    });
  });
}

async function verify() {
  console.log('='.repeat(50));
  console.log('🔍 British Museum 스크래핑 결과 검증');
  console.log('='.repeat(50));

  // 1. JSON 파일 존재 확인
  if (!fs.existsSync(JSON_PATH)) {
    console.log('❌ JSON 파일이 없습니다:', JSON_PATH);
    return;
  }

  // 2. JSON 파싱
  let data;
  try {
    data = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8'));
  } catch (e) {
    console.log('❌ JSON 파싱 실패:', e.message);
    return;
  }

  const objects = data.objects || [];
  console.log(`\n📊 기본 통계:`);
  console.log(`   총 작품 수: ${objects.length}개`);
  console.log(`   2D 작품: ${objects.filter(o => o.type === '2D').length}개`);
  console.log(`   3D 작품: ${objects.filter(o => o.type === '3D').length}개`);
  console.log(`   미분류: ${objects.filter(o => o.type === 'unknown').length}개`);

  // 3. 필수 필드 체크
  console.log(`\n🔎 데이터 품질:`);
  const noTitle = objects.filter(o => !o.title).length;
  const noImage = objects.filter(o => !o.image).length;
  const noArtist = objects.filter(o => !o.artist || o.artist === 'Unknown').length;
  const noYear = objects.filter(o => !o.year).length;

  console.log(`   제목 없음: ${noTitle}개`);
  console.log(`   이미지 없음: ${noImage}개`);
  console.log(`   작가 미상: ${noArtist}개`);
  console.log(`   년도 없음: ${noYear}개`);

  // 4. 샘플 이미지 URL 체크 (5개만)
  console.log(`\n🖼️  이미지 URL 샘플 체크 (5개)...`);
  const sampleObjects = objects.slice(0, 5);
  for (const obj of sampleObjects) {
    const ok = await checkImageUrl(obj.image);
    console.log(`   ${ok ? '✅' : '❌'} ${obj.title?.substring(0, 40)}...`);
  }

  // 5. 샘플 데이터 출력
  console.log(`\n📝 샘플 데이터 (처음 3개):`);
  objects.slice(0, 3).forEach((o, i) => {
    console.log(`\n   [${i + 1}] ${o.title}`);
    console.log(`       작가: ${o.artist}`);
    console.log(`       년도: ${o.year}`);
    console.log(`       타입: ${o.type}`);
  });

  console.log(`\n${'='.repeat(50)}`);
  console.log(`✅ 검증 완료! 총 ${objects.length}개 작품`);
  console.log(`${'='.repeat(50)}`);
}

verify();
