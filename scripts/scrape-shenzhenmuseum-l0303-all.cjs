/*
  Shenzhen Museum — Collections (lmType=L0303) ONLY

  Source (HTML list renders via JS):
    https://www.shenzhenmuseum.com/museum/html/collections/collection_list.html?lmType=L0303

  Data API (used by the site JS):
    https://www.shenzhenmuseum.com/webCollection/list1
    Params: pageNo, isAll=1, classCode=C010102, pageSize=50, lmType=L0303, paltform=0

  Output:
    public/data/shenzhenmuseum-l0303-all.json
*/

const fs = require('node:fs/promises');
const path = require('node:path');

const BASE_URL = 'https://www.shenzhenmuseum.com';
const API_URL = `${BASE_URL}/webCollection/list1`;

const LM_TYPE = 'L0303';
const CLASS_CODE = 'C010102';
const PAGE_SIZE = 50;

const OUT_DIR = path.join(process.cwd(), 'public', 'data');
const OUT_JSON = path.join(OUT_DIR, 'shenzhenmuseum-l0303-all.json');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const CODE_NAME_URL = `${BASE_URL}/webService/getNameByCode`;

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
  '竹': 'Bamboo',
};

const mapMaterialToCategory = (quality) => {
  const q = String(quality || '').trim();
  if (!q) return 'Artwork';
  for (const [key, val] of Object.entries(MATERIAL_MAP)) {
    if (q.includes(key)) return val;
  }
  return q;
};

const fetchPage = async (pageNo) => {
  const url = `${API_URL}?pageNo=${pageNo}&isAll=1&classCode=${CLASS_CODE}&pageSize=${PAGE_SIZE}&lmType=${LM_TYPE}&paltform=0`;
  console.log(`[Shenzhen L0303] Fetch page ${pageNo}: ${url}`);

  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; armin-web scraper)',
      'Accept': 'application/json, text/javascript, */*; q=0.01',
      'X-Requested-With': 'XMLHttpRequest',
    },
  });

  if (!res.ok) throw new Error(`HTTP ${res.status} fetching page ${pageNo}`);
  return await res.json();
};

const cleanStr = (s) => String(s || '').replace(/\r\n/g, '\n').trim();

const transformItem = (item) => {
  const ent = item.entity || {};
  const cms = item.cmsData || {};

  // Prefer the outer resId if present (most reliable)
  const id = item.resId || ent.resId || cms.resId || ent.id;
  if (!id) return null;

  const title = cleanStr(ent.showName || ent.name || cms.name);
  if (!title) return null;

  let imgPath = ent.showPic || ent.thumbPic || cms.thumbPic || '';
  imgPath = String(imgPath || '').trim();
  if (imgPath && !imgPath.startsWith('http')) imgPath = BASE_URL + imgPath;

  const medium = cleanStr(ent.quality);
  const categoryCode = cleanStr(ent.category);

  return {
    id,
    source: 'Shenzhen Museum',
    url: `${BASE_URL}/museum/html/collections/collection_detail.html?resId=${id}&resType=CmsCollection&lmType=${LM_TYPE}`,
    title,
    artist: '',
    date: cleanStr(ent.specificYear || ent.decade),
    medium,
    // Will be replaced with English name from categoryCode when available.
    category: mapMaterialToCategory(medium),
    dimensions: cleanStr(ent.size),
    description: cleanStr(ent.detail || ent.content || ent.summary || cms.content),
    image: imgPath,
    raw: {
      categoryCode,
      relicsLevel: cleanStr(ent.relicsLevel),
      quantity: cleanStr(ent.quantity),
      registerNum: cleanStr(ent.registerNum),
    },
  };
};

const fetchEngNameByCode = async (code) => {
  if (!code) return '';
  const url = `${CODE_NAME_URL}?code=${encodeURIComponent(code)}`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; armin-web scraper)',
      'Accept': 'application/json, text/javascript, */*; q=0.01',
      'X-Requested-With': 'XMLHttpRequest',
    },
  });
  if (!res.ok) return '';
  try {
    const data = await res.json();
    return String(data?.engName || '').trim();
  } catch {
    return '';
  }
};

const main = async () => {
  await fs.mkdir(OUT_DIR, { recursive: true });

  let page = 1;
  let totalPages = 1;
  const items = [];

  while (page <= totalPages) {
    const data = await fetchPage(page);

    if (page === 1) {
      if (data.pageCount) totalPages = data.pageCount;
      else if (data.count) totalPages = Math.ceil(data.count / PAGE_SIZE);
      console.log(`[Shenzhen L0303] Found ${data.count} items across ${totalPages} pages.`);
    }

    const list = Array.isArray(data.entitys) ? data.entitys : [];
    if (!list.length) break;

    for (const raw of list) {
      const out = transformItem(raw);
      if (out) items.push(out);
    }

    page++;
    await sleep(200);
  }

  // Replace category with the museum's English classification name (derived from category code)
  const codes = Array.from(new Set(items.map((x) => x?.raw?.categoryCode).filter(Boolean)));
  const codeToEng = {};
  for (const code of codes) {
    // small throttle to be polite
    await sleep(50);
    const eng = await fetchEngNameByCode(code);
    if (eng) codeToEng[code] = eng;
  }
  for (const it of items) {
    const code = it?.raw?.categoryCode;
    if (code && codeToEng[code]) {
      it.category = codeToEng[code];
    }
  }

  console.log(`[Shenzhen L0303] Writing ${items.length} items to ${OUT_JSON}`);
  await fs.writeFile(OUT_JSON, JSON.stringify(items, null, 2));
};

main().catch((e) => {
  console.error('[Shenzhen L0303] Failed:', e);
  process.exitCode = 1;
});
