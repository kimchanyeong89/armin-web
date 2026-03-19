const fs = require('fs');
const path = require('path');
const pLimit = (await import('p-limit')).default;

// We'll mimic the fetch by just using node-fetch if available, or https
// But since we are in a node environment, let's use a simple fetch wrapper or child_process
// Actually, we can use the same approach as before: standard fetch

const BASE_URL = 'https://collection.nationalmuseum.se';
const OUTPUT_FILE = path.join(__dirname, '../public/data/sweden-collection.json');
const LIMIT = 100; // User asked for 100 items

// We need a helper to fetch json
async function fetchJson(url) {
    const { default: fetch } = await import('node-fetch');
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
    console.log('Starting Sweden scraper (Test 100 items)...');

    // 1. Get the list of collections/items
    // We utilize the same Next.js data route for the list that we found
    const listUrl = `${BASE_URL}/_next/data/m_Ge927LpOLHuystKX3to/en/collection.json?lng=en&f=5005&v=2`;
    
    let allItemIds = [];
    
    try {
        console.log(`Fetching list from ${listUrl}...`);
        const data = await fetchJson(listUrl);
        
        if (data.pageProps && data.pageProps.collections) {
             data.pageProps.collections.forEach(c => {
                 if (c.OclObjectRef && c.OclObjectRef.Items) {
                     c.OclObjectRef.Items.forEach(item => {
                         if (item.ReferencedId) {
                             allItemIds.push(item.ReferencedId);
                         }
                     });
                 }
             });
        }
        
        // De-duplicate
        allItemIds = [...new Set(allItemIds)];
        console.log(`Found ${allItemIds.length} unique item IDs.`);
        
        // Slice to 100
        const itemsToProcess = allItemIds.slice(0, LIMIT);
        console.log(`Processing first ${itemsToProcess.length} items...`);
        
        const limit = pLimit(5); // 5 concurrent requests
        const results = [];
        
        const tasks = itemsToProcess.map((id, index) => limit(async () => {
            try {
                // Construct item API URL
                // Note: The build ID 'm_Ge927LpOLHuystKX3to' might change, so in a real scraper we should extract it from the homepage.
                // For this test, we assume it's stable for now or we could regex it if it fails.
                const itemUrl = `${BASE_URL}/_next/data/m_Ge927LpOLHuystKX3to/en/collection/item/${id}.json`;
                // console.log(`[${index+1}/${LIMIT}] Fetching ${id}...`);
                
                const itemData = await fetchJson(itemUrl);
                const rawItem = itemData.pageProps.data.item;
                
                // Map to our standard format
                // Fields mapping based on debug-sweden-item-data.json
                // Id: "35437"
                // Title: ObjTitleMainTxt_sv or ObjTitleGroupTxt
                // Artist: ObjPersonRef (array)
                // Image: DefaultImage or Multimedia
                // Type: ObjCategoryTxt ("#Tray# (#Service ware#)")
                // Dimensions: ObjDimensionGroupTxt
                // Medium: ObjMaterialTechniqueTxt
                // Date: ObjDateMainTxt
                // Source: "Nationalmuseum Sweden"
                
                // Normalize Image URL
                let imageUrl = null;
                if (rawItem.DefaultThumbnail) {
                    imageUrl = `${BASE_URL}/${rawItem.DefaultThumbnail.replace('.small.jpg', '.large.jpg')}`;
                } else if (rawItem.DefaultImage) {
                    imageUrl = `${BASE_URL}/${rawItem.DefaultImage}`;
                }
                
                // Artist
                let artist = "Unknown";
                if (rawItem.ObjPersonRef && rawItem.ObjPersonRef.Items && rawItem.ObjPersonRef.Items.length > 0) {
                   const artists = rawItem.ObjPersonRef.Items
                       .filter(p => !p.RoleVoc || p.RoleVoc.LabelTxt !== 'Commissioned by') // Exclude commissioners if possible
                       .map(p => p.LinkLabelTxt || p.ListLinkLabelTxt)
                       .map(n => n.replace(/Design:|Designer:|Formgivare:/g, '').trim())
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
                    type: (rawItem.ObjCategoryTxt || "").replace(/#/g, '').trim(),
                    dimensions: (rawItem.ObjDimensionGroupTxt || "").replace('h x l x w: ', ''),
                    medium: (rawItem.ObjMaterialTechniqueTxt || "").replace(/#/g, ''),
                    date: rawItem.ObjDateMainTxt,
                    _raw: {
                        id: rawItem.Id,
                        technique: rawItem.ObjTechniqueTxt,
                        collection: rawItem.ObjCollectionTxt,
                        description: rawItem.ObjDescriptionTxt
                    }
                };
                
            } catch (err) {
                console.error(`Error fetching item ${id}: ${err.message}`);
                return null;
            }
        }));
        
        const fetchedItems = (await Promise.all(tasks)).filter(i => i !== null);
        
        console.log(`Successfully scraped ${fetchedItems.length} items.`);
        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(fetchedItems, null, 2));
        console.log(`Saved to ${OUTPUT_FILE}`);
        
    } catch (error) {
        console.error('Fatal error:', error);
    }
}

main();
