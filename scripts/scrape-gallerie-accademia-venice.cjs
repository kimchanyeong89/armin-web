/**
 * Gallerie dell'Accademia di Venezia Scraper
 * 
 * Scrapes artworks from Gallerie dell'Accademia (Venice)
 * Combines 3 collections: collezione, opere-non-esposte, gabinetto-disegni-stampe
 * 
 * Collects: title, artist, year, medium, category, dimensions, room, image
 * 
 * Usage:
 *   node scripts/scrape-gallerie-accademia-venice.cjs          # Full scrape
 *   node scripts/scrape-gallerie-accademia-venice.cjs --test   # Test mode (3 pages per collection)
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://www.gallerieaccademia.it';
const COLLECTIONS = [
    { path: '/en/collezione', name: 'Collection', totalPages: 5 },
    { path: '/en/opere-non-esposte', name: 'Not on Display', totalPages: 8 },
    { path: '/en/gabinetto-disegni-stampe', name: 'Drawings & Prints', totalPages: 1 }
];
const OUTPUT_DIR = path.join(__dirname, '../public/data');
const DOWNLOADS_DIR = path.join(__dirname, '../downloads');
const PROGRESS_FILE = path.join(DOWNLOADS_DIR, 'gallerie-accademia-venice-progress.json');
const OUTPUT_FILE = 'gallerie-accademia-venice-collection.json';
const SAVE_INTERVAL = 50;

const delay = ms => new Promise(r => setTimeout(r, ms));
const timestamp = () => new Date().toLocaleTimeString('ko-KR', { hour12: false });
const log = msg => console.log(`[${timestamp()}] [ACCADEMIA-VE] ${msg}`);

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
        currentCollection: 0,
        currentPage: 0,
        done: false
    };
}

function saveProgress(progress) {
    fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

/**
 * Format artist name: remove "detto" suffix patterns, clean up
 * "GIORGIO O ZORZI DA CASTELFRANCO DETTO GIORGIONE" -> "Giorgione"
 */
function formatArtistName(rawName) {
    if (!rawName) return '';
    
    let name = rawName.trim();
    
    // Remove all-caps and normalize case
    if (name === name.toUpperCase()) {
        name = name.split(' ').map(word => 
            word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
        ).join(' ');
    }
    
    // If contains "detto" or "called", use the nickname
    const dettoMatch = name.match(/detto\s+(.+)$/i);
    if (dettoMatch) {
        name = dettoMatch[1].trim();
    }
    
    // Remove commas and periods between name parts
    name = name.replace(/[.,]/g, ' ').replace(/\s+/g, ' ').trim();
    
    return name;
}

/**
 * Extract artwork links from a collection page
 */
