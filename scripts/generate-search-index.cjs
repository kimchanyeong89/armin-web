/**
 * Generate a comprehensive search index from ALL museum artwork data
 * Automatically discovers all collection files in the data directory
 * AND splits the index into chunks < 20MB for Cloudflare Pages hosting
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../public/data');
const OUTPUT_FILE = path.join(DATA_DIR, 'search-index.json');
const VIDEO_EMBED_IDS_FILE = path.join(DATA_DIR, 'video-embed-ids.json');
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
    'scottish-national-gallery-of-modern-art': { museumName: 'Scottish National Gallery of Modern Art' },
    'scottish-national-gallery': { museumName: 'Scottish National Gallery' },
    'royal-academy': { museumName: 'Royal Academy of Arts' },
    'tate-britain': { museumName: 'Tate Britain' },
    'tate-st-ives': { museumName: 'Tate St Ives' },
    'tate-collection-highlights': { museumName: 'Tate Modern' },
    'vam-permanent-exhibitions': { museumName: 'Victoria and Albert Museum', exhibitionId: 'vam-permanent' },
    'british-museum': { museumName: 'British Museum', exhibitionId: 'bm-collection' },
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
    'jmoa': { museumName: 'Jeju Museum of Art', exhibitionId: 'jmoa-collection' },

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
    'hermitage': { museumName: 'State Hermitage Museum', exhibitionId: 'hermitage-collection' },
    'tretyakov': { museumName: 'State Tretyakov Gallery', exhibitionId: 'tretyakov-collection' },
    'pushkin': { museumName: 'The Pushkin State Museum of Fine Arts', exhibitionId: 'pushkin-collection' },
    'kremlin': { museumName: 'Moscow Kremlin Museums', exhibitionId: 'kremlin-collection' },
    'topkapi': { museumName: 'Topkapi Palace Museum', exhibitionId: 'topkapi-collection' },
    'house-of-refuge': { museumName: 'House of Refuge', exhibitionId: 'erick-oh-retrospective' },

    // Greece
    'acropolis-museum': { museumName: 'Acropolis Museum' },
    'museo-archeologico-napoli': { museumName: 'Museo Archeologico Nazionale di Napoli' },

    // Spain Additional
    'caixaforum': { museumName: 'CaixaForum' },
    'dali': { museumName: 'Dalí Foundation' },

    // The British Museum (GAC version)
    'the-british-museum': { museumName: 'British Museum', exhibitionId: 'bm-collection' },

    // Museum Wales
    'museum-wales': { museumName: 'National Museum Wales' },

    // Toulouse-Lautrec (special)
    'toulouse-lautrec': { museumName: 'Musée Toulouse-Lautrec' },

    // Matisse Nice
    'matisse-nice': { museumName: 'Musée Matisse Nice' },

    // Rouen MBA
    'rouen': { museumName: 'Musée des Beaux-Arts de Rouen' },

    // China
    'njmuseum': { museumName: 'Nanjing Museum', exhibitionId: 'njmuseum-collection-all' },
    'shenzhen': { museumName: 'Shenzhen Museum', exhibitionId: 'shenzhenmuseum-l0303-all' },
    'palace-museum': { museumName: 'Palace Museum (Forbidden City)' },
    'national-museum-of-china': { museumName: 'National Museum of China', exhibitionId: 'nmc-highlights-100' },
    'today-art-museum': { museumName: 'Today Art Museum' },
};

// Files to skip (split between substring patterns and exact filenames)
const SKIP_SUBSTRINGS = [
    'search-index-part', // Skip search index chunks (more specific than '-part')
    'search-index.json', // Skip main search index
    '.backup',
    'test',
    '-sample',
    '-new.json',
    'museum-ludwig', // Explicitly excluded by user request
    'british-museum-gac', // Uses the-british-museum-collection.json instead
    'british-museum', // Temporarily excluded
    'the-british-museum', // Temporarily excluded
    'serpentine-gallery', // Temporarily excluded
];

const SKIP_EXACT = new Set([
    'british-museum-collection.json', // Empty file, uses the-british-museum-collection.json
    'british-museum-galleries.json', // Empty galleries list
    'british-museum.json', // Empty metadata file
    'serpentine-gallery-collection.json', // Temporarily excluded
    'fine-arts-be-urls-temp.json', // Temp file
    'albertina-poster-1.json', // Partial file
    'albertina-photography-1.json', // Partial file
]);

// Blocked image URLs that are placeholders or broken
const BLOCKED_IMAGES = [
    'https://www.centrepompidou.fr/fileadmin/_processed_/f/6/csm_banniere_39261a8a7c.jpg', // Pompidou generic placeholder
    'no-image',
    'defaut',
    'placeholder',
    'missing',
    'search-index',
];

const DYNAMIC_MAPPINGS = new Map();

async function loadDynamicMappings() {
    try {
        const { exhibitions } = await import('../src/data/exhibitions.js');
        console.log(`📚 Loaded ${exhibitions.length} exhibitions from config for dynamic mapping.`);

        for (const museum of exhibitions) {
            const addExhibitions = (exhibitionsList) => {
                if (exhibitionsList && Array.isArray(exhibitionsList)) {
                    for (const exh of exhibitionsList) {
                        if (exh.collectionFile) {
                            const key = exh.collectionFile.replace('.json', '');
                            DYNAMIC_MAPPINGS.set(key, {
                                museumName: museum.name,
                                exhibitionId: exh.id,
                                fullFilename: exh.collectionFile
                            });
                        }
                    }
                }
            };
            addExhibitions(museum.permanentExhibitions);
            addExhibitions(museum.temporaryExhibitions);
            addExhibitions(museum.pastExhibitions);
        }
        console.log(`🔗 Generated ${DYNAMIC_MAPPINGS.size} dynamic file mappings.\n`);
    } catch (e) {
        console.warn('⚠️  Could not load src/data/exhibitions.js for dynamic mapping. Using static fallbacks.', e.message);
    }
}

function getMuseumInfo(filename) {
    const baseFilename = filename.replace('.json', '');

    // 1. Check Dynamic Mappings first (Source of Truth)
    if (DYNAMIC_MAPPINGS.has(baseFilename)) {
        return DYNAMIC_MAPPINGS.get(baseFilename);
    }

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
    
    // Add support for item.primaryImage as object (NGA, Met, etc)
    if (!url && item.primaryImage && typeof item.primaryImage === 'object') {
        url = item.primaryImage.iiifFull || item.primaryImage.iiifThumbUrl || item.primaryImage.image || item.primaryImage.url || '';
    }
    // Add support for primaryImage directly as string (some datasets)
    if (!url && typeof item.primaryImage === 'string') {
        url = item.primaryImage;
    }
    if (!url && typeof item.primaryImageSmall === 'string') {
        url = item.primaryImageSmall;
    }
    
    // Add support for item.images array 
    if (!url && item.images && Array.isArray(item.images) && item.images.length > 0) {
        if (typeof item.images[0] === 'string') {
            url = item.images[0];
        } else if (item.images[0]) {
            url = item.images[0].iiifurl || item.images[0].iiifThumbUrl || item.images[0].url || '';
        }
    }

    if (!url || url.length < 10) return '';

    // Check blocked images
    if (BLOCKED_IMAGES.some(bad => url.includes(bad))) return '';

    // Convert HTTP to HTTPS (iOS Safari blocks mixed content)
    // Convert HTTP to HTTPS (iOS Safari blocks mixed content)
    if (url.startsWith('http://')) {
        url = `https://wsrv.nl/?url=${encodeURIComponent(url)}`;
    }

    if (url.includes('/iiif/')) {
        url = url.replace(/\/full\/\d+,\//, '/full/200,/');
    }
    return url;
}

function normalizeArtistName(name) {
    if (!name || name === 'Unknown') return 'Unknown';

    // 1. If Korean characters exist, prioritize Korean representation
    // Regex for Hangul: [\uAC00-\uD7A3] (Syllables) and [\u3131-\u3163] (Jamo)
    // Simplify: if contains Hangul syllable
    if (/[\uAC00-\uD7A3]/.test(name)) {
        // Strategy: Remove ASCII letters (A-Z, a-z) entirely if Korean is present
        // This handles "Kim Tai (김태)", "김태 KIM TAI", "Kim, Tai 김태"
        let koreanOnly = name.replace(/[A-Za-z]/g, '');

        // Remove parens, commas, semicolons left over
        koreanOnly = koreanOnly.replace(/[(),;\-]/g, ' ');

        // Collapse spaces
        koreanOnly = koreanOnly.replace(/\s+/g, ' ').trim();

        if (koreanOnly.length > 0) return koreanOnly;
    }

    // 2. Basic cleanup for non-Korean names
    return name.trim();
}

function extractArtworkData(item, museumName, exhibitionId, idx) {
    let nameRaw = item.title || item.name || item.itemTitle || item.shortName || item.tytul || 'Untitled';
    let artistRaw = item.artist || item.artistName || item.creator || item.autor || 'Unknown';

    // Helper to extract string from potential array or object
    const extractString = (val) => {
        if (!val) return 'Unknown';
        if (typeof val === 'string') return val;
        if (Array.isArray(val)) {
            if (val.length === 0) return 'Unknown';
            if (typeof val[0] === 'string') return val.join(', ');
            if (val[0].name) return val.map(v => v.name).join(', ');
            if (val[0].title) return val.map(v => v.title).join(', ');
            return 'Unknown';
        }
        if (typeof val === 'object') {
            return val.name || val.title || val.value || 'Unknown';
        }
        return String(val);
    };

    const name = nameRaw === 'Untitled' ? 'Untitled' : extractString(nameRaw);
    let artist = artistRaw === 'Unknown' ? 'Unknown' : extractString(artistRaw);

    // Normalize artist name to merge duplicates (e.g. "Kim Tai (김태)" vs "김태")
    artist = normalizeArtistName(artist);

    const image = getThumbnailUrl(item);
    const date = item.date || item.year || item.creationDate || item.displayDate || '';
    const id = item.id || `${exhibitionId}-${idx}`;

    const url = item.sourceUrl || item.detailUrl || item.url || '';

    if (!image) return null;

    return {
        id,
        n: String(name).substring(0, 70),
        a: String(artist).substring(0, 40),
        i: String(image).substring(0, 500),
        d: String(date).substring(0, 4),
        m: museumName,
        e: exhibitionId,
        // u removed to save space
    };
}

function isEmbeddedVideoItem(item) {
    if (!item) return false;
    const youtubeId = item.youtubeId || item.youtubeID;
    const vimeoId = item.vimeoId;
    const videoId = item.videoId;
    const videoUrl = item.videoUrl || item.video || item.mediaUrl || '';
    const sourceUrl = item.sourceUrl || item.url || '';

    if (youtubeId || vimeoId || videoId) return true;

    const url = `${videoUrl} ${sourceUrl}`.toLowerCase();
    return /youtube\.com|youtu\.be|vimeo\.com/.test(url);
}

async function generateSearchIndex() {
    console.log('🔍 Generating comprehensive search index...\n');

    // Load dynamic mappings from source code
    await loadDynamicMappings();

    const allFiles = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.json')).sort();
    
    // Strict whitelist: Only index files explicitly registered in exhibitions.js
    const validFilesSet = new Set(
        Array.from(DYNAMIC_MAPPINGS.values()).map(m => m.fullFilename)
    );

    const collectionFiles = allFiles.filter(f => validFilesSet.has(f));

    console.log(`Found ${collectionFiles.length} collection files\n`);

    const allArtworks = [];
    const artistCounts = new Map();
    const processedIds = new Set();
    const processedContent = new Set(); // content hash (title + artist + image)
    const videoEmbedIds = new Set();

    for (const file of collectionFiles) {
        const filePath = path.join(DATA_DIR, file);
        const { museumName, exhibitionId } = getMuseumInfo(file);

        const items = loadCollection(filePath);
        if (file.includes("wawel")) console.log("Loaded wawel items:", items.length);
        if (items.length === 0) continue;

        let addedCount = 0;
        let duplicateCount = 0;

        items.forEach((item, idx) => {
            if (isEmbeddedVideoItem(item) && item.id) {
                videoEmbedIds.add(item.id);
            }
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
                    // Different content but same ID -> modify ID to be unique (Deterministic)
                    // Use a short hash of the content instead of random
                    let hash = 0;
                    for (let i = 0; i < contentHash.length; i++) {
                        hash = ((hash << 5) - hash) + contentHash.charCodeAt(i);
                        hash |= 0; // Convert to 32bit integer
                    }
                    artwork.id = `${artwork.id}-${Math.abs(hash).toString(16)}`;
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

    // Sort strictly by ID to ensure deterministic chunking
    allArtworks.sort((a, b) => (a.id > b.id ? 1 : -1));

    const timestamp = new Date().toISOString();

    const videoEmbedIndex = { t: timestamp, c: videoEmbedIds.size, ids: Array.from(videoEmbedIds) };
    fs.writeFileSync(VIDEO_EMBED_IDS_FILE, JSON.stringify(videoEmbedIndex));
    console.log(`\n🎬 Saved video embed ID list: ${VIDEO_EMBED_IDS_FILE} (${videoEmbedIds.size.toLocaleString()} ids)`);

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
