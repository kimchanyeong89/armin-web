/**
 * Test scraper for Museo del Novecento - Ottone Rosai collection
 */
const fs = require('fs');
const path = require('path');

const COLLECTION_URL = 'https://www.museonovecento.it/en/collezione/ottone-rosai-en-the-collections/';
const OUTPUT_FILE = path.join(__dirname, '../public/data/novecento-rosai-test.json');

async function fetchPage(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
    return res.text();
}

function extractArtworkLinks(html) {
    const links = [];
    const regex = /href="(https:\/\/www\.museonovecento\.it\/en\/collezioni\/[^"]+)"/g;
    let match;
    while ((match = regex.exec(html)) !== null) {
        if (!links.includes(match[1])) links.push(match[1]);
    }
    return links;
}

async function extractArtworkDetails(html, url) {
    const artwork = { sourceUrl: url };

    // Title
    const titleMatch = html.match(/<h1[^>]*class="[^"]*entry-title[^"]*"[^>]*>([^<]+)<\/h1>/i) ||
        html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
    artwork.title = titleMatch ? titleMatch[1].trim() : '';

    // Artist
    const artistMatch = html.match(/<span[^>]*class="[^"]*autore[^"]*"[^>]*>([^<]+)<\/span>/i) ||
        html.match(/<h2[^>]*class="[^"]*author[^"]*"[^>]*>([^<]+)<\/h2>/i);
    if (artistMatch) {
        let artist = artistMatch[1].trim();
        if (artist.includes(',')) {
            const parts = artist.split(',').map(p => p.trim());
            if (parts.length === 2) artist = parts[1] + ' ' + parts[0];
        }
        artwork.artist = artist;
    } else {
        artwork.artist = 'Ottone Rosai'; // Default for this collection
    }

    // Year
    const yearMatch = html.match(/<span[^>]*class="[^"]*anno[^"]*"[^>]*>([^<]+)<\/span>/i) ||
        html.match(/(\d{4})\s*(?:ca\.?|circa)?/i);
    artwork.year = yearMatch ? yearMatch[1].trim() : '';

    // Medium
    const mediumMatch = html.match(/<span[^>]*class="[^"]*tecnica[^"]*"[^>]*>([^<]+)<\/span>/i);
    artwork.medium = mediumMatch ? mediumMatch[1].trim() : '';

    // Dimensions
    const dimMatch = html.match(/(\d+(?:\.\d+)?\s*x\s*\d+(?:\.\d+)?(?:\s*cm)?)/i);
    artwork.dimension = dimMatch ? dimMatch[1].trim() : '';

    // Image
    const imgMatch = html.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i) ||
        html.match(/<img[^>]+class="[^"]*wp-post-image[^"]*"[^>]+src="([^"]+)"/i);
    artwork.image = imgMatch ? imgMatch[1].trim() : '';

    artwork.category = 'Ottone Rosai Collection';
    artwork.room = 'Ottone Rosai';

    return artwork;
}

async function main() {
    console.log('🎨 Scraping Museo del Novecento - Ottone Rosai (TEST)...\n');

    try {
        const mainHtml = await fetchPage(COLLECTION_URL);
        const links = extractArtworkLinks(mainHtml);

        console.log(`Found ${links.length} artwork links`);

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

        const output = {
            museum: 'Museo del Novecento',
            museumId: 'novecento-rosai',
            collection: 'Ottone Rosai',
            location: 'Florence, Italy',
            type: 'permanent',
            totalArtworks: artworks.length,
            totalAvailable: links.length,
            objects: artworks
        };

        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
        console.log(`\n✅ Saved ${artworks.length} artworks to ${OUTPUT_FILE}`);

        console.log('\n📊 Stats:');
        console.log(`  With image: ${artworks.filter(a => a.image).length}`);
        console.log(`  With artist: ${artworks.filter(a => a.artist).length}`);
        console.log(`  With year: ${artworks.filter(a => a.year).length}`);

    } catch (err) {
        console.error('Fatal error:', err.message);
    }
}

main();
