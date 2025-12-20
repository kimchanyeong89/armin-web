/**
 * Sync All Museums Script
 * 
 * This script scrapes exhibition data from all enabled museums
 * and updates the corresponding JSON files.
 * 
 * Usage: npx ts-node scripts/sync-all.ts
 * Or add to package.json: "sync-all": "ts-node scripts/sync-all.ts"
 */

import { chromium, Browser, Page } from 'playwright';
import fs from 'fs';
import path from 'path';
import { enabledMuseums, MuseumConfig } from './museum-config';

interface ExhibitionItem {
    id: string;
    name: string;
    title: string;
    description: string;
    startDate: string;
    endDate: string;
    image?: string;
    url?: string;
}

interface MuseumData {
    items?: ExhibitionItem[];
    special?: ExhibitionItem[];
    upcoming?: ExhibitionItem[];
    past?: ExhibitionItem[];
    updatedAt: string;
}

// ============== SCRAPER IMPLEMENTATIONS ==============

async function scrapeNationalGallery(page: Page, config: MuseumConfig): Promise<MuseumData> {
    const items: ExhibitionItem[] = [];
    const past: ExhibitionItem[] = [];

    // Scrape current exhibitions
    if (config.urls.current) {
        console.log(`  Fetching current exhibitions...`);
        await page.goto(config.urls.current, { waitUntil: 'networkidle', timeout: 60000 });
        await page.waitForTimeout(2000);

        const currentItems = await page.$$eval('.exhibition-card, article, .card', (cards) => {
            return cards.map((card) => {
                const titleEl = card.querySelector('h2, h3, .title, .exhibition-title');
                const imgEl = card.querySelector('img');
                const linkEl = card.querySelector('a');
                const dateEl = card.querySelector('.date, .exhibition-date, time');
                const descEl = card.querySelector('p, .description');

                const title = titleEl?.textContent?.trim() || '';
                if (!title) return null;

                let image = imgEl?.getAttribute('src') || imgEl?.getAttribute('data-src') || '';
                if (image && !image.startsWith('http')) image = 'https://www.nationalgallery.org.uk' + image;

                let url = linkEl?.getAttribute('href') || '';
                if (url && !url.startsWith('http')) url = 'https://www.nationalgallery.org.uk' + url;

                const dateText = dateEl?.textContent?.trim() || card.textContent || '';
                const dateMatch = dateText.match(/(\d{1,2}\s+[A-Za-z]+\s*\d{4}?)\s*[-–]\s*(\d{1,2}\s+[A-Za-z]+\s+\d{4})/);

                return {
                    id: title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 50),
                    name: title,
                    title: title,
                    description: descEl?.textContent?.trim() || '',
                    startDate: dateMatch?.[1] || '',
                    endDate: dateMatch?.[2] || '',
                    image: image || undefined,
                    url: url || undefined,
                };
            }).filter(Boolean);
        });

        items.push(...(currentItems as ExhibitionItem[]));
        console.log(`    Found ${currentItems.length} current exhibitions`);
    }

    // Scrape past exhibitions
    if (config.urls.past) {
        console.log(`  Fetching past exhibitions...`);
        await page.goto(config.urls.past, { waitUntil: 'networkidle', timeout: 60000 });
        await page.waitForTimeout(2000);

        const pastItems = await page.$$eval('.exhibition-card, article, .card', (cards) => {
            return cards.slice(0, 20).map((card) => { // Limit to 20 past exhibitions
                const titleEl = card.querySelector('h2, h3, .title, .exhibition-title');
                const imgEl = card.querySelector('img');
                const linkEl = card.querySelector('a');
                const dateEl = card.querySelector('.date, .exhibition-date, time');

                const title = titleEl?.textContent?.trim() || '';
                if (!title) return null;

                let image = imgEl?.getAttribute('src') || imgEl?.getAttribute('data-src') || '';
                if (image && !image.startsWith('http')) image = 'https://www.nationalgallery.org.uk' + image;

                let url = linkEl?.getAttribute('href') || '';
                if (url && !url.startsWith('http')) url = 'https://www.nationalgallery.org.uk' + url;

                const dateText = dateEl?.textContent?.trim() || '';
                const dateMatch = dateText.match(/(\d{1,2}\s+[A-Za-z]+\s*\d{4}?)\s*[-–]\s*(\d{1,2}\s+[A-Za-z]+\s+\d{4})/);

                return {
                    id: 'past-' + title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 50),
                    name: title,
                    title: title,
                    description: '',
                    startDate: dateMatch?.[1] || '',
                    endDate: dateMatch?.[2] || '',
                    image: image || undefined,
                    url: url || undefined,
                };
            }).filter(Boolean);
        });

        past.push(...(pastItems as ExhibitionItem[]));
        console.log(`    Found ${pastItems.length} past exhibitions`);
    }

    return { items, past, updatedAt: new Date().toISOString() };
}

