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
    'reina-sofia': { museumName: 'Museo Reina Sofía' },
    'thyssen': { museumName: 'Museo Thyssen-Bornemisza' },
    'prado': { museumName: 'Museo del Prado' },
    'guggenheim-bilbao': { museumName: 'Guggenheim Bilbao' },
    'picasso-bcn': { museumName: 'Museu Picasso Barcelona' },

    // Italian
    'uffizi': { museumName: 'Uffizi Gallery' },
    'pitti': { museumName: 'Palazzo Pitti' },
    'accademia-collection': { museumName: 'Galleria dell\'Accademia' },
    'galleria-borghese': { museumName: 'Galleria Borghese' },
    'borghese-arte-antica': { museumName: 'Galleria Borghese' },
    'vatican': { museumName: 'Vatican Museums' },
    'pinacoteca-brera': { museumName: 'Pinacoteca di Brera' },
    'gallerie-accademia-venice': { museumName: 'Gallerie dell\'Accademia Venice' },
    'guggenheim-venice': { museumName: 'Peggy Guggenheim Collection' },
    'doria-pamphilj': { museumName: 'Galleria Doria Pamphilj' },
    'museo-egizio': { museumName: 'Museo Egizio' },
    'ambrosiana': { museumName: 'Pinacoteca Ambrosiana' },
    'castello-di-rivoli': { museumName: 'Castello di Rivoli' },
    'museo-del-novecento': { museumName: 'Museo del Novecento' },
    'musei-capitolini': { museumName: 'Musei Capitolini' },
    'palazzo-ducale': { museumName: 'Palazzo Ducale' },

    // French
    'louvre': { museumName: 'Musée du Louvre' },
    'pompidou': { museumName: 'Centre Pompidou' },
    'orsay': { museumName: 'Musée d\'Orsay' },
    'orangerie': { museumName: 'Musée de l\'Orangerie' },
    'marmottan': { museumName: 'Musée Marmottan Monet' },
    'picasso-paintings': { museumName: 'Musée Picasso Paris' },
    'picasso-drawings': { museumName: 'Musée Picasso Paris' },
    'petit-palais': { museumName: 'Petit Palais' },
    'versailles': { museumName: 'Château de Versailles' },
    'guimet': { museumName: 'Musée Guimet', exhibitionId: 'guimet-collection' },
    'carnavalet': { museumName: 'Musée Carnavalet' },
    'rodin': { museumName: 'Musée Rodin' },
    'flv': { museumName: 'Fondation Louis Vuitton' },
    'musee-conde': { museumName: 'Musée Condé' },
    'musee-fabre': { museumName: 'Musée Fabre', exhibitionId: 'fabre-collection' },
    'musee-grenoble': { museumName: 'Musée de Grenoble' },
    'musee-chagall': { museumName: 'Musée Chagall', exhibitionId: 'chagall-collection' },
    'musee-granet': { museumName: 'Musée Granet', exhibitionId: 'granet-collection' },
    'musee-armee': { museumName: 'Musée de l\'Armée' },
    'musee-beaux-arts-rouen': { museumName: 'Musée des Beaux-Arts de Rouen' },
    'mucem': { museumName: 'Mucem' },
    'mam-': { museumName: 'Musée d\'Art Moderne' },
    'mep-': { museumName: 'Maison Européenne de la Photographie' },
    'macval': { museumName: 'MAC VAL' },
    'mad-paris': { museumName: 'Musée des Arts Décoratifs' },
    'la-piscine': { museumName: 'La Piscine', exhibitionId: 'piscine-collection' },
    'palais-de-tokyo': { museumName: 'Palais de Tokyo' },
    'musba-bordeaux': { museumName: 'Musée des Beaux-Arts de Bordeaux' },
    'mba-lyon': { museumName: 'Musée des Beaux-Arts de Lyon', exhibitionId: 'lyon-collection' },
    'jacquemart-andre': { museumName: 'Musée Jacquemart-André' },
    'lille': { museumName: 'Palais des Beaux-Arts de Lille' },
    'mamcs-strasbourg': { museumName: 'Musée d\'Art Moderne et Contemporain de Strasbourg' },
    'pinault': { museumName: 'Bourse de Commerce - Pinault Collection' },

    // German
    'smb-alte-nationalgalerie': { museumName: 'Alte Nationalgalerie' },
    'smb-neue-nationalgalerie': { museumName: 'Neue Nationalgalerie' },
    'smb-gemaeldegalerie': { museumName: 'Gemäldegalerie Berlin' },
    'smb-bode-museum': { museumName: 'Bode-Museum' },
    'smb-altes-museum': { museumName: 'Altes Museum' },
    'smb-neues-museum': { museumName: 'Neues Museum' },
    'smb-humboldt': { museumName: 'Humboldt Forum' },
    'alte-pinakothek': { museumName: 'Alte Pinakothek' },
    'neue-pinakothek': { museumName: 'Neue Pinakothek' },
    'pinakothek-moderne': { museumName: 'Pinakothek der Moderne' },
    'staatsgalerien': { museumName: 'Staatsgalerien' },
    'staedel': { museumName: 'Städel Museum' },
    'bruecke-museum': { museumName: 'Brücke-Museum' },
    'hamburger-kunsthalle': { museumName: 'Hamburger Kunsthalle' },

    // UK
    'courtauld': { museumName: 'Courtauld Gallery' },
    'dulwich': { museumName: 'Dulwich Picture Gallery' },
    'scottish-national-gallery': { museumName: 'Scottish National Gallery' },
    'royal-academy': { museumName: 'Royal Academy of Arts' },
    'tate-britain': { museumName: 'Tate Britain' },
    'tate-st-ives': { museumName: 'Tate St Ives' },
    'british-museum': { museumName: 'British Museum' },
    'soane': { museumName: 'Sir John Soane\'s Museum' },
    'wallace': { museumName: 'Wallace Collection', exhibitionId: 'wallace-permanent' },
    'hayward': { museumName: 'Hayward Gallery' },
    'serpentine': { museumName: 'Serpentine Gallery' },
    'walker-art-gallery': { museumName: 'Walker Art Gallery' },
    'jmw-turner': { museumName: 'Turner Collection', exhibitionId: 'jmw-turner' },

    // Korea
    'mmca': { museumName: 'MMCA (국립현대미술관)', exhibitionId: 'mmca-collection' },
    'seoul-museum-of-art': { museumName: 'SeMA (서울시립미술관)', exhibitionId: 'sema-collection' },
    'national-museum-korea': { museumName: '국립중앙박물관', exhibitionId: 'national-museum-korea' },
    'gyeongju-museum': { museumName: '국립경주박물관', exhibitionId: 'gyeongju-museum' },
    'buyeo-museum': { museumName: '국립부여박물관', exhibitionId: 'buyeo-museum' },

    // Netherlands
    'vangogh-museum': { museumName: 'Van Gogh Museum', exhibitionId: 'vangogh-museum-collection' },
    'rijksmuseum': { museumName: 'Rijksmuseum' },
    'mauritshuis': { museumName: 'Mauritshuis' },
    'kroller-muller': { museumName: 'Kröller-Müller Museum' },

    // Denmark
    'smk': { museumName: 'SMK (Statens Museum for Kunst)' },
    'glyptoteket': { museumName: 'Ny Carlsberg Glyptotek' },
    'louisiana': { museumName: 'Louisiana Museum of Modern Art' },
    'aros': { museumName: 'ARoS Aarhus Art Museum' },
    'skagens': { museumName: 'Skagens Museum' },

    // Norway
    'munch': { museumName: 'MUNCH Museum' },
    'nasjonal': { museumName: 'Nasjonalmuseet' },
    'nam-': { museumName: 'Nasjonalmuseet' },

    // Sweden
    'sweden-collection': { museumName: 'Nationalmuseum Sweden' },

    // Finland
    'ateneum': { museumName: 'Ateneum Art Museum' },
    'kiasma': { museumName: 'Kiasma Museum of Contemporary Art' },
    'sinebrychoff': { museumName: 'Sinebrychoff Art Museum' },

    // Austria
    'khm': { museumName: 'Kunsthistorisches Museum Vienna' },
    'belvedere': { museumName: 'Belvedere' },
    'leopold': { museumName: 'Leopold Museum' },
    'mumok': { museumName: 'mumok' },
    'albertina': { museumName: 'Albertina' },

    // Switzerland
    'kunsthaus': { museumName: 'Kunsthaus Zürich' },
    'beyeler': { museumName: 'Fondation Beyeler' },
    'basel': { museumName: 'Kunstmuseum Basel' },
    'mah-': { museumName: 'Musée d\'Art et d\'Histoire Geneva' },

    // Czech Republic
    'ngprague': { museumName: 'National Gallery Prague' },

    // Portugal
    'gulbenkian': { museumName: 'Calouste Gulbenkian Museum' },

    // Poland
    'mnk': { museumName: 'National Museum in Krakow' },
    'wawel': { museumName: 'Wawel Castle' },

    // Hungary
    'mfab': { museumName: 'Museum of Fine Arts Budapest' },

    // Russia
    'rusmuseum': { museumName: 'State Russian Museum' },

    // Greece
    'acropolis-museum': { museumName: 'Acropolis Museum' },
    'museo-archeologico-napoli': { museumName: 'Museo Archeologico Nazionale di Napoli' },

    // Spain Additional
    'caixaforum': { museumName: 'CaixaForum' },
    'dali': { museumName: 'Dalí Foundation' },

    // The British Museum (GAC version)
    'the-british-museum': { museumName: 'British Museum' },

    // Museum Wales
    'museum-wales': { museumName: 'National Museum Wales' },

    // Toulouse-Lautrec (special)
    'toulouse-lautrec': { museumName: 'Musée Toulouse-Lautrec' },

    // Matisse Nice
    'matisse-nice': { museumName: 'Musée Matisse Nice' },

    // Rouen MBA
    'rouen': { museumName: 'Musée des Beaux-Arts de Rouen' },
};

