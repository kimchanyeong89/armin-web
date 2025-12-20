/**
 * Sync New Exhibitions Only
 * 
 * This script safely adds NEW exhibitions without touching existing data.
 * - Reads existing JSON file
 * - Scrapes website for exhibitions
 * - Adds only NEW exhibitions (based on ID/title matching)
 * - Never removes or overwrites existing data
 * 
 * Usage: npm run sync-new
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
    updatedAt?: string;
}

// Normalize title for comparison
function normalizeTitle(title: string): string {
    return title.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 50);
}

// Check if exhibition already exists in data
function existsInData(scrapedItem: ExhibitionItem, existingData: MuseumData): boolean {
    const normalizedNew = normalizeTitle(scrapedItem.title || scrapedItem.name);

    const allExisting = [
        ...(existingData.items || []),
        ...(existingData.special || []),
        ...(existingData.upcoming || []),
        ...(existingData.past || []),
    ];

    return allExisting.some(existing => {
        const normalizedExisting = normalizeTitle(existing.title || existing.name);
        return normalizedExisting === normalizedNew || existing.id === scrapedItem.id;
    });
}

// ============== SCRAPER IMPLEMENTATIONS ==============
// Simplified scrapers that return basic info

async function scrapeNationalGallery(page: Page): Promise<ExhibitionItem[]> {
    const items: ExhibitionItem[] = [];

    try {
        await page.goto('https://www.nationalgallery.org.uk/exhibitions', {
            waitUntil: 'domcontentloaded',
            timeout: 30000
        });
        await page.waitForTimeout(3000);

        const scraped = await page.$$eval('a[href*="/exhibitions/"]', (links) => {
            const seen = new Set<string>();
            return links.map((link) => {
                const href = link.getAttribute('href') || '';
                const title = link.textContent?.trim() || '';

                // Skip navigation links, empty titles
                if (!title || title.length < 5 || title.length > 200) return null;
                if (seen.has(title.toLowerCase())) return null;
                seen.add(title.toLowerCase());

                // Find image in parent
                const parent = link.closest('article, .card, div');
                const img = parent?.querySelector('img');
                let image = img?.getAttribute('src') || img?.getAttribute('data-src') || '';
                if (image && !image.startsWith('http')) image = 'https://www.nationalgallery.org.uk' + image;

                let url = href;
                if (url && !url.startsWith('http')) url = 'https://www.nationalgallery.org.uk' + url;

                return { title, image, url };
            }).filter(Boolean);
        });

        for (const item of scraped as any[]) {
            if (!item?.title) continue;
            items.push({
                id: 'ng-' + normalizeTitle(item.title),
                name: item.title,
                title: item.title,
                description: '',
                startDate: '',
                endDate: '',
                image: item.image || undefined,
                url: item.url || undefined,
            });
        }
    } catch (e) {
        console.log(`    Error: ${(e as Error).message}`);
    }

    return items;
}

async function scrapeTate(page: Page, gallery: 'tate-modern' | 'tate-britain'): Promise<ExhibitionItem[]> {
    const items: ExhibitionItem[] = [];
    const galleryParam = gallery === 'tate-modern' ? 'tate-modern' : 'tate-britain';

    try {
        await page.goto(`https://www.tate.org.uk/whats-on?gallery=${galleryParam}`, {
            waitUntil: 'domcontentloaded',
            timeout: 30000
        });
        await page.waitForTimeout(3000);

        const scraped = await page.$$eval('.card, article', (cards) => {
            return cards.slice(0, 20).map((card) => {
                const titleEl = card.querySelector('h2, h3, .card__title, [class*="title"]');
                const title = titleEl?.textContent?.trim() || '';
                if (!title || title.length < 3) return null;

                const linkEl = card.querySelector('a');
                let url = linkEl?.getAttribute('href') || '';
                if (url && !url.startsWith('http')) url = 'https://www.tate.org.uk' + url;

                const imgEl = card.querySelector('img');
                let image = imgEl?.getAttribute('src') || imgEl?.getAttribute('data-src') || '';
                if (image && !image.startsWith('http')) image = 'https://www.tate.org.uk' + image;

                const dateEl = card.querySelector('[class*="date"], time');
                const dateText = dateEl?.textContent?.trim() || '';

                return { title, url, image, dateText };
            }).filter(Boolean);
        });

        for (const item of scraped as any[]) {
            if (!item?.title) continue;
            items.push({
                id: 'tate-' + normalizeTitle(item.title),
                name: item.title,
                title: item.title,
                description: '',
                startDate: item.dateText || '',
                endDate: '',
                image: item.image || undefined,
                url: item.url || undefined,
            });
        }
    } catch (e) {
        console.log(`    Error: ${(e as Error).message}`);
    }

    return items;
}

// ============== MAIN FUNCTION ==============

async function processMuseum(browser: Browser, config: MuseumConfig): Promise<{ added: number; total: number }> {
    const outputPath = path.join(process.cwd(), config.outputFile);

    // Load existing data
    let existingData: MuseumData = { items: [], upcoming: [], past: [] };
    try {
        if (fs.existsSync(outputPath)) {
            const raw = fs.readFileSync(outputPath, 'utf-8');
            existingData = JSON.parse(raw);
        }
    } catch {
        console.log(`    Could not read existing file, starting fresh`);
    }

    // Scrape new exhibitions
    const page = await browser.newPage();
    let scraped: ExhibitionItem[] = [];

    try {
        switch (config.scraperType) {
            case 'national-gallery':
                scraped = await scrapeNationalGallery(page);
                break;
            case 'tate':
                scraped = await scrapeTate(page, config.id as 'tate-modern' | 'tate-britain');
                break;
            default:
                console.log(`    Scraper not implemented for ${config.scraperType}`);
        }
    } finally {
        await page.close();
    }

    console.log(`    Scraped ${scraped.length} exhibitions from website`);

    // Find truly new exhibitions
    const newItems: ExhibitionItem[] = [];
    for (const item of scraped) {
        if (!existsInData(item, existingData)) {
            newItems.push(item);
        }
    }

    if (newItems.length === 0) {
        console.log(`    No new exhibitions found`);
        return { added: 0, total: (existingData.items?.length || 0) + (existingData.upcoming?.length || 0) };
    }

    console.log(`    Found ${newItems.length} NEW exhibitions!`);

    // Add new items to 'upcoming' (they'll auto-move based on dates)
    if (!existingData.upcoming) existingData.upcoming = [];
    existingData.upcoming.push(...newItems);
    existingData.updatedAt = new Date().toISOString();

    // Save (with backup)
    const backupPath = outputPath.replace('.json', '.backup.json');
    if (fs.existsSync(outputPath)) {
        fs.copyFileSync(outputPath, backupPath);
    }

    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(outputPath, JSON.stringify(existingData, null, 2));

    const total = (existingData.items?.length || 0) + (existingData.upcoming?.length || 0);
    return { added: newItems.length, total };
}

async function main() {
    console.log('='.repeat(60));
    console.log('  SYNC NEW EXHIBITIONS ONLY');
    console.log('  (Adds new exhibitions, never removes existing data)');
    console.log('='.repeat(60));

    const browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const results: { museum: string; added: number; total: number }[] = [];

    // Only process museums with implemented scrapers
    const supported = enabledMuseums.filter(m =>
        m.scraperType === 'national-gallery' || m.scraperType === 'tate'
    );

    console.log(`\nProcessing ${supported.length} museums...\n`);

    for (const config of supported) {
        console.log(`\n[${config.name}]`);

        try {
            const result = await processMuseum(browser, config);
            results.push({ museum: config.name, ...result });

            if (result.added > 0) {
                console.log(`  ✓ Added ${result.added} new exhibitions (total: ${result.total})`);
            }
        } catch (e) {
            console.log(`  ✗ Failed: ${(e as Error).message}`);
            results.push({ museum: config.name, added: 0, total: 0 });
        }
    }

    await browser.close();

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('  SYNC COMPLETE');
    console.log('='.repeat(60));

    const totalAdded = results.reduce((sum, r) => sum + r.added, 0);
    console.log(`\n  Total new exhibitions added: ${totalAdded}`);

    results.forEach(r => {
        if (r.added > 0) {
            console.log(`    ✓ ${r.museum}: +${r.added} new`);
        } else {
            console.log(`    - ${r.museum}: no changes`);
        }
    });

    console.log(`\n  Updated at: ${new Date().toLocaleString()}`);
    console.log('');
}

main().catch(console.error);
