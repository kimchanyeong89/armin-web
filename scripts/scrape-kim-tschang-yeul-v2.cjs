const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

const BASE_URL = 'https://kimtschang-yeul.jeju.go.kr';
const OUTPUT_FILE = path.join(__dirname, '../public/data/kim-tschang-yeul-collection.json');
const PROGRESS_FILE = path.join(__dirname, '../downloads/kim-tschang-yeul-progress.json');

// Load progress
function loadProgress() {
    if (fs.existsSync(PROGRESS_FILE)) {
        try {
            const data = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
            return {
                ...data,
                processedIds: new Set(data.processedIds || []),
            };
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

// Scrape collection
async function scrapeCollection() {
    console.log('=== Starting Kim Tschang-Yeul Museum Scraping ===\n');
    
    const progress = loadProgress();
    const processedIds = progress.processedIds || new Set();
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
        const MAX_PAGES = 30;

        while (hasMore && currentPage <= MAX_PAGES) {
            console.log(`\n[Page ${currentPage}] Loading...`);
            
            // Load first page or navigate using pagination
            if (currentPage === 1) {
                try {
                    await page.goto(`${BASE_URL}/colectionList.do?menuNum=5100`, { waitUntil: 'domcontentloaded', timeout: 60000 });
                    await new Promise(resolve => setTimeout(resolve, 3000));
                } catch (e) {
                    console.error(`  Failed to load page ${currentPage}:`, e.message);
                    currentPage++;
                    continue;
                }
            } else {
                // Try to click pagination button for next page
                try {
                    const clicked = await page.evaluate((pageNum) => {
                        // Find pagination links
                        const links = Array.from(document.querySelectorAll('a, .pagination a'));
                        const nextLink = links.find(link => {
                            const text = link.textContent?.trim() || '';
                            const href = link.href || '';
                            // Look for page number or "Next" button
                            return text === String(pageNum) || 
                                   (pageNum === 2 && (text.includes('Next') || text.includes('다음'))) ||
                                   href.includes(`page=${pageNum}`);
                        });
                        if (nextLink) {
                            nextLink.click();
                            return true;
                        }
                        return false;
                    }, currentPage);
                    
                    if (clicked) {
                        await new Promise(resolve => setTimeout(resolve, 3000));
                    } else {
                        // Fallback: try URL with page parameter
                        await page.goto(`${BASE_URL}/colectionList.do?menuNum=5100&page=${currentPage}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
                        await new Promise(resolve => setTimeout(resolve, 3000));
                    }
                } catch (e) {
                    console.error(`  Failed to navigate to page ${currentPage}:`, e.message);
                    currentPage++;
                    continue;
                }
            }

            // Extract all artwork IDs and basic info from current page
            const pageData = await page.evaluate(() => {
                const items = [];
                const elements = document.querySelectorAll('[onclick*="fn_colModal"]');
                
                elements.forEach((el) => {
                    const onclick = el.getAttribute('onclick');
                    if (!onclick) return;
                    
                    const idMatch = onclick.match(/fn_colModal\(['"]?([^,]+)['"]?\s*,\s*(\d+)/);
                    const artworkId = idMatch ? idMatch[2] : null;
                    if (!artworkId) return;
                    
                    // Find container
                    let container = el;
                    for (let i = 0; i < 5; i++) {
                        container = container.parentElement;
                        if (!container) break;
                        if (container.tagName === 'DIV' || container.tagName === 'LI') break;
                    }
                    
                    // Get all text
                    const allText = container.textContent || '';
                    
                    // Find title - look for h4, h5, h6, or strong with text
                    let title = '';
                    
                    // Method 1: Look for heading elements
                    const titleEl = container.querySelector('h4, h5, h6');
                    if (titleEl) {
                        title = titleEl.textContent?.trim() || '';
                    }
                    
                    // Method 2: Look for strong elements
                    if (!title) {
                        const strongEl = container.querySelector('strong');
                        if (strongEl) {
                            title = strongEl.textContent?.trim() || '';
                        }
                    }
                    
                    // Method 3: Extract from text pattern "무제 1/ 60x116cm/ 캔버스에 유채/ 1957"
                    if (!title) {
                        // Clean text: remove extra whitespace
                        const cleanText = allText.replace(/\s+/g, ' ').trim();
                        
                        // Pattern 1: Title before first "/" or number followed by "/"
                        // Example: "무제 1/ 60x116cm/..." -> "무제"
                        const titleMatch1 = cleanText.match(/^([^/\d]+?)(?:\s+\d+\s*\/|\s*\/)/);
                        if (titleMatch1) {
                            title = titleMatch1[1].trim();
                        } else {
                            // Pattern 2: First word/phrase before any "/"
                            const firstPart = cleanText.split('/')[0]?.trim();
                            if (firstPart) {
                                // Remove trailing numbers
                                title = firstPart.replace(/\s+\d+\s*$/, '').trim();
                            }
                        }
                    }
                    
                    // Clean title: remove leading/trailing numbers and whitespace
                    title = title.replace(/^\d+\s*/, '').replace(/\s+\d+\s*$/, '').trim();
                    
                    // If still empty, try to get from image alt or any text
                    if (!title || title === '') {
                        const img = container.querySelector('img') || el.querySelector('img');
                        title = img?.alt?.trim() || 'Untitled';
                    }
                    
                    // Find image
                    const img = container.querySelector('img') || el.querySelector('img');
                    let imgSrc = img?.src || img?.getAttribute('data-src') || '';
                    
                    // Extract metadata from text
                    const dimensionsMatch = allText.match(/(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)\s*(?:x\s*(\d+(?:\.\d+)?))?\s*(?:cm|mm|m)/i);
                    const yearMatch = allText.match(/\b(19|20)\d{2}\b/);
                    const mediumMatch = allText.match(/(?:캔버스|종이|판|판자)\s*(?:에|위에)?\s*(?:유채|아크릴릭|오일|수채|아크릴)|(?:유채|아크릴릭|오일|수채|아크릴|드로잉|그림|회화|조각|스컬프처)/i);
                    
                    items.push({
                        id: artworkId,
                        title: title || 'Untitled',
                        image: imgSrc,
                        dimensions: dimensionsMatch ? `${dimensionsMatch[1]} x ${dimensionsMatch[2]}${dimensionsMatch[3] ? ' x ' + dimensionsMatch[3] : ''} cm` : '',
                        year: yearMatch ? parseInt(yearMatch[0]) : null,
                        medium: mediumMatch ? mediumMatch[0].trim() : '',
                        allText: allText.substring(0, 1000),
                    });
                });
                
                // Get total count
                const totalText = document.querySelector('[class*="total"], [class*="count"]')?.textContent || '';
                const totalMatch = totalText.match(/(\d+)/);
                const total = totalMatch ? parseInt(totalMatch[1]) : 0;
                
                return { items, total };
            });

            const pageArtworks = pageData.items;
            const totalExpected = pageData.total || 239;

            // Process each artwork
            let newItemsCount = 0;
            for (const item of pageArtworks) {
                if (processedIds.has(item.id)) {
                    console.log(`  Skipping ${item.title} (ID: ${item.id}) - already processed`);
                    continue;
                }

                newItemsCount++;
                console.log(`  Processing: ${item.title} (ID: ${item.id})`);

                // Get higher resolution image
                let imageUrl = item.image || '';
                if (imageUrl && imageUrl.includes('fileSize=s')) {
                    imageUrl = imageUrl.replace('fileSize=s', 'fileSize=l');
                }

                // Determine category and type
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
                    name: item.title,
                    artist: 'Kim Tschang-Yeul',
                    year: item.year,
                    image: imageUrl,
                    dimensions: item.dimensions,
                    medium: item.medium,
                    description: item.allText,
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
            }

            console.log(`  Found ${pageArtworks.length} artworks on page ${currentPage}, ${newItemsCount} new items (Total expected: ${totalExpected}, Processed: ${allArtworks.length})`);

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
            
            // If no new items found on this page, might be end of collection
            if (newItemsCount === 0 && pageArtworks.length > 0) {
                console.log('  Warning: Found items but all were already processed. This might indicate pagination issue.');
            }

            // Check if we've collected enough
            if (allArtworks.length >= totalExpected) {
                console.log(`  Reached target (${allArtworks.length}/${totalExpected}). Stopping.`);
                hasMore = false;
            } else {
                currentPage++;
                await new Promise(resolve => setTimeout(resolve, 1500));
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
