const fs = require('fs');
const path = require('path');
const { request } = require('undici');
const cheerio = require('cheerio');

const BASE_URL = 'https://collection.nmwa.go.jp';
const SEARCH_URL = `${BASE_URL}/artizewebeng/search_4_art.php`;
const DETAIL_URL = `${BASE_URL}/artizewebeng/search_7_detail.php`;

// Art categories to scrape: 1 = Painting, 2 = Drawing
const CATEGORIES = [
  { id: '1', name: 'Painting' },
  { id: '2', name: 'Drawing' },
];

let cookies = '';

async function requestWithCookies(url, options) {
  const headers = { ...options.headers };
  if (cookies) {
    headers['Cookie'] = cookies;
  }

  const res = await request(url, { ...options, headers });
  
  // Update cookies if present
  // set-cookie can be an array or string. undici returns array or string?
  // undici headers is incoming headers.
  const setCookie = res.headers['set-cookie'];
  if (setCookie) {
    const newCookies = Array.isArray(setCookie) ? setCookie : [setCookie];
    // Simple cookie merge (naïve)
    // Just append? Or replace? PHPSESSID usually stays.
    // For PHP, usually just one session cookie.
    // Let's just join them for now or keep the latest.
    // If we receive new cookies, we should probably update our store.
    // A simple approach: key=value parsing.
    const cookieMap = cookies.split(';').reduce((acc, c) => {
        const [k, v] = c.split('=');
        if (k && v) acc[k.trim()] = v.trim();
        return acc;
    }, {});
    
    newCookies.forEach(c => {
        const parts = c.split(';');
        const [k, v] = parts[0].split('=');
        if (k && v) cookieMap[k.trim()] = v.trim();
    });

    cookies = Object.entries(cookieMap).map(([k, v]) => `${k}=${v}`).join('; ');
  }
  
  return res;
}

async function fetchSearchPage(categoryId, page = 1) {
  const body = new URLSearchParams({
    art_category: categoryId,
    art_location: '1', // All records
    art_vi: String(page),
  }).toString();

  const { body: resBody, statusCode } = await requestWithCookies(SEARCH_URL, {
    method: 'POST',
    body,
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
  });

  if (statusCode !== 200) {
    throw new Error(`Search page failed: ${statusCode}`);
  }
  return resBody.text();
}

async function fetchDetailPage(artCd, categoryId) {
  const body = new URLSearchParams({
    detail_artCd: artCd,
    type: '2', // Seemingly required
    art_category: categoryId,
    art_location: '1',
    detail_vi: '1', // View Image mode?
  }).toString();

  const { body: resBody, statusCode } = await requestWithCookies(DETAIL_URL, {
    method: 'POST',
    body,
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Referer': SEARCH_URL,
      'Origin': BASE_URL
    },
  });

  if (statusCode !== 200) {
    throw new Error(`Detail page failed: ${statusCode}`);
  }
  return resBody.text();
}

