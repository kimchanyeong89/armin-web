/*
  Shenzhen Museum — All Collections
  
  API Source:
    https://www.shenzhenmuseum.com/webCollection/list1
    Params: pageNo, isAll=1, classCode=..., pageSize=50, lmType=..., paltform=0
    
  Collections to Scrape:
    L0302: History of the Reform and Opening-up (codeFenLei: C010101)
    L0303: Ancient Art Collections (codeFenLei: C010102)
    L0304: History and Culture of Shenzhen City (codeFenLei: C010103)
    L0305: Specimens (codeFenLei: C010104)

  Data Strategy:
    - Iterate through each collection type.
    - Fetch all pages.
    - Transform data, including mapping Chinese materials to English categories.
  
  Output:
    public/data/shenzhenmuseum-all.json
*/

const fs = require('node:fs/promises');
const path = require('node:path');

const BASE_URL = 'https://www.shenzhenmuseum.com';
const API_URL = `${BASE_URL}/webCollection/list1`;

const COLLECTIONS = [
  { id: 'L0302', code: 'C010101', name: 'History of Reform' },
  { id: 'L0303', code: 'C010102', name: 'Ancient Art' },
  { id: 'L0304', code: 'C010103', name: 'Shenzhen History' },
  { id: 'L0305', code: 'C010104', name: 'Specimens' }
];

const PAGE_SIZE = 50; 
const OUT_DIR = path.join(process.cwd(), 'public', 'data');
const OUT_JSON = path.join(OUT_DIR, 'shenzhenmuseum-all.json');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const MATERIAL_MAP = {
  '瓷': 'Porcelain',
  '陶': 'Pottery',
  '铜': 'Bronze',
  '玉': 'Jade',
  '石': 'Stone',
  '金': 'Gold',
  '银': 'Silver',
  '木': 'Wood',
  '纸': 'Paper',
  '铁': 'Iron',
  '书画': 'Painting & Calligraphy',
  '丝': 'Silk',
  '织': 'Textile',
  '布': 'Textile',
  '牙': 'Ivory',
  '角': 'Horn',
  '竹': 'Bamboo'
};

const mapMaterialToCategory = (quality) => {
  if (!quality) return 'Artwork';
  for (const [key, val] of Object.entries(MATERIAL_MAP)) {
    if (quality.includes(key)) return val;
  }
  return quality; // Fallback to original text if no match
};

const fetchPage = async (collection, pageNo) => {
  const url = `${API_URL}?pageNo=${pageNo}&isAll=1&classCode=${collection.code}&pageSize=${PAGE_SIZE}&lmType=${collection.id}&paltform=0`;
  // console.log(`[Shenzhen] Fetching ${collection.name} page ${pageNo}...`);
  
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; armin-web scraper)',
      'Accept': 'application/json, text/javascript, */*; q=0.01',
      'X-Requested-With': 'XMLHttpRequest'
    }
  });
  
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} fetching ${collection.id} page ${pageNo}`);
  }
  return await res.json();
};

const transformItem = (item, collectionId) => {
  const ent = item.entity || {};
  const cms = item.cmsData || {};
  
  const id = ent.resId || cms.resId || ent.id;
  if (!id) return null;

  const title = (ent.showName || ent.name || cms.name || '').trim();
  if (!title) return null;

  let imgPath = ent.showPic || ent.thumbPic || cms.thumbPic || '';
  if (imgPath && !imgPath.startsWith('http')) {
    imgPath = BASE_URL + imgPath;
  }
  // If still no image, skip? No, keep it for completeness, but UI might hide it.
  
  // Clean newlines in description
  const cleanStr = (s) => (s || '').replace(/\r\n/g, '\n').trim();

  const medium = (ent.quality || '').trim();
  const cat = mapMaterialToCategory(medium) || 'Artwork';

  return {
    id,
    source: 'Shenzhen Museum',
    // Ensure the URL matches the logic in ExhibitionModal for proper linking if we used sourceUrl
    // But better to provide a field that works directly.
    url: `${BASE_URL}/museum/html/collections/collection_detail.html?resId=${id}&resType=CmsCollection&lmType=${collectionId}`,
    title: title,
    artist: '', // Not provided structured
    date: (ent.specificYear || ent.decade || '').trim(),
    medium: medium,
    category: cat,
    dimensions: (ent.size || '').trim(),
    description: cleanStr(ent.detail || ent.content || ent.summary || cms.content),
    image: imgPath,
    raw: { 
      collectionId,
      relicsLevel: ent.relicsLevel,
      quantity: ent.quantity,
      registerNum: ent.registerNum
    }
  };
};

const main = async () => {
  await fs.mkdir(OUT_DIR, { recursive: true });
  
  const allItems = [];
  
  for (const col of COLLECTIONS) {
    console.log(`[Shenzhen] Starting collection: ${col.name} (${col.id})`);
    let page = 1;
    let totalPages = 1;
    let count = 0;
    
    while (page <= totalPages) {
      try {
        const data = await fetchPage(col, page);
        
        if (page === 1) {
          if (data.pageCount) totalPages = data.pageCount;
          else if (data.count) totalPages = Math.ceil(data.count / PAGE_SIZE);
          console.log(`  -> Found ${data.count} items across ${totalPages} pages.`);
        }
        
        const list = data.entitys || [];
        if (list.length === 0) break;
        
        for (const rawItem of list) {
          const item = transformItem(rawItem, col.id);
          if (item) allItems.push(item);
        }
        
        count += list.length;
        process.stdout.write(`\r  -> Processed ${count} items...`);
        
        page++;
        await sleep(200);
      } catch (err) {
        console.error(`\n  -> Error on page ${page}:`, err.message);
        break; 
      }
    }
    console.log(`\n  -> Done with ${col.name}.`);
  }
  
  console.log(`[Shenzhen] Writing final JSON with ${allItems.length} items to ${OUT_JSON}`);
  await fs.writeFile(OUT_JSON, JSON.stringify(allItems, null, 2));
};

main();
