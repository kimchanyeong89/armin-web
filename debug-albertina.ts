
import fs from 'fs';
import path from 'path';

const files = [
  'albertina-paintings-sculpture-100.json',
  'albertina-drawings-prints-100.json',
  'albertina-photography-100.json',
  'albertina-objects-installations-media-art-100.json',
  'albertina-poster-100.json',
  'leopold-museum-collection-test.json'
];

const ensureHttps = (url: string | undefined | null): string => {
  if (!url) return '';
  if (url.startsWith('http://')) {
    return url.replace('http://', 'https://');
  }
  return url;
};

files.forEach(file => {
  const p = path.join(process.cwd(), 'public/data', file);
  if (!fs.existsSync(p)) {
    console.log(`MISSING: ${file}`);
    return;
  }
  
  const content = fs.readFileSync(p, 'utf8');
  try {
    const data = JSON.parse(content);
    let items = [];
    if (file.includes('leopold')) {
       items = Array.isArray(data.artworks) ? data.artworks : [];
    } else {
       items = Array.isArray(data.objects) ? data.objects : [];
    }
    
    console.log(`File: ${file}`);
    console.log(`  Raw items count: ${items.length}`);
    
    // Simulate mapping and filtering
    const mapped = items.map((item: any) => {
       const img = file.includes('leopold') ? item.image : item.imageUrl;
       return {
         id: item.id,
         image: ensureHttps(img)
       };
    });
    
    const valid = mapped.filter((a: any) => !!a.image);
    console.log(`  Valid items (with image): ${valid.length}`);
    if (valid.length === 0 && items.length > 0) {
        console.log(`  FIRST ITEM RAW:`, JSON.stringify(items[0], null, 2));
    }

  } catch (e) {
    console.error(`Error parsing ${file}:`, e);
  }
});
