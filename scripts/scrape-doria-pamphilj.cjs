/**
 * Doria Pamphilj Gallery Scraper
 * 
 * Scrapes masterpieces from Palazzo Doria Pamphilj (Rome)
 * Artist-based navigation: Artists -> Artworks
 * 
 * Collects: title, artist, year, medium, category, dimensions, image
 * 
 * Usage:
 *   node scripts/scrape-doria-pamphilj.cjs          # Full scrape
 *   node scripts/scrape-doria-pamphilj.cjs --test   # Test mode (first 5 artists)
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
        scrapedArtists: [],
        artistList: [],
        done: false
    };
}

function saveProgress(progress) {
    fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

/**
 * Format artist name
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
 * Parse artwork info from masterpieces page text
 * Format: "The Penitent Mary Magdalene122,5 x 98,5 cm; oil on canvas (FC 357)"
 */
function parseArtworkInfo(text) {
    const result = {
        title: '',
        dimensions: '',
        medium: '',
        inventory: ''
    };
    
    if (!text) return result;
    
    // Try to extract FC number (inventory)
    const fcMatch = text.match(/\(FC\s*(\d+)\)/i);
    if (fcMatch) {
        result.inventory = `FC ${fcMatch[1]}`;
        text = text.replace(fcMatch[0], '').trim();
    }
    
    // Try to extract dimensions (e.g., "122,5 x 98,5 cm" or "122.5 x 98.5 cm")
    const dimMatch = text.match(/(\d+[.,]?\d*\s*x\s*\d+[.,]?\d*\s*cm)/i);
    if (dimMatch) {
        result.dimensions = dimMatch[1].replace(/,/g, '.');
        const dimIdx = text.indexOf(dimMatch[0]);
        result.title = text.substring(0, dimIdx).trim();
        
        // Medium is after dimensions and before FC
        const afterDim = text.substring(dimIdx + dimMatch[0].length).trim();
        const mediumMatch = afterDim.match(/^;\s*(.+?)(?:\s*$|\s*\()/);
        if (mediumMatch) {
            result.medium = mediumMatch[1].trim();
        }
    } else {
        // No dimensions, try to split by semicolon
        const parts = text.split(';');
        result.title = parts[0].trim();
        if (parts[1]) {
            result.medium = parts[1].replace(/\([^)]*\)/g, '').trim();
        }
    }
    
    // Handle diameter format (e.g., "Ø 94 cm")
    const diamMatch = text.match(/(Ø\s*\d+[.,]?\d*\s*cm)/i);
    if (diamMatch && !result.dimensions) {
        result.dimensions = diamMatch[1].replace(/,/g, '.');
    }
    
    return result;
}

/**
 * Extract artist portfolio links from masterpieces page
 */
async function extractArtistLinks(page) {
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
    await page.evaluate(async () => {
        const delay = ms => new Promise(r => setTimeout(r, ms));
        for (let i = 0; i < 5; i++) {
            window.scrollBy(0, window.innerHeight);
            await delay(300);
        }
        window.scrollTo(0, 0);
    });
    await delay(1000);
    
    return await page.evaluate((baseUrl) => {
        const artists = [];
        const seenUrls = new Set();
        
        // Find artist portfolio links
        document.querySelectorAll('a[href*="/portfolio/"]').forEach(link => {
            const href = link.getAttribute('href');
            if (!href || seenUrls.has(href)) return;
            
            // Get artist name from h4 heading
            const h4 = link.querySelector('h4') || link.closest('article')?.querySelector('h4');
            let name = '';
            if (h4) {
                name = h4.textContent.trim();
            }
            
            // Skip if no name
            if (!name) return;
            
            seenUrls.add(href);
            
            const slugMatch = href.match(/\/portfolio\/([^/]+)/);
            const slug = slugMatch ? slugMatch[1] : '';
            
            artists.push({
                name,
                slug,
                url: href.startsWith('http') ? href : baseUrl + href
            });
        });
        
        // Deduplicate by slug
        const uniqueArtists = [];
        const slugSet = new Set();
        for (const artist of artists) {
            if (!slugSet.has(artist.slug)) {
                slugSet.add(artist.slug);
                uniqueArtists.push(artist);
            }
        }
        
        return uniqueArtists;
    }, BASE_URL);
}

/**
 * Extract artworks from an artist's portfolio page
 */
