const fs = require('fs');
const path = require('path');

const filePathArg = process.argv[2] && !process.argv[2].startsWith('--') 
  ? process.argv[2] 
  : 'public/data/guggenheim-ny-collection.json';

const FILE_PATH = path.isAbsolute(filePathArg) 
  ? filePathArg 
  : path.join(__dirname, '..', filePathArg);

function decodeEntities(str) {
  if (!str) return str;
  return str
    .replace(/&#(\d+);/g, (match, dec) => String.fromCharCode(dec))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#x([0-9A-Fa-f]+);/g, (match, hex) => String.fromCharCode(parseInt(hex, 16)));
}

function classifyCategoryFromMedium(medium, existingCategory) {
  const base = (existingCategory || '').trim() || 'Artwork';
  const text = (medium || '').toLowerCase();
  if (!text) return base;

  // Video/Film
  if (/(film|video|single-channel|projection|color sound)/.test(text)) return 'Film/Video';
  if (/installation/.test(text)) return 'Installation';
  if (/internet|website|browser/.test(text)) return 'Internet Art';

  // Photography
  if (/photograph|photography|gelatin silver|chromogenic|c-?print|inkjet print|archival pigment print/.test(text)) return 'Photography';

  // Sculpture
  if (/sculptur|sculpture|bronze|marble|steel|iron|aluminum|aluminium|wood|plaster|ceramic|ceramics|porcelain|stone|glass|plexiglass|found object|assemblage/.test(text)) {
    return 'Sculpture';
  }

  // Work on Paper
  if (/drawing|gouache|watercolor|watercolour|ink on paper|etching|lithograph|screen\s?print|serigraph|serigraf|monotype|woodcut|engraving|pencil|charcoal|pastel|crayon/.test(text)) {
    return 'Work on Paper';
  }
  // Generic "print" matches "Inkjet print", so we should check for photography first (handled above).
  // Now we can match generic print types.
  if (/print\b/.test(text) && !/inkjet|c-?print|photographic/.test(text)) {
      return 'Work on Paper';
  }
  
  if (/\bon paper\b/.test(text) && !/newspaper/.test(text)) {
    return 'Work on Paper';
  }

  // Painting
  if (/(oil|acrylic|tempera|enamel|paint)/.test(text) && /(canvas|board|panel|linen|masonite)\b/.test(text)) {
    return 'Painting';
  }
  if (/mixed media/.test(text) && /(canvas|board|panel|linen)\b/.test(text)) {
    return 'Painting';
  }
  if (/oil on/.test(text)) return 'Painting';

  return base;
}

try {
  console.log(`Reading ${FILE_PATH}...`);
  const data = JSON.parse(fs.readFileSync(FILE_PATH, 'utf8'));
  console.log(`Keys in data: ${Object.keys(data).join(', ')}`);
  if (data.artworks) console.log(`artworks length: ${data.artworks.length}`);
  if (data.objects) console.log(`objects length: ${data.objects.length}`);
  
  let updatedCount = 0;
  
  // Handle if root is object with "objects" array
  const list = Array.isArray(data) ? data : (data.objects || data.artworks || []);

  const fixedList = list.map(item => {
    let changed = false;
    
    // Fix encoding in text fields
    const fields = ['title', 'artist', 'medium', 'dimensions', 'credit', 'date'];
    fields.forEach(f => {
      if (item[f]) {
        const decoded = decodeEntities(item[f]);
        if (decoded !== item[f]) {
          item[f] = decoded;
          changed = true;
        }
      }
    });

    // Re-run classification
    if (item.medium) {
        const oldCat = item.category;
        // If provided, trust artworkType from source if it maps to our known types
        let baseCat = item.artworkType || 'Artwork'; 
        
        const newCat = classifyCategoryFromMedium(item.medium, baseCat); 
        
        if (newCat !== 'Artwork') {
             item.category = newCat;
             if (!item.categories || !item.categories.includes(newCat)) {
                 item.categories = item.categories ? [...item.categories, newCat] : [newCat];
             }
             changed = true;
        } else if (item.artworkType && item.artworkType !== item.category) {
             // Fallback to artworkType if medium didn't categorize it
             item.category = item.artworkType;
             changed = true;
        }
    }

    if (changed) updatedCount++;
    return item;
  });

  if (Array.isArray(data)) {
    console.log(`Writing ${fixedList.length} items (updated ${updatedCount}) to ${FILE_PATH}...`);
    fs.writeFileSync(FILE_PATH, JSON.stringify(fixedList, null, 2));
  } else {
    if (Array.isArray(data.artworks)) {
        data.artworks = fixedList;
    } else {
        data.objects = fixedList;
    }
    console.log(`Writing ${fixedList.length} items (updated ${updatedCount}) to ${FILE_PATH}...`);
    fs.writeFileSync(FILE_PATH, JSON.stringify(data, null, 2));
  }
  console.log('Done.');

} catch (err) {
  console.error('Error:', err);
}
