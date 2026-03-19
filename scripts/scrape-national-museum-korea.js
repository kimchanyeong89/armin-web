/**
 * 국립박물관 e뮤지엄 API 스크래퍼 (Multi-Museum Support)
 * 
 * API 문서: https://www.emuseum.go.kr/openApi
 * 데이터셋: https://www.data.go.kr/data/3036708/openapi.do
 * 
 * Usage:
 *   node scrape-national-museum-korea.js [museum] [--no-details]
 * 
 * Museums:
 *   nmk      - 국립중앙박물관 (PS01001001) - default
 *   jeonju   - 국립전주박물관 (PS01001008)
 *   gwangju  - 국립광주박물관 (PS01001005)
 *   folk     - 국립민속박물관 (PS01002001)
 *   all      - All museums above
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pLimit from 'p-limit';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// API 설정
const API_KEY = 'd44723b6b598e8f13c9a93d5bcb488219b58fe60bec8d9c7af4ef7fcc199b349';
const BASE_URL = 'http://www.emuseum.go.kr/openapi';

// Museum Configurations
const MUSEUMS = {
    nmk: {
        code: 'PS01001001',
        name: '국립중앙박물관',
        nameEn: 'National Museum of Korea',
        purposeCode: 'PS09009003002', // 일반회화
        outputFile: 'national-museum-korea.json'
    },
    jeonju: {
        code: 'PS01001008',
        name: '국립전주박물관',
        nameEn: 'Jeonju National Museum',
        purposeCode: 'PS09009003002', // 일반회화
        outputFile: 'jeonju-museum.json'
    },
    gwangju: {
        code: 'PS01001005',
        name: '국립광주박물관',
        nameEn: 'Gwangju National Museum',
        purposeCode: 'PS09009003', // 회화 (broader category)
        outputFile: 'gwangju-museum.json'
    },
    folk: {
        code: 'PS01002001',
        name: '국립민속박물관',
        nameEn: 'National Folk Museum of Korea',
        purposeCode: 'PS09009003002', // 일반회화
        outputFile: 'folk-museum.json'
    },
    busan: {
        code: 'PS01003005',
        name: '부산광역시립박물관',
        nameEn: 'Busan Museum',
        purposeCode: 'PS09009003002', // 일반회화
        outputFile: 'busan-museum.json'
    },
    gogung: {
        code: 'PS01002011',
        name: '국립고궁박물관',
        nameEn: 'National Palace Museum of Korea',
        purposeCode: 'PS09009003002', // 일반회화
        outputFile: 'gogung-museum.json'
    },
    snu: {
        code: 'PS01005003',
        name: '서울대학교박물관',
        nameEn: 'Seoul National University Museum',
        purposeCode: 'PS09009003002', // 일반회화
        outputFile: 'snu-museum.json'
    }
};

const PAGE_SIZE = 100;
const CONCURRENCY = 50;
const DETAIL_CONCURRENCY = 20;

const listLimit = pLimit(CONCURRENCY);
const detailLimit = pLimit(DETAIL_CONCURRENCY);

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function fetchJSON(url, retry = 3) {
    for (let i = 0; i < retry; i++) {
        try {
            const response = await fetch(url, {
                headers: { 'Accept': 'application/json' }
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return await response.json();
        } catch (e) {
            if (i === retry - 1) {
                return null;
            }
            await sleep(500 * (i + 1));
        }
    }
}

async function fetchRelicList(pageNo, museumCode) {
    const url = `${BASE_URL}/relic/list?serviceKey=${API_KEY}&numOfRows=${PAGE_SIZE}&pageNo=${pageNo}&museumCode=${museumCode}`;
    return fetchJSON(url);
}

async function fetchRelicDetail(relicId) {
    const url = `${BASE_URL}/relic/detail?serviceKey=${API_KEY}&id=${relicId}`;
    return fetchJSON(url);
}

function transformArtwork(item, detail = null, museumConfig) {
    const title = item.nameKr || item.name || item.nameCn || '';

    const artwork = {
        id: item.id,
        title: title,
        titleHanja: item.name || '',
        titleChinese: item.nameCn || '',
        artist: 'Unknown',
        museum: item.museumName2 || museumConfig.name,
        museumCode: item.museumCode,
        inventoryNumber: `${item.relicNo || ''}${item.relicSubNo && item.relicSubNo !== '00000' ? '-' + item.relicSubNo : ''}`,
        nationality: '',
        period: '',
        material: '',
        technique: '',
        dimensions: '',
        category: '',
        subcategory: '',
        genre: '',
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

        if (detail.imageList && detail.imageList.list) {
            artwork.images = detail.imageList.list.map(img => ({
                url: img.imgUri,
                thumbnailL: img.imgThumUriL,
                thumbnailM: img.imgThumUriM,
                thumbnailS: img.imgThumUriS,
                order: img.imgOrder
            }));
            artwork.imageCount = detail.imageList.totalCount || 0;
        }
    } else {
        artwork.nationality = item.nationalityName1 || '';
        artwork.period = item.nationalityName2 || '';
        artwork.material = item.materialName1 || '';
        artwork.category = item.purposeName1 || '';
        artwork.subcategory = item.purposeName2 || '';
    }

    return artwork;
}

async function processPage(pageNo, museumConfig, fetchDetails) {
    const data = await fetchRelicList(pageNo, museumConfig.code);
    if (!data || data.resultCode !== '0000' || !data.list) return [];

    const pageArtworks = [];

    const promises = data.list.map(async (item) => {
        // Filter by museum code
        if (item.museumCode2 !== museumConfig.code) return;

        // Filter by Purpose Code
        if (!item.purposeCode || !item.purposeCode.startsWith(museumConfig.purposeCode)) return;

        let detail = null;
        if (fetchDetails && item.id) {
            detail = await detailLimit(async () => {
                const detailData = await fetchRelicDetail(item.id);
                if (detailData && detailData.resultCode === '0000' && detailData.list && detailData.list[0]) {
                    return detailData.list[0];
                }
                return null;
            });
        }

        const artwork = transformArtwork(item, detail, museumConfig);
        if (artwork.imageUrl || artwork.thumbnailUrl) {
            pageArtworks.push(artwork);
        }
    });

    await Promise.all(promises);
    return pageArtworks;
}

async function scrapeMuseum(museumKey, options = {}) {
    const { fetchDetails = true } = options;
    const museumConfig = MUSEUMS[museumKey];

    if (!museumConfig) {
        console.error(`Unknown museum: ${museumKey}`);
        return;
    }

    const outputFile = path.join(__dirname, '../public/data', museumConfig.outputFile);

    console.log('═══════════════════════════════════════════════════════════');
    console.log(`🏛️  ${museumConfig.name} (${museumConfig.nameEn}) 스크래퍼`);
    console.log(`    Museum Code: ${museumConfig.code}`);
    console.log(`    Category Filter: ${museumConfig.purposeCode}`);
    console.log('═══════════════════════════════════════════════════════════');

    const testUrl = `${BASE_URL}/relic/list?serviceKey=${API_KEY}&numOfRows=1&pageNo=1&museumCode=${museumConfig.code}`;
    const firstRes = await fetchJSON(testUrl);
    if (!firstRes || firstRes.resultCode !== '0000') {
        console.error("API Error or Invalid Key", firstRes);
        return;
    }

    const totalCountInSystem = firstRes.totalCount;
    const estimatedPages = Math.ceil(totalCountInSystem / PAGE_SIZE);
    console.log(`Total items in museum: ${totalCountInSystem} (~${estimatedPages} pages)`);

    const allArtworks = [];
    let processedPages = 0;

    const pages = Array.from({ length: estimatedPages }, (_, i) => i + 1);

    const tasks = pages.map(page => listLimit(async () => {
        try {
            const results = await processPage(page, museumConfig, fetchDetails);
            if (results.length > 0) {
                allArtworks.push(...results);
            }
            processedPages++;
            if (processedPages % 50 === 0) {
                process.stdout.write(`\rProgress: ${processedPages}/${estimatedPages} pages. Found: ${allArtworks.length} items...`);
            }
        } catch (e) {
            console.error(`\nError page ${page}: ${e.message}`);
        }
    }));

    await Promise.all(tasks);

    console.log('\n\n✅ 수집 완료!');
    console.log(`📊 총 수집: ${allArtworks.length}개`);

    if (allArtworks.length === 0) {
        console.warn(`⚠️  경고: 수집된 항목이 없습니다. 필터 코드(${museumConfig.purposeCode})를 확인하세요.`);
    }

    allArtworks.sort((a, b) => (a.inventoryNumber || '').localeCompare(b.inventoryNumber || ''));

    fs.writeFileSync(outputFile, JSON.stringify(allArtworks, null, 2), 'utf-8');
    console.log(`💾 저장됨: ${outputFile}`);
    console.log('');

    return allArtworks.length;
}

async function main() {
    const args = process.argv.slice(2);
    const fetchDetails = !args.includes('--no-details');
    const cleanArgs = args.filter(a => !a.startsWith('--'));
    const targetMuseum = cleanArgs[0] || 'nmk';

    if (targetMuseum === 'all') {
        console.log('🎨 모든 박물관 스크래핑 시작...\n');
        const results = {};
        for (const key of Object.keys(MUSEUMS)) {
            results[key] = await scrapeMuseum(key, { fetchDetails });
        }
        console.log('\n═══════════════════════════════════════════════════════════');
        console.log('📊 전체 결과 요약:');
        for (const [key, count] of Object.entries(results)) {
            console.log(`   ${MUSEUMS[key].name}: ${count}개`);
        }
        console.log('═══════════════════════════════════════════════════════════');
    } else {
        await scrapeMuseum(targetMuseum, { fetchDetails });
    }
}

main();
