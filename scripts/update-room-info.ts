/**
 * Re-scrape Room information from National Gallery search page
 * This script updates the roomId for existing items based on official data
 */

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const OUTPUT_FILE = path.join(process.cwd(), 'public', 'data', 'national-gallery-permanent.json');

async function updateRoomInfo() {
    // Load existing data
    if (!fs.existsSync(OUTPUT_FILE)) {
        console.error("JSON file not found.");
        return;
    }

    const raw = fs.readFileSync(OUTPUT_FILE, 'utf-8');
    const data = JSON.parse(raw);
    const existingItems: any[] = data.items;

    console.log(`Loaded ${existingItems.length} existing items.`);

    // Create a map for quick lookup
    const itemMap = new Map<string, any>();
    existingItems.forEach(item => itemMap.set(item.id, item));

    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    console.log("Navigating to collection search...");
    await page.goto('https://www.nationalgallery.org.uk/paintings/search-the-collection', { waitUntil: 'domcontentloaded' });

    // Handle Cookiebot
    try {
        console.log("Waiting for cookie dialog...");
        const acceptBtn = await page.waitForSelector('#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll', { timeout: 5000 });
        if (acceptBtn) {
            console.log("Clicking Accept Cookies...");
            await acceptBtn.click();
            await page.waitForSelector('#CybotCookiebotDialog', { state: 'hidden', timeout: 5000 });
        }
    } catch (e) {
        console.log("Cookie dialog not found or already accepted.");
    }

    // Wait for results
    try {
        await page.waitForSelector('li.search-result', { timeout: 10000 });
    } catch (e) { console.log("Timeout waiting for initial results"); }

    let retries = 0;
    let processedCount = 0;
    let updatedCount = 0;
    const seenIds = new Set<string>();

    while (retries < 5) {
        const elements = await page.$$('li.search-result');
        console.log(`Visible elements: ${elements.length} | Processed: ${processedCount} | Updated: ${updatedCount}`);

        let newItemsFound = 0;

        for (const el of elements) {
            try {
                const href = await el.$eval('.title a', node => node.getAttribute('href')).catch(() => "");
                const id = href?.split('/').pop() || "";

                if (!id || seenIds.has(id)) continue;
                seenIds.add(id);
                processedCount++;

                // Get room info from official source
                let room = "Not on display";
                const locationText = await el.$eval('.location', node => node.textContent?.trim()).catch(() => "");
                if (locationText.includes("Room")) {
                    const roomMatch = locationText.match(/Room\s+(\d+)/);
                    if (roomMatch) room = roomMatch[1];
                }

                // Update existing item if we have it
                const existingItem = itemMap.get(id);
                if (existingItem) {
                    const oldRoom = existingItem.roomId;
                    if (oldRoom !== room) {
                        existingItem.roomId = room;
                        updatedCount++;
                        if (room !== "Not on display") {
                            console.log(`Updated [${id}]: "${oldRoom}" -> Room ${room}`);
                        }
                    }
                    newItemsFound++;
                }
            } catch (e) {
                // Ignore element error
            }
        }

        if (newItemsFound === 0) {
            // Try 'See more' button
            try {
                const seeMoreBtn = await page.$('.see-more-link');
                if (seeMoreBtn && await seeMoreBtn.isVisible()) {
                    console.log("Clicking 'See more' button...");
                    await seeMoreBtn.click();
                    await page.waitForTimeout(4000);
                    retries = 0;
                    continue;
                }
            } catch (e) { console.log("Button check failed", e); }

            retries++;
            console.log(`No new items found (Retry ${retries}/5)`);
        } else {
            retries = 0;
        }

        // Scroll to load more
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await page.waitForTimeout(3000);
    }

    await browser.close();

    // Sort items by Room Number
    existingItems.sort((a, b) => {
        const roomA = a.roomId?.match(/^\d+$/) ? parseInt(a.roomId, 10) : 9999;
        const roomB = b.roomId?.match(/^\d+$/) ? parseInt(b.roomId, 10) : 9999;
        return roomA - roomB;
    });

    // Save updated data
    data.items = existingItems;
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(data, null, 2));

    console.log(`\nDone! Processed ${processedCount} items, Updated ${updatedCount} room assignments.`);
}

updateRoomInfo().catch(console.error);