async function extractArtworkLinks(page) {
    return await page.evaluate((baseUrl) => {
        const links = [];
        const seenHrefs = new Set();
        
        // Look for artwork cards/links
        // Structure: <a href="/en/tempest">...</a> or <a href="/la-tempesta">...</a>
        const artworkSelectors = [
            'article a[href*="/en/"]',
            '.views-row a[href*="/en/"]',
            '.node--type-opera a',
            'a[href^="/en/"][href]:not([href*="page="])'
        ];
        
        for (const selector of artworkSelectors) {
            document.querySelectorAll(selector).forEach(link => {
                const href = link.getAttribute('href');
                if (!href || seenHrefs.has(href)) return;
                
                // Skip navigation and non-artwork pages
                const skipPatterns = [
                    '/collezione', '/opere-non-esposte', '/gabinetto',
                    'page=', '/admission', '/plan', '/newsletter', '/support',
                    '/node/', '/contacts', '/accessibility', '/membership',
                    '/museum-', '/history', '/church', '/scuola-', '/conservation',
                    '/mostre', '/use-images', '/rent-venue', '/art-bonus',
                    '/5xmille', '/patrons', '/progetto', '/sponsorship', '/bandi',
                    '/provvedimenti', '/credits', '/help-us', '/news', '/eventi',
                    '/transparent', '/legal', '/privacy', '/cookie', '/rivelazioni'
                ];
                if (href === '/en' || href === '/en/' || 
                    skipPatterns.some(p => href.toLowerCase().includes(p))) return;
                
                seenHrefs.add(href);
                
                // Extract slug from URL
                const slugMatch = href.match(/\/en\/([^/?#]+)$/);
                if (!slugMatch) return;
                
                const slug = slugMatch[1];
                
                // Skip if it's a page navigation
                if (/^\d+$/.test(slug)) return;
                
                // Get artist name from the card if available
                let artist = '';
                const artistEl = link.closest('article')?.querySelector('h3, .field--name-field-autore');
                if (artistEl) {
                    artist = artistEl.textContent.trim();
                }
                
                // Get thumbnail
                const img = link.querySelector('img');
                let thumbnail = '';
                if (img) {
                    thumbnail = img.src || img.dataset.src || '';
                }
                
                links.push({
                    slug,
                    sourceUrl: href.startsWith('http') ? href : baseUrl + href,
                    artist,
                    thumbnail
                });
            });
        }
        
        return links;
    }, BASE_URL);
}

/**
 * Extract artwork details from detail page
 */
async function extractArtworkDetails(page, item, collectionName) {
    try {
        await page.goto(item.sourceUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await delay(1500);
        
        // Scroll to load content
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2));
        await delay(500);
        
        const details = await page.evaluate(() => {
            const result = {
                title: '',
                artist: '',
                year: '',
                medium: '',
                category: '',
                dimensions: '',
                room: '',
                image: '',
                inventory: ''
            };
            
            // Title - h1
            const titleEl = document.querySelector('h1');
            if (titleEl) {
                result.title = titleEl.textContent.trim();
            }
            
            // Look for metadata in the detail section
            // Format: "Author:Giorgio o Zorzi da Castelfranco detto GiorgioneCastelfranco 1476/1477 - Venezia 1510Title:The TempestCatalogue: 915Support: Canvas, 82 x 73 cm"
            const detailText = document.body.innerText;
            
            // Author
            const authorMatch = detailText.match(/Author:\s*([^\n]+?)(?:Title:|Catalogue:|$)/i);
            if (authorMatch) {
                // Extract just the name, removing dates
                let authorText = authorMatch[1].trim();
                // Remove birth-death dates pattern like "Castelfranco 1476/1477 - Venezia 1510"
                authorText = authorText.replace(/[A-Za-z]+\s+\d{4}[\/\d]*\s*-\s*[A-Za-z]+\s+\d{4}/g, '').trim();
                result.artist = authorText;
            }
            
            // Catalogue/Inventory number
            const catMatch = detailText.match(/Catalogue:\s*(\d+)/i);
            if (catMatch) {
                result.inventory = catMatch[1];
            }
            
            // Support (medium + dimensions)
            const supportMatch = detailText.match(/Support:\s*([^\n]+)/i);
            if (supportMatch) {
                const supportText = supportMatch[1].trim();
                // Split by comma - first part is medium, rest might include dimensions
                const parts = supportText.split(',').map(p => p.trim());
                if (parts.length >= 1) {
                    result.medium = parts[0];
                }
                if (parts.length >= 2) {
                    // Look for dimensions pattern
                    const dimPart = parts.slice(1).join(', ');
                    const dimMatch = dimPart.match(/(\d+(?:\.\d+)?\s*x\s*\d+(?:\.\d+)?\s*cm)/i);
                    if (dimMatch) {
                        result.dimensions = dimMatch[1];
                    }
                }
            }
            
            // Try alternative metadata format
            // Look for labeled fields
            const fieldMappings = {
                'Autore': 'artist',
                'Author': 'artist',
                'Titolo': 'title',
                'Title': 'title',
                'Data': 'year',
                'Date': 'year',
                'Datazione': 'year',
                'Tecnica': 'medium',
                'Technique': 'medium',
                'Supporto': 'medium',
                'Support': 'medium',
                'Dimensioni': 'dimensions',
                'Dimensions': 'dimensions',
                'Misure': 'dimensions',
                'Collocazione': 'room',
                'Location': 'room',
                'Sala': 'room',
                'Room': 'room',
                'Hall': 'room'
            };
            
            // Try to find key-value pairs
            for (const [label, field] of Object.entries(fieldMappings)) {
                if (!result[field]) {
                    const regex = new RegExp(label + '[:\\s]+([^\\n]+)', 'i');
                    const match = detailText.match(regex);
                    if (match) {
                        result[field] = match[1].trim();
                    }
                }
            }
            
            // Image - look for high-res image first from gallery links
            // Gallery lightbox links contain high-res images at /repository/media/images/
            const galleryLinks = document.querySelectorAll('a[href*="/repository/media/images/"]');
            for (const link of galleryLinks) {
                if (link.href && !link.href.includes('logo') && !link.href.includes('icon')) {
                    result.image = link.href;
                    break;
                }
            }
            
            // Fallback to img tags if no gallery links found
            if (!result.image) {
                const imageSelectors = [
                    'img[src*="/repository/media/images/"]',
                    'img[src*="/sites/default/files/"]',
                    '.field--name-field-immagine img',
                    'article img',
                    'main img'
                ];
                
                for (const selector of imageSelectors) {
                    const imgs = document.querySelectorAll(selector);
                    for (const img of imgs) {
                        if (img.src && !img.src.includes('logo') && !img.src.includes('icon')) {
                            // Get highest quality version
                            let src = img.src;
                            // Remove style suffixes to get original
                            src = src.replace(/\/styles\/[^/]+\/public\//, '/');
                            result.image = src;
                            break;
                        }
                    }
                    if (result.image) break;
                }
            }
            
            // Try to find room/hall info
            const roomMatch = detailText.match(/(?:Sala|Room|Hall)\s*(\d+)/i);
            if (roomMatch && !result.room) {
                result.room = roomMatch[1];
            }
            
            // Determine category from medium or context
            if (!result.category) {
                const mediumLower = (result.medium || '').toLowerCase();
                if (mediumLower.includes('canvas') || mediumLower.includes('panel') || 
                    mediumLower.includes('oil') || mediumLower.includes('tempera')) {
                    result.category = 'Painting';
                } else if (mediumLower.includes('marble') || mediumLower.includes('bronze') ||
                           mediumLower.includes('sculpture') || mediumLower.includes('terracotta')) {
                    result.category = 'Sculpture';
                } else if (mediumLower.includes('drawing') || mediumLower.includes('paper') ||
                           mediumLower.includes('pencil') || mediumLower.includes('ink')) {
                    result.category = 'Drawing';
                } else if (mediumLower.includes('print') || mediumLower.includes('engraving') ||
                           mediumLower.includes('etching')) {
                    result.category = 'Print';
                }
            }
            
            return result;
        });
        
        // Use pre-extracted artist if page extraction failed
        let artist = details.artist || item.artist || '';
        artist = formatArtistName(artist);
        
        // Set category based on collection if not determined
        let category = details.category || '';
        if (!category) {
            if (collectionName === 'Drawings & Prints') {
                category = 'Drawing';
            } else {
                category = 'Painting';
            }
        }
        
        return {
            id: item.slug,
            slug: item.slug,
            title: details.title,
            artist: artist,
            year: details.year,
            medium: details.medium,
            category: category,
            dimensions: details.dimensions,
            roomId: details.room || '',
            image: details.image || item.thumbnail,
            inventory: details.inventory,
            collection: collectionName,
            sourceUrl: item.sourceUrl
        };
        
    } catch (e) {
        log(`  ⚠️ Failed to get details for ${item.slug}: ${e.message}`);
        return {
            id: item.slug,
            slug: item.slug,
            artist: formatArtistName(item.artist),
            image: item.thumbnail,
            sourceUrl: item.sourceUrl,
            collection: collectionName,
            error: e.message
        };
    }
}

/**
 * Get total number of pages for a collection
 */
async function getTotalPages(page, collectionPath) {
    await page.goto(BASE_URL + collectionPath, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await delay(2000);
    
    // Handle cookie consent
    try {
        const cookieBtn = await page.$('button:has-text("Accept"), button:has-text("Accetta"), .eu-cookie-compliance-default-button');
        if (cookieBtn) {
            await cookieBtn.click();
            await delay(500);
        }
    } catch (e) { }
    
    return await page.evaluate(() => {
        // Look for pagination links
        const lastPageLink = document.querySelector('a[title="Go to last page"]');
        if (lastPageLink) {
            const href = lastPageLink.getAttribute('href');
            const match = href.match(/page=(\d+)/);
            if (match) {
                return parseInt(match[1]) + 1; // page is 0-indexed
            }
        }
        
        // Try finding page numbers
        const pageLinks = document.querySelectorAll('a[href*="page="]');
        let maxPage = 0;
        pageLinks.forEach(link => {
            const href = link.getAttribute('href');
            const match = href.match(/page=(\d+)/);
            if (match) {
                const pageNum = parseInt(match[1]);
                if (pageNum > maxPage) maxPage = pageNum;
            }
        });
        
        return maxPage + 1 || 1;
    });
}

async function main() {
    const args = process.argv.slice(2);
    const testMode = args.includes('--test');
    const maxTestPages = 3;
    
    log(`🏛️ Gallerie dell'Accademia di Venezia Scraper`);
    log(`   Mode: ${testMode ? `TEST (first ${maxTestPages} pages per collection)` : 'FULL'}`);
    log(`   Venice, Italy - 3 Collections Combined`);
    
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
    
    const listPage = await context.newPage();
    const detailPage = await context.newPage();
    
    try {
        // Process each collection
        for (let colIdx = progress.currentCollection; colIdx < COLLECTIONS.length; colIdx++) {
            const collection = COLLECTIONS[colIdx];
            log(`\n📚 Processing collection: ${collection.name} (${collection.path})`);
            
            // Get actual total pages
            const totalPages = await getTotalPages(listPage, collection.path);
            log(`   Found ${totalPages} pages`);
            
            const pagesToScrape = testMode ? Math.min(maxTestPages, totalPages) : totalPages;
            const startPage = (colIdx === progress.currentCollection) ? progress.currentPage : 0;
            
            for (let pageNum = startPage; pageNum < pagesToScrape; pageNum++) {
                log(`📖 Scraping ${collection.name} page ${pageNum + 1}/${pagesToScrape}...`);
                
                const pageUrl = pageNum === 0 
                    ? BASE_URL + collection.path 
                    : `${BASE_URL}${collection.path}?page=${pageNum}`;
                    
                await listPage.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
                await delay(2000);
                
                // Scroll to load lazy images
                await listPage.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2));
                await delay(500);
                await listPage.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
                await delay(500);
                
                const pageLinks = await extractArtworkLinks(listPage);
                log(`   Found ${pageLinks.length} artworks on page ${pageNum + 1}`);
                
                // Filter out already scraped
                const newLinks = pageLinks.filter(link => !progress.scrapedSlugs.includes(link.slug));
                
                // Scrape each artwork
                for (let i = 0; i < newLinks.length; i++) {
                    const link = newLinks[i];
                    
                    log(`🎨 [${i + 1}/${newLinks.length}] Scraping: ${link.slug}`);
                    
                    const artwork = await extractArtworkDetails(detailPage, link, collection.name);
                    
                    // Skip if no image
                    if (!artwork.image || artwork.image === '') {
                        log(`   ⚠️ Skipping ${link.slug} - no image`);
                        progress.scrapedSlugs.push(link.slug);
                        continue;
                    }
                    
                    // Warn if missing required fields
                    if (!artwork.title) log(`   ⚠️ Missing title for ${link.slug}`);
                    if (!artwork.artist) log(`   ⚠️ Missing artist for ${link.slug}`);
                    
                    progress.artworks.push(artwork);
                    progress.scrapedSlugs.push(link.slug);
                    
                    // Save progress periodically
                    if (progress.artworks.length % SAVE_INTERVAL === 0) {
                        progress.currentCollection = colIdx;
                        progress.currentPage = pageNum;
                        saveProgress(progress);
                        log(`   💾 Checkpoint saved: ${progress.artworks.length} items`);
                    }
                    
                    await delay(500 + Math.random() * 500);
                }
                
                progress.currentPage = pageNum + 1;
            }
            
            progress.currentCollection = colIdx + 1;
            progress.currentPage = 0;
        }
        
        progress.done = !testMode;
        
    } finally {
        await browser.close();
    }
    
    // Final save
    saveProgress(progress);
    
    // Create output file
    const outputData = {
        museum: "Gallerie dell'Accademia di Venezia",
        museumId: "gallerie-accademia-venice",
        location: "Venice, Italy",
        type: "permanent",
        scrapedAt: new Date().toISOString(),
        totalArtworks: progress.artworks.length,
        artworksWithImage: progress.artworks.filter(a => a.image).length,
        artworksWithTitle: progress.artworks.filter(a => a.title).length,
        artworksWithArtist: progress.artworks.filter(a => a.artist).length,
        artworksWithYear: progress.artworks.filter(a => a.year).length,
        collections: COLLECTIONS.map(c => c.name),
        objects: progress.artworks
    };
    
    fs.writeFileSync(path.join(OUTPUT_DIR, OUTPUT_FILE), JSON.stringify(outputData, null, 2));
    log(`\n✅ Done! ${progress.artworks.length} items saved to ${OUTPUT_FILE}`);
    
    // Summary
    log(`\n📊 Summary:`);
    log(`   Total artworks: ${progress.artworks.length}`);
    log(`   With images: ${outputData.artworksWithImage}`);
    log(`   With titles: ${outputData.artworksWithTitle}`);
    log(`   With artists: ${outputData.artworksWithArtist}`);
    log(`   With years: ${outputData.artworksWithYear}`);
    
    // Collection breakdown
    for (const col of COLLECTIONS) {
        const count = progress.artworks.filter(a => a.collection === col.name).length;
        log(`   ${col.name}: ${count} items`);
    }
    
    // Check for issues
    const issues = progress.artworks.filter(a => !a.title || !a.artist);
    if (issues.length > 0) {
        log(`\n⚠️ ${issues.length} items with missing required fields`);
    }
}

main().catch(console.error);
