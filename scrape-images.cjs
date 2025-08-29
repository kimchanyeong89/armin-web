#!/usr/bin/env node
// Scrape image URLs from National Gallery pages

const axios = require('axios');
const cheerio = require('cheerio');

const artworks = [
  {
    id: 'room-2-page',
    url: 'https://www.nationalgallery.org.uk/visiting/floorplans/level-2/room-2'
  }
];

async function scrapeImageUrl(pageUrl) {
  try {
    const response = await axios.get(pageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });
    const $ = cheerio.load(response.data);

    // Look for image with class or specific pattern
    const img = $('img[data-src]').first();
    if (img.length > 0) {
      const src = img.attr('data-src') || img.attr('src');
      if (src && src.includes('nationalgallery.org.uk')) {
        return src;
      }
    }

    // Alternative: look for meta og:image
    const ogImage = $('meta[property="og:image"]').attr('content');
    if (ogImage && ogImage.includes('nationalgallery.org.uk')) {
      return ogImage;
    }

    console.log(`No image found for ${pageUrl}`);
    return null;
  } catch (error) {
    console.error(`Error scraping ${pageUrl}:`, error.message);
    return null;
  }
}

async function scrapeRoom2Artworks() {
  try {
    const response = await axios.get('https://www.nationalgallery.org.uk/visiting/floorplans/level-2/room-2', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });
    const $ = cheerio.load(response.data);

    const artworks = [];
    // Look for artwork links
    $('a[href*="/paintings/"]').each((i, elem) => {
      const href = $(elem).attr('href');
      if (href && href.includes('/paintings/')) {
        const fullUrl = href.startsWith('http') ? href : `https://www.nationalgallery.org.uk${href}`;
        const title = $(elem).text().trim();
        if (title) {
          artworks.push({ title, url: fullUrl });
        }
      }
    });

    return artworks;
  } catch (error) {
    console.error('Error scraping room 2:', error.message);
    return [];
  }
}

async function scrapeImageUrl(pageUrl) {
  try {
    const response = await axios.get(pageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });
    const $ = cheerio.load(response.data);

    // Look for image with class or specific pattern
    const img = $('img[data-src]').first();
    if (img.length > 0) {
      const src = img.attr('data-src') || img.attr('src');
      if (src && src.includes('nationalgallery.org.uk')) {
        return src;
      }
    }

    // Alternative: look for meta og:image
    const ogImage = $('meta[property="og:image"]').attr('content');
    if (ogImage && ogImage.includes('nationalgallery.org.uk')) {
      return ogImage;
    }

    console.log(`No image found for ${pageUrl}`);
    return null;
  } catch (error) {
    console.error(`Error scraping ${pageUrl}:`, error.message);
    return null;
  }
}

async function main() {
  console.log('Scraping Room 2 artworks...');
  const artworks = await scrapeRoom2Artworks();
  console.log(`Found ${artworks.length} artworks`);

  for (const artwork of artworks.slice(0, 5)) { // Limit to 5 for testing
    console.log(`Scraping: ${artwork.title}`);
    const imageUrl = await scrapeImageUrl(artwork.url);
    if (imageUrl) {
      console.log(`${artwork.title}: ${imageUrl}`);
    }
  }
}

main();
