/**
 * Doria Pamphilj Gallery Scraper v2
 * 
 * Scrapes masterpieces directly from the masterpieces page
 * Each artwork has: artist, title, dimensions, medium, FC number, image
 * 
 * Usage:
 *   node scripts/scrape-doria-pamphilj.cjs          # Full scrape
 *   node scripts/scrape-doria-pamphilj.cjs --test   # Test mode (first 10 artworks)
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://www.doriapamphilj.it';
const MASTERPIECES_URL = 'https://www.doriapamphilj.it/en/rome/the-art/the-masterpieces/';
const OUTPUT_DIR = path.join(__dirname, '../public/data');
const DOWNLOADS_DIR = path.join(__dirname, '../downloads');
const PROGRESS_FILE = path.join(DOWNLOADS_DIR, 'doria-pamphilj-progress.json');
const OUTPUT_FILE = 'doria-pamphilj-collection.json';
const SAVE_INTERVAL = 50;

const delay = ms => new Promise(r => setTimeout(r, ms));
const timestamp = () => new Date().toLocaleTimeString('ko-KR', { hour12: false });
const log = msg => console.log(`[${timestamp()}] [DORIA] ${msg}`);

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
        scrapedSlugs: [],
        done: false
    };
}

function saveProgress(progress) {
    fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

/**
 * Format artist name (proper case, remove period/comma)
 */
function formatArtistName(rawName) {
    if (!rawName) return '';
    
    let name = rawName.trim();
    
    // Handle "MICHELANGELO MERISI DETTO IL CARAVAGGIO" -> "Caravaggio"
    const dettoMatch = name.match(/detto\s+(?:il\s+)?(.+)$/i);
    if (dettoMatch) {
        name = dettoMatch[1].trim();
    }
    
    // Normalize case if all caps
    if (name === name.toUpperCase()) {
        name = name.split(' ').map(word => 
            word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
        ).join(' ');
    }
    
    // Remove commas and periods
    name = name.replace(/[.,]/g, ' ').replace(/\s+/g, ' ').trim();
    
    return name;
}

/**
 * Scrape individual artist page for detailed artwork info
 */
