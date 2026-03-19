const fs = require('fs');
const { fetch } = require('undici');

const PAGE_URLS = [
  "https://glyptoteket.com/exhibitions/permanent-exhibitions/french-art-1800",
  "https://glyptoteket.com/exhibitions/permanent-exhibitions/french-art-1870",
  "https://glyptoteket.com/exhibitions/permanent-exhibitions/danish-art"
];

async function scrapePage(url) {
  console.log(`Fetching ${url}...`);
  const response = await fetch(url);
  const html = await response.text();
  
  const images = [];
  // Regex to capture image objects in the hydration data
  // We use a broader match and then clean up properties
  const rawMatches = html.matchAll(/\\"id\\":\\"([a-f0-9-]+)\\",\\"name\\":\\"(.*?)\\",\\"mediaType\\":\\"Image\\",\\"url\\":\\"(.*?)\\"/g);
  
  for (const match of rawMatches) {
    let name = match[2];
    let imageUrl = match[3];
    
    // Clean up potentially messy captures if regex overshot (unlikely with this specific pattern)
    // Next.js hydration often uses multiple backslashes
    name = name.replace(/\\"/g, '"');
    
    // Construct full URL
    if (imageUrl.startsWith('/')) {
      imageUrl = `https://glyptoteket.com${imageUrl}`;
    }

    // Filter out obvious decoration/social icons
    if (name.includes('Social ') || name.includes('Ico ') || name.includes('App ')) {
      continue;
    }
    if (imageUrl.includes('svg')) {
      continue;
    }

    images.push({
      source_url: url,
      id: match[1],
      title: name, // Using 'name' as title. Often contains "Title, Artist, MIN Number"
      image_url: imageUrl,
      // Attempt to extract MIN number if present
      inventory_number: name.match(/MIN\s+(\d+[a-zA-Z]*)/i)?.[0] || null
    });
  }
  
  return images;
}

(async () => {
  const allImages = [];
  
  for (const url of PAGE_URLS) {
    try {
      const pageImages = await scrapePage(url);
      console.log(`Found ${pageImages.length} relevant images on ${url}`);
      allImages.push(...pageImages);
    } catch (e) {
      console.error(`Error scraping ${url}:`, e);
    }
  }
  
  // Deduplicate
  const uniqueImages = Array.from(new Map(allImages.map(item => [item.id, item])).values());
  
  console.log(`Total unique artwork images found: ${uniqueImages.length}`);
  
  fs.writeFileSync('glyptoteket-works.json', JSON.stringify(uniqueImages, null, 2));
  console.log('Saved to glyptoteket-works.json');
})();
