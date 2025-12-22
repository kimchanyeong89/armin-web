/**
 * MAM 이미지 URL 확장자 수정
 * .jpg가 404/415이면 .JPG로 시도
 */

const fs = require('fs');
const https = require('https');

const DATA_FILE = './public/data/mam-painting-collection.json';
const PARALLEL = 20;

function checkUrl(url) {
  return new Promise((resolve) => {
    const req = https.request(url, { method: 'HEAD', timeout: 5000 }, (res) => {
      resolve({ url, status: res.statusCode });
    });
    req.on('error', () => resolve({ url, status: 0 }));
    req.on('timeout', () => { req.destroy(); resolve({ url, status: 0 }); });
    req.end();
  });
}

async function main() {
  const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
  
  console.log(`총 ${data.objects.length}개 이미지 확인 중...`);
  
  let fixedCount = 0;
  let errorCount = 0;
  
  for (let i = 0; i < data.objects.length; i += PARALLEL) {
    const batch = data.objects.slice(i, i + PARALLEL);
    
    const results = await Promise.all(batch.map(async (obj) => {
      if (!obj.image) return { obj, fixed: false };
      
      // 현재 URL 확인
      const check = await checkUrl(obj.image);
      
      if (check.status === 200) {
        return { obj, fixed: false };
      }
      
      // 실패하면 대소문자 바꿔서 시도
      let altUrl;
      if (obj.image.endsWith('.jpg')) {
        altUrl = obj.image.replace(/\.jpg$/, '.JPG');
      } else if (obj.image.endsWith('.JPG')) {
        altUrl = obj.image.replace(/\.JPG$/, '.jpg');
      }
      
      if (altUrl) {
        const altCheck = await checkUrl(altUrl);
        if (altCheck.status === 200) {
          obj.image = altUrl;
          return { obj, fixed: true };
        }
      }
      
      return { obj, fixed: false, error: true };
    }));
    
    results.forEach(r => {
      if (r.fixed) fixedCount++;
      if (r.error) errorCount++;
    });
    
    process.stdout.write(`\r${i + batch.length}/${data.objects.length} 확인됨, ${fixedCount}개 수정됨`);
  }
  
  // 저장
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  
  console.log(`\n\n완료!`);
  console.log(`  - 수정된 URL: ${fixedCount}개`);
  console.log(`  - 여전히 오류: ${errorCount}개`);
}

main();
