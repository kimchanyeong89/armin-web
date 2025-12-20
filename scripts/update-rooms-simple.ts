/**
 * Simple Room assignment updater
 * Scrapes each room page and updates roomId based on painting links found
 */

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const OUTPUT_FILE = path.join(process.cwd(), 'public', 'data', 'national-gallery-permanent.json');

// Room URLs
const ROOM_URLS: { room: string, url: string }[] = [];
for (let i = 2; i <= 66; i++) {
    ROOM_URLS.push({ room: String(i), url: `https://www.nationalgallery.org.uk/visiting/floorplans/level-2/room-${i}` });
}
['A', 'B', 'C', 'D', 'E', 'F', 'G'].forEach(letter => {
    ROOM_URLS.push({ room: letter, url: `https://www.nationalgallery.org.uk/visiting/floorplans/level-0/room-${letter.toLowerCase()}` });
});

async function run() {
    const data = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf-8'));
    const items: any[] = data.items;
    console.log(`Loaded ${items.length} items.`);

    // Create map by ID
    const itemMap = new Map<string, any>();
    items.forEach(item => itemMap.set(item.id, item));

    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    // Cookie handling
    await page.goto('https://www.nationalgallery.org.uk/', { waitUntil: 'domcontentloaded' });
    try {
        const btn = await page.waitForSelector('#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll', { timeout: 5000 });
        if (btn) await btn.click();
    } catch { }
    await page.waitForTimeout(500);

    let totalUpdated = 0;
    const roomStats: Record<string, { found: number, updated: number }> = {};

    for (const { room, url } of ROOM_URLS) {
        try {
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
            await page.waitForTimeout(1000);

            const title = await page.title();
            if (title.includes('Page not found') || title.includes('404')) continue;

            // Get ALL links that contain /paintings/
            const paintingSlugs = await page.$$eval('a[href*="/paintings/"]', links => {
                const slugs: string[] = [];
                links.forEach(a => {
                    const href = a.getAttribute('href') || '';
                    const match = href.match(/\/paintings\/([a-z0-9-]+)/i);
                    if (match) {
                        const slug = match[1];
                        // Filter out non-painting pages
                        if (!['explore-the-collection', 'must-sees', 'latest-arrivals', 'picture-of-the-month', 'residency-programmes'].includes(slug)) {
                            slugs.push(slug);
                        }
                    }
                });
                return [...new Set(slugs)];
            });

            if (paintingSlugs.length === 0) continue;

            let found = 0;
            let updated = 0;

            for (const slug of paintingSlugs) {
                const item = itemMap.get(slug);
                if (item) {
                    found++;
                    if (item.roomId !== room) {
                        item.roomId = room;
                        updated++;
                        totalUpdated++;
                    }
                }
            }

            roomStats[room] = { found: paintingSlugs.length, updated };
            console.log(`Room ${room}: ${paintingSlugs.length} paintings listed, ${found} in our JSON, ${updated} updated`);

        } catch (e) {
            console.log(`Room ${room}: Error - ${e}`);
            continue;
        }
    }

    await browser.close();

    // Sort items
    items.sort((a, b) => {
        const getOrder = (r: string) => {
            if (r === 'n' || r === 'Not on display') return 9999;
            if (/^\d+$/.test(r)) return parseInt(r, 10);
            if (/^[A-G]$/.test(r)) return 1000 + r.charCodeAt(0);
            return 9998;
        };
        return getOrder(a.roomId) - getOrder(b.roomId);
    });

    data.items = items;
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(data, null, 2));

    console.log(`\n=== Summary ===`);
    console.log(`Total items: ${items.length}`);
    console.log(`Total updated: ${totalUpdated}`);

    // Count by room
    const roomCounts: Record<string, number> = {};
    items.forEach(i => {
        roomCounts[i.roomId] = (roomCounts[i.roomId] || 0) + 1;
    });

    const displayedCount = items.filter(i => i.roomId !== 'n' && i.roomId !== 'Not on display').length;
    const notDisplayedCount = items.filter(i => i.roomId === 'n' || i.roomId === 'Not on display').length;

    console.log(`Displayed (with room): ${displayedCount}`);
    console.log(`Not displayed: ${notDisplayedCount}`);
}

run().catch(console.error);
