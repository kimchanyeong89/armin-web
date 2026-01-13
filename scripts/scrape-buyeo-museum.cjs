/**
 * 국립부여박물관 스크래핑 (e뮤지엄 API) - 초고속 버전
 * 
 * 전략:
 * 1. 전체 목록 API를 빠르게 스캔하여 부여박물관 시작/종료 페이지 찾기
 * 2. 목록 병렬 수집 (10페이지 동시)
 * 3. 상세 정보 병렬 수집 (50개 동시)
 * 4. 파트별로 분할 저장 (메모리 효율화)
 */

const fs = require('fs');
const path = require('path');

const API_KEY = 'd44723b6b598e8f13c9a93d5bcb488219b58fe60bec8d9c7af4ef7fcc199b349';
const BASE_URL = 'http://www.emuseum.go.kr/openapi';
const PAGE_SIZE = 100;

// 국립부여박물관 코드
const MUSEUM_CODE_PREFIX = 'PS01001003';
const MUSEUM_NAME = '국립부여박물관';

// 병렬 처리 설정 (초고속)
const PARALLEL_PAGES = 10;       // 동시에 10페이지 목록 수집
const PARALLEL_DETAILS = 50;    // 동시에 50개 상세 API 호출
const PAGE_BATCH_DELAY = 200;   // 페이지 배치 간 200ms
const DETAIL_BATCH_DELAY = 50;  // 상세 배치 간 50ms

// 파일 경로
const DATA_DIR = path.join(__dirname, '../public/data');
const DOWNLOADS_DIR = path.join(__dirname, '../downloads');
const LOG_FILE = path.join(DOWNLOADS_DIR, 'buyeo-scrape.log');
const PROGRESS_FILE = path.join(DOWNLOADS_DIR, 'buyeo-progress.json');
const ITEMS_PER_PART = 5000;  // 파트당 5000개

// 전역 변수
let totalCollected = 0;
let startTime = Date.now();

// 디렉토리 생성
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(DOWNLOADS_DIR)) fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });

