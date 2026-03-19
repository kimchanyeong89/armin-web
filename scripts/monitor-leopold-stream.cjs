const fs = require('fs');
const path = require('path');

const PROGRESS_FILE = path.join(__dirname, '../downloads/leopold-museum-parallel-progress.json');

console.log('🚀 Leopold Museum 수집 현황 모니터링 시작...');
console.log('새로운 작품이 수집될 때마다 표시됩니다.\n');

let lastCount = -1; // -1로 초기화하여 처음에 무조건 출력

setInterval(() => {
  if (fs.existsSync(PROGRESS_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
      const artworks = data.artworks || [];
      const count = artworks.length;
      
      if (count > lastCount) {
        const diff = lastCount === -1 ? count : count - lastCount; // 처음에 전체 개수 표시
        const lastArt = artworks[artworks.length - 1] || { name: '없음' };
        const timestamp = new Date().toLocaleTimeString('ko-KR');
        
        if (lastCount === -1) {
            console.log(`[${timestamp}] 📊 현재 총 ${count}개 수집되어 있습니다. (계속 수집 중...)`);
        } else {
            console.log(`[${timestamp}] ✅ ${count}개 수집됨 (+${diff}) | ${lastArt.name.substring(0, 40)}...`);
        }
        lastCount = count;
      }
    } catch (e) {
      // 읽기 에러 무시
    }
  }
}, 1000);
