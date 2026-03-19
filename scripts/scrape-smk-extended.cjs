#!/usr/bin/env node
/**
 * SMK (Statens Museum for Kunst) - Extended Scraper
 * Adds artworks currently on display to existing collection
 * Handles deduplication and updates onDisplay flag
 */

const fs = require('fs');
const path = require('path');

const OUTPUT_FILE = path.join(__dirname, '..', 'public', 'data', 'smk-collection.json');
const API_BASE = 'https://api.smk.dk/api/v1/art/search/';
const PAGE_SIZE = 100;

async function fetchPage(offset, onDisplayOnly = false) {
    let filters = '%5Bhas_image%3Atrue%5D';
    if (onDisplayOnly) {
        filters += '%2C%5Bon_display%3Atrue%5D';
    } else {
        filters += '%2C%5Bobject_names%3Amaleri%5D';
    }

    const url = `${API_BASE}?keys=*&filters=${filters}&offset=${offset}&rows=${PAGE_SIZE}`;

    const res = await fetch(url);
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    return res.json();
}

function parseItem(item) {
    // Extract artist name
    let artist = 'Unknown';
    if (item.production && item.production.length > 0) {
        const mainProducer = item.production.find(p => !p.creator_role || p.creator_role === 'Kunstner');
        if (mainProducer) {
            artist = mainProducer.creator || 'Unknown';
        } else {
            artist = item.production[0].creator || 'Unknown';
        }
    }
    if (item.artist && item.artist.length > 0) {
        artist = item.artist[0];
    }

    // Extract title (prefer English if available)
    let title = 'Untitled';
    if (item.titles && item.titles.length > 0) {
        const englishTitle = item.titles.find(t => t.language === 'engelsk' || t.language === 'english');
        title = englishTitle ? englishTitle.title : item.titles[0].title;
    }

    // Extract date
    let date = '';
    let year = 0;
    if (item.production_date && item.production_date.length > 0) {
        date = item.production_date[0].period || '';
        const yearMatch = date.match(/(\d{4})/);
        if (yearMatch) year = parseInt(yearMatch[1], 10);
    }

    // Extract dimensions
    let dimensions = '';
    if (item.dimensions && item.dimensions.length > 0) {
        dimensions = item.dimensions
            .filter(d => d.type === 'højde' || d.type === 'bredde')
            .map(d => `${d.type}: ${d.value} ${d.unit}`)
            .join(', ');
    }

    // Extract technique/medium
    let medium = '';
    if (item.techniques && item.techniques.length > 0) {
        medium = item.techniques.join(', ');
    }

    // Get 800px thumbnail
    const image = item.image_thumbnail || '';

    // Determine object type
    let category = 'Artwork';
    if (item.object_names && item.object_names.length > 0) {
        const objName = item.object_names[0].name.toLowerCase();
        if (objName.includes('maleri') || objName.includes('painting')) category = 'Painting';
        else if (objName.includes('skulptur') || objName.includes('sculpture')) category = 'Sculpture';
        else if (objName.includes('tegning') || objName.includes('drawing')) category = 'Drawing';
        else if (objName.includes('grafik') || objName.includes('print')) category = 'Print';
        else if (objName.includes('fotografi') || objName.includes('photo')) category = 'Photography';
        else if (objName.includes('installation')) category = 'Installation';
        else if (objName.includes('akvarel') || objName.includes('watercolor')) category = 'Watercolor';
    }

    return {
        id: item.object_number || item.id,
        source: 'SMK',
        url: item.frontend_url || `https://open.smk.dk/artwork/image/${item.object_number}`,
        title: title,
        artist: artist,
        image: image,
        date: date,
        year: year,
        medium: medium,
        dimensions: dimensions,
        category: category,
        type: '2D',
        onDisplay: item.on_display || false,
        publicDomain: item.public_domain || false,
        rights: item.rights || '',
        colors: item.colors || [],
        department: item.responsible_department || ''
    };
}

async function main() {
    console.log('Starting SMK extended scraper...');

    // Load existing collection
    let existingItems = [];
    try {
        existingItems = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf8'));
        console.log(`Loaded ${existingItems.length} existing items`);
    } catch (err) {
        console.log('No existing file found, starting fresh');
    }

    // Create ID map for quick lookup
    const itemsById = new Map();
    existingItems.forEach(item => {
        itemsById.set(item.id, item);
    });

    // Fetch on-display artworks
    console.log('\nFetching artworks currently on display...');
    const firstPage = await fetchPage(0, true);
    const totalOnDisplay = firstPage.found;
    console.log(`Total on-display artworks: ${totalOnDisplay}`);

    let newCount = 0;
    let updatedCount = 0;

    // Process first page
    for (const item of firstPage.items) {
        const parsed = parseItem(item);
        if (!parsed.image) continue;

        if (itemsById.has(parsed.id)) {
            // Update existing item's onDisplay flag
            const existing = itemsById.get(parsed.id);
            if (!existing.onDisplay) {
                existing.onDisplay = true;
                updatedCount++;
            }
        } else {
            // Add new item
            itemsById.set(parsed.id, parsed);
            newCount++;
        }
    }
    console.log(`Page 1: ${newCount} new, ${updatedCount} updated`);

    // Paginate through remaining on-display items
    for (let offset = PAGE_SIZE; offset < totalOnDisplay; offset += PAGE_SIZE) {
        try {
            const data = await fetchPage(offset, true);

            for (const item of data.items) {
                const parsed = parseItem(item);
                if (!parsed.image) continue;

                if (itemsById.has(parsed.id)) {
                    const existing = itemsById.get(parsed.id);
                    if (!existing.onDisplay) {
                        existing.onDisplay = true;
                        updatedCount++;
                    }
                } else {
                    itemsById.set(parsed.id, parsed);
                    newCount++;
                }
            }

            const pageNum = Math.floor(offset / PAGE_SIZE) + 1;
            console.log(`Page ${pageNum}: ${newCount} new, ${updatedCount} updated (total: ${itemsById.size})`);

            // Respectful delay
            await new Promise(r => setTimeout(r, 200));
        } catch (err) {
            console.error(`Error at offset ${offset}:`, err.message);
            break;
        }
    }

    // Convert map back to array
    const finalItems = Array.from(itemsById.values());

    // Save results
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(finalItems, null, 2));
    console.log(`\n✅ Done!`);
    console.log(`   Total items: ${finalItems.length}`);
    console.log(`   New items added: ${newCount}`);
    console.log(`   Items updated (onDisplay): ${updatedCount}`);
    console.log(`   Items on display: ${finalItems.filter(i => i.onDisplay).length}`);
}

main().catch(console.error);
