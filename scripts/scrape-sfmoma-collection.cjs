const fs = require('fs');
const path = require('path');

// Configuration
const OUTPUT_FILE = path.join(__dirname, '../public/data/sfmoma-collection.json');
const PAGE_SIZE = 100;
const DELAY_MS = 500;
const LIMIT = process.env.LIMIT ? parseInt(process.env.LIMIT) : 0; // 0 for no limit

async function fetchPage(page) {
  const params = new URLSearchParams();
  params.append('action', 'collection_filter');
  params.append('scope', 'collection');
  params.append('id', '101618');
  params.append('_page', page);
  params.append('_on_view', '0');
  params.append('_classification', 'printed material,painting,drawing');
  params.append('ppp', PAGE_SIZE);

  console.log(`Fetching page ${page}...`);
  
  try {
    const response = await fetch('https://www.sfmoma.org/wp-admin/admin-ajax.php', {
      method: 'POST',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'Origin': 'https://www.sfmoma.org',
        'Referer': 'https://www.sfmoma.org/artists-artworks/',
        'X-Requested-With': 'XMLHttpRequest'
      },
      body: params
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error(`Error fetching page ${page}:`, error);
    return null;
  }
}

function processItem(item) {
  // Filter out unwanted classifications
  const classification = (item.classification || '').toLowerCase();
  
  // Strict matching to user request: "printed material,painting,drawing"
  // Based on the counts: Painting (1372) + Drawing (752) + Printed Material (1045) = 3169
  // We must excludes "architectural drawing", "photograph", etc.
  const valid = ['painting', 'drawing', 'printed material'];
  if (!valid.includes(classification)) {
     return null;
  }


  // Check on view status
  // Logic: has text in on_view field
  const isOnView = !!(item.on_view && item.on_view.trim().length > 0);
  
  // Extract gallery from on_view text if possible
  // "On view on Floor 2 as part of..."
  let gallery = null;
  if (isOnView) {
    const floorMatch = item.on_view.match(/Floor\s+\d+/i);
    if (floorMatch) {
      gallery = floorMatch[0];
    }
  }

  // Clean title (remove html tags)
  let title = item.title || '';
  title = title.replace(/<[^>]+>/g, '').trim();

  // Clean artist
  let artist = item.artwork_artist || '';
  artist = artist.replace(/<[^>]+>/g, '').trim();

  // Image
  let imageUrl = null;
  if (item.image && item.image.url) {
    imageUrl = item.image.url;
  }

  return {
    id: `sfmoma-${item.ID}`,
    sourceId: item.ID,
    title: title,
    artist: artist,
    date: item.artwork_created,
    medium: item.filter_groups ? item.filter_groups.join(', ') : '', 
    classification: item.classification,
    image: imageUrl,
    detailUrl: item.permalink,
    isOnView: isOnView,
    onViewText: item.on_view,
    gallery: gallery,
    source: 'sfmoma'
  };
}

async function main() {
  let allItems = [];
  let page = 1;
  let hasMore = true;
  let onViewCount = 0;

  while (hasMore) {
    const data = await fetchPage(page);
    
    if (!data || !data.posts || data.posts.length === 0) {
      hasMore = false;
      break;
    }

    console.log(`Page ${page}: Got ${data.posts.length} items. Processing...`);

    let addedCount = 0;
    for (const post of data.posts) {
      const item = processItem(post);
      if (item) {
        allItems.push(item);
        if (item.isOnView) onViewCount++;
        addedCount++;
      }
    }
    
    console.log(`  Added ${addedCount} non-photography items. (On View so far: ${onViewCount})`);

    // Check if we reached max pages
    if (page >= data.max_num_pages) {
      hasMore = false;
    }

    if (LIMIT > 0 && allItems.length >= LIMIT) {
      console.log(`Reached limit of ${LIMIT} items.`);
      hasMore = false;
    }

    page++;
    
    // Pause to be polite
    await new Promise(resolve => setTimeout(resolve, DELAY_MS));
  }

  console.log(`Total collected items: ${allItems.length}`);
  console.log(`Total On View items: ${onViewCount}`);
  
  if (LIMIT > 0) {
    allItems = allItems.slice(0, LIMIT);
  }

  const outputDir = path.dirname(OUTPUT_FILE);
  if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
  }

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(allItems, null, 2));
  console.log(`Saved to ${OUTPUT_FILE}`);
}

main();
