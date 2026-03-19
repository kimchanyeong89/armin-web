
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../public/data');
const PROGRESS_FILE = path.join(__dirname, '../.embedding-progress-local.json');

async function audit() {
    console.log("🔍 [Manifest 기반] 데이터 정밀 조사 시작...");

    // 1. Manifest 로드
    const MANIFEST_FILE = path.join(DATA_DIR, 'search-manifest.json');
    if (!fs.existsSync(MANIFEST_FILE)) {
        console.error("❌ search-manifest.json 없음!");
        return;
    }

    const manifest = JSON.parse(fs.readFileSync(MANIFEST_FILE, 'utf-8'));
    console.log(`📂 Manifest 정의 청크 수: ${manifest.chunks.length}`);

    let totalItems = 0;
    let koreanItems = 0;
    let targetItems = 0;

    // 한국 박물관 키워드 (스크립트와 동일)
    const KOREAN_MUSEUMS = ["국립중앙박물관", "국립경주박물관", "국립부여박물관", "National Museum of Korea", "Gyeongju National Museum", "Buyeo National Museum"];

    for (const chunkFile of manifest.chunks) {
        try {
            const filePath = path.join(DATA_DIR, chunkFile);
            if (!fs.existsSync(filePath)) {
                console.warn(`⚠️ 누락된 청크 파일: ${chunkFile}`);
                continue;
            }

            const content = fs.readFileSync(filePath, 'utf-8');
            const data = JSON.parse(content);
            const items = Array.isArray(data) ? data : (data.items || []);
            const flatItems = (items.length > 0 && Array.isArray(items[0])) ? items.flat() : items;

            for (const item of flatItems) {
                totalItems++;
                const m = item.m || '';

                let isKorean = false;
                if (KOREAN_MUSEUMS.includes(m)) isKorean = true;
                if (!isKorean && KOREAN_MUSEUMS.some(k => m.includes(k))) isKorean = true;

                if (isKorean) {
                    koreanItems++;
                } else {
                    targetItems++;
                }
            }
        } catch (e) {
            console.error(`❌ 청크 읽기 실패: ${chunkFile}`, e.message);
        }
    }

    // 2. 진행 상황 파일 분석 & 한국 박물관 포함 여부 체크
    let completedCount = 0;
    let leakedKoreanCount = 0;

    try {
        if (fs.existsSync(PROGRESS_FILE)) {
            const progress = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf-8'));
            const processedIds = new Set(progress.processed_ids || []);
            completedCount = processedIds.size;
            console.log(`📄 진행 파일 Load 완료 (IDs: ${completedCount})`);

            const KOREAN_ID_KEYWORDS = ['national-museum-of-korea', 'gyeongju', 'buyeo'];

            for (const id of processedIds) {
                const idLower = String(id).toLowerCase();
                for (const k of KOREAN_ID_KEYWORDS) {
                    if (idLower.includes(k)) {
                        leakedKoreanCount++;
                        // console.log(`  - Leaked ID: ${id}`); // 디버깅용
                        break; // 한 번 발견되면 카운트하고 다음 ID로
                    }
                }
            }

        } else {
            console.warn("⚠️ 진행 상황 파일(.embedding-progress-local.json)이 없습니다.");
        }
    } catch (e) {
        console.error("❌ 진행 상황 파일 읽기 실패", e.message);
    }

    const remainingCount = Math.max(0, targetItems - completedCount);

    console.log("\n📊 [최종 분석 보고서]");
    console.log("=========================================");
    console.log(`1. 📚 전체 데이터 총량: ${totalItems.toLocaleString()} 개`);
    console.log(`2. 🇰🇷 제외된 한국 박물관(중앙/경주/부여) 데이터: ${koreanItems.toLocaleString()} 개`);
    console.log(`3. 🎯 임베딩 대상(서양+서울시립 등): ${targetItems.toLocaleString()} 개`);
    console.log("-----------------------------------------");
    console.log(`4. ✅ 현재 임베딩 완료된 수(ID 기준): ${completedCount.toLocaleString()} 개`);
    console.log(`   🚨 완료된 데이터 중 한국 박물관 이름 포함: ${leakedKoreanCount.toLocaleString()} 개`);
    if (leakedKoreanCount === 0) {
        console.log(`   ✨ 한국 박물관 데이터는 완벽하게 제외되었습니다.`);
    }
    console.log(`5. ⏳ 남은 작업 수: ${remainingCount.toLocaleString()} 개`);
    console.log("=========================================");
}

audit();
