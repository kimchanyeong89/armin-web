/**
 * Museo del Novecento Full Scraper
 * Scrapes both Alberto Della Ragione and Ottone Rosai collections
 */

const fs = require('fs');
const path = require('path');

const OUTPUT_DIR = path.join(__dirname, '../public/data');
const delay = ms => new Promise(r => setTimeout(r, ms));
const timestamp = () => new Date().toLocaleTimeString('ko-KR', { hour12: false });

function formatArtistName(rawName) {
    if (!rawName) return '';
    let name = rawName.trim();
    name = name.replace(/\s*\([^)]*\d{4}[^)]*\)\s*/g, '');
    return name.replace(/[.,]/g, ' ').replace(/\s+/g, ' ').trim();
}

function extractNovecentoDetails(html, url, config) {
    const artwork = {
        sourceUrl: url,
        id: url.split('/').filter(Boolean).pop(),
        category: config.collection || 'Painting',
        room: config.room || ''
    };

    const titleMatch = html.match(/<h1[^>]*class="[^"]*entry-header--title[^"]*"[^>]*>([^<]+)<\/h1>/i) ||
        html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
    artwork.title = titleMatch ? titleMatch[1].trim() : '';

    const artistMatch = html.match(/header-author-wrapper[\s\S]*?<p[^>]*class="[^"]*txt-h2[^"]*"[^>]*>([^<]+)<\/p>/i);
    artwork.artist = artistMatch ? formatArtistName(artistMatch[1]) : '';

    const yearMatch = html.match(/<p[^>]*class="[^"]*txt-h1[^"]*has-primary-gray-color[^"]*"[^>]*>([^<]+)<\/p>/i);
    if (yearMatch) {
        let yearText = yearMatch[1].trim();
        const realYear = yearText.match(/(\d{4}(?:\s*(?:–|-)\s*\d{4})?(?:\s*ca\.?)?)/);
        artwork.year = realYear ? realYear[1].trim() : yearText;
    } else {
        artwork.year = '';
    }

    const mediumMatch = html.match(/accordion-tecnica[\s\S]*?<h4>([^<]+)<\/h4>/i);
    artwork.medium = mediumMatch ? mediumMatch[1].trim() : '';

    const roomMatch = html.match(/luogo-link-text[^>]*>([^<]+)<\//i);
    if (roomMatch) artwork.room = roomMatch[1].trim();

    const imgMatch = html.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i) ||
        html.match(/data-src="(https:\/\/www\.museonovecento\.it\/wp-content\/uploads\/[^"]+)"/i);
    artwork.image = imgMatch ? imgMatch[1].trim() : '';

    return artwork;
}

async function scrapeNovecento(config) {
    const log = msg => console.log(`[${timestamp()}] [${config.id}] ${msg}`);
    log(`🎨 Starting FULL scrape of ${config.name}...`);

    const artworks = [];
    const scrapedUrls = new Set();

    try {
        log(`📄 Fetching collection page...`);
        const res = await fetch(config.url);
        const html = await res.text();

        const linkRegex = /href="(https:\/\/www\.museonovecento\.it\/en\/collezioni\/[^"]+)"/g;
        const links = [];
        let match;
        while ((match = linkRegex.exec(html)) !== null) {
            if (!links.includes(match[1]) && !scrapedUrls.has(match[1])) links.push(match[1]);
        }

        log(`   Found ${links.length} artwork links`);

        for (let i = 0; i < links.length; i++) {
            const url = links[i];
            if (scrapedUrls.has(url)) continue;

            try {
                log(`🖼️  [${i + 1}/${links.length}] ${url.split('/').pop()}`);
                const artRes = await fetch(url);
                const artHtml = await artRes.text();

                const artwork = extractNovecentoDetails(artHtml, url, config);
                if (artwork.title || artwork.image) {
                    artworks.push(artwork);
                    scrapedUrls.add(url);
                    log(`   ✓ ${artwork.title} | ${artwork.artist} | ${artwork.year}`);
                }

                if (artworks.length % 50 === 0) {
                    log(`   💾 Progress: ${artworks.length} items`);
                }

                await delay(200 + Math.random() * 100);
            } catch (e) {
                log(`   ⚠️ Error: ${e.message}`);
            }
        }
    } catch (e) {
        log(`❌ Fatal error: ${e.message}`);
    }

    const output = {
        museum: config.name,
        museumId: config.id,
        location: config.location,
        collection: config.collection || '',
        type: 'permanent',
        scrapedAt: new Date().toISOString(),
        totalArtworks: artworks.length,
        artworksWithImage: artworks.filter(a => a.image).length,
        artworksWithTitle: artworks.filter(a => a.title).length,
        artworksWithArtist: artworks.filter(a => a.artist).length,
        artworksWithYear: artworks.filter(a => a.year).length,
        objects: artworks
    };

    const outputPath = path.join(OUTPUT_DIR, config.outputFile);
    fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
    log(`✅ Saved ${artworks.length} artworks to ${config.outputFile}`);

    return output;
}

const MUSEUMS = {
    della_ragione: {
        id: 'novecento-della-ragione',
        name: 'Museo del Novecento - Alberto Della Ragione',
        location: 'Florence, Italy',
        url: 'https://www.museonovecento.it/en/collezione/alberto-della-ragione-en/',
        collection: 'Alberto Della Ragione',
        room: 'Alberto Della Ragione',
        outputFile: 'novecento-della-ragione-collection.json'
    },
    rosai: {
        id: 'novecento-rosai',
        name: 'Museo del Novecento - Ottone Rosai',
        location: 'Florence, Italy',
        url: 'https://www.museonovecento.it/en/collezione/ottone-rosai-en-the-collections/',
        collection: 'Ottone Rosai',
        room: 'Ottone Rosai',
        outputFile: 'novecento-rosai-collection.json'
    }
};

(async () => {
    console.log('═'.repeat(60));
    console.log('🏛️  NOVECENTO COLLECTIONS FULL SCRAPE');
    console.log('═'.repeat(60));

    const [dr, ros] = await Promise.all([
        scrapeNovecento(MUSEUMS.della_ragione),
        scrapeNovecento(MUSEUMS.rosai)
    ]);

    console.log('\n' + '═'.repeat(60));
    console.log('📊 FINAL RESULTS');
    console.log('═'.repeat(60));
    console.log(`\nDella Ragione: ${dr.totalArtworks} artworks`);
    console.log(`  Images: ${dr.artworksWithImage}, Artists: ${dr.artworksWithArtist}, Years: ${dr.artworksWithYear}`);
    console.log(`\nRosai: ${ros.totalArtworks} artworks`);
    console.log(`  Images: ${ros.artworksWithImage}, Artists: ${ros.artworksWithArtist}, Years: ${ros.artworksWithYear}`);
    console.log(`\n📦 TOTAL: ${dr.totalArtworks + ros.totalArtworks} artworks scraped`);
})();