// Files to skip
const SKIP_PATTERNS = [
    'search-index-part', // Skip search index chunks (more specific than '-part')
    'search-index.json', // Skip main search index
    '.backup',
    'test',
    '-sample',
    '-new.json',
    'museum-ludwig', // Explicitly excluded by user request
    'british-museum-gac', // Uses the-british-museum-collection.json instead
    'british-museum-collection.json', // Empty file, uses the-british-museum-collection.json
    'british-museum-galleries.json', // Empty galleries list
    'british-museum.json', // Empty metadata file
];

// Blocked image URLs that are placeholders or broken
const BLOCKED_IMAGES = [
    'https://www.centrepompidou.fr/fileadmin/_processed_/f/6/csm_banniere_39261a8a7c.jpg', // Pompidou generic placeholder
    'no-image',
    'defaut',
    'placeholder',
    'missing',
    'search-index',
];

function getMuseumInfo(filename) {
    const baseFilename = filename.replace('.json', '');

    // Manual overrides for Condé, Grenoble, Bordeaux split collections to match short IDs
    if (baseFilename === 'musee-conde-paintings') return { museumName: 'Musée Condé', exhibitionId: 'conde-paintings' };
    if (baseFilename === 'musee-conde-drawings') return { museumName: 'Musée Condé', exhibitionId: 'conde-drawings' };

    if (baseFilename === 'musee-grenoble-paintings-collection') return { museumName: 'Musée de Grenoble', exhibitionId: 'grenoble-paintings' };
    if (baseFilename === 'musee-grenoble-drawings-collection') return { museumName: 'Musée de Grenoble', exhibitionId: 'grenoble-drawings' };
    if (baseFilename === 'musee-grenoble-photography-collection') return { museumName: 'Musée de Grenoble', exhibitionId: 'grenoble-photography' };

    if (baseFilename === 'musba-bordeaux-paintings-collection') return { museumName: 'Musée des Beaux-Arts de Bordeaux', exhibitionId: 'bordeaux-paintings' };
    if (baseFilename === 'musba-bordeaux-drawings-collection') return { museumName: 'Musée des Beaux-Arts de Bordeaux', exhibitionId: 'bordeaux-drawings' };

    if (baseFilename === 'mam-painting-collection') return { museumName: 'Musée d\'Art Moderne', exhibitionId: 'mam-perm-painting' };
    if (baseFilename === 'mam-photography-collection') return { museumName: 'Musée d\'Art Moderne', exhibitionId: 'mam-perm-photography' };

    if (baseFilename === 'museum-wales-art') return { museumName: 'National Museum Wales', exhibitionId: 'wales-art' };
    if (baseFilename === 'museum-wales-industry') return { museumName: 'National Museum Wales', exhibitionId: 'wales-industry' };
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

    // Manual overrides for Condé, Grenoble, Bordeaux split collections to match short IDs
    if (baseFilename === 'musee-conde-paintings') return { museumName: 'Musée Condé', exhibitionId: 'conde-paintings' };
    if (baseFilename === 'musee-conde-drawings') return { museumName: 'Musée Condé', exhibitionId: 'conde-drawings' };

    if (baseFilename === 'musee-grenoble-paintings-collection') return { museumName: 'Musée de Grenoble', exhibitionId: 'grenoble-paintings' };
    if (baseFilename === 'musee-grenoble-drawings-collection') return { museumName: 'Musée de Grenoble', exhibitionId: 'grenoble-drawings' };
    if (baseFilename === 'musee-grenoble-photography-collection') return { museumName: 'Musée de Grenoble', exhibitionId: 'grenoble-photography' };

    if (baseFilename === 'musba-bordeaux-paintings-collection') return { museumName: 'Musée des Beaux-Arts de Bordeaux', exhibitionId: 'bordeaux-paintings' };
    if (baseFilename === 'musba-bordeaux-drawings-collection') return { museumName: 'Musée des Beaux-Arts de Bordeaux', exhibitionId: 'bordeaux-drawings' };

    if (baseFilename === 'mam-painting-collection') return { museumName: 'Musée d\'Art Moderne', exhibitionId: 'mam-perm-painting' };
    if (baseFilename === 'mam-photography-collection') return { museumName: 'Musée d\'Art Moderne', exhibitionId: 'mam-perm-photography' };

    if (baseFilename === 'museum-wales-art') return { museumName: 'National Museum Wales', exhibitionId: 'wales-art' };
    if (baseFilename === 'museum-wales-industry') return { museumName: 'National Museum Wales', exhibitionId: 'wales-industry' };

    return { museumName: name, exhibitionId: baseFilename };
}

function loadCollection(filePath) {
    try {
        const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        if (Array.isArray(data)) return data;
        if (data.items) return data.items;
        if (data.objects) return data.objects;
        if (data.artworks) return data.artworks;
        if (data.rooms) return data.rooms.flatMap(room => room.artworks || room.items || []);
        return [];
    } catch (e) {
        return [];
    }
}

function getThumbnailUrl(item) {
    let url = item.thumb || item.thumbnailUrl || item.lq || item.image || item.imageUrl || '';
    if (!url || url.length < 10) return '';

    // Check blocked images
    if (BLOCKED_IMAGES.some(bad => url.includes(bad))) return '';

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

    const url = item.sourceUrl || item.detailUrl || item.url || '';

    if (!image) return null;

    return {
        id,
        n: name.substring(0, 80),
        a: artist.substring(0, 50),
        i: image.substring(0, 500), // Increased from 300 to 500 for emuseum API URLs (max 323 chars)
        d: String(date).substring(0, 15),
        m: museumName,
        e: exhibitionId,
        u: url.substring(0, 300),
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
