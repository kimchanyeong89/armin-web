/**
 * MAD Paris (Musée des Arts Décoratifs) Collection Scraper
 * Playwright를 사용하여 모든 컬렉션에서 작품을 스크래핑
 * 
 * 사용법:
 *   node scripts/scrape-mad-paris.cjs
 * 
 * 환경변수:
 *   HEADLESS=0     - 브라우저 창을 보여줌
 *   MAX_ITEMS=100  - 카테고리당 최대 아이템 수
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const HEADLESS = !(process.env.HEADLESS === '0');
const MAX_ITEMS_PER_CATEGORY = parseInt(process.env.MAX_ITEMS || '99999', 10);
const OUTPUT_PATH = path.join(__dirname, '..', 'public', 'data', 'mad-paris-collection.json');

// 8개 주요 타이폴로지 + 4개 테마 카테고리 = 12개
const COLLECTIONS = [
    {
        name: 'Arts décoratifs et design XVe-XXIe siècles',
        url: 'https://collections.madparis.fr/page/arts-decoratifs-et-design-xve-xxie-siecles/64462f74d0b7061116c3be25'
    },
    {
        name: 'Mode et textile',
        url: 'https://collections.madparis.fr/page/mode-et-textile/64462f8cd0b7061116c3be29'
    },
    {
        name: 'Bijoux',
        url: 'https://collections.madparis.fr/page/bijoux/64462fc2d0b7061116c3be31'
    },
    {
        name: 'Dessins, photographies, papiers peints',
        url: 'https://collections.madparis.fr/page/dessins-photographies-papiers-peints/65f2cbd54f0b366c2655003b'
    },
    {
        name: 'Publicité et design graphique',
        url: 'https://collections.madparis.fr/page/publicite-et-design-graphique/64462fb0d0b7061116c3be2d'
    },
    {
        name: 'Jouets',
        url: 'https://collections.madparis.fr/page/jouets/64462fe7d0b7061116c3be36'
    },
    {
        name: 'Arts asiatiques et Arts de l\'islam',
        url: 'https://collections.madparis.fr/page/arts-asiatiques-et-arts-de-l-islam/65f2cecf4f0b366c265540e9'
    },
    {
        name: 'Musée Nissim de Camondo',
        url: 'https://collections.madparis.fr/page/musee-nissim-de-camondo/64463004d0b7061116c3be3a'
    },
    {
        name: 'Chefs d\'oeuvres',
        url: 'https://collections.madparis.fr/page/chefs-d-oeuvres/64463337d0b7061116c3bf4e'
    },
    {
        name: 'Period-rooms',
        url: 'https://collections.madparis.fr/page/period-rooms/64463368d0b7061116c3bf5d'
    },
    {
        name: 'Oeuvres en dépôt',
        url: 'https://collections.madparis.fr/page/oeuvres-en-depot/644633d8d0b7061116c3bf76'
    },
    {
        name: 'Acquisitions récentes',
        url: 'https://collections.madparis.fr/page/acquisitions-recentes/64463349d0b7061116c3bf59'
    }
];

async function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function parseYear(dateStr) {
    if (!dateStr) return null;
    // "1770 (vers)", "XIXe siècle", "1920-1930" 등 다양한 형식
    const yearMatch = dateStr.match(/(\d{4})/);
    if (yearMatch) return parseInt(yearMatch[1], 10);

    // Roman numerals for centuries
    const centuryMatch = dateStr.match(/(X{0,3})(IX|IV|V?I{0,3})e?\s*siècle/i);
    if (centuryMatch) {
        const roman = centuryMatch[1] + centuryMatch[2];
        const romanToNum = { 'XV': 1450, 'XVI': 1550, 'XVII': 1650, 'XVIII': 1750, 'XIX': 1850, 'XX': 1950, 'XXI': 2000 };
        return romanToNum[roman.toUpperCase()] || null;
    }
    return null;
}

async function scrapeMADParis() {
    console.log('============================================');
    console.log('🎨 MAD Paris Collection Scraper');
    console.log('============================================\n');
    console.log(`HEADLESS: ${HEADLESS}`);
    console.log(`MAX_ITEMS_PER_CATEGORY: ${MAX_ITEMS_PER_CATEGORY}`);
    console.log(`COLLECTIONS: ${COLLECTIONS.length}개\n`);

    const browser = await chromium.launch({
        headless: HEADLESS,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        viewport: { width: 1920, height: 1080 }
    });

    const page = await context.newPage();

    // 웹드라이버 감지 방지
    await page.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });

    const allArtworks = [];
    const seenUrls = new Set(); // 중복 방지

    try {
        for (const collection of COLLECTIONS) {
            console.log(`\n📂 ${collection.name}`);
            console.log(`   URL: ${collection.url}`);

            let pageNum = 0;
            let collectionItems = 0;

            while (collectionItems < MAX_ITEMS_PER_CATEGORY) {
                const pageUrl = pageNum === 0 ? collection.url : `${collection.url}?pgn=${pageNum}`;
                console.log(`   페이지 ${pageNum + 1} 로드 중...`);

                try {
                    await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
                } catch (e) {
                    console.log(`   ⚠️ 페이지 로드 실패: ${e.message}`);
                    break;
                }

                // 쿠키 동의 팝업 처리
                try {
                    const cookieBtn = await page.$('button:has-text("Tout accepter"), .accept-cookies, #didomi-notice-agree-button');
                    if (cookieBtn) await cookieBtn.click({ timeout: 2000 });
                } catch { }

                // JavaScript 렌더링 대기 (중요!)
                try {
                    await page.waitForSelector('a[href*="/document/"]', { timeout: 15000 });
                } catch {
                    console.log('   ⚠️ 아이템 셀렉터 대기 타임아웃');
                }
                await delay(3000);

                // 아이템 추출
                const items = await page.evaluate(() => {
                    const results = [];

                    // a[href*="/document/"] 셀렉터 사용 - 작품 상세 링크
                    const links = document.querySelectorAll('a[href*="/document/"]');

                    links.forEach(link => {
                        const href = link.href;

                        // 부모 카드 컨테이너 찾기
                        const card = link.closest('.hit-image.card') || link.closest('.card') || link.parentElement;
                        if (!card) return;

                        // 이미지 찾기
                        const img = card.querySelector('img.card-img') || card.querySelector('img');

                        // 제목, 작가, 날짜 찾기
                        const h2 = card.querySelector('h2');
                        const h3 = card.querySelector('h3'); // 카테고리 (예: "Oeuvre")
                        const paragraphs = card.querySelectorAll('p');

                        let title = h2?.textContent?.trim() || '';
                        let artist = '';
                        let date = '';

                        // p 태그에서 작가, 날짜 추출
                        if (paragraphs.length >= 1) {
                            artist = paragraphs[0]?.textContent?.trim() || '';
                        }
                        if (paragraphs.length >= 2) {
                            date = paragraphs[1]?.textContent?.trim() || '';
                        }

                        // 인벤토리 번호 (a.disable-hover)
                        const invLink = card.querySelector('a.disable-hover');
                        const invNo = invLink?.textContent?.trim() || '';

                        // 이미지 URL 가져오기
                        let imageSrc = img?.src || img?.getAttribute('data-src') || '';
                        // 더 큰 이미지로 변환
                        if (imageSrc.includes('/small/')) {
                            imageSrc = imageSrc.replace('/small/', '/big/');
                        } else if (imageSrc.includes('/medium/')) {
                            imageSrc = imageSrc.replace('/medium/', '/big/');
                        }

                        if (href && title) {
                            results.push({
                                url: href,
                                title,
                                artist,
                                date,
                                invNo,
                                image: imageSrc
                            });
                        }
                    });

                    // 중복 제거 (같은 href가 여러 번 나올 수 있음)
                    const seen = new Set();
                    const unique = [];
                    for (const item of results) {
                        if (!seen.has(item.url)) {
                            seen.add(item.url);
                            unique.push(item);
                        }
                    }

                    // 다음 페이지 버튼 확인
                    const nextBtn = document.querySelector('#pagination-next:not(.disabled), a[rel="next"]');
                    const hasNext = !!nextBtn && !nextBtn.classList.contains('disabled');

                    return { items: unique, hasNext };
                });

                console.log(`   ${items.items.length}개 아이템 발견`);

                if (items.items.length === 0) {
                    console.log('   더 이상 아이템 없음');
                    break;
                }

                // 중복 제거하며 추가
                for (const item of items.items) {
                    if (seenUrls.has(item.url)) continue;
                    seenUrls.add(item.url);

                    allArtworks.push({
                        id: `mad-${allArtworks.length + 1}`,
                        title: item.title,
                        artist: item.artist || 'Inconnu',
                        year: parseYear(item.date),
                        date: item.date,
                        image: item.image,
                        sourceUrl: item.url,
                        collection: collection.name
                    });
                    collectionItems++;
                }

                console.log(`   누적: ${collectionItems}개 (전체 ${allArtworks.length}개)`);

                // 중간 저장
                saveOutput(allArtworks);

                if (!items.hasNext) {
                    console.log('   마지막 페이지');
                    break;
                }

                pageNum++;
                await delay(1000 + Math.random() * 1000);
            }

            console.log(`   ✅ ${collection.name}: ${collectionItems}개 완료`);
        }

    } catch (error) {
        console.error('❌ 스크래핑 오류:', error.message);
    }

    await browser.close();

    // 최종 저장
    saveOutput(allArtworks);

    console.log('\n============================================');
    console.log(`✅ 완료: ${allArtworks.length}개 작품`);
    console.log(`📁 저장: ${OUTPUT_PATH}`);
    console.log('============================================');
}

function saveOutput(artworks) {
    const output = {
        museum: 'Musée des Arts Décoratifs',
        museumId: 'mad-paris',
        location: 'Paris, France',
        collectionName: 'Les collections',
        scrapedAt: new Date().toISOString(),
        totalObjects: artworks.length,
        coverImage: artworks[0]?.image || '',
        objects: artworks
    };

    // 디렉토리 생성
    const dir = path.dirname(OUTPUT_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2));
}

scrapeMADParis().catch(console.error);