async function scrapeTate(page: Page, config: MuseumConfig): Promise<MuseumData> {
    const items: ExhibitionItem[] = [];

    if (config.urls.current) {
        console.log(`  Fetching exhibitions...`);
        await page.goto(config.urls.current, { waitUntil: 'networkidle', timeout: 60000 });
        await page.waitForTimeout(3000);

        // Tate uses a card-based layout
        const exhibitions = await page.$$eval('.card, .event-card, article', (cards) => {
            return cards.slice(0, 30).map((card) => {
                const titleEl = card.querySelector('h2, h3, .card__title');
                const imgEl = card.querySelector('img');
                const linkEl = card.querySelector('a');
                const dateEl = card.querySelector('.card__date, .date, time');
                const descEl = card.querySelector('.card__description, p');

                const title = titleEl?.textContent?.trim() || '';
                if (!title) return null;

                let image = imgEl?.getAttribute('src') || imgEl?.getAttribute('data-src') || '';
                if (image && !image.startsWith('http')) image = 'https://www.tate.org.uk' + image;

                let url = linkEl?.getAttribute('href') || '';
                if (url && !url.startsWith('http')) url = 'https://www.tate.org.uk' + url;

                const dateText = dateEl?.textContent?.trim() || '';

                return {
                    id: title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 50),
                    name: title,
                    title: title,
                    description: descEl?.textContent?.trim() || '',
                    startDate: dateText,
                    endDate: '',
                    image: image || undefined,
                    url: url || undefined,
                };
            }).filter(Boolean);
        });

        items.push(...(exhibitions as ExhibitionItem[]));
        console.log(`    Found ${exhibitions.length} exhibitions`);
    }

    return { items, updatedAt: new Date().toISOString() };
}

async function scrapeBritishMuseum(page: Page, config: MuseumConfig): Promise<MuseumData> {
    const items: ExhibitionItem[] = [];
    const past: ExhibitionItem[] = [];

    if (config.urls.current) {
        console.log(`  Fetching current exhibitions...`);
        await page.goto(config.urls.current, { waitUntil: 'networkidle', timeout: 60000 });
        await page.waitForTimeout(3000);

        const exhibitions = await page.$$eval('.card, article, .exhibition-item', (cards) => {
            return cards.slice(0, 20).map((card) => {
                const titleEl = card.querySelector('h2, h3, .title');
                const imgEl = card.querySelector('img');
                const linkEl = card.querySelector('a');
                const dateEl = card.querySelector('.date, time');

                const title = titleEl?.textContent?.trim() || '';
                if (!title) return null;

                let image = imgEl?.getAttribute('src') || imgEl?.getAttribute('data-src') || '';
                if (image && !image.startsWith('http')) image = 'https://www.britishmuseum.org' + image;

                let url = linkEl?.getAttribute('href') || '';
                if (url && !url.startsWith('http')) url = 'https://www.britishmuseum.org' + url;

                return {
                    id: title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 50),
                    name: title,
                    title: title,
                    description: '',
                    startDate: dateEl?.textContent?.trim() || '',
                    endDate: '',
                    image: image || undefined,
                    url: url || undefined,
                };
            }).filter(Boolean);
        });

        items.push(...(exhibitions as ExhibitionItem[]));
        console.log(`    Found ${exhibitions.length} current exhibitions`);
    }

    return { items, past, updatedAt: new Date().toISOString() };
}

async function scrapeVAM(page: Page, config: MuseumConfig): Promise<MuseumData> {
    const items: ExhibitionItem[] = [];

    if (config.urls.current) {
        console.log(`  Fetching exhibitions...`);
        await page.goto(config.urls.current, { waitUntil: 'networkidle', timeout: 60000 });
        await page.waitForTimeout(3000);

        const exhibitions = await page.$$eval('.card, article, .exhibition-card', (cards) => {
            return cards.slice(0, 20).map((card) => {
                const titleEl = card.querySelector('h2, h3, .title');
                const imgEl = card.querySelector('img');
                const linkEl = card.querySelector('a');
                const dateEl = card.querySelector('.date, time');

                const title = titleEl?.textContent?.trim() || '';
                if (!title) return null;

                let image = imgEl?.getAttribute('src') || imgEl?.getAttribute('data-src') || '';
                if (image && !image.startsWith('http')) image = 'https://www.vam.ac.uk' + image;

                let url = linkEl?.getAttribute('href') || '';
                if (url && !url.startsWith('http')) url = 'https://www.vam.ac.uk' + url;

                return {
                    id: title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 50),
                    name: title,
                    title: title,
                    description: '',
                    startDate: dateEl?.textContent?.trim() || '',
                    endDate: '',
                    image: image || undefined,
                    url: url || undefined,
                };
            }).filter(Boolean);
        });

        items.push(...(exhibitions as ExhibitionItem[]));
        console.log(`    Found ${exhibitions.length} exhibitions`);
    }

    return { items, updatedAt: new Date().toISOString() };
}