function log(message) {
    const timestamp = new Date().toISOString();
    const line = `[${timestamp}] ${message}`;
    console.log(line);
    fs.appendFileSync(LOG_FILE, line + '\n');
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// 진행 상황 저장
function saveProgress(phase, data) {
    const elapsed = (Date.now() - startTime) / 1000;
    fs.writeFileSync(PROGRESS_FILE, JSON.stringify({
        phase,
        ...data,
        elapsedSeconds: Math.round(elapsed),
        lastUpdate: new Date().toISOString()
    }, null, 2));
}

// 진행 상황 로드
function loadProgress() {
    if (fs.existsSync(PROGRESS_FILE)) {
        try {
            return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
        } catch (e) { }
    }
    return null;
}

// API 호출 (재시도 포함)
async function fetchJSON(url, retries = 3) {
    for (let i = 0; i < retries; i++) {
        try {
            const response = await fetch(url, {
                headers: { 'Accept': 'application/json' }
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const text = await response.text();
            if (text.startsWith('<?xml') || text.startsWith('<')) {
                throw new Error('XML response received');
            }

            return JSON.parse(text);
        } catch (error) {
            if (i < retries - 1) {
                await sleep(1000 * (i + 1));
            } else {
                throw error;
            }
        }
    }
}

// 목록 페이지 가져오기
async function fetchPage(pageNo) {
    const url = `${BASE_URL}/relic/list?serviceKey=${API_KEY}&numOfRows=${PAGE_SIZE}&pageNo=${pageNo}`;
    return fetchJSON(url);
}

// 상세 정보 가져오기
async function fetchDetail(relicId) {
    const url = `${BASE_URL}/relic/detail?serviceKey=${API_KEY}&id=${relicId}`;
    return fetchJSON(url);
}

// 아트워크 데이터 변환
function transformArtwork(item, detail = null) {
    const title = item.nameKr || item.name || item.nameCn || '';

    const artwork = {
        id: item.id,
        title: title,
        titleHanja: item.name || '',
        titleChinese: item.nameCn || '',
        artist: 'Unknown',
        museum: item.museumName2 || MUSEUM_NAME,
        museumCode: item.museumCode,
        inventoryNumber: `${item.relicNo || ''}${item.relicSubNo && item.relicSubNo !== '00000' ? '-' + item.relicSubNo : ''}`,
        imageUrl: item.imgUri || '',
        thumbnailUrl: item.imgThumUriL || item.imgThumUriM || item.imgThumUriS || '',
        sourceUrl: `https://www.emuseum.go.kr/detail?relicId=${item.id}`,
    };

    if (detail) {
        artwork.description = detail.desc || '';
        artwork.dimensions = detail.sizeInfo || '';
        artwork.dimensionRange = detail.sizeRangeName || '';
        artwork.indexWord = detail.indexWord || '';
        artwork.nationality = detail.nationalityName1 || '';
        artwork.period = detail.nationalityName2 || '';
        artwork.material = detail.materialName1 || '';
        artwork.materialDetail = detail.materialName2 || '';
        artwork.category = detail.purposeName1 || '';
        artwork.subcategory = detail.purposeName2 || '';
        artwork.genre = detail.purposeName3 || '';
        artwork.subgenre = detail.purposeName4 || '';
        artwork.excavationSite = detail.placeLandName1 ?
            `${detail.placeLandName1}${detail.placeLandName2 ? ' ' + detail.placeLandName2 : ''}` : '';

        // 여러 이미지
        if (detail.imageList && detail.imageList.list) {
            artwork.images = detail.imageList.list.map(img => ({
                url: img.imgUri,
                thumbnailL: img.imgThumUriL,
                thumbnailM: img.imgThumUriM,
                thumbnailS: img.imgThumUriS,
                order: img.imgOrder
            }));
        }
    }

    return artwork;
}

// 1단계: 부여박물관 페이지 범위 찾기
async function findBuyeoPageRange() {
    log('═══════════════════════════════════════════════════════════');
    log('  1단계: 부여박물관 페이지 범위 스캔');
    log('═══════════════════════════════════════════════════════════');

    // 이진 탐색으로 시작 페이지 찾기
    // 경주박물관: 2080~4200, 중앙박물관: 1~2080
    // 부여박물관은 4200 이후 예상

    let startPage = null;
    let endPage = null;

    // 먼저 대략적인 위치 찾기 (경주 이후)
    const testPages = [4200, 4500, 5000, 5500, 6000, 6500, 7000];

    log('📍 부여박물관 시작 위치 탐색 중...');

    for (const testPage of testPages) {
        try {
            const data = await fetchPage(testPage);
            const items = data.list || [];
            const buyeoItems = items.filter(i => i.museumCode && i.museumCode.startsWith(MUSEUM_CODE_PREFIX));

            if (buyeoItems.length > 0) {
                log(`  페이지 ${testPage}: ${buyeoItems.length}개 부여박물관 발견`);
                // 시작점 찾기 위해 역방향 탐색
                startPage = testPage;
                break;
            } else {
                log(`  페이지 ${testPage}: 부여박물관 없음`);
            }
            await sleep(300);
        } catch (e) {
            log(`  페이지 ${testPage} 오류: ${e.message}`);
        }
    }

    if (!startPage) {
        // 더 넓은 범위 탐색
        log('📍 더 넓은 범위 탐색...');
        for (let page = 7500; page <= 10000; page += 500) {
            try {
                const data = await fetchPage(page);
                const items = data.list || [];
                const buyeoItems = items.filter(i => i.museumCode && i.museumCode.startsWith(MUSEUM_CODE_PREFIX));

                if (buyeoItems.length > 0) {
                    log(`  페이지 ${page}: ${buyeoItems.length}개 부여박물관 발견!`);
                    startPage = page;
                    break;
                }
                await sleep(300);
            } catch (e) { }
        }
    }

    if (!startPage) {
        log('❌ 부여박물관 데이터를 찾을 수 없습니다.');
        return null;
    }

    // 정확한 시작 페이지 찾기 (역방향 이진 탐색)
    log('📍 정확한 시작 페이지 탐색...');
    let low = startPage - 500;
    let high = startPage;

    while (low < high) {
        const mid = Math.floor((low + high) / 2);
        try {
            const data = await fetchPage(mid);
            const items = data.list || [];
            const buyeoItems = items.filter(i => i.museumCode && i.museumCode.startsWith(MUSEUM_CODE_PREFIX));

            if (buyeoItems.length > 0) {
                high = mid;
            } else {
                low = mid + 1;
            }
            await sleep(200);
        } catch (e) {
            low = mid + 1;
        }
    }
    startPage = low;

    // 종료 페이지 찾기
    log('📍 종료 페이지 탐색...');
    endPage = startPage;
    let consecutiveEmpty = 0;

    for (let page = startPage + 600; page <= startPage + 1000; page += 50) {
        try {
            const data = await fetchPage(page);
            const items = data.list || [];
            const buyeoItems = items.filter(i => i.museumCode && i.museumCode.startsWith(MUSEUM_CODE_PREFIX));

            if (buyeoItems.length > 0) {
                endPage = page;
                consecutiveEmpty = 0;
                log(`  페이지 ${page}: ${buyeoItems.length}개`);
            } else {
                consecutiveEmpty++;
                if (consecutiveEmpty >= 3) {
                    log(`  페이지 ${page}: 비어있음 (${consecutiveEmpty}회 연속)`);
                    break;
                }
            }
            await sleep(200);
        } catch (e) { }
    }

    // 정확한 종료 페이지 확인
    for (let page = endPage; page <= endPage + 100; page += 10) {
        try {
            const data = await fetchPage(page);
            const items = data.list || [];
            const buyeoItems = items.filter(i => i.museumCode && i.museumCode.startsWith(MUSEUM_CODE_PREFIX));

            if (buyeoItems.length > 0) {
                endPage = page;
            }
            await sleep(200);
        } catch (e) { }
    }

    log(`✅ 부여박물관 페이지 범위: ${startPage} ~ ${endPage} (약 ${(endPage - startPage + 1) * 100}개 예상)`);

    return { startPage, endPage };
}

// 2단계: 목록 병렬 수집
async function collectListItems(startPage, endPage) {
    log('═══════════════════════════════════════════════════════════');
    log('  2단계: 목록 병렬 수집');
    log('═══════════════════════════════════════════════════════════');

    const allItems = [];
    const totalPages = endPage - startPage + 1;

    for (let batchStart = startPage; batchStart <= endPage; batchStart += PARALLEL_PAGES) {
        const batchEnd = Math.min(batchStart + PARALLEL_PAGES - 1, endPage);
        const pagePromises = [];

        for (let page = batchStart; page <= batchEnd; page++) {
            pagePromises.push(
                fetchPage(page).then(data => {
                    const items = data.list || [];
                    return items.filter(i => i.museumCode && i.museumCode.startsWith(MUSEUM_CODE_PREFIX));
                }).catch(() => [])
            );
        }

        const results = await Promise.all(pagePromises);
        const batchItems = results.flat();
        allItems.push(...batchItems);

        const progress = Math.round((batchEnd - startPage + 1) / totalPages * 100);
        const speed = allItems.length / ((Date.now() - startTime) / 1000);

        process.stdout.write(`\r  📥 페이지 ${batchEnd}/${endPage} (${progress}%) | 수집: ${allItems.length.toLocaleString()}개 | ${speed.toFixed(1)}/초`);

        await sleep(PAGE_BATCH_DELAY);
    }

    console.log('');
    log(`✅ 목록 수집 완료: ${allItems.length.toLocaleString()}개`);

    return allItems;
}

// 3단계: 상세 정보 병렬 수집
async function collectDetails(items) {
    log('═══════════════════════════════════════════════════════════');
    log('  3단계: 상세 정보 병렬 수집');
    log('═══════════════════════════════════════════════════════════');

    const artworks = [];
    const total = items.length;
    let detailsFetched = 0;
    let errorCount = 0;

    // 배치로 처리
    for (let i = 0; i < total; i += PARALLEL_DETAILS) {
        const batch = items.slice(i, i + PARALLEL_DETAILS);

        const detailPromises = batch.map(async (item) => {
            try {
                const detail = await fetchDetail(item.id);
                detailsFetched++;
                return transformArtwork(item, detail);
            } catch (e) {
                errorCount++;
                // 상세 실패시 기본 정보로
                return transformArtwork(item, null);
            }
        });

        const batchArtworks = await Promise.all(detailPromises);
        artworks.push(...batchArtworks);

        const progress = Math.round(artworks.length / total * 100);
        const elapsed = (Date.now() - startTime) / 1000;
        const speed = artworks.length / elapsed;
        const eta = Math.round((total - artworks.length) / speed / 60);

        process.stdout.write(`\r  🔍 ${artworks.length.toLocaleString()}/${total.toLocaleString()} (${progress}%) | ${speed.toFixed(1)}/초 | ETA: ${eta}분 | 오류: ${errorCount}`);

        // 진행 중간 저장
        if (artworks.length % 10000 === 0) {
            saveProgress('details', {
                total,
                collected: artworks.length,
                detailsFetched,
                errorCount
            });
        }

        await sleep(DETAIL_BATCH_DELAY);
    }

    console.log('');
    log(`✅ 상세 정보 수집 완료: ${artworks.length.toLocaleString()}개 (상세: ${detailsFetched}, 오류: ${errorCount})`);

    return artworks;
}

// 4단계: 파트별 저장
function saveInParts(artworks) {
    log('═══════════════════════════════════════════════════════════');
    log('  4단계: 파트별 저장');
    log('═══════════════════════════════════════════════════════════');

    const totalParts = Math.ceil(artworks.length / ITEMS_PER_PART);

    for (let part = 1; part <= totalParts; part++) {
        const startIdx = (part - 1) * ITEMS_PER_PART;
        const endIdx = Math.min(part * ITEMS_PER_PART, artworks.length);
        const partItems = artworks.slice(startIdx, endIdx);

        const filename = `buyeo-museum-part${part}.json`;
        const filepath = path.join(DATA_DIR, filename);

        fs.writeFileSync(filepath, JSON.stringify(partItems));
        log(`  💾 Part ${part}: ${partItems.length.toLocaleString()}개 → ${filename}`);
    }

    // 전체 메타 정보 저장
    const meta = {
        museum: MUSEUM_NAME,
        museumCode: MUSEUM_CODE_PREFIX,
        totalArtworks: artworks.length,
        parts: totalParts,
        itemsPerPart: ITEMS_PER_PART,
        lastUpdate: new Date().toISOString()
    };

    fs.writeFileSync(path.join(DATA_DIR, 'buyeo-museum-meta.json'), JSON.stringify(meta, null, 2));
    log(`  📋 메타 정보 저장: buyeo-museum-meta.json`);

    return totalParts;
}

// 메인 함수
async function main() {
    log('');
    log('═══════════════════════════════════════════════════════════');
    log(`  🏛️  ${MUSEUM_NAME} 스크래핑 시작`);
    log('  초고속 병렬 처리 모드');
    log('═══════════════════════════════════════════════════════════');
    log(`  병렬 페이지: ${PARALLEL_PAGES} | 병렬 상세: ${PARALLEL_DETAILS}`);
    log('');

    // 이전 진행 상황 확인
    const progress = loadProgress();

    let pageRange;
    let items = [];

    // 1단계: 페이지 범위 찾기 (또는 복원)
    if (progress && progress.phase === 'list_done' && progress.items) {
        log('♻️  이전 진행 복원: 목록 수집 완료 상태');
        items = progress.items;
    } else {
        pageRange = await findBuyeoPageRange();

        if (!pageRange) {
            log('❌ 페이지 범위 찾기 실패');
            process.exit(1);
        }

        // 2단계: 목록 수집
        items = await collectListItems(pageRange.startPage, pageRange.endPage);

        // 진행 저장
        saveProgress('list_done', {
            pageRange,
            itemCount: items.length,
            items: items.slice(0, 100)  // 복원용 샘플만 저장
        });

        // 임시 전체 목록 저장
        fs.writeFileSync(
            path.join(DOWNLOADS_DIR, 'buyeo-items-temp.json'),
            JSON.stringify(items)
        );
        log('📦 임시 목록 저장: buyeo-items-temp.json');
    }

    // 임시 파일에서 전체 목록 로드
    if (items.length < 100 && fs.existsSync(path.join(DOWNLOADS_DIR, 'buyeo-items-temp.json'))) {
        items = JSON.parse(fs.readFileSync(path.join(DOWNLOADS_DIR, 'buyeo-items-temp.json'), 'utf8'));
        log(`📦 임시 목록 로드: ${items.length.toLocaleString()}개`);
    }

    // 3단계: 상세 정보 수집
    const artworks = await collectDetails(items);

    // 4단계: 파트별 저장
    const totalParts = saveInParts(artworks);

    // 완료
    const elapsed = Math.round((Date.now() - startTime) / 1000 / 60);

    log('');
    log('═══════════════════════════════════════════════════════════');
    log('  ✅ 스크래핑 완료!');
    log('═══════════════════════════════════════════════════════════');
    log(`  총 수집: ${artworks.length.toLocaleString()}개`);
    log(`  파트 파일: ${totalParts}개`);
    log(`  소요 시간: ${elapsed}분`);
    log(`  평균 속도: ${(artworks.length / (elapsed * 60)).toFixed(1)}/초`);
    log('');

    // 통계
    const stats = {
        byCategory: {},
        byPeriod: {},
        withImage: 0,
        withDetail: 0
    };

    artworks.forEach(a => {
        stats.byCategory[a.category || '미분류'] = (stats.byCategory[a.category || '미분류'] || 0) + 1;
        stats.byPeriod[a.period || '미상'] = (stats.byPeriod[a.period || '미상'] || 0) + 1;
        if (a.imageUrl || a.thumbnailUrl) stats.withImage++;
        if (a.description || a.material) stats.withDetail++;
    });

    log('📊 분류별 통계:');
    Object.entries(stats.byCategory)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .forEach(([cat, cnt]) => log(`  ${cat}: ${cnt.toLocaleString()}`));

    log('');
    log('📊 시대별 통계:');
    Object.entries(stats.byPeriod)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .forEach(([period, cnt]) => log(`  ${period}: ${cnt.toLocaleString()}`));

    log('');
    log(`📷 이미지 있음: ${stats.withImage.toLocaleString()}개 (${(stats.withImage / artworks.length * 100).toFixed(1)}%)`);
    log(`📝 상세 정보 있음: ${stats.withDetail.toLocaleString()}개 (${(stats.withDetail / artworks.length * 100).toFixed(1)}%)`);

    // 진행 파일 정리
    if (fs.existsSync(PROGRESS_FILE)) {
        fs.unlinkSync(PROGRESS_FILE);
    }
    if (fs.existsSync(path.join(DOWNLOADS_DIR, 'buyeo-items-temp.json'))) {
        fs.unlinkSync(path.join(DOWNLOADS_DIR, 'buyeo-items-temp.json'));
    }
}

main().catch(error => {
    log(`❌ 치명적 오류: ${error.message}`);
    console.error(error);
    process.exit(1);
});
