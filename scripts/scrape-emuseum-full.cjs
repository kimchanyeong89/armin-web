/**
 * 국립중앙박물관 e뮤지엄 전체 유물 스크래핑 스크립트
 * 
 * API 제공 정보:
 * - id: 유물 고유 ID
 * - nameKr: 한글명
 * - name: 원본명 (한자 등)
 * - imgUri: 고해상도 이미지 URL
 * - imgThumUriL: 대형 썸네일
 * - imgThumUriM: 중형 썸네일
 * - imgThumUriS: 소형 썸네일
 * - museumName2: 박물관명
 * - materialCode: 재질 코드
 * - nationalityCode: 국적 코드
 */

const fs = require('fs');
const path = require('path');

// API 설정
const SERVICE_KEY = 'd44723b6b598e8f13c9a93d5bcb488219b58fe60bec8d9c7af4ef7fcc199b349';
const BASE_URL = 'http://www.emuseum.go.kr/openapi';
const OUTPUT_DIR = path.join(__dirname, '..', 'public', 'data');

// 요청 간격 (ms) - Rate limiting 방지
const DELAY_MS = 300;

/**
 * 유물 목록 조회
 */
async function fetchRelicList(pageNo = 1, numOfRows = 100, options = {}) {
    const params = new URLSearchParams({
        serviceKey: SERVICE_KEY,
        pageNo: pageNo.toString(),
        numOfRows: numOfRows.toString(),
        ...options
    });

    const url = `${BASE_URL}/relic/list?${params}`;

    try {
        const response = await fetch(url, {
            headers: { 'Accept': 'application/json' }
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();

        if (data.resultCode !== '0000') {
            throw new Error(`API Error: ${data.resultCode} - ${data.resultMsg}`);
        }

        return data;
    } catch (error) {
        console.error(`Error fetching page ${pageNo}:`, error.message);
        return null;
    }
}

/**
 * 유물 상세 조회
 */
async function fetchRelicDetail(relicId) {
    const params = new URLSearchParams({
        serviceKey: SERVICE_KEY,
        id: relicId
    });

    const url = `${BASE_URL}/relic/detail?${params}`;

    try {
        const response = await fetch(url, {
            headers: { 'Accept': 'application/json' }
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();

        if (data.resultCode !== '0000') {
            throw new Error(`API Error: ${data.resultCode} - ${data.resultMsg}`);
        }

        return data;
    } catch (error) {
        console.error(`Error fetching detail ${relicId}:`, error.message);
        return null;
    }
}

/**
 * 데이터 정규화
 */
function normalizeRelic(item) {
    return {
        id: item.id,
        title: item.nameKr || item.name,
        titleOriginal: item.name,
        titleChinese: item.nameCn || null,
        museum: item.museumName2 || '국립중앙박물관',
        museumSection: item.museumName3 || null,
        relicNo: item.relicNo,
        indexWord: item.indexWord,
        // 이미지
        imageUrl: item.imgUri ? item.imgUri.replace(/&amp;/g, '&') : null,
        thumbnailLarge: item.imgThumUriL ? item.imgThumUriL.replace(/&amp;/g, '&') : null,
        thumbnailMedium: item.imgThumUriM ? item.imgThumUriM.replace(/&amp;/g, '&') : null,
        thumbnailSmall: item.imgThumUriS ? item.imgThumUriS.replace(/&amp;/g, '&') : null,
        // 메타데이터 코드
        museumCode: item.museumCode,
        nationalityCode: item.nationalityCode,
        materialCode: item.materialCode,
        purposeCode: item.purposeCode,
        // 기타
        glsv: item.glsv
    };
}

/**
 * API 상태 테스트
 */
async function testAPI() {
    console.log('🏛️ e뮤지엄 API 연결 테스트...\n');

    const result = await fetchRelicList(1, 1);

    if (!result) {
        console.error('❌ API 연결 실패');
        console.log('\n💡 가능한 원인:');
        console.log('   1. 인증키가 아직 서버에 동기화되지 않음 (1~2시간 대기)');
        console.log('   2. 인증키가 올바르지 않음');
        console.log('   3. 네트워크 문제');
        return false;
    }

    console.log('✅ API 연결 성공!');
    console.log(`📊 총 유물 수: ${result.totalCount?.toLocaleString() || 'Unknown'}건`);

    if (result.list && result.list.length > 0) {
        const sample = result.list[0];
        console.log('\n📝 샘플 데이터:');
        console.log(`   ID: ${sample.id}`);
        console.log(`   이름: ${sample.nameKr || sample.name}`);
        console.log(`   박물관: ${sample.museumName2}`);
        console.log(`   이미지: ${sample.imgUri ? '✓ 있음' : '✗ 없음'}`);
    }

    return true;
}

/**
 * 전체 유물 수집
 */
async function collectAllRelics(options = {}) {
    const {
        maxPages = null,
        numOfRows = 100,
        outputFile = 'nmk-emuseum-collection.json',
        museumCode = null  // 특정 박물관만 수집하려면 지정
    } = options;

    console.log('🏛️ 국립중앙박물관 e뮤지엄 전체 유물 수집\n');

    // 첫 페이지로 총 개수 확인
    const fetchOptions = museumCode ? { museumCode } : {};
    const firstResult = await fetchRelicList(1, numOfRows, fetchOptions);

    if (!firstResult) {
        console.error('❌ API 호출 실패. 인증키를 확인하세요.');
        return null;
    }

    const totalCount = firstResult.totalCount;
    const totalPages = Math.ceil(totalCount / numOfRows);
    const pagesToFetch = maxPages ? Math.min(maxPages, totalPages) : totalPages;

    console.log(`📊 총 유물: ${totalCount?.toLocaleString()}건`);
    console.log(`📄 총 페이지: ${totalPages?.toLocaleString()}페이지`);
    console.log(`🎯 수집할 페이지: ${pagesToFetch}페이지`);
    console.log(`⏱️ 예상 시간: 약 ${Math.ceil(pagesToFetch * DELAY_MS / 1000 / 60)}분\n`);

    const allRelics = [];
    const startTime = Date.now();
    let errorCount = 0;

    for (let page = 1; page <= pagesToFetch; page++) {
        const result = await fetchRelicList(page, numOfRows, fetchOptions);

        if (result && result.list) {
            const normalized = result.list.map(normalizeRelic);
            allRelics.push(...normalized);

            const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
            const progress = ((page / pagesToFetch) * 100).toFixed(1);
            const eta = ((pagesToFetch - page) * DELAY_MS / 1000 / 60).toFixed(1);

            process.stdout.write(`\r📥 ${page}/${pagesToFetch} (${progress}%) | ${allRelics.length.toLocaleString()}건 | ${elapsed}s | ETA: ${eta}분     `);
        } else {
            errorCount++;
            console.log(`\n⚠️ 페이지 ${page} 실패`);

            if (errorCount > 5) {
                console.log('\n❌ 연속 오류 발생. 중단합니다.');
                break;
            }

            // 재시도
            await new Promise(r => setTimeout(r, 2000));
            page--;
        }

        await new Promise(r => setTimeout(r, DELAY_MS));
    }

    console.log('\n');

    // 저장
    if (!fs.existsSync(OUTPUT_DIR)) {
        fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }

    const outputPath = path.join(OUTPUT_DIR, outputFile);
    fs.writeFileSync(outputPath, JSON.stringify(allRelics, null, 2), 'utf-8');

    const totalTime = ((Date.now() - startTime) / 1000 / 60).toFixed(1);

    console.log('✅ 수집 완료!');
    console.log(`📁 저장: ${outputPath}`);
    console.log(`📊 총 수집: ${allRelics.length.toLocaleString()}건`);
    console.log(`⏱️ 소요 시간: ${totalTime}분`);

    // 이미지 있는 항목 통계
    const withImages = allRelics.filter(r => r.imageUrl).length;
    console.log(`🖼️ 이미지 있음: ${withImages.toLocaleString()}건 (${((withImages / allRelics.length) * 100).toFixed(1)}%)`);

    return allRelics;
}

/**
 * 상세 정보 수집 (선택적)
 */
async function collectDetails(relicIds, outputFile = 'nmk-emuseum-details.json') {
    console.log(`\n🔍 상세 정보 수집: ${relicIds.length}건\n`);

    const details = [];
    const startTime = Date.now();

    for (let i = 0; i < relicIds.length; i++) {
        const id = relicIds[i];
        const result = await fetchRelicDetail(id);

        if (result && result.data) {
            details.push(result.data);
        }

        const progress = (((i + 1) / relicIds.length) * 100).toFixed(1);
        process.stdout.write(`\r🔍 ${i + 1}/${relicIds.length} (${progress}%)     `);

        await new Promise(r => setTimeout(r, DELAY_MS));
    }

    console.log('\n');

    const outputPath = path.join(OUTPUT_DIR, outputFile);
    fs.writeFileSync(outputPath, JSON.stringify(details, null, 2), 'utf-8');

    console.log(`✅ 상세 정보 저장: ${outputPath}`);
    return details;
}

// CLI
const args = process.argv.slice(2);
const command = args[0] || 'test';

switch (command) {
    case 'test':
        testAPI();
        break;

    case 'collect':
        const maxPages = args[1] ? parseInt(args[1]) : null;
        collectAllRelics({ maxPages });
        break;

    case 'sample':
        // 샘플 수집 (10페이지)
        collectAllRelics({
            maxPages: 10,
            outputFile: 'nmk-emuseum-sample.json'
        });
        break;

    default:
        console.log('사용법:');
        console.log('  node scrape-emuseum-full.cjs test     - API 연결 테스트');
        console.log('  node scrape-emuseum-full.cjs sample   - 샘플 수집 (1000건)');
        console.log('  node scrape-emuseum-full.cjs collect  - 전체 수집');
        console.log('  node scrape-emuseum-full.cjs collect 100  - 100페이지만 수집');
}
