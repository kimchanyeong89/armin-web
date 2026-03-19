const fs = require('fs');
const path = require('path');

const OUTPUT_FILE = path.join(__dirname, '../public/data/thebroad-collection.json');
const BASE_URL = 'https://www.thebroad.org/jsonapi/node/art_pages';
const INITIAL_QUERY = '?include=field_artist_,field_preview_sharing_image_med.field_media_image&page[limit]=50';

async function fetchJSON(url) {
  // Use native fetch if available (Node 18+), otherwise try to dynamically import node-fetch
  let fetchFn = global.fetch;
  if (!fetchFn) {
    try {
      const mod = await import('node-fetch');
      fetchFn = mod.default;
    } catch (e) {
      throw new Error('No fetch implementation found. Use Node 18+ or install node-fetch.');
    }
  }

  const res = await fetchFn(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }
  });
  
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText}`);
  }
  return await res.json();
}

function resolveRelationship(resource, item, fieldName) {
  if (!item.relationships || !item.relationships[fieldName] || !item.relationships[fieldName].data) {
    return null;
  }
  const relData = item.relationships[fieldName].data;
  const isArray = Array.isArray(relData);
  const targets = isArray ? relData : [relData];
  
  if (targets.length === 0) return null;

  const resolved = targets.map(target => {
    return resource.included.find(inc => inc.type === target.type && inc.id === target.id);
  }).filter(Boolean);

  return isArray ? resolved : resolved[0];
}

async function run() {
  let url = BASE_URL + INITIAL_QUERY;
  let allItems = [];
  let page = 0;

  console.log('Starting fetch from The Broad...');

  while (url) {
    page++;
    console.log(`Fetching page ${page}: ${url}`);
    
    try {
      const data = await fetchJSON(url);
      
      const { data: items, included, links } = data;
      
      // Helper to find included items by type and id from the current page's included array
      // Note: JSON:API 'included' is flat.
      const getIncluded = (type, id) => included ? included.find(i => i.type === type && i.id === id) : null;

      const processed = items.map(item => {
        const attr = item.attributes;
        
        // Resolve Artist
        let artistName = 'Unknown Artist';
        if (item.relationships.field_artist_ && item.relationships.field_artist_.data && item.relationships.field_artist_.data.length > 0) {
           const artRel = item.relationships.field_artist_.data[0];
           const artistObj = getIncluded(artRel.type, artRel.id);
           if (artistObj && artistObj.attributes && artistObj.attributes.title) {
             artistName = artistObj.attributes.title;
           }
        }

        // Resolve Image
        let imageUrl = null;
        if (item.relationships.field_preview_sharing_image_med && item.relationships.field_preview_sharing_image_med.data) {
          const mediaRel = item.relationships.field_preview_sharing_image_med.data;
          const mediaObj = getIncluded(mediaRel.type, mediaRel.id);
          
          if (mediaObj && mediaObj.relationships && mediaObj.relationships.field_media_image && mediaObj.relationships.field_media_image.data) {
             const fileRel = mediaObj.relationships.field_media_image.data;
             const fileObj = getIncluded(fileRel.type, fileRel.id);
             
             if (fileObj && fileObj.attributes && fileObj.attributes.uri && fileObj.attributes.uri.url) {
                imageUrl = 'https://www.thebroad.org' + fileObj.attributes.uri.url;
             }
          }
        }

        return {
          id: attr.drupal_internal__nid || item.id,
          title: attr.title,
          artist: artistName,
          date: attr.field_label_date,
          medium: attr.field_media_and_support,
          dimensions: attr.field_label_dimensions,
          credit: attr.field_credit_line,
          objectNumber: attr.field_accession_number,
          image: imageUrl,
          url: attr.path && attr.path.alias ? 'https://www.thebroad.org' + attr.path.alias : null
        };
      });

      console.log(`  Found ${processed.length} items.`);
      allItems.push(...processed);

      // Next page
      if (links && links.next && links.next.href) {
        url = links.next.href;
      } else {
        url = null;
      }

    } catch (err) {
      console.error('Error fetching data:', err);
      break;
    }
  }

  console.log(`Total items fetched: ${allItems.length}`);
  
  // Save to file
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(allItems, null, 2));
  console.log(`Saved to ${OUTPUT_FILE}`);
}

run();