async function scrape() {
  const allItems = [];
  const seenIds = new Set();

  for (const cat of CATEGORIES) {
    console.log(`Scraping category: ${cat.name} (${cat.id})`);
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      console.log(`  Page ${page}...`);
      const html = await fetchSearchPage(cat.id, page);
      const $ = cheerio.load(html);

      const items = $('.itemList .item').map((i, el) => {
        // Extract basic info from list item
        const onclick = $(el).find('a').attr('href');
        // href is like: javascript:doSendPost('detail_artCd','5','detail_vi','1','type','2');
        const match = /'detail_artCd','(\d+)'/.exec(onclick || '');
        const id = match ? match[1] : null;
        
        // On Display check in list view
        const onDisplay = $(el).find('.icnOn').length > 0;

        // Extract image from search result
        const imgSrc = $(el).find('.imgArea img').attr('src');
        let searchImageUrl = '';
        if (imgSrc) {
            // imgSrc is like "../image_files/m/41-M.jpg"
            // Base is /artizewebeng/ -> /image_files/
            searchImageUrl = new URL(imgSrc, `${BASE_URL}/artizewebeng/`).href;
        }

        return { id, onDisplay, searchImageUrl };
      }).get().filter(i => i.id);

      if (items.length === 0) {
        hasMore = false;
        break;
      }

      console.log(`    Found ${items.length} items.`);

      // Process details in parallel chunks
      const CHUNK_SIZE = 5;
      for (let i = 0; i < items.length; i += CHUNK_SIZE) {
        const chunk = items.slice(i, i + CHUNK_SIZE);
        await Promise.all(chunk.map(async (item) => {
          if (seenIds.has(item.id)) return;
          seenIds.add(item.id);

          try {
            const detailHtml = await fetchDetailPage(item.id, cat.id);
            const $d = cheerio.load(detailHtml);

            // Extract Metadata
            const title = $d('.title').text().trim();
            const artist = $d('.artist').text().trim().replace(/[\n\t]+/g, ' ');
            
            // Image
            // Try to find the Enlarge link (LL image) first
            let imgRel = $d('.expansion a').attr('href');
            
            // Fallback to viewer img 'l' attr (L/LL image)
            if (!imgRel) {
                const imgParams = $d('#_viewer img');
                imgRel = imgParams.attr('l') || imgParams.attr('src');
            }
            // If main viewer missing (rare), check others?
            if (!imgRel) {
              imgRel = $d('.collection img').first().attr('src');
            }

            let imageUrl = '';
            if (imgRel) {
              // imgRel is like "../image_files/l/..."
              // Base is /artizewebeng/ -> .. -> /image_files/
              imageUrl = new URL(imgRel, `${BASE_URL}/artizewebeng/`).href;
            }

            // Fallback: Use search image if detail image is missing or placeholder
            if ((!imageUrl || imageUrl.includes('NoImage')) && item.searchImageUrl) {
                let fallback = item.searchImageUrl;
                if (fallback.includes('/m/')) {
                    // Try to upgrade M to L: /m/ -> /l/, -M.jpg -> -L.jpg
                    fallback = fallback.replace('/m/', '/l/').replace(/-[mM]\./, '-L.');
                }
                imageUrl = fallback;
            }

      // check onDisplay again from detail to be sure (optional, but robust)
            const onDisplayDetail = $d('.icnOn').length > 0;
            const finalOnDisplay = item.onDisplay || onDisplayDetail;

            // Table data
            const getRow = (label) => $d(`th:contains("${label}")`).next('td').text().trim();
            
            const date = getRow('Date');
            const medium = getRow('Materials and Techniques');
            const dimensions = getRow('Size') || getRow('Size（cm）');
            const credit = getRow('Credit Line');
            const collectionId = getRow('Collection Number');

            const permalinkText = $d('#footer .permalink').text();
            const permalink = permalinkText.replace('Permalink:', '').trim();

            allItems.push({
              id: `nmwa-${item.id}`,
              sourceId: item.id,
              sourceUrl: permalink || `https://collection.nmwa.go.jp/en/P.${item.id}.html`,
              permalink: permalink,
              
              title,
              artist,
              imageUrl,
              date,
              medium,
              dimensions,
              credit,
              collectionId,
              onDisplay: finalOnDisplay,
              category: cat.name
            });

          } catch (e) {
            console.error(`    Failed to scrape item ${item.id}:`, e.message);
          }
        }));
        // Small delay
        await new Promise(r => setTimeout(r, 100));
      }

      // Check pagination
      // The pager has numbers. If we don't see the next page number or "Next", stop.
      // But standard way is usually: if we found items, try next page.
      // Let's rely on items.length > 0 for now. But safe to check if 'next' button exists or current page < total pages.
      // The pager html: <div class="pager"> <span>1</span> <a ...>2</a> ... </div>
      // If we are on page X, and there is no link for X+1, we are done.
      const hasNext = $(`.pager a:contains("${page + 1}")`).length > 0 || $(`.pager a:contains(">")`).length > 0;
      if (!hasNext && items.length > 0) {
         // This logic is tricky if the pager structure is "1 2 3 ... 10 >".
         // Let's assume if items returned < 10 (or whatever page size is), we are done.
         // Page size seems to be 10 or 20.
         // Let's assume we stop when items are 0.
         // However, in search_4_art.php, if page is out of range, it might return empty list or last page.
         // safely: if items.length === 0, stop and break.
      }
      
      page++;
      // Safety break for testing
      // if (page > 3) break; 
    }
  }

  console.log(`\nTotal items scraped: ${allItems.length}`);
  fs.writeFileSync(path.join(__dirname, '../public/data/nmwa-collection.json'), JSON.stringify(allItems, null, 2));
}

scrape().catch(console.error);
