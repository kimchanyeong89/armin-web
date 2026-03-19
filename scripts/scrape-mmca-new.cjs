const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUTPUT_PATH = path.join(__dirname, '../public/data/mmca-collection.json');

(async () => {
    console.log('🚀 Starting MMCA scraper...');
    // Use headless: true for stability in this environment
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });
    const page = await context.newPage();

    console.log('Navigating to list page...');
    try {
        await page.goto('https://www.mmca.go.kr/collections/collectionsList.do', { timeout: 60000 });
    } catch (e) {
        console.error("Error loading list page:", e);
        await browser.close();
        process.exit(1);
    }

    let allItems = [];
    let pageNum = 1;

    // RESUME LOGIC
    if (fs.existsSync(OUTPUT_PATH)) {
        try {
            const existingCtx = JSON.parse(fs.readFileSync(OUTPUT_PATH, 'utf-8'));
            if (Array.isArray(existingCtx.objects)) {
                allItems = existingCtx.objects;
                console.log(`Loaded ${allItems.length} existing items.`);

                // Assuming ~10 items per page, we estimate the next page
                // Or simply we rely on 'duplicates' check to skip already scraped items quickly
                // but navigating 900 pages takes time. Better to jump close to the page.
                // 9210 items / 10 items/page = 921 pages done. Start at 922.
                pageNum = Math.floor(allItems.length / 10) + 1;
                console.log(`Resuming from page ${pageNum}...`);
            }
        } catch (e) {
            console.error("Error reading existing file, starting fresh.", e);
        }
    }

    const ATTEMPT_LIMIT = 3;

    while (true) {
        console.log(`\n📄 Processing page ${pageNum}... (Total collected: ${allItems.length})`);

        // Wait for the list to load
        try {
            await page.waitForSelector('.boardType01 li', { timeout: 10000 });
        } catch (e) {
            console.log('Timeout waiting for list, retrying or moving on...');
        }

        // Get all artwork links on the current page
        const links = await page.$$eval('.boardType01 li a', (anchors) => {
            return anchors.map(a => {
                const onclick = a.getAttribute('onclick') || '';
                // Format: fn_InfoPage('00001','32154','김원 a','11757')
                const match = onclick.match(/fn_InfoPage\('([^']+)','([^']+)','([^']+)','([^']+)'\)/);

                return {
                    onclick: onclick,
                    params: match ? {
                        museumCd: match[1],
                        wrkInfoSeq: match[2],
                        artist: match[3],
                        mgrNo: match[4]
                    } : null,
                    title: a.querySelector('p.tit')?.innerText?.trim(),
                    thumb: a.querySelector('img')?.src,
                };
            }).filter(item => item.params);
        });

        console.log(`Found ${links.length} items on page ${pageNum}`);

        if (links.length === 0) {
            console.log("No items found on this page. Stopping.");
            break;
        }

        for (const link of links) {
            // Check for duplicates
            if (allItems.some(item => item.id === `mmca-${link.params.wrkInfoSeq}`)) {
                continue;
            }

            const { museumCd, wrkInfoSeq, artist, mgrNo } = link.params;
            const detailUrl = `https://www.mmca.go.kr/collections/collectionsDetailPage.do?museumId=${museumCd}&wrkinfoSeqno=${wrkInfoSeq}&artistnm=${encodeURIComponent(artist)}&wrkMngNo=${mgrNo}`;

            console.log(`  [${allItems.length + 1}] Fetching details: ${link.title} (${wrkInfoSeq})`);

            let retries = 0;
            let success = false;
            while (retries < ATTEMPT_LIMIT && !success) {
                try {
                    const detailPage = await context.newPage();
                    await detailPage.goto(detailUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

                    let metadata = {};

                    try {
                        // Try waiting for multiple potential selectors
                        await Promise.race([
                            detailPage.waitForSelector('.tableType01', { timeout: 10000 }),
                            detailPage.waitForSelector('.box.type02.artInfo', { timeout: 10000 }),
                            detailPage.waitForSelector('dl', { timeout: 10000 })
                        ]);

                        metadata = await detailPage.evaluate(() => {
                            const data = {};

                            // Strategy 1: Table parsing
                            document.querySelectorAll('.tableType01 tr').forEach(row => {
                                const dimKey = row.querySelector('th')?.innerText?.trim();
                                const dimVal = row.querySelector('td')?.innerText?.trim();
                                if (dimKey && dimVal) data[dimKey] = dimVal;
                            });

                            // Strategy 2: Global DL/DT/DD parsing
                            document.querySelectorAll('dl').forEach(dl => {
                                const dt = dl.querySelector('dt')?.innerText?.trim();
                                const dd = dl.querySelector('dd')?.innerText?.trim();
                                if (dt && dd) data[dt] = dd;
                            });

                            // Strategy 3: Specific .box.type02.artInfo parsing
                            const infoBox = document.querySelector('.box.type02.artInfo');
                            if (infoBox) {
                                infoBox.querySelectorAll('dl').forEach(dl => {
                                    const dt = dl.querySelector('dt')?.innerText?.trim();
                                    const dd = dl.querySelector('dd')?.innerText?.trim();
                                    if (dt && dd) data[dt] = dd;
                                });
                            }

                            // Check for 'on display' status
                            const status = data['전시상태'] || data['전시 여부'] || 'Unknown';

                            // High res image
                            const highResImg = document.querySelector('.gallery__pic img')?.src || document.querySelector('.imgDetail img')?.src;

                            return {
                                title: data['작품명'] || data['명칭'],
                                artist: data['작가명'] || data['작가'],
                                date: data['제작연도'] || data['연대'],
                                medium: data['재료'] || data['재질'],
                                dimensions: data['규격'] || data['크기'],
                                category: data['부문'] || data['장르'],
                                ondisplay: status.includes('전시중'),
                                displayStatus: status,
                                image: highResImg
                            };
                        });
                    } catch (e) {
                        console.log("  Could not find metadata element, trying to parse what's available...");
                        metadata = await detailPage.evaluate(() => {
                            const highResImg = document.querySelector('img')?.src;
                            return { image: highResImg };
                        });
                    }

                    if (metadata.title) {
                        allItems.push({
                            id: `mmca-${wrkInfoSeq}`,
                            title: metadata.title || link.title,
                            artist: metadata.artist || link.params.artist,
                            date: metadata.date,
                            medium: metadata.medium,
                            dimensions: metadata.dimensions,
                            category: metadata.category, // Use 'category' for consistency with ExhibitionModal
                            ondisplay: metadata.ondisplay,
                            displayStatus: metadata.displayStatus, // Raw display status string (e.g., '비전시')
                            image: metadata.image || link.thumb,
                            detailUrl: detailUrl,
                            museum: "MMCA",
                            scrapedAt: new Date().toISOString()
                        });
                        success = true;
                    } else {
                        console.log("  Incomplete metadata (missing title), skipping...");
                        success = true;
                    }

                    await detailPage.close();

                } catch (err) {
                    console.error(`  Error scraping detail ${detailUrl} (Attempt ${retries + 1}):`, err.message);
                    retries++;
                    // Only sleep if retrying
                    if (retries < ATTEMPT_LIMIT) await new Promise(r => setTimeout(r, 2000));
                    if (retries >= ATTEMPT_LIMIT) {
                        console.error(`  Skipping ${link.title} after ${ATTEMPT_LIMIT} failed attempts.`);
                    }
                }
            }
        }

        // Save progress after each page
        const fileContent = JSON.stringify({
            museum: "국립현대미술관",
            museumId: "mmca-seoul",
            collectionName: "MMCA 소장작품",
            scrapedAt: new Date().toISOString(),
            totalObjects: allItems.length,
            objects: allItems
        }, null, 2);
        fs.writeFileSync(OUTPUT_PATH, fileContent);
        console.log(`Saved ${allItems.length} items so far.`);

        // Navigate to next page unconditionally
        pageNum++;
        console.log(`Navigating to page ${pageNum}...`);

        try {
            await page.evaluate((n) => {
                if (typeof window.fn_egov_link_page === 'function') {
                    window.fn_egov_link_page(n);
                } else {
                    console.error('Pagination function not found!');
                }
            }, pageNum);

            await page.waitForTimeout(3000);
        } catch (e) {
            console.error("Error navigating to next page:", e);
            break;
        }
    }

    // Save to file
    console.log(`\n💾 Saving ${allItems.length} items to ${OUTPUT_PATH}...`);
    const fileContent = JSON.stringify({
        museum: "국립현대미술관",
        museumId: "mmca-seoul",
        collectionName: "MMCA 소장작품",
        scrapedAt: new Date().toISOString(),
        totalObjects: allItems.length,
        objects: allItems
    }, null, 2);

    fs.writeFileSync(OUTPUT_PATH, fileContent);
    console.log('Done!');

    await browser.close();
})();
