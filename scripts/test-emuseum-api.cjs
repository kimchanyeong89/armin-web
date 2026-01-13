/**
 * 국립중앙박물관 e뮤지엄 API 테스트 스크립트
 * 
 * KCISA API (문화공공데이터광장)에서 제공하는 유물 정보를 가져옵니다.
 * 총 334,187건의 유물 데이터가 있습니다.
 * 
 * 주의: 이 API는 이미지 URL을 제공하지 않습니다.
 * 이미지를 가져오려면 e뮤지엄 직접 API 키가 필요합니다.
 */

const fs = require('fs');
const path = require('path');

const SERVICE_KEY = 'cb7bbe5a-0a68-4d54-ba62-b2076c2edc32';
const BASE_URL = 'https://api.kcisa.kr/openapi/service/rest/meta/MPKreli';

async function fetchRelics(pageNo = 1, numOfRows = 100) {
    const url = `${BASE_URL}?serviceKey=${SERVICE_KEY}&numOfRows=${numOfRows}&pageNo=${pageNo}`;

    try {
        const response = await fetch(url, {
            headers: { 'Accept': 'application/json' }
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        return data;
    } catch (error) {
        console.error(`Error fetching page ${pageNo}:`, error.message);
        return null;
    }
}

async function testAPI() {
    console.log('🏛️ 국립중앙박물관 e뮤지엄 API 테스트\n');

    // 첫 페이지 가져오기
    console.log('📡 API 호출 중...');
    const result = await fetchRelics(1, 5);

    if (!result || result.response?.header?.resultCode !== '0000') {
        console.error('❌ API 호출 실패:', result?.response?.header?.resultMsg || 'Unknown error');
        return;
    }

    const { body } = result.response;
    const totalCount = parseInt(body.totalCount);
    const items = body.items?.item || [];

    console.log(`\n✅ API 호출 성공!`);
    console.log(`📊 총 유물 수: ${totalCount.toLocaleString()}건`);
    console.log(`📄 현재 페이지: ${body.pageNo}`);
    console.log(`📋 조회된 항목: ${items.length}건\n`);

    // 샘플 데이터 출력
    console.log('📝 샘플 데이터 (첫 3개):');
    console.log('─'.repeat(60));

    items.slice(0, 3).forEach((item, idx) => {
        console.log(`\n[${idx + 1}] ${item.title}`);
        console.log(`    시대: ${item.temporal || '미상'}`);
        console.log(`    재질: ${item.medium || '미상'}`);
        console.log(`    크기: ${item.extent || '미상'}`);
        console.log(`    국적: ${item.spatial || '미상'}`);
        console.log(`    분류: ${item.subDescription || '미상'}`);
        console.log(`    등록일: ${item.regDate}`);
    });

    console.log('\n' + '─'.repeat(60));

    // 필드 분석
    console.log('\n📋 응답 필드 목록:');
    const sampleItem = items[0];
    if (sampleItem) {
        Object.keys(sampleItem).forEach(key => {
            const value = sampleItem[key];
            const hasValue = value !== null && value !== undefined && value !== '';
            console.log(`  - ${key}: ${hasValue ? '✓' : '✗'} ${typeof value}`);
        });
    }

    // 페이지 수 계산
    const totalPages = Math.ceil(totalCount / 100);
    console.log(`\n📚 전체 페이지 수 (100건/페이지): ${totalPages.toLocaleString()} 페이지`);
    console.log(`⏱️ 예상 수집 시간 (1초/페이지): 약 ${Math.ceil(totalPages / 60)}시간`);

    // 중요 정보
    console.log('\n⚠️ 중요 정보:');
    console.log('   - 이 API는 이미지 URL을 제공하지 않습니다.');
    console.log('   - 유물 고유 ID가 포함되어 있지 않습니다.');
    console.log('   - 이미지와 상세정보를 얻으려면 e뮤지엄 직접 API 키가 필요합니다.');
    console.log('   - e뮤지엄 API: https://www.data.go.kr/data/3036708/openapi.do');
}

// 전체 수집 함수 (필요시 사용)
async function collectAllRelics(outputFile, maxPages = null) {
    console.log('🏛️ 전체 유물 데이터 수집 시작...\n');

    // 첫 페이지로 총 개수 확인
    const firstResult = await fetchRelics(1, 100);
    if (!firstResult || firstResult.response?.header?.resultCode !== '0000') {
        console.error('❌ 첫 페이지 호출 실패');
        return;
    }

    const totalCount = parseInt(firstResult.response.body.totalCount);
    const totalPages = Math.ceil(totalCount / 100);
    const pagesToFetch = maxPages ? Math.min(maxPages, totalPages) : totalPages;

    console.log(`📊 총 유물: ${totalCount.toLocaleString()}건`);
    console.log(`📄 수집할 페이지: ${pagesToFetch.toLocaleString()} / ${totalPages.toLocaleString()}\n`);

    const allItems = [];
    const startTime = Date.now();

    for (let page = 1; page <= pagesToFetch; page++) {
        const result = await fetchRelics(page, 100);

        if (result && result.response?.header?.resultCode === '0000') {
            const items = result.response.body.items?.item || [];
            allItems.push(...items);

            const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
            const progress = ((page / pagesToFetch) * 100).toFixed(1);
            process.stdout.write(`\r📥 페이지 ${page}/${pagesToFetch} (${progress}%) - ${allItems.length}건 수집됨 - ${elapsed}s`);
        } else {
            console.log(`\n⚠️ 페이지 ${page} 실패, 재시도...`);
            page--; // 재시도
            await new Promise(r => setTimeout(r, 2000));
        }

        // Rate limiting
        await new Promise(r => setTimeout(r, 200));
    }

    console.log('\n');

    // 저장
    const outputPath = path.join(__dirname, '..', 'public', 'data', outputFile);
    fs.writeFileSync(outputPath, JSON.stringify(allItems, null, 2), 'utf-8');
    console.log(`✅ 저장 완료: ${outputPath}`);
    console.log(`📊 총 수집: ${allItems.length.toLocaleString()}건`);

    return allItems;
}

// 실행
testAPI();

// 전체 수집 (주석 해제하여 사용)
// collectAllRelics('nmk-collection.json', 10); // 테스트: 10페이지만
