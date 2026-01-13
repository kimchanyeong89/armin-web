/**
 * Generate a comprehensive search index from ALL museum artwork data
 * Automatically discovers all collection files in the data directory
 * AND splits the index into chunks < 20MB for Cloudflare Pages hosting
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../public/data');
const OUTPUT_FILE = path.join(DATA_DIR, 'search-index.json');
const CHUNK_SIZE_LIMIT = 15 * 1024 * 1024; // 15MB chunks (safe limit for Pages 25MB)

// Mapping from filename patterns to museum info
const MUSEUM_MAPPINGS = {
    // Spanish
    'reina-sofia': { museumName: 'Museo Reina Sofía', exhibitionId: 'reina-sofia-collection' },
    'thyssen': { museumName: 'Museo Thyssen-Bornemisza', exhibitionId: 'thyssen-collection' },
    'prado': { museumName: 'Museo del Prado', exhibitionId: 'prado-collection' },
    'guggenheim-bilbao': { museumName: 'Guggenheim Bilbao', exhibitionId: 'guggenheim-bilbao-collection' },
    'picasso-bcn': { museumName: 'Museu Picasso Barcelona', exhibitionId: 'picasso-bcn-collection' },

    // Italian
    'uffizi': { museumName: 'Uffizi Gallery', exhibitionId: 'uffizi-gallery-collection' },
    'pitti': { museumName: 'Palazzo Pitti', exhibitionId: 'pitti-collection' },
    'accademia-collection': { museumName: 'Galleria dell\'Accademia', exhibitionId: 'accademia-collection' },
    'galleria-borghese': { museumName: 'Galleria Borghese', exhibitionId: 'borghese-paintings' },
    'borghese-arte-antica': { museumName: 'Galleria Borghese', exhibitionId: 'borghese-arte-antica' },
    'vatican': { museumName: 'Vatican Museums', exhibitionId: 'vatican-collection' },
    'pinacoteca-brera': { museumName: 'Pinacoteca di Brera', exhibitionId: 'brera-collection' },
    'gallerie-accademia-venice': { museumName: 'Gallerie dell\'Accademia Venice', exhibitionId: 'accademia-venice-collection' },
    'guggenheim-venice': { museumName: 'Peggy Guggenheim Collection', exhibitionId: 'guggenheim-collection' },
    'doria-pamphilj': { museumName: 'Galleria Doria Pamphilj', exhibitionId: 'doria-pamphilj-collection' },
    'museo-egizio': { museumName: 'Museo Egizio', exhibitionId: 'museo-egizio-collection' },
    'ambrosiana': { museumName: 'Pinacoteca Ambrosiana', exhibitionId: 'ambrosiana-collection' },
    'castello-di-rivoli': { museumName: 'Castello di Rivoli', exhibitionId: 'rivoli-collection' },
    'museo-del-novecento': { museumName: 'Museo del Novecento', exhibitionId: 'novecento-collection' },
    'musei-capitolini': { museumName: 'Musei Capitolini', exhibitionId: 'capitolini-collection' },
    'palazzo-ducale': { museumName: 'Palazzo Ducale', exhibitionId: 'palazzo-ducale-collection' },

    // French
    'louvre': { museumName: 'Musée du Louvre', exhibitionId: 'louvre-painting' },
    'pompidou': { museumName: 'Centre Pompidou', exhibitionId: 'pompidou' },
    'orsay': { museumName: 'Musée d\'Orsay', exhibitionId: 'orsay-collection' },
    'orangerie': { museumName: 'Musée de l\'Orangerie', exhibitionId: 'orangerie-collection' },
    'marmottan': { museumName: 'Musée Marmottan Monet', exhibitionId: 'marmottan-collection' },
    'picasso-paintings': { museumName: 'Musée Picasso Paris', exhibitionId: 'picasso-paintings' },
    'picasso-drawings': { museumName: 'Musée Picasso Paris', exhibitionId: 'picasso-drawings' },
    'petit-palais': { museumName: 'Petit Palais', exhibitionId: 'petit-palais-collection' },
    'versailles': { museumName: 'Château de Versailles', exhibitionId: 'versailles-collection' },
    'guimet': { museumName: 'Musée Guimet', exhibitionId: 'guimet-collection' },
    'carnavalet': { museumName: 'Musée Carnavalet', exhibitionId: 'carnavalet' },
    'rodin': { museumName: 'Musée Rodin', exhibitionId: 'rodin' },
    'flv': { museumName: 'Fondation Louis Vuitton', exhibitionId: 'flv-collection' },
    'musee-conde': { museumName: 'Musée Condé', exhibitionId: 'musee-conde' },
    'musee-fabre': { museumName: 'Musée Fabre', exhibitionId: 'musee-fabre-collection' },
    'musee-grenoble': { museumName: 'Musée de Grenoble', exhibitionId: 'musee-grenoble' },
    'musee-chagall': { museumName: 'Musée Chagall', exhibitionId: 'musee-chagall-collection' },
    'musee-granet': { museumName: 'Musée Granet', exhibitionId: 'musee-granet-collection' },
    'musee-armee': { museumName: 'Musée de l\'Armée', exhibitionId: 'musee-armee' },
    'musee-beaux-arts-rouen': { museumName: 'Musée des Beaux-Arts de Rouen', exhibitionId: 'rouen-mba' },
    'mucem': { museumName: 'Mucem', exhibitionId: 'mucem-collection' },
    'mam-': { museumName: 'Musée d\'Art Moderne', exhibitionId: 'mam-collection' },
    'mep-': { museumName: 'Maison Européenne de la Photographie', exhibitionId: 'mep-collection' },
    'macval': { museumName: 'MAC VAL', exhibitionId: 'macval-collection' },
    'mad-paris': { museumName: 'Musée des Arts Décoratifs', exhibitionId: 'mad-paris-collection' },
    'la-piscine': { museumName: 'La Piscine', exhibitionId: 'la-piscine-collection' },
    'palais-de-tokyo': { museumName: 'Palais de Tokyo', exhibitionId: 'palais-de-tokyo-collection' },
    'musba-bordeaux': { museumName: 'Musée des Beaux-Arts de Bordeaux', exhibitionId: 'musba-bordeaux' },
    'mba-lyon': { museumName: 'Musée des Beaux-Arts de Lyon', exhibitionId: 'mba-lyon-collection' },
    'jacquemart-andre': { museumName: 'Musée Jacquemart-André', exhibitionId: 'jacquemart-andre-collection' },
    'lille': { museumName: 'Palais des Beaux-Arts de Lille', exhibitionId: 'lille-pba' },
    'mamcs-strasbourg': { museumName: 'MAMCS Strasbourg', exhibitionId: 'mamcs-strasbourg' },
    'pinault': { museumName: 'Pinault Collection', exhibitionId: 'pinault-collection' },

    // German
    'smb-alte-nationalgalerie': { museumName: 'Alte Nationalgalerie', exhibitionId: 'alte-nationalgalerie-collection' },
    'smb-neue-nationalgalerie': { museumName: 'Neue Nationalgalerie', exhibitionId: 'neue-nationalgalerie-collection' },
    'smb-gemaeldegalerie': { museumName: 'Gemäldegalerie Berlin', exhibitionId: 'gemaeldegalerie-collection' },
    'smb-bode-museum': { museumName: 'Bode-Museum', exhibitionId: 'bode-collection' },
    'smb-altes-museum': { museumName: 'Altes Museum', exhibitionId: 'altes-collection' },
    'smb-neues-museum': { museumName: 'Neues Museum', exhibitionId: 'neues-collection' },
    'smb-humboldt': { museumName: 'Humboldt Forum', exhibitionId: 'humboldt-collection' },
    'alte-pinakothek': { museumName: 'Alte Pinakothek', exhibitionId: 'alte-pinakothek-collection' },
    'neue-pinakothek': { museumName: 'Neue Pinakothek', exhibitionId: 'neue-pinakothek-collection' },
    'pinakothek-moderne': { museumName: 'Pinakothek der Moderne', exhibitionId: 'pinakothek-moderne-collection' },
    'staatsgalerien': { museumName: 'Staatsgalerien', exhibitionId: 'staatsgalerien-collection' },
    'staedel': { museumName: 'Städel Museum', exhibitionId: 'staedel-collection' },
    'bruecke-museum': { museumName: 'Brücke-Museum', exhibitionId: 'bruecke-collection' },
    'hamburger-kunsthalle': { museumName: 'Hamburger Kunsthalle', exhibitionId: 'hamburger-kunsthalle' },

    // UK
    'courtauld': { museumName: 'Courtauld Gallery', exhibitionId: 'courtauld-collection' },
    'dulwich': { museumName: 'Dulwich Picture Gallery', exhibitionId: 'dulwich-collection' },
    'scottish-national-gallery': { museumName: 'Scottish National Gallery', exhibitionId: 'scottish-national-gallery' },
    'royal-academy': { museumName: 'Royal Academy of Arts', exhibitionId: 'royal-academy-collection' },
    'tate-britain': { museumName: 'Tate Britain', exhibitionId: 'tate-britain' },
    'tate-st-ives': { museumName: 'Tate St Ives', exhibitionId: 'tate-st-ives' },
    'british-museum': { museumName: 'British Museum', exhibitionId: 'british-museum' },
    'soane': { museumName: 'Sir John Soane\'s Museum', exhibitionId: 'soane-museum' },
    'wallace': { museumName: 'Wallace Collection', exhibitionId: 'wallace-collection' },
    'hayward': { museumName: 'Hayward Gallery', exhibitionId: 'hayward-gallery-collection' },
    'serpentine': { museumName: 'Serpentine Gallery', exhibitionId: 'serpentine-gallery-collection' },
    'walker-art-gallery': { museumName: 'Walker Art Gallery', exhibitionId: 'walker-art-gallery-collection' },
    'jmw-turner': { museumName: 'Turner Collection', exhibitionId: 'jmw-turner' },

    // Korea
    'mmca': { museumName: 'MMCA (국립현대미술관)', exhibitionId: 'mmca-collection' },
    'seoul-museum-of-art': { museumName: 'SeMA (서울시립미술관)', exhibitionId: 'sema-collection' },
    'national-museum-korea': { museumName: '국립중앙박물관', exhibitionId: 'national-museum-korea' },
    'gyeongju-museum': { museumName: '국립경주박물관', exhibitionId: 'gyeongju-museum' },
    'buyeo-museum': { museumName: '국립부여박물관', exhibitionId: 'buyeo-museum' },
};

// Files to skip
const SKIP_PATTERNS = [
    'search-index',
    '.backup',
    '-part',
    'test',
    '-sample',
    '-new.json',
];

function getMuseumInfo(filename) {
    const baseFilename = filename.replace('.json', '');
    for (const [pattern, info] of Object.entries(MUSEUM_MAPPINGS)) {
        if (baseFilename.includes(pattern)) {
            return { ...info, exhibitionId: info.exhibitionId || baseFilename };
        }
    }
    const name = baseFilename
        .replace(/-collection|-paintings|-drawings|-sculptures|-photography|-prints|-gravures/g, '')
        .replace(/-/g, ' ')
        .split(' ')
        .map(w => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
    return { museumName: name, exhibitionId: baseFilename };
}

function loadCollection(filePath) {
    try {
        const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        if (Array.isArray(data)) return data;
        if (data.objects) return data.objects;
        if (data.artworks) return data.artworks;
        if (data.rooms) return data.rooms.flatMap(room => room.artworks || []);
        return [];
    } catch (e) {
        return [];
    }
}

function getThumbnailUrl(item) {
    let url = item.thumb || item.thumbnailUrl || item.lq || item.image || item.imageUrl || '';
    if (!url || url.includes('no-image') || url.length < 10) return '';

    // Convert HTTP to HTTPS (iOS Safari blocks mixed content)
    if (url.startsWith('http://')) {
        url = url.replace('http://', 'https://');
    }

    if (url.includes('/iiif/')) {
        url = url.replace(/\/full\/\d+,\//, '/full/200,/');
    }
    return url;
}

function extractArtworkData(item, museumName, exhibitionId, idx) {
    const name = item.title || item.name || 'Untitled';
    const artist = item.artist || item.artistName || item.creator || 'Unknown';
    const image = getThumbnailUrl(item);
    const date = item.date || item.year || '';
    const id = item.id || `${exhibitionId}-${idx}`;

    if (!image) return null;

    return {
        id,
        n: name.substring(0, 80),
        a: artist.substring(0, 50),
        i: image.substring(0, 500), // Increased from 300 to 500 for emuseum API URLs (max 323 chars)
        d: String(date).substring(0, 15),
        m: museumName,
        e: exhibitionId,
    };
}

async function generateSearchIndex() {
    console.log('🔍 Generating comprehensive search index...\n');

    const allFiles = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.json'));
    const collectionFiles = allFiles.filter(f => {
        const lower = f.toLowerCase();
        return !SKIP_PATTERNS.some(pattern => lower.includes(pattern));
    });

    console.log(`Found ${collectionFiles.length} collection files\n`);

    const allArtworks = [];
    const artistCounts = new Map();
    const processedIds = new Set();
    const processedContent = new Set(); // content hash (title + artist + image)

    for (const file of collectionFiles) {
        const filePath = path.join(DATA_DIR, file);
        const { museumName, exhibitionId } = getMuseumInfo(file);

        const items = loadCollection(filePath);
        if (items.length === 0) continue;

        let addedCount = 0;
        let duplicateCount = 0;

        items.forEach((item, idx) => {
            const artwork = extractArtworkData(item, museumName, exhibitionId, idx);
            if (artwork && artwork.n !== 'Untitled') {
                // Generate a unique content hash to detect duplicates across files
                // (e.g., same artwork in part1.json and part2.json)
                const contentHash = `${artwork.n}|${artwork.a}|${artwork.i.slice(-20)}`; // Title|Artist|Last20CharsOfImage

                if (processedIds.has(artwork.id)) {
                    // ID collision: append suffix if content is different, otherwise skip
                    if (processedContent.has(contentHash)) {
                        duplicateCount++;
                        return; // Skip exact duplicate
                    }
                    // Different content but same ID -> modify ID to be unique
                    artwork.id = `${artwork.id}-${Math.random().toString(36).substr(2, 5)}`;
                } else if (processedContent.has(contentHash)) {
                    duplicateCount++;
                    return; // Skip duplicate content with different ID
                }

                processedIds.add(artwork.id);
                processedContent.add(contentHash);

                allArtworks.push(artwork);
                addedCount++;
                if (artwork.a && artwork.a !== 'Unknown') {
                    artistCounts.set(artwork.a, (artistCounts.get(artwork.a) || 0) + 1);
                }
            }
        });

        if (addedCount > 0) {
            const dupMsg = duplicateCount > 0 ? ` (skipped ${duplicateCount} duplicates)` : '';
            console.log(`✅ ${file}: ${addedCount.toLocaleString()} artworks${dupMsg}`);
        }
    }

    const timestamp = new Date().toISOString();

    // Save Full Index (for backup/R2)
    const fullIndex = { a: allArtworks, t: timestamp, c: allArtworks.length };
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(fullIndex));
    console.log(`\n📦 Saved full index: ${OUTPUT_FILE} (${(fs.statSync(OUTPUT_FILE).size / 1024 / 1024).toFixed(2)} MB)`);

    // Split Index (for Pages)
    console.log('\n✂️  Splitting index into chunks...');
    const CHUNK_ITEMS = 40000; // Approx 40k items = ~14MB

    const manifest = { t: timestamp, c: allArtworks.length, chunks: [] };

    for (let i = 0; i < allArtworks.length; i += CHUNK_ITEMS) {
        const chunk = allArtworks.slice(i, i + CHUNK_ITEMS);
        const chunkFile = `search-index-part-${manifest.chunks.length}.json`;

        fs.writeFileSync(path.join(DATA_DIR, chunkFile), JSON.stringify(chunk));
        manifest.chunks.push(chunkFile);

        const size = (fs.statSync(path.join(DATA_DIR, chunkFile)).size / 1024 / 1024).toFixed(2);
        console.log(`   - ${chunkFile}: ${chunk.length} items (${size} MB)`);
    }

    fs.writeFileSync(path.join(DATA_DIR, 'search-manifest.json'), JSON.stringify(manifest));
    console.log(`\n✅ Saved manifest with ${manifest.chunks.length} chunks`);
}

generateSearchIndex().catch(console.error);
