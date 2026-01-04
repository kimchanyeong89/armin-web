/**
 * Museo Egizio (Turin) Scraper
 * 
 * Scrapes the Egyptian Museum collection from collezioni.museoegizio.it
 * 
 * Usage:
 *   node scripts/scrape-museo-egizio.cjs          # Full scrape
 *   node scripts/scrape-museo-egizio.cjs --test   # Test mode (first 20 items)
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://collezioni.museoegizio.it';
const COLLECTION_URL = 'https://collezioni.museoegizio.it/en-GB/search';
const OUTPUT_DIR = path.join(__dirname, '../public/data');
const DOWNLOADS_DIR = path.join(__dirname, '../downloads');
const PROGRESS_FILE = path.join(DOWNLOADS_DIR, 'museo-egizio-progress.json');
const OUTPUT_FILE = 'museo-egizio-collection.json';
const SAVE_INTERVAL = 50;

const delay = ms => new Promise(r => setTimeout(r, ms));
const timestamp = () => new Date().toLocaleTimeString('ko-KR', { hour12: false });
const log = msg => console.log(`[${timestamp()}] [EGIZIO] ${msg}`);

// Ensure directories exist
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
if (!fs.existsSync(DOWNLOADS_DIR)) fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });

function loadProgress() {
    if (fs.existsSync(PROGRESS_FILE)) {
        try {
            return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
        } catch (e) {
            log('⚠️ Failed to load progress, starting fresh');
        }
    }
    return {
        artworks: [],
        scrapedIds: [],
        currentPage: 1,
        done: false
    };
}

function saveProgress(progress) {
    fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

function saveOutput(artworks) {
    const output = {
        museum: "Museo Egizio",
        museumId: "museo-egizio",
        location: "Turin, Italy",
        type: "permanent",
        scrapedAt: new Date().toISOString(),
        totalArtworks: artworks.length,
        artworksWithImage: artworks.filter(a => a.image).length,
        artworksWithTitle: artworks.filter(a => a.title).length,
        artworksWithYear: artworks.filter(a => a.year).length,
        objects: artworks
    };
    fs.writeFileSync(path.join(OUTPUT_DIR, OUTPUT_FILE), JSON.stringify(output, null, 2));
}

async function acceptCookies(page) {
    try {
        // Wait for cookie banner
        await delay(2000);
        
        // Try different cookie accept buttons
        const selectors = [
            'button:has-text("Accept all")',
            'button:has-text("Accetta tutti")',
            '#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll',
            '.accept-cookies',
            'button[data-action="accept"]'
        ];
        
        for (const selector of selectors) {
            const btn = await page.$(selector);
            if (btn) {
                await btn.click();
                log('   ✓ Accepted cookies');
                await delay(1000);
                return true;
            }
        }
        
        // Try clicking anywhere to dismiss
        await page.keyboard.press('Escape');
        await delay(500);
        
    } catch (e) {
        // Continue without accepting
    }
    return false;
}

async function scrapeItemDetails(page, itemUrl) {
    try {
        await page.goto(itemUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await delay(1500);
        
        const data = await page.evaluate(() => {
            const result = {
                title: '',
                artist: '',
                year: '',
                medium: '',
                dimensions: '',
                category: '',
                inventory: '',
                image: ''
            };
            
            // Title - look for main heading
            const h1 = document.querySelector('h1, .object-title, .title');
            if (h1) result.title = h1.textContent.trim();
            
            // Look for object details in various formats
            const detailRows = document.querySelectorAll('.detail-row, .field, .metadata-item, tr, dl dt, dl dd');
            
            // Try to find key-value pairs
            const allText = document.body.innerText;
            
            // Extract inventory number
            const invMatch = allText.match(/(?:Inventory|Inv\.|Cat\.|Number|N°)[:\s]*([A-Z]?\d+[\w.-]*)/i);
            if (invMatch) result.inventory = invMatch[1];
            
            // Extract date/period
            const dateMatch = allText.match(/(?:Date|Period|Dynasty|Era)[:\s]*([^.\n]+)/i);
            if (dateMatch) result.year = dateMatch[1].trim();
            
            // Extract material/medium
            const matMatch = allText.match(/(?:Material|Medium|Made of)[:\s]*([^.\n]+)/i);
            if (matMatch) result.medium = matMatch[1].trim();
            
            // Extract dimensions
            const dimMatch = allText.match(/(?:Dimensions|Size|H\.|Height)[:\s]*([^.\n]*(?:cm|mm|m)[^.\n]*)/i);
            if (dimMatch) result.dimensions = dimMatch[1].trim();
            
            // Extract category/type
            const typeMatch = allText.match(/(?:Type|Category|Classification|Object type)[:\s]*([^.\n]+)/i);
            if (typeMatch) result.category = typeMatch[1].trim();
            
            // Get image
            const mainImg = document.querySelector('.main-image img, .object-image img, .media img, article img');
            if (mainImg && mainImg.src && !mainImg.src.includes('logo') && !mainImg.src.includes('placeholder')) {
                result.image = mainImg.src;
            }
            
            // Fallback: find largest image
            if (!result.image) {
                const allImgs = document.querySelectorAll('img');
                let maxSize = 0;
                allImgs.forEach(img => {
                    const size = (img.naturalWidth || img.width || 0) * (img.naturalHeight || img.height || 0);
                    if (size > maxSize && !img.src.includes('logo') && !img.src.includes('icon')) {
                        maxSize = size;
                        result.image = img.src;
                    }
                });
            }
            
            return result;
        });
        
        return data;
        
    } catch (error) {
        log(`   ⚠️ Error scraping ${itemUrl}: ${error.message}`);
        return null;
    }
}

async function main() {
    const args = process.argv.slice(2);
    const testMode = args.includes('--test');
    
    log('🏛️ Museo Egizio (Turin) Scraper');
    log(`   Mode: ${testMode ? 'TEST (20 items)' : 'FULL'}`);
    log('   Turin, Italy - Egyptian Museum Collection');
    
    const progress = loadProgress();
    log(`   Resuming with ${progress.artworks.length} items already scraped`);
    
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
    });
    const page = await context.newPage();
    
    try {
        log('📋 Loading collection page...');
        await page.goto(COLLECTION_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await delay(3000);
        
        // Accept cookies
        await acceptCookies(page);
        
        // Wait for content to load
        await delay(2000);
        
        // Try to find collection items
        log('🔍 Searching for collection items...');
        
        // Scroll to load more content
        for (let i = 0; i < 5; i++) {
            await page.evaluate(() => window.scrollBy(0, window.innerHeight));
            await delay(500);
        }
        
        // Find all object links
        const itemLinks = await page.evaluate(() => {
            const links = [];
            const anchors = document.querySelectorAll('a[href*="/object/"], a[href*="/oggetto/"], .object-card a, .result-item a');
            
            anchors.forEach(a => {
                const href = a.href;
                if (href && !links.includes(href)) {
                    links.push(href);
                }
            });
            
            // Fallback: look for any links that might be objects
            if (links.length === 0) {
                document.querySelectorAll('a').forEach(a => {
                    const href = a.href;
                    if (href && href.includes('museoegizio') && 
                        (href.includes('/object') || href.includes('/oggetto') || 
                         href.match(/\/\d{5,}/))) {
                        if (!links.includes(href)) links.push(href);
                    }
                });
            }
            
            return links;
        });
        
        log(`   Found ${itemLinks.length} potential object links`);
        
        if (itemLinks.length === 0) {
            // Try alternative approach - get page HTML structure
            const pageInfo = await page.evaluate(() => {
                return {
                    title: document.title,
                    url: window.location.href,
                    bodyClasses: document.body.className,
                    h1: document.querySelector('h1')?.textContent,
                    linkCount: document.querySelectorAll('a').length,
                    sampleLinks: Array.from(document.querySelectorAll('a')).slice(0, 20).map(a => a.href)
                };
            });
            log('   Page info: ' + JSON.stringify(pageInfo, null, 2));
        }
        
        // Limit items in test mode
        const limit = testMode ? 20 : itemLinks.length;
        const linksToProcess = itemLinks.slice(0, limit);
        
        log(`📦 Scraping ${linksToProcess.length} objects...`);
        
        for (let i = 0; i < linksToProcess.length; i++) {
            const url = linksToProcess[i];
            const urlId = url.split('/').pop();
            
            // Skip if already scraped
            if (progress.scrapedIds.includes(urlId)) {
                continue;
            }
            
            log(`🎨 [${i + 1}/${linksToProcess.length}] Scraping: ${urlId}`);
            
            const details = await scrapeItemDetails(page, url);
            
            if (details && details.title) {
                const artwork = {
                    id: urlId,
                    slug: urlId,
                    title: details.title,
                    artist: details.artist || 'Ancient Egyptian',
                    year: details.year,
                    medium: details.medium,
                    category: details.category || 'Artifact',
                    dimensions: details.dimensions,
                    roomId: '',
                    image: details.image,
                    inventory: details.inventory,
                    sourceUrl: url
                };
                
                progress.artworks.push(artwork);
                progress.scrapedIds.push(urlId);
                
                log(`   ✓ ${details.title.substring(0, 40)}...`);
            }
            
            // Save checkpoint
            if (progress.artworks.length % SAVE_INTERVAL === 0) {
                saveProgress(progress);
                log(`   💾 Checkpoint saved: ${progress.artworks.length} items`);
            }
            
            await delay(1000);
        }
        
        // Save final output
        saveOutput(progress.artworks);
        progress.done = true;
        saveProgress(progress);
        
        log('');
        log(`✅ Done! ${progress.artworks.length} items saved to ${OUTPUT_FILE}`);
        log('');
        log('📊 Summary:');
        log(`   Total artworks: ${progress.artworks.length}`);
        log(`   With images: ${progress.artworks.filter(a => a.image).length}`);
        log(`   With titles: ${progress.artworks.filter(a => a.title).length}`);
        log(`   With years: ${progress.artworks.filter(a => a.year).length}`);
        
    } catch (error) {
        log(`❌ Error: ${error.message}`);
        saveProgress(progress);
        saveOutput(progress.artworks);
    } finally {
        await browser.close();
    }
}

main().catch(console.error);
