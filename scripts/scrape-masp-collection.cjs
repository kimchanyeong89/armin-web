
const fs = require('fs');
const cheerio = require('cheerio');

const OUTPUT_FILE = 'public/data/masp-collection.json';
const CATEGORIES = [
    { id: 'Pintura', label: 'Paintings' },
    { id: 'Desenho', label: 'Drawings' }
];

(async () => {
    const allItems = [];
    const seenIds = new Set();
    const headers = {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    };

    for (const cat of CATEGORIES) {
        console.log(`\n=== Scraping Category: ${cat.label} (${cat.id}) ===`);
        let page = 1;
        let consecutiveEmpty = 0;

        while (page <= 50) { // Safety limit
            // Try standard Laravel/generic pagination params
            const url = `https://masp.org.br/en/collections/search?author=&category=${encodeURIComponent(cat.id)}&date-from=collection-date&date-to=collection-date&page=${page}`;
            console.log(`Fetching page ${page}: ${url}`);

            try {
                const res = await fetch(url, { headers });
                
                if (!res.ok) {
                    console.error(`HTTP Error ${res.status}`);
                    break;
                }

                const html = await res.text();
                const $ = cheerio.load(html);
                
                // Content is in .container.margin-top.row
                // Structure: .wrapper-title (Artist) -> .div (Gallery)
                const container = $('section.container.margin-top.row');
                
                if (container.length === 0) {
                    console.log('Container not found (possibly end of results).');
                    break;
                }

                let currentArtist = 'Unknown';
                let pageItems = 0;

                container.children().each((i, el) => {
                    const $el = $(el);
                    
                    if ($el.hasClass('wrapper-title')) {
                        currentArtist = $el.find('.title').text().trim() || 'Unknown';
                    } else if ($el.find('.collection-figure').length > 0) {
                        // This div contains the gallery items
                        $el.find('.collection-figure').each((j, fig) => {
                            const $fig = $(fig);
                            const link = $fig.find('a').attr('href');
                            const img = $fig.find('img').attr('src');
                            
                            // Caption is usually in figcaption p "Title, Date"
                            let caption = $fig.find('figcaption p').first().text().trim();
                            
                            // Fallback if p is missing
                            if (!caption) caption = $fig.find('figcaption').text().trim();

                            if (link && img) {
                                let title = caption;
                                let date = '';
                                
                                // Clean up whitespace
                                caption = caption.replace(/\s+/g, ' '); 
                                
                                // Heuristic: "Title, Date"
                                const lastComma = caption.lastIndexOf(',');
                                if (lastComma > 0) {
                                    // Make sure the part after comma looks like a date (digits) or "sem data"
                                    const candidateDate = caption.substring(lastComma + 1).trim();
                                    // if it has digits or is short
                                    if (/\d/.test(candidateDate) || candidateDate.length < 20) {
                                        title = caption.substring(0, lastComma).trim();
                                        date = candidateDate;
                                    }
                                }

                                const item = {
                                    id: link.split('/').pop(),
                                    title: title,
                                    artist: currentArtist,
                                    date: date,
                                    category: cat.label,
                                    image: img,
                                    url: link
                                };

                                if (!seenIds.has(item.id)) {
                                    seenIds.add(item.id);
                                    allItems.push(item);
                                    pageItems++;
                                }
                            }
                        });
                    }
                });

                console.log(`  Found ${pageItems} items.`);
                
                if (pageItems === 0) {
                    consecutiveEmpty++;
                } else {
                    consecutiveEmpty = 0;
                }

                if (consecutiveEmpty >= 2) {
                    console.log('No new items found for 2 pages. Stopping category.');
                    break;
                }
                
                page++;
                await new Promise(r => setTimeout(r, 1000)); // Be polite

            } catch (err) {
                console.error(`Error processing page ${page}:`, err);
                break;
            }
        }
    }

    console.log(`\nTotal collected: ${allItems.length}`);
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(allItems, null, 2));
    console.log(`Saved to ${OUTPUT_FILE}`);

})();
