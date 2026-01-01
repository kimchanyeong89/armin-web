/**
 * NPG (National Portrait Gallery) Scraper - Stealth Mode
 * puppeteer-extra + stealth plugin을 사용하여 Cloudflare 우회
 * 
 * 사용법:
 *   node scripts/scrape-npg-stealth.cjs
 * 
 * 환경변수:
 *   HEADLESS=0     - 브라우저 창을 보여줌 (Cloudflare 수동 통과 필요시)
 *   MAX_PAGES=10   - 최대 페이지 수
 *   SAVE_COOKIES=1 - 쿠키를 파일로 저장
 */

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');

// Stealth 플러그인 적용
puppeteer.use(StealthPlugin());

const HEADLESS = process.env.HEADLESS !== '0';
const MAX_PAGES = parseInt(process.env.MAX_PAGES || '100', 10);
const SAVE_COOKIES = process.env.SAVE_COOKIES === '1';
const COOKIES_FILE = path.join(__dirname, '.npg-cookies.json');

const TARGET_URL = 'https://www.npg.org.uk/collections/search/portrait-list.php?search=ap&firstRun=true&title=&npgno=&eDate=&lDate=&medium=&subj=&set=&portraitplace=&searchCatalogue=&od=restrict&submitSearchTerm=Search';
const OUTPUT_PATH = path.join(__dirname, '..', 'public', 'data', 'npg-portraits.json');

async function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForCloudflare(page, maxWait = 120000) {
    const start = Date.now();
    console.log('⏳ Cloudflare 체크 확인 중...');

    while (Date.now() - start < maxWait) {
        const bodyText = await page.evaluate(() => document.body?.innerText || '');
        const title = await page.title();

        // Cloudflare 챌린지가 통과되었는지 확인
        if (!bodyText.includes('Verifying you are human') &&
            !bodyText.includes('Just a moment') &&
            !title.includes('Just a moment')) {
            console.log('✅ Cloudflare 통과!');
            return true;
        }

        console.log('   아직 Cloudflare 챌린지 페이지... 대기 중');
        await delay(3000);
    }

    console.log('❌ Cloudflare 타임아웃');
    return false;
}

