const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');
const { fetch } = require('undici'); // or native fetch if node 18+

const BASE_URL = 'https://www.mori.art.museum';
const OUTPUT_FILE = path.join(__dirname, '../public/data/mori-collection.json');

// Letters to iterate
const LETTERS = 'abcdefghijklmnopqrstuvwxyz'.split('');
LETTERS.push('other');

const TIMEOUT = 10000;
const DELAY_MS = 2000; // Increased delay to avoid blocks

function wait(ms) {
    return new Promise(r => setTimeout(r, ms));
}

async function fetchHtml(url, retries = 3) {
    // console.log(`Fetching ${url}...`);
    for (let i = 0; i < retries; i++) {
        try {
            const res = await fetch(url, {
                 headers: {
                     'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                 },
                 signal: AbortSignal.timeout(TIMEOUT)
            });
            if (res.status === 429) {
                 console.warn(`Rate limited on ${url}, waiting...`);
                 await wait(5000 * (i + 1));
                 continue;
            }
            if (!res.ok) {
                console.error(`Failed to fetch ${url}: ${res.status}`);
                return null;
            }
            return await res.text();
        } catch (e) {
            console.error(`Error fetching ${url} (attempt ${i+1}):`, e.message);
            await wait(2000 * (i + 1));
        }
    }
    return null;
}

async function scrape() {
    const allWorks = [];
    
    // Step 1: Gather all Artist Detail URLs from A-Z pages
    const artistUrls = new Set();
    
    for (const letter of LETTERS) {
        const url = `${BASE_URL}/en/collection/artists/${letter}/index.html`;
        console.log(`Scraping Index: ${letter.toUpperCase()}...`);
        const html = await fetchHtml(url);
        if (!html) continue;
        
        const $ = cheerio.load(html);
        $('.collectionList-item a.collectionList-link').each((i, el) => {
            const href = $(el).attr('href');
            if (href) {
                // href is like /en/collection/artworks/aiweiwei/
                const fullUrl = new URL(href, url).href;
                artistUrls.add(fullUrl);
            }
        });
        await wait(DELAY_MS);
    }
    
    console.log(`Found ${artistUrls.size} artists.`);
    const artistUrlList = Array.from(artistUrls);
    
    // Step 2: For each artist, gather Artwork Detail URLs
    const workUrls = new Set();
    
    for (let i = 0; i < artistUrlList.length; i++) {
        const url = artistUrlList[i];
        // console.log(`[${i+1}/${artistUrlList.length}] Scraping Artist: ${url}`);
        const html = await fetchHtml(url);
        if (!html) continue;
        
        const $ = cheerio.load(html);
        // Artist page lists artworks
        $('.collectionList-item a.collectionList-link').each((i, el) => {
            // href is like ../../2612/index.html relative to /en/collection/artworks/aiweiwei/
            // so base /en/collection/artworks/aiweiwei/
            // resolved: /en/collection/2612/index.html
            const href = $(el).attr('href');
            if (href) {
                const fullUrl = new URL(href, url).href;
                workUrls.add(fullUrl);
            }
        });
        await wait(DELAY_MS);
        if ((i + 1) % 10 === 0) console.log(`Processed ${i + 1} artists...`);
    }
    
    console.log(`Found ${workUrls.size} artworks. Scraping details...`);
    const workUrlList = Array.from(workUrls);
    
    // Step 3: Scrape Artwork Metadata
    for (let i = 0; i < workUrlList.length; i++) {
        const url = workUrlList[i];
        // console.log(`[${i+1}/${workUrlList.length}] Scraping Work: ${url}`);
        const html = await fetchHtml(url);
        if (!html) continue;
        
        const $ = cheerio.load(html);
        
        // Extract metadata
        // Title: h2.collectionDetailContent-title
        let title = $('.collectionDetailContent-title').first().text().trim();
        
        // Metadata table
        let artist = '';
        let year = '';
        let material = '';
        let dimensions = '';
        let nationality = '';
        
        $('.collectionDetailContent-info_tbl tr').each((j, tr) => {
            const th = $(tr).find('th').first().text().trim();
            const td = $(tr).find('td').text().trim();
            
            if (th.includes('Artist')) artist = td.replace(/\(\d{4}-.*?\)/, '').trim(); // Remove (1957-)
            if (th.includes('Year')) year = td;
            if (th.includes('Material')) material = td;
            if (th.includes('Size')) dimensions = td;
            if (th.includes('Nationality')) nationality = td;
        });
        
        // Create a unique list of works found on this page
        // Some pages group multiple distinct works (e.g. Glitter Pieces #21 and #22).
        // Others just show multiple views of the same work (e.g. Brain Scan Image on Plate).
        // We distinguish by checking if the Title is distinct.
        
        const pageWorks = [];
        const galleryItems = $('.collectionDetailGallery-item');
        
        if (galleryItems.length > 0) {
            galleryItems.each((j, el) => {
                const item = $(el);
                
                // Image
                let imageUrl = '';
                const imgEl = item.find('img').first();
                if (imgEl.length) {
                    const src = imgEl.attr('src');
                    if (src) imageUrl = new URL(src, url).href;
                }
                
                // Parse caption for metadata
                // Format usually: Artist <br> <i>Title</i> <br> Year <br> Material <br> Size
                // But sometimes simple text.
                const captionEl = item.find('.collectionDetailGallery-caption').last(); // .last() because sometimes it is nested inside another p
                
                let itemTitle = title; // fallback to page title
                let itemYear = year;
                let itemMaterial = material;
                let itemDimensions = dimensions;
                let itemArtist = artist;

                // Try to extract from structured caption if available
                const italicTitle = captionEl.find('i').text().trim();
                
                // Split by <br> to guessing fields involves risk if order changes.
                // However, we can trust the <i> tag for Title.
                if (italicTitle) {
                    itemTitle = italicTitle;
                }
                
                // If we found a title in caption, we might want to try to parse the other fields
                // But generally the table on the page (scraped above) is more reliable for the "Main" work info.
                // The issue is when the table says "Glitter Pieces #21, Glitter Pieces #22" and we need to split.
                
                // Let's rely on the caption text lines if possible, but it's unstructured.
                // Example: Aoyama Satoru<br><i>Glitter Pieces #21</i><br>2009<br>Embroidery...<br>24.6 x 19.8 cm
                
                const htmlContent = captionEl.html() || '';
                const lines = htmlContent.split(/<br\s*\/?>/i).map(l => cheerio.load(l).text().trim()).filter(l => l);
                
                // Heuristic mapping based on lines
                // If line matches the italic title, it's title
                // If line looks like year, it's year
                if (lines.length >= 3) {
                    // Line 0: Artist usually
                    // Line 1: Title usually (or vice versa)
                    // ...
                }
                
                // Infer distinct work identity from Title
                const existing = pageWorks.find(w => w.title === itemTitle);
                
                if (!existing) {
                     // New distinct work on this page
                     const idMatch = url.match(/\/(\d+)\/index\.html/);
                     const baseId = idMatch ? `mori-${idMatch[1]}` : `mori-${Math.random().toString(36).substr(2, 9)}`;
                     const suffix = pageWorks.length + 1;
                     
                     pageWorks.push({
                         id: `${baseId}-${suffix}`,
                         title: itemTitle,
                         artist: itemArtist || artist, 
                         date: itemYear || year,
                         medium: itemMaterial || material,
                         dimensions: itemDimensions || dimensions,
                         nationality,
                         category: 'Contemporary Art', // Placeholder, updated in post-processing
                         imageUrl,
                         sourceUrl: url
                     });
                } else {
                    // Same title already exists. It's a second image/view.
                }
            });
        } else {
            // No gallery items
            if (title && imageUrl) {
                 const idMatch = url.match(/\/(\d+)\/index\.html/);
                 const id = idMatch ? `mori-${idMatch[1]}` : `mori-${Math.random().toString(36).substr(2, 9)}`;
                 pageWorks.push({
                     id,
                     title,
                     artist,
                     date: year,
                     medium: material,
                     dimensions,
                     nationality,
                     category: 'Contemporary Art', // Placeholder
                     imageUrl,
                     sourceUrl: url
                 });
            }
        }
        
        // Post-process category
        pageWorks.forEach(w => {
            let cat = 'Contemporary Art';
            const mLower = (w.medium || material).toLowerCase();
            const tLower = w.title.toLowerCase();
            
            if (mLower.includes('oil') || mLower.includes('acrylic') || mLower.includes('canvas') || mLower.includes('painting')) cat = 'Painting';
            else if (mLower.includes('video') || mLower.includes('film') || mLower.includes('single channel') || mLower.includes('monitor')) cat = 'Video/Film';
            else if (mLower.includes('photo') || mLower.includes('c-print') || mLower.includes('gelatin silver')) cat = 'Photography';
            else if (mLower.includes('sculpture') || mLower.includes('bronze') || mLower.includes('steel') || mLower.includes('wood') || mLower.includes('stone') || mLower.includes('installation') || mLower.includes('embroidery')) cat = 'Sculpture/Installation';
            else if (mLower.includes('drawing') || mLower.includes('paper') || mLower.includes('pencil') || mLower.includes('charcoal')) cat = 'Drawing';
            
            // Refine embroidery/textile as Sculpture/Craft usually, or 2D if framed? 
            // The ExhibitionModal handles 'Sculpture' keyword for 3D.
            
            w.category = cat;
            allWorks.push(w);
        });
        
        await wait(DELAY_MS);
        if ((i + 1) % 20 === 0) console.log(`Processed ${i + 1} artworks...`);
    }

    console.log(`Total collected: ${allWorks.length}`);
    if (allWorks.length > 0) {
        fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(allWorks, null, 2));
        console.log(`Saved to ${OUTPUT_FILE}`);
    }
}

scrape().catch(err => console.error(err));
