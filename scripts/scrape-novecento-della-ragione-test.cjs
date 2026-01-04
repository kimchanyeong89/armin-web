/**
 * Test scraper for Museo del Novecento - Alberto Della Ragione collection
 * Scrapes 3 pages or loads for testing
 */
const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://www.museonovecento.it';
const COLLECTION_URL = 'https://www.museonovecento.it/en/collezione/alberto-della-ragione-en/';
const OUTPUT_FILE = path.join(__dirname, '../public/data/novecento-della-ragione-test.json');

async function fetchPage(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
    return res.text();
}

function extractArtworkLinks(html) {
    const links = [];
    // Match artwork links
    const regex = /href="(https:\/\/www\.museonovecento\.it\/en\/collezioni\/[^"]+)"/g;
    let match;
    while ((match = regex.exec(html)) !== null) {
        if (!links.includes(match[1])) links.push(match[1]);
    }
    return links;
}

async function extractArtworkDetails(html, url) {
    const artwork = { sourceUrl: url };

    // Title - h1
    const titleMatch = html.match(/<h1[^>]*class="[^"]*entry-title[^"]*"[^>]*>([^<]+)<\/h1>/i) ||
        html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
    artwork.title = titleMatch ? titleMatch[1].trim() : '';

    // Artist - author info
    const artistMatch = html.match(/<span[^>]*class="[^"]*autore[^"]*"[^>]*>([^<]+)<\/span>/i) ||
        html.match(/<h2[^>]*class="[^"]*author[^"]*"[^>]*>([^<]+)<\/h2>/i) ||
        html.match(/<p[^>]*class="[^"]*artista[^"]*"[^>]*>([^<]+)<\/p>/i);
    if (artistMatch) {
        // Clean artist name - remove commas between first/last name
        let artist = artistMatch[1].trim();
        // Format "Last, First" to "First Last"
        if (artist.includes(',')) {
            const parts = artist.split(',').map(p => p.trim());
            if (parts.length === 2) artist = parts[1] + ' ' + parts[0];
        }
        artwork.artist = artist;
    } else {
        artwork.artist = '';
    }

    // Year
    const yearMatch = html.match(/<span[^>]*class="[^"]*anno[^"]*"[^>]*>([^<]+)<\/span>/i) ||
        html.match(/(\d{4})\s*(?:ca\.?|circa)?/i);
    artwork.year = yearMatch ? yearMatch[1].trim() : '';

    // Medium/technique
    const mediumMatch = html.match(/<span[^>]*class="[^"]*tecnica[^"]*"[^>]*>([^<]+)<\/span>/i) ||
        html.match(/tecnica[:\s]*([^<]+)/i);
    artwork.medium = mediumMatch ? mediumMatch[1].trim() : '';

    // Dimensions
    const dimMatch = html.match(/<span[^>]*class="[^"]*dimensioni[^"]*"[^>]*>([^<]+)<\/span>/i) ||
        html.match(/(\d+(?:\.\d+)?\s*x\s*\d+(?:\.\d+)?(?:\s*x\s*\d+(?:\.\d+)?)?(?:\s*cm)?)/i);
    artwork.dimension = dimMatch ? dimMatch[1].trim() : '';

    // Image
    const imgMatch = html.match(/<img[^>]+class="[^"]*wp-post-image[^"]*"[^>]+src="([^"]+)"/i) ||
        html.match(/<img[^>]+src="([^"]+)"[^>]+class="[^"]*featured[^"]*"/i) ||
        html.match(/<picture[^>]*>.*?<source[^>]+srcset="([^"]+)"/is) ||
        html.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i);
    artwork.image = imgMatch ? imgMatch[1].trim() : '';

    // Collection/category
    artwork.category = 'Alberto Della Ragione Collection';
    artwork.room = 'Alberto Della Ragione';

    return artwork;
}

async function main() {
    console.log('🎨 Scraping Museo del Novecento - Alberto Della Ragione (TEST)...\n');

    try {
        // Get main page
        const mainHtml = await fetchPage(COLLECTION_URL);
        const links = extractArtworkLinks(mainHtml);

        console.log(`Found ${links.length} artwork links`);

        // Test with first 10 links
        const testLimit = 10;
        const artworks = [];

        for (let i = 0; i < Math.min(testLimit, links.length); i++) {
            try {
                console.log(`Fetching ${i + 1}/${testLimit}: ${links[i]}`);
                const html = await fetchPage(links[i]);
                const artwork = await extractArtworkDetails(html, links[i]);
                artworks.push(artwork);
                console.log(`  → ${artwork.title} | ${artwork.artist} | ${artwork.year}`);
            } catch (err) {
                console.error(`  Error: ${err.message}`);
            }
        }

        // Save
        const output = {
            museum: 'Museo del Novecento',
            museumId: 'novecento-della-ragione',
            collection: 'Alberto Della Ragione',
            location: 'Florence, Italy',
            type: 'permanent',
            totalArtworks: artworks.length,
            totalAvailable: links.length,
            objects: artworks
        };

        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
        console.log(`\n✅ Saved ${artworks.length} artworks to ${OUTPUT_FILE}`);

        // Stats
        console.log('\n📊 Stats:');
        console.log(`  With image: ${artworks.filter(a => a.image).length}`);
        console.log(`  With artist: ${artworks.filter(a => a.artist).length}`);
        console.log(`  With year: ${artworks.filter(a => a.year).length}`);
        console.log(`  With title: ${artworks.filter(a => a.title).length}`);

    } catch (err) {
        console.error('Fatal error:', err.message);
    }
}

main();
