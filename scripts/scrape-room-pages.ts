/**
 * Scrape room assignments directly from National Gallery room pages
 * This is the authoritative source for which paintings are in which rooms
 */

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const OUTPUT_FILE = path.join(process.cwd(), 'public', 'data', 'national-gallery-permanent.json');

// All room URLs to scrape
const ROOM_URLS: { room: string, url: string }[] = [];

// Level 2 rooms (2-66, not all exist)
for (let i = 2; i <= 66; i++) {
    ROOM_URLS.push({
        room: String(i),
        url: `https://www.nationalgallery.org.uk/visiting/floorplans/level-2/room-${i}`
    });
}

// Level 0 rooms (A-G)
['A', 'B', 'C', 'D', 'E', 'F', 'G'].forEach(letter => {
    ROOM_URLS.push({
        room: letter,
        url: `https://www.nationalgallery.org.uk/visiting/floorplans/level-0/room-${letter.toLowerCase()}`
    });
});

async function scrapeRoomPages() {
    if (!fs.existsSync(OUTPUT_FILE)) {
        console.error("JSON file not found.");
        return;
    }

    const raw = fs.readFileSync(OUTPUT_FILE, 'utf-8');
    const data = JSON.parse(raw);
    const items: any[] = data.items;

    console.log(`Loaded ${items.length} existing items.`);

    // Create a map: painting URL slug -> item
    const itemMap = new Map<string, any>();
    items.forEach(item => {
        // Extract slug from URL
        const slug = item.url?.split('/paintings/').pop();
        if (slug) {
            itemMap.set(slug, item);
        }
        // Also map by ID
        itemMap.set(item.id, item);
    });

    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    // Handle cookies
    await page.goto('https://www.nationalgallery.org.uk/visiting/floorplans/level-2/room-2', { waitUntil: 'domcontentloaded' });
    try {
        const acceptBtn = await page.waitForSelector('#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll', { timeout: 5000 });
        if (acceptBtn) {
            await acceptBtn.click();
            await page.waitForTimeout(1000);
        }
    } catch (e) {
        console.log("Cookie dialog not found.");
    }

    let totalUpdated = 0;
    const roomCounts: Record<string, number> = {};

    for (const { room, url } of ROOM_URLS) {
        try {
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 10000 });
            await page.waitForTimeout(1000);

            // Check if page exists (not 404)
            const title = await page.title();
            if (title.includes('Page not found') || title.includes('404')) {
                continue;
            }

            // Find all painting links in the room
            const paintingLinks = await page.$$eval('a[href*="/paintings/"]', links =>
                links.map(a => {
                    const href = a.getAttribute('href') || '';
                    // Extract slug from href
                    const match = href.match(/\/paintings\/([^\/]+)/);
                    return match ? match[1] : null;
                }).filter(Boolean)
            );

            // Unique slugs only
            const uniqueSlugs = [...new Set(paintingLinks)];

            if (uniqueSlugs.length === 0) {
                continue;
            }

            console.log(`Room ${room}: Found ${uniqueSlugs.length} paintings`);
            roomCounts[room] = uniqueSlugs.length;

            for (const slug of uniqueSlugs) {
                const item = itemMap.get(slug);
                if (item && item.roomId !== room) {
                    const oldRoom = item.roomId;
                    item.roomId = room;
                    totalUpdated++;
                    // console.log(`  Updated [${slug}]: ${oldRoom} -> Room ${room}`);
                }
            }

        } catch (e) {
            // Room page doesn't exist or error
            continue;
        }
    }

    await browser.close();

    // Sort items: numeric rooms first (ascending), then letter rooms, then 'n'
    items.sort((a, b) => {
        const getOrder = (roomId: string) => {
            if (roomId === 'n' || roomId === 'Not on display') return 9999;
            if (/^\d+$/.test(roomId)) return parseInt(roomId, 10);
            if (/^[A-G]$/.test(roomId)) return 1000 + roomId.charCodeAt(0);
            return 9998;
        };
        return getOrder(a.roomId) - getOrder(b.roomId);
    });

    // Save
    data.items = items;
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(data, null, 2));

    console.log(`\n=== Summary ===`);
    console.log(`Total updated: ${totalUpdated}`);
    console.log(`\nRoom counts from official pages:`);
    Object.entries(roomCounts).sort((a, b) => {
        const numA = parseInt(a[0]) || 1000;
        const numB = parseInt(b[0]) || 1000;
        return numA - numB;
    }).forEach(([room, count]) => {
        console.log(`  Room ${room}: ${count}`);
    });
}

scrapeRoomPages().catch(console.error);
