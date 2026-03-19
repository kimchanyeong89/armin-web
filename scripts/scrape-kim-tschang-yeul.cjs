const fs = require('fs');
const path = require('path');
const axios = require('axios');
const cheerio = require('cheerio');
const puppeteer = require('puppeteer');

const BASE_URL = 'https://kimtschang-yeul.jeju.go.kr';
const OUTPUT_FILE = path.join(__dirname, '../public/data/kim-tschang-yeul-collection.json');
const PROGRESS_FILE = path.join(__dirname, '../downloads/kim-tschang-yeul-progress.json');

// Headers
const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
    'Referer': `${BASE_URL}/colectionList.do?menuNum=5100`,
};

// Load progress
function loadProgress() {
    if (fs.existsSync(PROGRESS_FILE)) {
        try {
            return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
        } catch (e) {
            console.error('Failed to load progress:', e.message);
        }
    }
    return { artworks: [], page: 1, processedIds: new Set() };
}

// Save progress
function saveProgress(progress) {
    const data = {
        ...progress,
        processedIds: Array.from(progress.processedIds),
    };
    fs.writeFileSync(PROGRESS_FILE, JSON.stringify(data, null, 2));
}

// Extract artwork ID from onclick or link
function extractArtworkId(element) {
    const onclick = element.getAttribute('onclick') || '';
    const match = onclick.match(/fn_colModal\(['"]?([^,]+)['"]?\s*,\s*(\d+)/);
    if (match) {
        return match[2]; // Return the ID (second parameter)
    }
    return null;
}

// Note: We extract metadata directly from list page, so no need for separate detail fetching

// Scrape collection
async function scrapeCollection() {
    console.log('=== Starting Kim Tschang-Yeul Museum Scraping ===\n');
    
    const progress = loadProgress();
    const processedIds = new Set(progress.processedIds || []);
    const allArtworks = progress.artworks || [];
    
    const browser = await puppeteer.launch({ 
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
        const page = await browser.newPage();
        await page.setViewport({ width: 1920, height: 1080 });
        
        let currentPage = progress.page || 1;
        let hasMore = true;
        let emptyStreak = 0;

        while (hasMore) {
            console.log(`\n[Page ${currentPage}] Loading...`);
            
            const url = `${BASE_URL}/colectionList.do?menuNum=5100&page=${currentPage}`;
            await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
            await new Promise(resolve => setTimeout(resolve, 2000));

            // Extract artworks from current page
            const pageArtworks = await page.evaluate(() => {
                const items = [];
                // Find all items with onclick that contains fn_colModal
                const elements = document.querySelectorAll('[onclick*="fn_colModal"]');
                
                elements.forEach((el) => {
                    const onclick = el.getAttribute('onclick');
                    if (!onclick) return;
                    
                    const idMatch = onclick.match(/fn_colModal\(['"]?([^,]+)['"]?\s*,\s*(\d+)/);
                    const artworkId = idMatch ? idMatch[2] : null;
                    if (!artworkId) return;
                    
                    // Find container (parent div or li)
                    let container = el;
                    for (let i = 0; i < 5; i++) {
                        container = container.parentElement;
                        if (!container) break;
                        if (container.tagName === 'DIV' || container.tagName === 'LI' || container.tagName === 'ARTICLE') {
                            break;
                        }
                    }
                    
                    // Find title - look for h4, h5, or text in strong/bold
                    // Also check for text nodes directly
                    let title = '';
                    
                    // Method 1: Look for h4, h5, h6, strong
                    const titleEl = container.querySelector('h4, h5, h6, strong, [class*="title"]');
                    if (titleEl) {
                        title = titleEl.textContent?.trim() || '';
                    }
                    
                    // Method 2: Extract from all text - pattern like "무제 1/ 60x116cm/ 캔버스에 유채/ 1957"
                    if (!title) {
                        const allText = container.textContent || '';
                        // Remove whitespace and newlines, then match title pattern
                        const cleanText = allText.replace(/\s+/g, ' ').trim();
                        // Pattern: Korean/English title before first "/" or number
                        const titleMatch = cleanText.match(/^([^/\d]+?)(?:\s*\d+\s*\/|\s*\/)/);
                        if (titleMatch) {
                            title = titleMatch[1].trim();
                        } else {
                            // Fallback: take first word/phrase before any "/"
                            const firstPart = cleanText.split('/')[0]?.trim();
                            if (firstPart && !firstPart.match(/^\d+$/)) {
                                // Remove trailing numbers
                                title = firstPart.replace(/\s+\d+\s*$/, '').trim();
                            }
                        }
                    }
                    
                    // Clean title
                    title = title.replace(/^\d+\s*/, '').trim();
                    
                    // Find image
                    const img = container.querySelector('img') || el.querySelector('img');
                    let imgSrc = img?.src || img?.getAttribute('data-src');
                    
                    // Extract all text from container for metadata
                    const allText = container.textContent || '';
                    
                    // Parse pattern like "무제 1/ 60x116cm/ 캔버스에 유채/ 1957"
                    // or "물방울 3/ 50x64.5x3cm/ 종이에 아크릴릭/ 1975"
                    const parts = allText.split('/').map(p => p.trim()).filter(p => p);
                    
                    let dimensions = '';
                    let year = null;
                    let medium = '';
                    
                    // Try to find dimensions (pattern: number x number [x number] [cm|mm|m])
                    const dimensionsMatch = allText.match(/(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)\s*(?:x\s*(\d+(?:\.\d+)?))?\s*(?:cm|mm|m)/i);
                    if (dimensionsMatch) {
                        dimensions = `${dimensionsMatch[1]} x ${dimensionsMatch[2]}${dimensionsMatch[3] ? ' x ' + dimensionsMatch[3] : ''} cm`;
                    }
                    
                    // Try to find year (4-digit year)
                    const yearMatch = allText.match(/\b(19|20)\d{2}\b/);
                    if (yearMatch) {
                        year = parseInt(yearMatch[0]);
                    }
                    
                    // Try to find medium (캔버스, 종이, 유채, 아크릴릭, etc.)
                    const mediumPatterns = [
                        /(?:캔버스|종이|판|판자)\s*(?:에|위에)?\s*(?:유채|아크릴릭|오일|수채|아크릴)/i,
                        /(?:유채|아크릴릭|오일|수채|아크릴|드로잉|그림|회화|조각|스컬프처)/i,
                    ];
                    
                    for (const pattern of mediumPatterns) {
                        const match = allText.match(pattern);
                        if (match) {
                            medium = match[0].trim();
                            break;
                        }
                    }
                    
                    // If still no title, use first non-empty part
                    if (!title && parts.length > 0) {
                        title = parts[0].replace(/\d+\s*$/, '').trim() || 'Untitled';
                    }
                    
                    if (title || imgSrc) {
                        items.push({
                            id: artworkId,
                            title: title || 'Untitled',
                            image: imgSrc || '',
                            dimensions: dimensions,
                            year: year,
                            medium: medium,
                            allText: allText.substring(0, 500),
                        });
                    }
                });
                
                return items;
            });

            console.log(`  Found ${pageArtworks.length} artworks on page ${currentPage}`);

            if (pageArtworks.length === 0) {
                emptyStreak++;
                if (emptyStreak >= 2) {
                    console.log('  No more items found. Stopping.');
                    hasMore = false;
                    break;
                }
            } else {
                emptyStreak = 0;
            }

            // Process each artwork
            for (const item of pageArtworks) {
                if (processedIds.has(item.id)) {
                    console.log(`  Skipping ${item.id} (already processed)`);
                    continue;
                }

                console.log(`  Processing: ${item.title} (ID: ${item.id})`);

                // Try to get higher resolution image (replace fileSize=s with fileSize=l or remove)
                let imageUrl = item.image || '';
                if (imageUrl && imageUrl.includes('fileSize=s')) {
                    imageUrl = imageUrl.replace('fileSize=s', 'fileSize=l');
                }

                // Determine category and type from medium
                let category = 'Painting';
                let type = '2D';
                const mediumLower = (item.medium || '').toLowerCase();
                if (mediumLower.includes('조각') || mediumLower.includes('스컬프처')) {
                    category = 'Sculpture';
                    type = '3D';
                } else if (mediumLower.includes('드로잉') || mediumLower.includes('그림')) {
                    category = 'Drawing';
                } else if (mediumLower.includes('판화')) {
                    category = 'Print';
                }

                // Build artwork object
                const artwork = {
                    id: `kim-tschang-yeul-${item.id}`,
                    name: item.title || 'Untitled',
                    artist: 'Kim Tschang-Yeul',
                    year: item.year || null,
                    image: imageUrl,
                    dimensions: item.dimensions || '',
                    medium: item.medium || '',
                    description: item.allText || '',
                    category: category,
                    type: type,
                    museum: 'Kim Tschang-Yeul Art Museum',
                    exhibitionName: 'Collection',
                    exhibitionTitle: 'Collection',
                    roomId: 'kim-tschang-yeul-collection',
                    sourceUrl: `${BASE_URL}/colectionList.do?menuNum=5100`,
                    metadata: {
                        artworkId: item.id,
                        museum: 'Kim Tschang-Yeul Art Museum',
                        location: 'Jeju, South Korea',
                    },
                };

                allArtworks.push(artwork);
                processedIds.add(item.id);
                
                // Save progress after each item
                saveProgress({
                    artworks: allArtworks,
                    page: currentPage,
                    processedIds: processedIds,
                });
                
                // Small delay to avoid overwhelming the server
                await new Promise(resolve => setTimeout(resolve, 500));
            }

            // Check if there's a next page
            const paginationInfo = await page.evaluate(() => {
                const totalText = document.querySelector('[class*="total"], [class*="count"]')?.textContent || '';
                const totalMatch = totalText.match(/(\d+)/);
                const total = totalMatch ? parseInt(totalMatch[1]) : 0;
                
                const currentPageEl = document.querySelector('.pagination .active, .pagination .current, [class*="current"]');
                const currentPage = currentPageEl ? parseInt(currentPageEl.textContent) : 1;
                
                // Find next button by text content
                const allLinks = Array.from(document.querySelectorAll('a, .pagination a'));
                const nextBtn = allLinks.find(link => {
                    const text = link.textContent?.toLowerCase() || '';
                    return text.includes('next') || text.includes('다음') || link.href?.includes('page=');
                });
                
                return { total, currentPage, hasNext: !!nextBtn };
            });

            console.log(`  Total: ${paginationInfo.total}, Current: ${paginationInfo.currentPage}, Processed: ${allArtworks.length}`);

            // Check if we've collected enough or reached max pages
            const totalExpected = paginationInfo.total || 239;
            if (allArtworks.length >= totalExpected || currentPage >= 30) {
                console.log(`  Reached target (${allArtworks.length}/${totalExpected}) or max pages. Stopping.`);
                hasMore = false;
            } else if (pageArtworks.length === 0 && emptyStreak >= 2) {
                hasMore = false;
            } else {
                // Move to next page
                currentPage++;
                // Small delay between pages
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }

        await page.close();
    } catch (e) {
        console.error('Scraping error:', e);
    } finally {
        await browser.close();
    }

    // Save final results
    console.log(`\n✅ Scraping complete! Total artworks: ${allArtworks.length}`);
    
    // Write to output file
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(allArtworks, null, 2));
    console.log(`\n📁 Saved to: ${OUTPUT_FILE}`);
    
    // Clean up progress file
    if (fs.existsSync(PROGRESS_FILE)) {
        fs.unlinkSync(PROGRESS_FILE);
    }
}

// Run
scrapeCollection().catch(console.error);