async function extractArtistArtworks(page, artist) {
    try {
        await page.goto(artist.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await delay(1500);
        
        // Scroll to load all content
        await page.evaluate(async () => {
            const delay = ms => new Promise(r => setTimeout(r, ms));
            for (let i = 0; i < 3; i++) {
                window.scrollBy(0, window.innerHeight);
                await delay(200);
            }
        });
        await delay(500);
        
        const artworks = await page.evaluate((artistName, artistUrl) => {
            const works = [];
            
            // The page structure has sections with h2 titles and descriptions
            // Each artwork has: title, dimensions, medium, FC number, image, description
            
            // Find all h2 elements (artwork titles)
            const h2s = document.querySelectorAll('h2');
            
            h2s.forEach(h2 => {
                const title = h2.textContent.trim();
                if (!title) return;
                
                // Skip navigation h2s
                if (title.toLowerCase().includes('doria pamphilj') || 
                    title.toLowerCase().includes('documentation')) return;
                
                const work = {
                    title,
                    artist: artistName,
                    dimensions: '',
                    medium: '',
                    inventory: '',
                    image: '',
                    description: ''
                };
                
                // Find the containing section
                let container = h2.closest('section') || h2.parentElement;
                
                // Look for info text after the title (dimensions, medium, FC)
                let nextEl = h2.nextElementSibling;
                while (nextEl && !['H2', 'H1'].includes(nextEl.tagName)) {
                    const text = nextEl.textContent?.trim() || '';
                    
                    // Check for dimensions pattern
                    const dimMatch = text.match(/(\d+[.,]?\d*\s*x\s*\d+[.,]?\d*\s*cm)/i);
                    if (dimMatch && !work.dimensions) {
                        work.dimensions = dimMatch[1].replace(/,/g, '.');
                    }
                    
                    // Check for diameter
                    const diamMatch = text.match(/(Ø\s*\d+[.,]?\d*\s*cm)/i);
                    if (diamMatch && !work.dimensions) {
                        work.dimensions = diamMatch[1].replace(/,/g, '.');
                    }
                    
                    // Check for medium (oil on canvas, tempera, marble, etc.)
                    const mediumPatterns = [
                        /oil on (canvas|panel|wood|copper)/i,
                        /tempera on (canvas|wood|panel)/i,
                        /(marble|bronze|terracotta)/i,
                        /oil on wood panel/i,
                        /tempera and gold/i
                    ];
                    for (const pattern of mediumPatterns) {
                        const medMatch = text.match(pattern);
                        if (medMatch && !work.medium) {
                            work.medium = medMatch[0];
                            break;
                        }
                    }
                    
                    // Alternative: extract full medium text
                    if (!work.medium) {
                        const semiMatch = text.match(/cm[;,]?\s*([^(]+)/i);
                        if (semiMatch) {
                            work.medium = semiMatch[1].trim();
                        }
                    }
                    
                    // Check for FC inventory
                    const fcMatch = text.match(/\(FC\s*(\d+)\)/i);
                    if (fcMatch && !work.inventory) {
                        work.inventory = `FC ${fcMatch[1]}`;
                    }
                    
                    // If it's a paragraph, might be description
                    if (nextEl.tagName === 'P' && text.length > 50 && !work.description) {
                        work.description = text.substring(0, 200);
                    }
                    
                    nextEl = nextEl.nextElementSibling;
                }
                
                // Find associated image
                // Images are typically in links before the h2 or in the same section
                const section = h2.closest('section') || h2.closest('article') || h2.parentElement;
                if (section) {
                    const imgs = section.querySelectorAll('img');
                    for (const img of imgs) {
                        if (img.src && !img.src.includes('logo') && !img.src.includes('flag')) {
                            // Prefer larger images
                            let src = img.src;
                            // Try to get full size version
                            src = src.replace(/-\d+x\d+\./, '.');
                            work.image = src;
                            break;
                        }
                    }
                }
                
                // Also check for linked images (a > img patterns)
                if (!work.image) {
                    const imgLinks = document.querySelectorAll('a[href*=".jpg"], a[href*=".png"]');
                    imgLinks.forEach(link => {
                        if (!work.image) {
                            const href = link.getAttribute('href');
                            if (href && href.includes(artist.slug || artistName.toLowerCase().replace(/\s/g, '-'))) {
                                work.image = href;
                            }
                        }
                    });
                }
                
                works.push(work);
            });
            
            // If no h2-based works found, try alternative structure
            if (works.length === 0) {
                // Look for image + text pairs
                const mainContent = document.querySelector('main, article, .content');
                if (mainContent) {
                    const imgs = mainContent.querySelectorAll('img[src*="uploads"]');
                    imgs.forEach(img => {
                        if (img.src.includes('logo') || img.src.includes('flag')) return;
                        
                        works.push({
                            title: artistName + ' artwork',
                            artist: artistName,
                            image: img.src.replace(/-\d+x\d+\./, '.'),
                            dimensions: '',
                            medium: '',
                            inventory: ''
                        });
                    });
                }
            }
            
            return works;
        }, artist.name, artist.url);
        
        // Add source URL and format artist name
        return artworks.map(work => ({
            ...work,
            artist: formatArtistName(work.artist),
            sourceUrl: artist.url,
            category: determineCategoryFromMedium(work.medium)
        }));
        
    } catch (e) {
        log(`  ⚠️ Failed to scrape artist ${artist.name}: ${e.message}`);
        return [];
    }
}

function determineCategoryFromMedium(medium) {
    if (!medium) return 'Painting';
    const m = medium.toLowerCase();
    if (m.includes('marble') || m.includes('bronze') || m.includes('terracotta')) {
        return 'Sculpture';
    }
    if (m.includes('drawing') || m.includes('pencil') || m.includes('ink')) {
        return 'Drawing';
    }
    return 'Painting';
}

async function main() {
    const args = process.argv.slice(2);
    const testMode = args.includes('--test');
    const maxTestArtists = 5;
    
    log(`🏛️ Doria Pamphilj Gallery Scraper`);
    log(`   Mode: ${testMode ? `TEST (first ${maxTestArtists} artists)` : 'FULL'}`);
    log(`   Rome, Italy - Masterpieces Collection`);
    
    const progress = loadProgress();
    
    if (progress.done && !testMode) {
        log('✅ Already completed. Delete progress file to restart.');
        return;
    }
    
    log(`   Resuming with ${progress.artworks.length} items already scraped`);
    
    const browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox']
    });
    
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        viewport: { width: 1920, height: 1080 }
    });
    
    const page = await context.newPage();
    
    try {
        // Get list of artists if not already loaded
        if (progress.artistList.length === 0) {
            log(`📋 Getting artist list from masterpieces page...`);
            progress.artistList = await extractArtistLinks(page);
            saveProgress(progress);
            log(`   Found ${progress.artistList.length} artists`);
        }
        
        const artistsToScrape = testMode 
            ? progress.artistList.slice(0, maxTestArtists)
            : progress.artistList;
        
        // Process each artist
        for (let i = 0; i < artistsToScrape.length; i++) {
            const artist = artistsToScrape[i];
            
            // Skip already scraped artists
            if (progress.scrapedArtists.includes(artist.slug)) {
                continue;
            }
            
            log(`\n👨‍🎨 [${i + 1}/${artistsToScrape.length}] Scraping: ${artist.name}`);
            
            const artworks = await extractArtistArtworks(page, artist);
            log(`   Found ${artworks.length} artworks`);
            
            for (const artwork of artworks) {
                // Generate unique ID
                const baseSlug = artwork.title
                    .toLowerCase()
                    .replace(/[^a-z0-9]+/g, '-')
                    .replace(/^-|-$/g, '')
                    .substring(0, 50);
                artwork.id = `${artist.slug}-${baseSlug}`;
                artwork.slug = artwork.id;
                
                // Skip if no image
                if (!artwork.image) {
                    log(`   ⚠️ Skipping "${artwork.title}" - no image`);
                    continue;
                }
                
                progress.artworks.push(artwork);
                
                // Warn if missing required fields
                if (!artwork.title) log(`   ⚠️ Missing title`);
            }
            
            progress.scrapedArtists.push(artist.slug);
            
            // Save progress periodically
            if (progress.artworks.length % SAVE_INTERVAL === 0 || 
                (i + 1) % 5 === 0) {
                saveProgress(progress);
                log(`   💾 Checkpoint saved: ${progress.artworks.length} items`);
            }
            
            await delay(1000 + Math.random() * 500);
        }
        
        progress.done = !testMode;
        
    } finally {
        await browser.close();
    }
    
    // Final save
    saveProgress(progress);
    
    // Create output file
    const outputData = {
        museum: "Palazzo Doria Pamphilj",
        museumId: "doria-pamphilj",
        location: "Rome, Italy",
        type: "permanent",
        scrapedAt: new Date().toISOString(),
        totalArtworks: progress.artworks.length,
        artworksWithImage: progress.artworks.filter(a => a.image).length,
        artworksWithTitle: progress.artworks.filter(a => a.title).length,
        artworksWithArtist: progress.artworks.filter(a => a.artist).length,
        artworksWithDimensions: progress.artworks.filter(a => a.dimensions).length,
        artists: progress.artistList.map(a => a.name),
        objects: progress.artworks
    };
    
    fs.writeFileSync(path.join(OUTPUT_DIR, OUTPUT_FILE), JSON.stringify(outputData, null, 2));
    log(`\n✅ Done! ${progress.artworks.length} items saved to ${OUTPUT_FILE}`);
    
    // Summary
    log(`\n📊 Summary:`);
    log(`   Total artists: ${progress.artistList.length}`);
    log(`   Total artworks: ${progress.artworks.length}`);
    log(`   With images: ${outputData.artworksWithImage}`);
    log(`   With titles: ${outputData.artworksWithTitle}`);
    log(`   With dimensions: ${outputData.artworksWithDimensions}`);
    
    // Check for issues
    const issues = progress.artworks.filter(a => !a.title || !a.image);
    if (issues.length > 0) {
        log(`\n⚠️ ${issues.length} items with missing required fields`);
    }
}

main().catch(console.error);
