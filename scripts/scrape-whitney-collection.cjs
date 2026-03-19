const fs = require('fs');
const path = require('path');
const https = require('https');

const OUTPUT_FILE = path.join(__dirname, '../public/data/whitney-collection.json');
const API_BASE = 'https://whitney.org/api/artworks';
const PER_PAGE = 100;

// User requested: Paintings, Drawings, Photos, Video, Digital Art, Film
// We use the plural forms as seen in the API (e.g., "Paintings", "Prints")
// We will query for these specifically.
const TARGET_CLASSIFICATIONS = [
  'Paintings',
  'Drawings',
  'Photographs',
  'Video',
  'Digital Art', // Verifying if this is the exact string later, but assuming yes for now
  'Film',
  'Prints', // Included as it's often grouped with drawings/photos
  'Sculptures', // Adding for completeness if user wants "all metadata" but focused on specific types
  'Installation' // Common in modern museums
];

// However, to be safe and accurate to the user's request, let's stick closer to the list,
// but since we want "everything" generally available for the modal,
// maybe fetching *everything* with images is safer?
// The user said: "Use this museum's API... get all metadata... include on view status."
// Then listed specific categories as interest.
// Use `q[has_image_true]=1` to ensure we get visual items.
// I will fetch ALL classifications to be safe, filtering is easier than missing data.

async function fetchPage(page) {
  const params = new URLSearchParams({
    page: page.toString(),
    per_page: PER_PAGE.toString(),
    'q[has_image_true]': '1' // Only items with images
  });

  // If we wanted to restrict:
  // TARGET_CLASSIFICATIONS.forEach(c => params.append('q[classification_in][]', c));

  const url = `${API_BASE}?${params.toString()}`;
  console.log(`Fetching page ${page}... ${url}`);

  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          if (res.statusCode !== 200) {
            reject(new Error(`Status ${res.statusCode}: ${data}`));
            return;
          }
          const json = JSON.parse(data);
          resolve(json);
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

const CATEGORY_MAP = {
  'Paintings': 'Painting',
  'Drawings': 'Drawing',
  'Photographs': 'Photography',
  'Prints': 'Print',
  'Sculptures': 'Sculpture',
  'Video': 'Video',
  'Film': 'Film',
  'Digital Art': 'Digital Art',
  'Installation': 'Installation'
};

function transformItem(item) {
  const attr = item.attributes;
  const image = attr.images && attr.images.length > 0 ? attr.images[0].url : null;
  
  // User wants all items even if image is missing but metadata says it exists (ghost image)
  // if (!image) return null; 

  const classification = attr.classification;
  const category = CATEGORY_MAP[classification] || classification;

  return {
    id: `whitney-${attr.id}`,
    originalId: attr.id,
    title: attr.title,
    artist: attr.display_artist_text,
    date: attr.display_date,
    medium: attr.medium,
    dimensions: attr.dimensions,
    image: image,
    category: category,
    onView: attr.on_view,
    classification: classification, // Keep original just in case
    detailUrl: `https://whitney.org/collection/works/${attr.id}` // Guessing URL pattern
  };
}

async function scrape() {
  let allItems = [];
  let page = 1;
  let totalPages = 1; // Will update on first response

  // Resume capability? 
  // For a clean json generation, we might just run it all. 27k items / 100 = 270 requests.
  // That's manageable in one go (approx 5 mins).
  
  while (page <= totalPages) {
    try {
      const response = await fetchPage(page);
      const items = response.data;
      const meta = response.meta;
      
      if (page === 1) {
        // Calculate total pages
        totalPages = Math.ceil(meta.total / PER_PAGE);
        console.log(`Total items: ${meta.total}, Total pages: ${totalPages}`);
      }

      const transformed = items.map(transformItem).filter(Boolean);
      allItems = allItems.concat(transformed);
      
      console.log(`Page ${page}/${totalPages}: Got ${items.length} raw, ${transformed.length} valid. Total so far: ${allItems.length}`);

      if (page % 5 === 0) {
        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(allItems, null, 2));
        console.log(`Saved intermediate result to ${OUTPUT_FILE}`);
      }

      if (items.length === 0) break; // Safety break

      page++;
      
      // Polite delay
      await new Promise(r => setTimeout(r, 200));

    } catch (e) {
      console.error(`Error on page ${page}:`, e);
      // Retry logic could be added here
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  console.log(`Finished. Total items: ${allItems.length}`);
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(allItems, null, 2));
  console.log(`Written to ${OUTPUT_FILE}`);
}

scrape();
