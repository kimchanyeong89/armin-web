/**
 * Scrape Pitti Palace artworks directly from https://www.uffizi.it/en/pitti-palace/artworks
 */

const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://www.uffizi.it';
const ARTWORKS_URL = 'https://www.uffizi.it/en/pitti-palace/artworks';
const OUTPUT_FILE = path.join(__dirname, '../public/data/pitti-palace-collection.json');
const DELAY_MS = 500;

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function fetchPage(url) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);
    return response.text();
}

// Extract artwork links from listing page
function extractArtworkLinks(html) {
    const links = [];
    // Match links to artwork detail pages
    const regex = /href="(\/en\/artworks\/[^"]+)"/g;
    let match;
    while ((match = regex.exec(html)) !== null) {
        const link = BASE_URL + match[1];
        if (!links.includes(link)) links.push(link);
    }
    return links;
}

// Extract artwork details from detail page
function extractArtworkDetails(html, url) {
    const artwork = {
        sourceUrl: url,
        id: url.split('/').pop(),
        slug: url.split('/').pop()
    };

    // Title
    const titleMatch = html.match(/<h1[^>]*class="[^"]*Title[^"]*"[^>]*>([^<]+)<\/h1>/i) ||
        html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
    artwork.title = titleMatch ? titleMatch[1].trim() : '';

    // Artist - look for Artist class or dl/dt patterns
    const artistMatch = html.match(/class="[^"]*Artist[^"]*"[^>]*>([^<]+)</i) ||
        html.match(/<dt[^>]*>Artist<\/dt>\s*<dd[^>]*>([^<]+)</i);
    artwork.artist = artistMatch ? artistMatch[1].trim() : '';

    // Date
    const dateMatch = html.match(/class="[^"]*Date[^"]*"[^>]*>([^<]+)</i) ||
        html.match(/<dt[^>]*>Date<\/dt>\s*<dd[^>]*>([^<]+)</i);
    artwork.date = dateMatch ? dateMatch[1].trim() : '';

    // Technique
    const techMatch = html.match(/<dt[^>]*>Technique<\/dt>\s*<dd[^>]*>([^<]+)</i);
    artwork.technique = techMatch ? techMatch[1].trim() : '';

    // Size
    const sizeMatch = html.match(/<dt[^>]*>(?:Size|Dimensions?)<\/dt>\s*<dd[^>]*>([^<]+)</i);
    artwork.size = sizeMatch ? sizeMatch[1].trim() : '';

    // Location
    const locMatch = html.match(/<dt[^>]*>Location<\/dt>\s*<dd[^>]*>([^<]+)</i) ||
        html.match(/<dt[^>]*>Room<\/dt>\s*<dd[^>]*>([^<]+)</i);
    artwork.location = locMatch ? locMatch[1].trim() : '';

    // Inventory
    const invMatch = html.match(/<dt[^>]*>Inventory<\/dt>\s*<dd[^>]*>([^<]+)</i);
    artwork.inventory = invMatch ? invMatch[1].trim() : '';

    // Description
    const descMatch = html.match(/<div[^>]*class="[^"]*Description[^"]*"[^>]*>([\s\S]*?)<\/div>/i) ||
        html.match(/<p[^>]*class="[^"]*description[^"]*"[^>]*>([\s\S]*?)<\/p>/i);
    if (descMatch) {
        artwork.description = descMatch[1].replace(/<[^>]+>/g, '').trim().substring(0, 500);
    }

    // Image - look for high-res image
    const imgMatch = html.match(/srcset="([^"]+)"/i) ||
        html.match(/<img[^>]*src="(https:\/\/www\.datocms-assets\.com[^"]+)"/i) ||
        html.match(/<picture[^>]*>[\s\S]*?<source[^>]*srcset="([^"]+)"/i);
    if (imgMatch) {
        // Get highest resolution from srcset
        const srcset = imgMatch[1];
        const urls = srcset.split(',').map(s => s.trim().split(' ')[0]);
        artwork.image = urls[urls.length - 1] || urls[0];
    }

    artwork.museum = 'Pitti Palace';
    artwork.collection = 'Palatine Gallery';

    return artwork;
}

// Get all pages of artwork listings
async function getAllArtworkLinks() {
    const allLinks = [];
    let page = 1;
    const maxPages = 22; // 429 / 21 per page ≈ 21 pages

    while (page <= maxPages) {
        const url = page === 1 ? ARTWORKS_URL : `${ARTWORKS_URL}?page=${page}`;
        console.log(`Fetching page ${page}...`);

        try {
            const html = await fetchPage(url);
            const links = extractArtworkLinks(html);

            if (links.length === 0) {
                console.log(`No more artworks on page ${page}`);
                break;
            }

            allLinks.push(...links);
            console.log(`  Found ${links.length} artworks (total: ${allLinks.length})`);
            page++;
            await sleep(DELAY_MS);
        } catch (error) {
            console.error(`Error on page ${page}:`, error.message);
            break;
        }
    }

    // Remove duplicates
    return [...new Set(allLinks)];
}

async function main() {
    console.log('🖼️ Scraping Pitti Palace artworks...\n');

    // Get all artwork links
    const links = await getAllArtworkLinks();
    console.log(`\n📋 Found ${links.length} unique artwork links\n`);

    // Scrape each artwork
    const artworks = [];
    for (let i = 0; i < links.length; i++) {
        const url = links[i];
        try {
            const html = await fetchPage(url);
            const artwork = extractArtworkDetails(html, url);
            artworks.push(artwork);

            if ((i + 1) % 20 === 0 || i === links.length - 1) {
                console.log(`Progress: ${i + 1}/${links.length} (${artwork.title})`);
            }

            await sleep(DELAY_MS);
        } catch (error) {
            console.error(`Error scraping ${url}:`, error.message);
        }
    }

    // Save results
    const output = {
        museum: 'Pitti Palace',
        museumId: 'pitti-palace',
        location: 'Florence, Italy',
        type: 'permanent',
        scrapedAt: new Date().toISOString(),
        totalArtworks: artworks.length,
        objects: artworks
    };

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
    console.log(`\n✅ Saved ${artworks.length} artworks to ${OUTPUT_FILE}`);
}

main().catch(console.error);
