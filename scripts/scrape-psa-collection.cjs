const fs = require('node:fs');
const path = require('node:path');
const pLimitImport = require('p-limit');
const pLimit = pLimitImport.default || pLimitImport;

// PSA Collection Scraper (All Categories + Detail Fetching)
// URL: https://www.powerstationofart.com/psa-collections

const API_BASE = 'https://www.powerstationofart.com/campus/api/feed/public/psa/psa-collections';
const LINK_BASE = 'https://www.powerstationofart.com/psa-collections';
const OUT_FILE = path.join(__dirname, '../public/data/psa-collection-all.json');

const HDRS = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
    'Referer': 'https://www.powerstationofart.com/psa-collections',
    'x-language': 'en',
};

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function fetchPage(offset, limit) {
    // No artworkType filter to get all
    const url = `${API_BASE}?limit=${limit}&offset=${offset}`;
    console.log(`[List] Fetching offset ${offset}...`);
    const res = await fetch(url, { headers: HDRS });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
}

async function fetchDetail(slug) {
    const url = `${API_BASE}/${slug}`;
    try {
        const res = await fetch(url, { headers: HDRS });
        if (!res.ok) return null;
        return await res.json();
    } catch {
        return null;
    }
}

// Parse combined "Medium, Dimensions" string
function parseMediumString(str) {
    if (!str) return { medium: '', dimensions: '' };
    
    // Look for dimension pattern like "57.5x43.9 cm" or "100 x 200 cm" or "100cm"
    // Regex: look for digits, x/×, digits, cm.
    const dimRegex = /((?:[\d\.]+\s*[×x]\s*)+[\d\.]+\s*cm)|(\d+\s*cm)/i;
    const match = str.match(dimRegex);
    
    if (match) {
        const dimensions = match[0];
        // Remove dimensions from string to get medium
        let medium = str.replace(match[0], '').trim();
        // Remove trailing commas or separators
        medium = medium.replace(/,\s*$/, '').replace(/\.\s*$/, '').trim();
        return { medium, dimensions };
    }
    
    // Fallback: split by last comma if no "cm" found but it looks split?
    // User sample: "colored ink on paper, 49.5x31.4 cm" -> has comma.
    // If no regex match but has comma, maybe split?
    // But safely, let's just return whole string as medium if regex fails, or check if user provided sample structure is consistent.
    
    return { medium: str, dimensions: '' };
}

(async () => {
    const allItems = [];
    let offset = 0;
    const limit = 50;
    const limitConcurrency = pLimit(5); // 5 concurrent detail fetches
    
    console.log('Phase 1: Fetching List...');
    
    // 1. Fetch all list items first
    let listItems = [];
    
    while (true) {
        try {
            const data = await fetchPage(offset, limit);
            const items = data.items || [];
            if (items.length === 0) break;
            listItems = listItems.concat(items);
            console.log(`  Got ${items.length} items. List Total: ${listItems.length}`);
            offset += limit;
            await sleep(200);
        } catch (e) {
            console.error('List Error:', e);
            break;
        }
    }
    
    console.log(`\nPhase 2: Fetching Details for ${listItems.length} items...`);
    
    const tasks = listItems.map((item, idx) => limitConcurrency(async () => {
        const slug = item.slug;
        const detail = await fetchDetail(slug);
        
        // Find best image
        let imgUrl = '';
        if (item.image && Array.isArray(item.image.srcs)) {
             const sorted = item.image.srcs.sort((a, b) => b.width - a.width);
             imgUrl = sorted[0]?.url || item.image.placeholder;
        } else if (item.image && item.image.url) {
             imgUrl = item.image.url;
        }
        
        // Parse metadata
        let medium = item.medium || '';
        let dimensions = item.dimensions || '';
        
        if (detail) {
            // User sample shows detail has combined string in 'medium' field
            // API probe showed: "medium": "colored ink on paper, 57.5×43.9 cm"
            const rawMedium = detail.medium || '';
            const parsed = parseMediumString(rawMedium);
            medium = parsed.medium;
            dimensions = parsed.dimensions || detail.dimensions || detail.dimension || '';
        }

        const category = item.artworkType ? item.artworkType.title : 'Artworks';

        if ((idx + 1) % 10 === 0) process.stdout.write(`.`);
        
        return {
            id: slug || `psa-${idx}`,
            title: item.title,
            artist: item.artist,
            date: item.date,
            medium: medium,
            dimensions: dimensions,
            image: imgUrl,
            sourceUrl: `${LINK_BASE}/${slug}`,
            category: category, // User asked for Object Type here
            raw: { ...item, ...detail } // Keep raw for debugging
        };
    }));
    
    const finalResults = await Promise.all(tasks);
    
    // Filter out potential nulls if any
    const validResults = finalResults.filter(r => !!r);
    
    console.log(`\nFinished. Total valid items: ${validResults.length}`);
    fs.writeFileSync(OUT_FILE, JSON.stringify(validResults, null, 2));
    console.log(`Saved to ${OUT_FILE}`);
    
    // Log stats
    const stats = validResults.reduce((acc, i) => {
        acc[i.category] = (acc[i.category] || 0) + 1;
        return acc;
    }, {});
    console.log('Categories:', stats);
})();
