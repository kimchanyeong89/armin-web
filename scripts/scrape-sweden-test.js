import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import fetch from 'node-fetch';
import pLimit from 'p-limit';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE_URL = 'https://collection.nationalmuseum.se';
const OUTPUT_FILE = path.join(__dirname, '../public/data/sweden-collection.json');

// Collection IDs to scrape
// 5005: Old Master Paintings
// 5006: 19th Century Paintings
// 3011: Carl Gustaf Tessin's collection (contains drawings)
// 17002: Master Drawings in Tokyo (drawings)
const COLLECTION_IDS = ['5005', '5006', '3011', '17002'];

async function fetchJson(url) {
    const response = await fetch(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
    });
    if (!response.ok) {
        throw new Error(`Failed to fetch ${url}: ${response.status}`);
    }
    return response.json();
}

async function main() {
    console.log('Starting Sweden scraper (Paintings + Drawings, On Display)...');

    let allItemIds = [];

    // 1. Fetch Lists for all Target Collections
    for (const id of COLLECTION_IDS) {
        const listUrl = `${BASE_URL}/_next/data/m_Ge927LpOLHuystKX3to/en/collection.json?lng=en&f=${id}&v=2`;
        try {
            console.log(`Fetching list for collection ${id}...`);
            const data = await fetchJson(listUrl);
            
            if (data.pageProps && data.pageProps.collections) {
                 data.pageProps.collections.forEach(c => {
                     // Check if this is the requested collection or a sub-collection
                     if (c.OclObjectRef && c.OclObjectRef.Items) {
                         console.log(`  Found ${c.OclObjectRef.Items.length} items in "${c.OclTitleTxt}"`);
                         c.OclObjectRef.Items.forEach(item => {
                             if (item.ReferencedId) {
                                 allItemIds.push(item.ReferencedId);
                             }
                         });
                     }
                 });
            }
        } catch (err) {
            console.error(`Error fetching list ${id}: ${err.message}`);
        }
    }
    
    // De-duplicate
    allItemIds = [...new Set(allItemIds)];
    console.log(`Found ${allItemIds.length} unique item IDs total.`);
    
    // 2. Fetch Details & Filter
    const itemsToProcess = allItemIds;
    console.log(`Fetching details for ${itemsToProcess.length} items...`);
    
    const limit = pLimit(20); // Increase concurrency
    
    const tasks = itemsToProcess.map((id, index) => limit(async () => {
        try {
            const itemUrl = `${BASE_URL}/_next/data/m_Ge927LpOLHuystKX3to/en/collection/item/${id}.json`;
            const itemData = await fetchJson(itemUrl);
            const rawItem = itemData.pageProps.data.item;
            
            // ---------------------------------------------------------
            // FILTERING LOGIC
            // ---------------------------------------------------------

            // 1. Must be On Display
            if (rawItem.ObjExhibitedTxt !== 'Yes') {
                return null;
            }

            // 2. Must have an Image
            let imageUrl = null;
            if (rawItem.DefaultImage) {
                imageUrl = `${BASE_URL}/${rawItem.DefaultImage}`;
            } else if (rawItem.DefaultThumbnail) {
                imageUrl = `${BASE_URL}/${rawItem.DefaultThumbnail.replace('.small.', '.large.')}`;
            }
            if (!imageUrl) {
                return null;
            }

            // 3. Must be Painting OR Drawing
            const typeLower = (rawItem.ObjCollectionTxt || rawItem.ObjCategoryTxt || "").toLowerCase();
            const techniqueLower = (rawItem.ObjMaterialTechniqueTxt || "").toLowerCase();
            
            const isPainting = typeLower.includes('painting') || typeLower.includes('måleri') || typeLower.includes('maleri');
            const isDrawing = typeLower.includes('drawing') || typeLower.includes('teckning') || techniqueLower.includes('drawing') || techniqueLower.includes('teckning');
            const isMiniature = typeLower.includes('miniature') || typeLower.includes('miniatyr');

            if (isMiniature) {
                return null;
            }

            if (!isPainting && !isDrawing) {
                return null;
            }
            
            // ---------------------------------------------------------
            // NORMALIZATION
            // ---------------------------------------------------------
            
            let artist = "Unknown";
            if (rawItem.ObjPersonRef && rawItem.ObjPersonRef.Items && rawItem.ObjPersonRef.Items.length > 0) {
               const artists = rawItem.ObjPersonRef.Items
                   .filter(p => !p.RoleVoc || !p.RoleVoc.LabelTxt || p.RoleVoc.LabelTxt !== 'Commissioned by')
                   .map(p => p.LinkLabelTxt || p.ListLinkLabelTxt)
                   .map(n => n.replace(/^Designer:|^Formgivare:|^Artist:/i, '').trim())
                   .join(', ');
               if (artists) artist = artists;
            }
            
            return {
                id: `NMS-${rawItem.Id}`,
                source: "Nationalmuseum Sweden",
                url: `${BASE_URL}/en/collection/item/${rawItem.Id}`,
                title: rawItem.ObjTitleMainTxt || rawItem.ObjTitleMainTxt_sv || "Untitled",
                artist: artist,
                image: imageUrl,
                type: (rawItem.ObjCollectionTxt || rawItem.ObjCategoryTxt || "").replace(/#/g, '').trim(),
                dimensions: (rawItem.ObjDimensionGroupTxt || "").replace(/^h x l x w: /i, '').trim(),
                medium: (rawItem.ObjMaterialTechniqueTxt || "").replace(/#/g, '').trim(),
                date: rawItem.ObjDateMainTxt || rawItem.ObjDateMainTxt_sv,
                _raw: {
                    id: rawItem.Id,
                    technique: rawItem.ObjTechniqueTxt,
                    collection: rawItem.ObjCollectionTxt,
                    description: rawItem.ObjDescriptionMainTxt || rawItem.ObjDescriptionTxt,
                    exhibited: rawItem.ObjExhibitedTxt
                }
            };
            
        } catch (err) {
            console.error(`Error fetching item ${id}: ${err.message}`);
            return null;
        }
    }));
    
    const fetchedItems = (await Promise.all(tasks)).filter(i => i !== null);
    
    console.log(`Successfully scraped ${fetchedItems.length} items matching criteria.`);
    
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(fetchedItems, null, 2));
    console.log(`Saved to ${OUTPUT_FILE}`);
}

main();