async function scrapeNPG() {
    console.log('============================================');
    console.log('🎨 National Portrait Gallery - Stealth Scraper');
    console.log('============================================\n');
    console.log(`HEADLESS: ${HEADLESS}`);
    console.log(`MAX_PAGES: ${MAX_PAGES}`);
    console.log(`TARGET: ${TARGET_URL}\n`);

    const browser = await puppeteer.launch({
        headless: HEADLESS ? 'new' : false,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-infobars',
            '--window-size=1920,1080',
            '--disable-blink-features=AutomationControlled',
            '--disable-features=site-per-process',
            '--disable-web-security',
            '--user-agent=Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        ],
        ignoreDefaultArgs: ['--enable-automation']
    });

    const page = await browser.newPage();

    // 추가 stealth 설정
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setExtraHTTPHeaders({
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
    });

    // webdriver 속성 숨기기
    await page.evaluateOnNewDocument(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
        Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
        window.chrome = { runtime: {} };

        // Chrome 프로퍼티 추가
        const originalQuery = window.navigator.permissions.query;
        window.navigator.permissions.query = (parameters) => (
            parameters.name === 'notifications' ?
                Promise.resolve({ state: Notification.permission }) :
                originalQuery(parameters)
        );
    });

    // 저장된 쿠키 로드
    if (fs.existsSync(COOKIES_FILE)) {
        try {
            const cookies = JSON.parse(fs.readFileSync(COOKIES_FILE, 'utf8'));
            await page.setCookie(...cookies);
            console.log('🍪 저장된 쿠키 로드됨');
        } catch (e) {
            console.log('⚠️ 쿠키 로드 실패:', e.message);
        }
    }

    const allPortraits = [];
    let pageNum = 1;

    try {
        console.log('📡 NPG 페이지 로드 중...');
        await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });

        // Cloudflare 대기
        const cfPassed = await waitForCloudflare(page);
        if (!cfPassed) {
            console.log('\n⚠️ Cloudflare를 통과하지 못했습니다.');
            console.log('   HEADLESS=0 으로 실행하여 수동으로 체크박스를 클릭해주세요.');
            await browser.close();
            return;
        }

        // 쿠키 저장
        if (SAVE_COOKIES || !HEADLESS) {
            const cookies = await page.cookies();
            fs.writeFileSync(COOKIES_FILE, JSON.stringify(cookies, null, 2));
            console.log('🍪 쿠키 저장됨:', COOKIES_FILE);
        }

        // 스크린샷 저장 (디버깅용)
        const screenshotPath = path.join(__dirname, '..', 'downloads', 'npg', 'npg-stealth.png');
        const screenshotDir = path.dirname(screenshotPath);
        if (!fs.existsSync(screenshotDir)) fs.mkdirSync(screenshotDir, { recursive: true });
        await page.screenshot({ path: screenshotPath, fullPage: false });
        console.log('📸 스크린샷 저장:', screenshotPath);

        // 페이지 스크래핑
        while (pageNum <= MAX_PAGES) {
            console.log(`\n📄 페이지 ${pageNum} 스크래핑 중...`);

            // 결과 로드 대기
            await delay(2000);

            // HTML 저장 (디버깅용)
            const htmlPath = path.join(__dirname, '..', 'downloads', 'npg', `page-${pageNum}.html`);
            const html = await page.content();
            fs.writeFileSync(htmlPath, html);
            console.log(`   HTML 저장: ${htmlPath}`);

            // 작품 데이터 추출
            const portraits = await page.evaluate(() => {
                const results = [];

                // 다양한 셀렉터 시도
                const selectors = [
                    '.search-results__list li',
                    '.search-results__item',
                    '.portrait-item',
                    '.result-item',
                    'article.portrait',
                    '.c-card',
                    '.listing__item'
                ];

                let cards = [];
                for (const sel of selectors) {
                    cards = document.querySelectorAll(sel);
                    if (cards.length > 0) {
                        console.log('Found cards with selector:', sel, cards.length);
                        break;
                    }
                }

                // 카드가 없으면 모든 링크에서 portrait 관련 찾기
                if (cards.length === 0) {
                    const allLinks = document.querySelectorAll('a[href*="/portrait/"]');
                    allLinks.forEach((link, idx) => {
                        const img = link.querySelector('img') || link.closest('li,article,div')?.querySelector('img');
                        results.push({
                            id: `npg-portrait-${idx}`,
                            title: link.textContent?.trim() || img?.alt || 'Unknown',
                            url: link.href,
                            image: img?.src || img?.dataset?.src || ''
                        });
                    });
                    return { portraits: results, hasNext: false };
                }

                cards.forEach((card, idx) => {
                    const link = card.querySelector('a[href*="/portrait/"]') || card.querySelector('a');
                    const img = card.querySelector('img');
                    const titleEl = card.querySelector('h2, h3, .title, .name') || link;
                    const artistEl = card.querySelector('.artist, .creator, .meta');
                    const dateEl = card.querySelector('.date, .year');

                    const imgSrc = img?.src || img?.dataset?.src || img?.getAttribute('data-lazy') || '';

                    results.push({
                        id: `npg-portrait-${idx}`,
                        title: titleEl?.textContent?.trim() || 'Unknown',
                        artist: artistEl?.textContent?.trim() || '',
                        date: dateEl?.textContent?.trim() || '',
                        url: link?.href || '',
                        image: imgSrc
                    });
                });

                // 다음 페이지 확인
                const nextLink = document.querySelector('a[rel="next"], .pagination__next a, a.next, a[aria-label*="Next"]');

                return {
                    portraits: results,
                    hasNext: !!nextLink,
                    nextUrl: nextLink?.href || null
                };
            });

            console.log(`   ${portraits.portraits.length}개 작품 발견`);

            if (portraits.portraits.length === 0) {
                console.log('   작품을 찾지 못했습니다. HTML을 확인해주세요.');
                break;
            }

            allPortraits.push(...portraits.portraits);

            // 중간 저장
            const output = {
                museum: 'National Portrait Gallery',
                museumId: 'npg',
                scrapedAt: new Date().toISOString(),
                totalObjects: allPortraits.length,
                source: TARGET_URL,
                objects: allPortraits
            };
            fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2));
            console.log(`   누적 ${allPortraits.length}개 저장됨`);

            if (!portraits.hasNext || !portraits.nextUrl) {
                console.log('   마지막 페이지입니다.');
                break;
            }

            // 다음 페이지로
            console.log(`   다음 페이지로 이동: ${portraits.nextUrl}`);
            await page.goto(portraits.nextUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });

            // Cloudflare 재확인
            const cfOk = await waitForCloudflare(page, 30000);
            if (!cfOk) {
                console.log('   Cloudflare 재인증 필요. 중단합니다.');
                break;
            }

            pageNum++;
            await delay(2000 + Math.random() * 2000); // 랜덤 딜레이
        }

    } catch (error) {
        console.error('❌ 스크래핑 오류:', error.message);
    }

    await browser.close();

    console.log('\n============================================');
    console.log(`✅ 완료: ${allPortraits.length}개 작품`);
    console.log(`📁 저장: ${OUTPUT_PATH}`);
    console.log('============================================');
}

scrapeNPG().catch(console.error);
