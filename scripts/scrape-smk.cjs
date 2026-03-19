#!/usr/bin/env node
/**
 * SMK (Statens Museum for Kunst) - Denmark's National Gallery
 * Uses their public REST API: https://api.smk.dk
 * 
 * Scrapes paintings with images from the collection
 */

const fs = require('fs');
const path = require('path');

const OUTPUT_FILE = path.join(__dirname, '..', 'public', 'data', 'smk-collection.json');
const API_BASE = 'https://api.smk.dk/api/v1/art/search/';
const PAGE_SIZE = 100;

async function fetchPage(offset) {
    const url = `${API_BASE}?keys=*&filters=%5Bhas_image%3Atrue%5D%2C%5Bobject_names%3Amaleri%5D&offset=${offset}&rows=${PAGE_SIZE}`;

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
    let category = 'Painting';
    if (item.object_names && item.object_names.length > 0) {
        const objName = item.object_names[0].name.toLowerCase();
        if (objName.includes('skulptur') || objName.includes('sculpture')) category = 'Sculpture';
        else if (objName.includes('tegning') || objName.includes('drawing')) category = 'Drawing';
        else if (objName.includes('grafik') || objName.includes('print')) category = 'Print';
        else if (objName.includes('fotografi') || objName.includes('photo')) category = 'Photography';
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
    console.log('Starting SMK scraper...');

    // First request to get total count
    const firstPage = await fetchPage(0);
    const total = firstPage.found;
    console.log(`Total paintings with images: ${total}`);

    const allItems = [];

    // Process first page
    for (const item of firstPage.items) {
        const parsed = parseItem(item);
        if (parsed.image) allItems.push(parsed);
    }
    console.log(`Page 1: ${allItems.length} items`);

    // Paginate through remaining pages
    for (let offset = PAGE_SIZE; offset < total; offset += PAGE_SIZE) {
        try {
            const data = await fetchPage(offset);

            for (const item of data.items) {
                const parsed = parseItem(item);
                if (parsed.image) allItems.push(parsed);
            }

            const pageNum = Math.floor(offset / PAGE_SIZE) + 1;
            console.log(`Page ${pageNum}: ${allItems.length} total items`);

            // Respectful delay
            await new Promise(r => setTimeout(r, 200));
        } catch (err) {
            console.error(`Error at offset ${offset}:`, err.message);
            break;
        }
    }

    // Save results
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(allItems, null, 2));
    console.log(`\nDone! Saved ${allItems.length} items to ${OUTPUT_FILE}`);
}

main().catch(console.error);
