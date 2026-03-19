const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

puppeteer.use(StealthPlugin());

const OUTPUT_FILE = path.join(__dirname, '../public/data/high-collection.json');

async function scrape() {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();
    
    // Go to the search page first to set cookies/headers
    console.log('Navigating to High Museum search page...');
    try {
      await page.goto(
        'https://high.org/?s=&rt=collections&obj-3=3&obj-4=4&obj-7=7&obj-13=13&obj-18=18&clf-2=has-image',
        { waitUntil: 'domcontentloaded', timeout: 90000 }
      );
    } catch (e) {
      console.log('Navigation error (ignoring if we loaded partially):', e.message);
    }
    
    // Slight pause to allow scripts to settle
    await new Promise(r => setTimeout(r, 5000));

    let allItems = [];
    let pageNum = 1;
    let hasMore = true;

    while (hasMore) {
      console.log(`Fetching page ${pageNum}...`);
      
      try {
        const data = await page.evaluate(async (p) => {
          const url = `https://high.org/wp-admin/admin-ajax.php?action=loadSearch`;
          
          // Construct the payload exactly as seen in the logs
          // Note: In the log, action=loadSearch was in the URL.
          // The body was JSON.
          const payload = {
            searchFields: {
              queryType: "collection",
              metaFields: {
                "result-type": "collection",
                "obj-type-3": "3",
                "obj-type-4": "4",
                "obj-type-7": "7",
                "obj-type-13": "13",
                "obj-type-18": "18",
                "collections-filters-2": "has-image"
              },
              taxFields: {}
            },
            page: p,
            posts_per_page: 5000 // Try requesting a massive chunk
          };

          const response = await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json' // Try JSON first
            },
            body: JSON.stringify(payload)
          });
          
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
          }

          return await response.json();
        }, pageNum);

        // Analyze response structure
        // If data flow is loadSearch -> loadTemplatePart, then loadSearch might return the Raw Data.
        // Let's assume 'data' contains the items based on standard flows, or 'items'.
        // Wait, looking at the logs again:
        // loadTemplatePart received {"data": {"items": [...]}}
        // loadSearch SENT JSON. 
        // So loadSearch RETURNS the data used by loadTemplatePart.
        // The response from loadSearch is likely { success: true, data: { items: [...] } } or similar.
        
        let items = [];
        // Handle various potential response shapes
        if (data.posts) {
          items = data.posts;
        } else if (data.data && data.data.items) {
          items = data.data.items;
        } else if (data.items) {
          items = data.items;
        } else if (Array.isArray(data)) {
          items = data;
        } else {
             // If the structure is unknown, log it and break (debug mode essentially)
             console.log('Unknown response structure:', Object.keys(data));
             if (data.results) items = data.results;
        }

        if (items.length === 0) {
          console.log('No more items found.');
          hasMore = false;
        } else {
          console.log(`Found ${items.length} items.`);
          
          const processed = items.map(item => {
            const meta = item.meta || {};
            
            // Helper to clean up image values (often arrays or objects with .value)
            const clean = (v) => {
              if (!v) return null;
              if (Array.isArray(v)) v = v[0];
              if (typeof v === 'object' && v !== null) {
                return v.url || v.src || v.value || null;
              }
              return v;
            };

            // Prefer webImage (high res) over thumbnail
            let img = clean(meta.webImage) || clean(item.thumbnail) || clean(item.image);
            
            // If image is the placeholder string, treat as null
            if (img && img.includes('image-placeholder.png')) img = null;

            return {
                id: item.link ? item.link.split('/').filter(Boolean).pop() : String(Math.random()),
                title: item.title || item.post_title,
                // description often holds the 'Artist' in this API
                artist: item.description || meta.creator || 'Unknown', 
                date: clean(meta.dated) || clean(meta.displayDate) || clean(item['formatted-date']),
                category: clean(meta.classification) || clean(meta.objectName),
                medium: clean(meta.medium) || clean(meta.objectMedium),
                image: img || null,
                url: item.link || item.permalink
            };
          });

          allItems.push(...processed);
          console.log(`Total collected: ${allItems.length}`);
          
          if (allItems.length % 100 === 0 || allItems.length < 100) {
             console.log(`Saving ${allItems.length} items to disk...`);
             fs.writeFileSync(OUTPUT_FILE, JSON.stringify(allItems, null, 2));
          }

          const limit = parseInt(process.env.LIMIT || '0');
          if (limit > 0 && allItems.length >= limit) {
             console.log('Limit reached.');
             hasMore = false;
          }
        }

        pageNum++;
        // Be nice
        await new Promise(r => setTimeout(r, 2000));

      } catch (e) {
        console.error(`Error on page ${pageNum}:`, e.message);
        // Try fallback: maybe it expects form-data?
        console.log('Retrying with URLSearchParams...');
        try {
            const data = await page.evaluate(async (p) => {
                const url = `https://high.org/wp-admin/admin-ajax.php?action=loadSearch`;
                const payload = {
                    searchFields: {
                    queryType: "collection",
                    metaFields: {
                        "result-type": "collection",
                        "obj-type-3": "3",
                        "obj-type-4": "4",
                        "obj-type-7": "7",
                        "obj-type-13": "13",
                        "obj-type-18": "18",
                        "collections-filters-2": "has-image"
                    },
                    taxFields: {}
                    },
                    page: p
                };

                // convert to form data key=value where value is JSON string?
                // Or just standard post body?
                // In logs: Post data: { ... } suggests JSON header or raw body.
                // But let's try just standard fetch if JSON failed.
                return { error: "JSON failed" };
            }, pageNum);
            
            hasMore = false; 
        } catch (ex) {
            hasMore = false;
        }
      }
    }

    console.log(`Writing ${allItems.length} items to ${OUTPUT_FILE}`);
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(allItems, null, 2));

  } catch (err) {
    console.error('Scrape failed:', err);
  } finally {
    await browser.close();
  }
}

scrape();