async function scrapeNPG(page: Page, config: MuseumConfig): Promise<MuseumData> {
    const items: ExhibitionItem[] = [];

    if (config.urls.current) {
        console.log(`  Fetching exhibitions...`);
        await page.goto(config.urls.current, { waitUntil: 'networkidle', timeout: 60000 });
        await page.waitForTimeout(3000);

        const exhibitions = await page.$$eval('.card, article, .exhibition-item', (cards) => {
            return cards.slice(0, 20).map((card) => {
                const titleEl = card.querySelector('h2, h3, .title');
                const imgEl = card.querySelector('img');
                const linkEl = card.querySelector('a');
                const dateEl = card.querySelector('.date, time');
                const descEl = card.querySelector('p, .description');

                const title = titleEl?.textContent?.trim() || '';
                if (!title) return null;

                let image = imgEl?.getAttribute('src') || imgEl?.getAttribute('data-src') || '';
                if (image && !image.startsWith('http')) image = 'https://www.npg.org.uk' + image;

                let url = linkEl?.getAttribute('href') || '';
                if (url && !url.startsWith('http')) url = 'https://www.npg.org.uk' + url;

                return {
                    id: title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 50),
                    name: title,
                    title: title,
                    description: descEl?.textContent?.trim() || '',
                    startDate: dateEl?.textContent?.trim() || '',
                    endDate: '',
                    image: image || undefined,
                    url: url || undefined,
                };
            }).filter(Boolean);
        });

        items.push(...(exhibitions as ExhibitionItem[]));
        console.log(`    Found ${exhibitions.length} exhibitions`);
    }

    return { items, updatedAt: new Date().toISOString() };
}

// ============== MAIN SYNC FUNCTION ==============

async function scrapeMuseum(browser: Browser, config: MuseumConfig): Promise<MuseumData | null> {
    const page = await browser.newPage();

    try {
        // Accept cookies if dialog appears
        page.on('dialog', async (dialog) => {
            await dialog.accept();
        });

        switch (config.scraperType) {
            case 'national-gallery':
                return await scrapeNationalGallery(page, config);
            case 'tate':
                return await scrapeTate(page, config);
            case 'british-museum':
                return await scrapeBritishMuseum(page, config);
            case 'vam':
                return await scrapeVAM(page, config);
            case 'npg':
                return await scrapeNPG(page, config);
            default:
                console.log(`    No scraper implemented for ${config.scraperType}`);
                return null;
        }
    } catch (error) {
        console.error(`    Error scraping ${config.name}:`, error);
        return null;
    } finally {
        await page.close();
    }
}

async function main() {
    console.log('='.repeat(60));
    console.log('  SYNC ALL MUSEUMS - Exhibition Data Scraper');
    console.log('='.repeat(60));
    console.log(`\nFound ${enabledMuseums.length} enabled museums to sync.\n`);

    const browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const results: { museum: string; success: boolean; count: number }[] = [];

    for (const config of enabledMuseums) {
        console.log(`\n[${config.name}]`);

        const data = await scrapeMuseum(browser, config);

        if (data) {
            const totalItems = (data.items?.length || 0) + (data.past?.length || 0) + (data.special?.length || 0) + (data.upcoming?.length || 0);

            if (totalItems > 0) {
                // Write to file
                const outputPath = path.join(process.cwd(), config.outputFile);
                const backupPath = outputPath.replace('.json', '.backup.json');
                const dir = path.dirname(outputPath);
                if (!fs.existsSync(dir)) {
                    fs.mkdirSync(dir, { recursive: true });
                }

                // Create backup of existing file before overwriting
                if (fs.existsSync(outputPath)) {
                    fs.copyFileSync(outputPath, backupPath);
                    console.log(`  📁 Backup created: ${config.outputFile.replace('.json', '.backup.json')}`);
                }

                fs.writeFileSync(outputPath, JSON.stringify(data, null, 2));
                console.log(`  ✓ Saved ${totalItems} items to ${config.outputFile}`);
                results.push({ museum: config.name, success: true, count: totalItems });
            } else {
                console.log(`  ⚠ No items found (selectors may need adjustment)`);
                results.push({ museum: config.name, success: false, count: 0 });
            }
        } else {
            console.log(`  ✗ Failed to scrape`);
            results.push({ museum: config.name, success: false, count: 0 });
        }
    }

    await browser.close();

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('  SYNC COMPLETE');
    console.log('='.repeat(60));

    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);

    console.log(`\n  ✓ Successful: ${successful.length}`);
    successful.forEach(r => console.log(`    - ${r.museum}: ${r.count} items`));

    if (failed.length > 0) {
        console.log(`\n  ✗ Failed: ${failed.length}`);
        failed.forEach(r => console.log(`    - ${r.museum}`));
    }

    console.log(`\n  Updated at: ${new Date().toLocaleString()}`);
    console.log('');
}

main().catch(console.error);
