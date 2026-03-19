const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '../public/data/wallace-collection.json');

const RE_MATERIAL_3D = /\b(bronzes?|marbles?|stones?|woods?|ceramics?|porcelains?|metals?|gold|silver|ivory|glass|enamel|steel|iron|brass|copper|earthenware|stoneware|terracotta|faience|maiolica|alloy|pewter|tin-glazed|gilt|birch|walnut|oak|mahogany|lacquer|amber|carved|limestones?)\b/i;
const RE_MATERIAL_2D = /\b(oil|canvas|panel|paper|cardboard|vellum|watercolou?r|pencil|ink|chalk|pastel|miniature|board|millboard)\b/i;

// Hard-deny by title: these are clearly decorative arts or arms regardless of medium field
function isHardDenyTitle(titleRaw) {
  const t = (titleRaw || '').toLowerCase().trim();

  // Exact-match deny (pure object names)
  const EXACT_DENY = new Set([
    'mirror', 'table', 'box', 'vase', 'bowl', 'sword', 'shield',
    'ewer stand', 'plateau', 'longbow', 'longsword', 'armour', 'armor',
  ]);
  if (EXACT_DENY.has(t)) return true;

  // Substring deny (unambiguously non-painting categories)
  const CONTAINS = [
    'augsburg service',
    'mantel clock', 'wall clock', 'carriage clock',
    ' armour', ' armor', ' helmet', ' pistol',
    ' sword', ' shield',
    'jousting', 'longsword', 'parade shield',
    'écuelle', 'ecuelle', 'salver', 'tureen',
    'mirror frame', 'ewer stand',
    'snuff box', 'scent bottle',
    'knee-hole',
    'escutcheon',
    'lacquered cabinet',
    'toilet mirror',
  ];
  if (CONTAINS.some(k => t.includes(k))) return true;

  // Starts-with deny (furniture, silverware, etc.)
  const STARTS = [
    'table (', 'table,',
    'side table', 'writing table', 'work table',
    'dressing table', 'tea table', 'combined dressing',
    'plate from', 'box from', 'box with',
    'covered goblet', 'goblet from',
    'bowl and cover', 'footed bowl', 'armorial bowl', 'bowl with',
    'vase with', 'vase (',
    'plateau ',
    'close helmet', 'visor of',
    'sword of', 'sword belt', 'sword with',
    'angel with a sword',
  ];
  if (STARTS.some(k => t.startsWith(k))) return true;

  return false;
}

function is3D(artwork) {
  const medium = (artwork.medium || '').toLowerCase();
  const title = (artwork.title || '');

  // Hard deny by title always wins (decorative arts misclassified with painting medium)
  if (isHardDenyTitle(title)) return true;

  // If medium is clearly 2D, keep
  if (RE_MATERIAL_2D.test(medium)) return false;

  // Strong signal from medium being 3D material
  if (medium && RE_MATERIAL_3D.test(medium)) return true;

  // For items with empty/ambiguous medium, check title for broad 3D cues
  if (!medium || medium.length < 3) {
    const RE_3D_CUE = /\b(sculptures?|statues?|statuettes?|busts?|reliefs?|vessels?|coins?|medals?|weapons?|masks?|jewelry|jewellery|ceramics?|porcelains?|terracottas?|bronzes?|marbles?|carving|figurine|clock|watch|cabinet|chair|commode|sèvres|majolica|chandelier)\b/i;
    if (RE_3D_CUE.test(title)) return true;
  }

  return false;
}

function clean() {
  console.log(`Reading ${DATA_FILE}...`);
  const raw = fs.readFileSync(DATA_FILE, 'utf8');
  const data = JSON.parse(raw);

  let removedCount = 0;
  let totalCount = 0;

  data.rooms.forEach(room => {
    const originalLength = room.artworks.length;
    room.artworks = room.artworks.filter(a => {
      const isThreeD = is3D(a);
      if (isThreeD) {
          // console.log(`Removing 3D: ${a.title} (${a.medium})`);
          removedCount++;
      }
      return !isThreeD;
    });
    totalCount += room.artworks.length;
  });

  data.totalArtworks = totalCount;
  data.lastUpdated = new Date().toISOString();

  console.log(`Removed ${removedCount} 3D artworks.`);
  console.log(`Remaining ${totalCount} artworks.`);

  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  console.log(`Updated ${DATA_FILE}`);
}

clean();