async function scrapeArtistPage(page, artistUrl, artistName) {
    try {
        await page.goto(artistUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await delay(1500);
        
        // Scroll to load content
        await page.evaluate(async () => {
            const delay = ms => new Promise(r => setTimeout(r, ms));
            for (let i = 0; i < 3; i++) {
                window.scrollBy(0, window.innerHeight);
                await delay(200);
            }
        });
        await delay(500);
        
        const artworks = await page.evaluate(() => {
            const works = [];
            
            // Find h2 elements which contain artwork titles
            const h2Elements = document.querySelectorAll('h2');
            
            h2Elements.forEach(h2 => {
                const title = h2.textContent.trim();
                
                // Skip if title is empty or navigation-like
                if (!title || 
                    title.toLowerCase().includes('doria pamphilj') ||
                    title.toLowerCase().includes('documentation') ||
                    title.toLowerCase().includes('the art') ||
                    title.toLowerCase().includes('bibliography') ||
                    title.toLowerCase().includes('masterpieces') ||
                    title.toLowerCase() === 'more projects') {
                    return;
                }
                
                // Look for next sibling or parent container for dimensions/medium
                let container = h2.closest('section') || h2.closest('div') || h2.parentElement;
                let infoText = '';
                
                // Get the text content after h2
                let nextEl = h2.nextElementSibling;
                while (nextEl && nextEl.tagName !== 'H2' && nextEl.tagName !== 'H1') {
                    if (nextEl.tagName === 'P' || nextEl.tagName === 'DIV') {
                        infoText += ' ' + nextEl.textContent;
                    }
                    nextEl = nextEl.nextElementSibling;
                }
                
                // Also check the container's text
                if (!infoText && container) {
                    const containerText = container.innerText;
                    const h2Index = containerText.indexOf(title);
                    if (h2Index !== -1) {
                        infoText = containerText.substring(h2Index + title.length, h2Index + title.length + 200);
                    }
                }
                
                // Extract dimensions (e.g., "122.5 x 98.5 cm" or "135,5 x 166,5 cm")
                let dimensions = '';
                const dimMatch = infoText.match(/(\d+[.,]?\d*\s*x\s*\d+[.,]?\d*\s*cm)/i);
                if (dimMatch) {
                    dimensions = dimMatch[1].replace(/,/g, '.');
                }
                // Handle diameter format (e.g., "Ø 94 cm")
                if (!dimensions) {
                    const diamMatch = infoText.match(/(Ø\s*\d+[.,]?\d*\s*cm)/i);
                    if (diamMatch) {
                        dimensions = diamMatch[1].replace(/,/g, '.');
                    }
                }
                
                // Extract medium (after dimensions, before FC)
                let medium = '';
                const mediumMatch = infoText.match(/cm[;,]?\s*([^(]+)\s*(?:\(FC|\(|$)/i);
                if (mediumMatch) {
                    medium = mediumMatch[1].trim().replace(/[;,]$/, '').trim();
                }
                
                // Extract inventory (FC number)
                let inventory = '';
                const fcMatch = infoText.match(/\(FC\s*(\d+)\)/i);
                if (fcMatch) {
                    inventory = `FC ${fcMatch[1]}`;
                }
                
                // Find associated image
                let image = '';
                // Look for image in the same section
                const section = h2.closest('section') || h2.closest('article') || h2.closest('.elementor-widget-container');
                if (section) {
                    const img = section.querySelector('img');
                    if (img && img.src && !img.src.includes('logo') && !img.src.includes('flag')) {
                        image = img.src;
                    }
                    // Also check for linked images
                    const linkImg = section.querySelector('a[href*=".jpg"] img, a[href*=".png"] img');
                    if (linkImg && linkImg.closest('a')) {
                        image = linkImg.closest('a').href;
                    }
                }
                // Fallback: look for any image with "big" in name
                if (!image) {
                    const bigImgs = document.querySelectorAll('img[src*="-big"]');
                    if (bigImgs.length > 0) {
                        // Try to match based on title keywords
                        const titleWords = title.toLowerCase().split(/\s+/);
                        for (const img of bigImgs) {
                            const srcLower = img.src.toLowerCase();
                            if (titleWords.some(w => w.length > 3 && srcLower.includes(w))) {
                                image = img.src;
                                break;
                            }
                        }
                    }
                }
                
                works.push({
                    title,
                    dimensions,
                    medium,
                    inventory,
                    image
                });
            });
            
            // Also get all high-res images from the page
            const allImages = Array.from(document.querySelectorAll('a[href*="-big.jpg"], a[href*="-big.png"]'))
                .map(a => a.href);
            
            // Match images to works if not already matched
            if (allImages.length > 0 && works.length > 0) {
                let imgIdx = 0;
                works.forEach((work, idx) => {
                    if (!work.image && imgIdx < allImages.length) {
                        work.image = allImages[imgIdx];
                        imgIdx++;
                    }
                });
            }
            
            return works;
        });
        
        return artworks.map(w => ({
            ...w,
            artist: artistName
        }));
        
    } catch (error) {
        log(`  ⚠️ Error scraping ${artistUrl}: ${error.message}`);
        return [];
    }
}

async function main() {
    const args = process.argv.slice(2);
    const testMode = args.includes('--test');
    
    log('🏛️ Doria Pamphilj Gallery Scraper');
    log(`   Mode: ${testMode ? 'TEST' : 'FULL'}`);
    log('   Rome, Italy - Masterpieces Collection');
    
    const progress = loadProgress();
    log(`   Resuming with ${progress.artworks.length} items already scraped`);
    
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
    });
    const page = await context.newPage();
    
    try {
        log('📋 Getting masterpieces from main page...');
        
        await page.goto(MASTERPIECES_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await delay(2000);
        
        // Handle cookie consent
        try {
            const cookieBtn = await page.$('button:has-text("Accept"), button:has-text("Accetta"), #cookie-notice-accept');
            if (cookieBtn) {
                await cookieBtn.click();
                await delay(500);
            }
        } catch (e) { }
        
        // Scroll to load all content
        log('   Scrolling to load all content...');
        await page.evaluate(async () => {
            const delay = ms => new Promise(r => setTimeout(r, ms));
            for (let i = 0; i < 10; i++) {
                window.scrollBy(0, window.innerHeight);
                await delay(300);
            }
            window.scrollTo(0, 0);
        });
        await delay(1000);
        
        // Extract all artwork cards from the masterpieces page
        const artworkCards = await page.evaluate(() => {
            const cards = [];
            
            // Artist cards with portfolio links
            const artistLinks = document.querySelectorAll('a[href*="/portfolio/"]');
            const processedUrls = new Set();
            
            artistLinks.forEach(link => {
                const href = link.href;
                if (processedUrls.has(href)) return;
                processedUrls.add(href);
                
                // Find artist name from h4 in or near the link
                const container = link.closest('article') || link.closest('div') || link.parentElement;
                const h4 = container?.querySelector('h4') || link.querySelector('h4');
                
                // Get the description text (contains title, dimensions, medium)
                const descText = container?.innerText || '';
                
                // Get image
                const img = container?.querySelector('img') || link.querySelector('img');
                const image = img?.src || '';
                
                if (h4) {
                    cards.push({
                        artistName: h4.textContent.trim(),
                        url: href,
                        descText,
                        image
                    });
                }
            });
            
            return cards;
        });
        
        log(`   Found ${artworkCards.length} artist entries on masterpieces page`);
        
        // Now visit each artist page to get detailed artwork info
        let artworkCount = 0;
        const limit = testMode ? 10 : artworkCards.length;
        
        for (let i = 0; i < Math.min(limit, artworkCards.length); i++) {
            const card = artworkCards[i];
            
            // Skip if no URL
            if (!card || !card.url) {
                log(`   ⚠️ Skipping card ${i+1}: no URL`);
                continue;
            }
            
            // Skip if already scraped
            const slug = card.url.match(/\/portfolio\/([^/]+)/)?.[1] || '';
            if (slug && progress.scrapedSlugs.includes(slug)) {
                continue;
            }
            
            log(`🎨 [${i+1}/${limit}] Visiting: ${card.artistName}`);
            
            const artworks = await scrapeArtistPage(page, card.url, formatArtistName(card.artistName));
            
            for (const artwork of artworks) {
                if (!artwork.title) continue;
                
                const id = `${slug}-${artwork.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').substring(0, 50)}`;
                
                // Check for duplicates
                if (progress.artworks.some(a => a.id === id)) continue;
                
                // Determine category
                let category = 'Painting';
                const mediumLower = (artwork.medium || '').toLowerCase();
                if (mediumLower.includes('marble') || mediumLower.includes('bronze') || mediumLower.includes('terracotta')) {
                    category = 'Sculpture';
                }
                
                progress.artworks.push({
                    id,
                    slug: id,
                    title: artwork.title,
                    artist: artwork.artist,
                    year: '',  // Not provided on website
                    medium: artwork.medium || '',
                    category,
                    dimensions: artwork.dimensions || '',
                    roomId: '',
                    image: artwork.image || '',
                    inventory: artwork.inventory || '',
                    sourceUrl: card.url
                });
                
                artworkCount++;
                log(`   ✓ ${artwork.title.substring(0, 40)}...`);
            }
            
            progress.scrapedSlugs.push(slug);
            
            // Save progress periodically
            if ((i + 1) % 10 === 0) {
                saveProgress(progress);
                log(`   [Saved progress: ${progress.artworks.length} artworks]`);
            }
            
            await delay(500);
        }
        
        progress.done = true;
        saveProgress(progress);
        
        // Write final output
        const output = {
            museum: 'Galleria Doria Pamphilj',
            museumId: 'doria-pamphilj',
            location: 'Rome, Italy',
            type: 'permanent',
            scrapedAt: new Date().toISOString(),
            totalArtworks: progress.artworks.length,
            artworksWithImage: progress.artworks.filter(a => a.image).length,
            artworksWithTitle: progress.artworks.filter(a => a.title).length,
            artworksWithDimensions: progress.artworks.filter(a => a.dimensions).length,
            objects: progress.artworks
        };
        
        const outputPath = path.join(OUTPUT_DIR, OUTPUT_FILE);
        fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
        
        log(`\n✅ Done! ${progress.artworks.length} items saved to ${OUTPUT_FILE}`);
        log('\n📊 Summary:');
        log(`   Total artworks: ${progress.artworks.length}`);
        log(`   With images: ${output.artworksWithImage}`);
        log(`   With titles: ${output.artworksWithTitle}`);
        log(`   With dimensions: ${output.artworksWithDimensions}`);
        
    } catch (error) {
        log(`❌ Error: ${error.message}`);
        console.error(error);
    } finally {
        await browser.close();
    }
}

main().catch(console.error);
