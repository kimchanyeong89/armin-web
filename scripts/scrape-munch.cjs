const fs = require('fs');
const path = require('path');

const OUTPUT_FILE = path.join(__dirname, '../public/data/munch-collection.json');

async function scrapeMunch() {
    console.log('Starting Munch Museum FULL scrape...');
    const allArtworks = [];
    const classifications = ['Malerier', 'Grafikk'];

    for (const cls of classifications) {
        console.log(`\n=== Processing Classification: ${cls} ===`);
        let page = 1;
        let consecutiveErrors = 0;

        while (true) {
            const listUrl = `https://www.munch.no/en/edvard-munch-catalouge-raisonne//Search?query=&page=${page}&munchSamlingen=true&showAll=true&classification=${cls}&years=1863%7C1944`;
            console.log(`Fetching ${cls} page ${page}... (Total collected: ${allArtworks.length})`);

            try {
                const res = await fetch(listUrl);
                if (!res.ok) {
                    console.error(`Failed to fetch list page ${page}: ${res.status}`);
                    consecutiveErrors++;
                    if (consecutiveErrors > 3) break;
                    page++;
                    continue;
                }

                const data = await res.json();
                const items = data.results?.items;

                if (!items || items.length === 0) {
                    console.log(`No more items for ${cls} at page ${page}.`);
                    break;
                }
                consecutiveErrors = 0; // Reset on success

                for (const item of items) {
                    // Check if already collected (some items might appear in multiple searches or overlap, though unlikely with distinct classes)
                    if (allArtworks.some(a => a.metadata.inventory === item.invNo)) {
                        continue;
                    }

                    // Fetch detail
                    const detailUrl = `https://www.munch.no/en/object/${item.invNo}`;

                    try {
                        const dRes = await fetch(detailUrl);
                        const html = await dRes.text();

                        // Regex for React Hydration Data
                        const match = html.match(/ReactDOM\.hydrate\(React\.createElement\(CollectionItemPage,\s*(\{.*?\})\),/s);

                        let dimensions = '';
                        let medium = item.mediumEn || item.medium;
                        let category = cls === 'Malerier' ? 'Painting' : (cls === 'Grafikk' ? 'Print' : 'Artwork');
                        let type = '2D'; // Default
                        let classification = cls;
                        let fullImage = '';

                        if (match && match[1]) {
                            try {
                                const dData = JSON.parse(match[1]);
                                const obj = dData.collectionObject;

                                // Dimensions
                                if (obj.dimensions && obj.dimensions.length > 0) {
                                    dimensions = obj.dimensions[0];
                                    // Clean up "Bilde (Image): " prefix if present
                                    dimensions = dimensions.replace(/Bilde \(Image\):\s*/i, '');
                                }

                                // Category/Classification Override if precise
                                if (obj.classificationEn) {
                                    // Map to standard categories
                                    if (obj.classificationEn === 'Paintings') category = 'Painting';
                                    else if (obj.classificationEn === 'Generics') category = 'Print'; // Often prints fall here
                                    else category = obj.classificationEn;
                                }

                                // Medium
                                if (obj.mediumEn) medium = obj.mediumEn;

                                // Image: Use 800px width which is safer/standard
                                // pattern: https://iiif.micr.io/{mediaId}/full/800,/0/default.jpg
                                if (obj.mediaId) {
                                    fullImage = `https://iiif.micr.io/${obj.mediaId}/full/800,/0/default.jpg`;
                                }
                            } catch (parseErr) {
                                // console.error('Error parsing detail JSON:', parseErr);
                            }
                        }

                        // Fallback image if not found in detail
                        if (!fullImage && item.mediaId) {
                            fullImage = `https://iiif.micr.io/${item.mediaId}/full/800,/0/default.jpg`;
                        }

                        // Determine type
                        if (category.toLowerCase().includes('sculpture')) type = '3D';

                        // Artist is Munch
                        const artist = "Edvard Munch";

                        // clean year
                        let year = item.displayDate || (item.yearFrom ? String(item.yearFrom) : '');

                        allArtworks.push({
                            id: `munch-${item.invNo.replace(/\./g, '-')}`,
                            title: item.titleEn || item.title,
                            artist: artist,
                            year: year,
                            date: item.displayDate || '',
                            medium: medium,
                            dimensions: dimensions,
                            image: fullImage,
                            source: detailUrl,
                            museum: "Munchmuseet",
                            category: category,
                            type: type,
                            metadata: {
                                inventory: item.invNo,
                                classification: classification
                            }
                        });

                    } catch (err) {
                        console.error(`Failed to fetch/parse detail for ${item.invNo}:`, err.message);
                    }
                }

                page++;
                // Check safety limit just in case (e.g. 100 pages * 20 items = 2000)
                if (page > 100) {
                    console.log(`Reached page limit (100) for ${cls}. Stopping.`);
                    break;
                }

            } catch (e) {
                console.error(`Error fetching list page ${page} for ${cls}:`, e);
                consecutiveErrors++;
                if (consecutiveErrors > 3) break;
            }
        }
    }

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(allArtworks, null, 2));
    console.log(`Saved ${allArtworks.length} items to ${OUTPUT_FILE}`);
}

scrapeMunch();
