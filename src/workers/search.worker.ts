
import { normalizeSearchText } from "../utils/textNormalize";

// Web Worker for handling search operations off the main thread

// Known artist last names for grouping similar names
const KNOWN_ARTIST_KEYS: Record<string, string> = {
    'monet': 'monet', 'manet': 'manet', 'renoir': 'renoir', 'picasso': 'picasso',
    'nolde': 'nolde', 'delacroix': 'delacroix', 'gogh': 'gogh', 'rembrandt': 'rembrandt',
    'vermeer': 'vermeer', 'cezanne': 'cezanne', 'degas': 'degas', 'gauguin': 'gauguin',
    'matisse': 'matisse', 'kandinsky': 'kandinsky', 'klimt': 'klimt', 'dali': 'dali',
    'warhol': 'warhol', 'miro': 'miro', 'chagall': 'chagall', 'klee': 'klee',
    'mondrian': 'mondrian', 'pollock': 'pollock', 'rothko': 'rothko', 'bacon': 'bacon',
    'hockney': 'hockney', 'basquiat': 'basquiat', 'caravaggio': 'caravaggio',
    'raphael': 'raphael', 'michelangelo': 'michelangelo', 'botticelli': 'botticelli',
    'titian': 'titian', 'tintoretto': 'tintoretto', 'veronese': 'veronese',
    'rubens': 'rubens', 'velazquez': 'velazquez', 'goya': 'goya', 'greco': 'greco',
    'bruegel': 'bruegel', 'bosch': 'bosch', 'durer': 'durer', 'holbein': 'holbein',
    'constable': 'constable', 'turner': 'turner', 'gainsborough': 'gainsborough',
    'reynolds': 'reynolds', 'hogarth': 'hogarth', 'whistler': 'whistler',
    'sargent': 'sargent', 'homer': 'homer', 'eakins': 'eakins', 'cassatt': 'cassatt',
    'seurat': 'seurat', 'signac': 'signac', 'caillebotte': 'caillebotte',
    'toulouse': 'toulouse-lautrec', 'lautrec': 'toulouse-lautrec',
    'bonnard': 'bonnard', 'vuillard': 'vuillard', 'redon': 'redon',
    'munch': 'munch', 'ensor': 'ensor', 'kirchner': 'kirchner', 'schiele': 'schiele',
    'kokoschka': 'kokoschka', 'beckmann': 'beckmann', 'grosz': 'grosz', 'dix': 'dix',
    'duchamp': 'duchamp', 'leger': 'leger', 'braque': 'braque', 'gris': 'gris',
    'malevich': 'malevich', 'tatlin': 'tatlin', 'lissitzky': 'lissitzky',
    'rivera': 'rivera', 'kahlo': 'kahlo', 'orozco': 'orozco', 'siqueiros': 'siqueiros',
    'hopper': 'hopper', 'okeefe': 'okeefe', 'wood': 'wood', 'benton': 'benton',
    'lichtenstein': 'lichtenstein', 'rauschenberg': 'rauschenberg', 'johns': 'johns',
    'haring': 'haring', 'koons': 'koons', 'richter': 'richter', 'kiefer': 'kiefer',
    'bourgeois': 'bourgeois', 'kusama': 'kusama', 'ai': 'ai weiwei', 'banksy': 'banksy',
    // Artists with compound surnames
    'fantin': 'fantin-latour', 'latour': 'fantin-latour',
    // German Expressionists - explicit merges
    'heckel': 'heckel', 'pechstein': 'pechstein',
};

// Normalize artist name to a canonical key for grouping
function getArtistKey(name: string): string {
    if (!name) return '';

    // Remove parentheses content and special prefixes before normalization
    const stripped = name
        .replace(/\([^)]*\)/g, ' ')
        .replace(/^dit\)\s*/i, ' ');

    let normalized = normalizeSearchText(stripped);

    // Tokenize
    const tokens = normalized.split(/[\s-]+/).filter(t => t.length > 2);

    // Check each token against known artist keys
    for (const token of tokens) {
        if (KNOWN_ARTIST_KEYS[token]) {
            return KNOWN_ARTIST_KEYS[token];
        }
    }

    // Fallback: return sorted tokens joined (stable grouping for unknown artists)
    return tokens.sort().join(' ');
}

let allArtworks: any[] = [];
let idMap = new Map<string, any>(); // Optimize ID lookups

type WorkerMode = {
    cacheBust: boolean;
    maxConcurrency: number;
};

const DEFAULT_MODE: WorkerMode = {
    cacheBust: true,
    maxConcurrency: 6,
};

let mode: WorkerMode = { ...DEFAULT_MODE };
let loadStarted = false;
let warmLoadStarted = false;

type WarmArtist = {
    artist: string;
    count: number;
    image?: string;
};

type WarmBucket = {
    artworks: any[];
    artists: WarmArtist[];
};

const warmBuckets = new Map<string, WarmBucket>();

const queue: Array<() => void> = [];
let inflight = 0;

const runLimited = async <T>(fn: () => Promise<T>): Promise<T> => {
    if (inflight >= mode.maxConcurrency) {
        await new Promise<void>((resolve) => queue.push(resolve));
    }
    inflight += 1;
    try {
        return await fn();
    } finally {
        inflight = Math.max(0, inflight - 1);
        const next = queue.shift();
        if (next) next();
    }
};

const fetchInit = (): RequestInit => ({
    cache: mode.cacheBust ? 'no-store' : 'force-cache',
});

const withCacheBust = (url: string) => {
    if (!mode.cacheBust) return url;
    const join = url.includes('?') ? '&' : '?';
    return `${url}${join}v=${Date.now()}`;
};

const getQueryPrefix = (query: string): string => {
    const normalized = normalizeSearchText(query || '');
    if (!normalized) return '#';
    const first = normalized[0] || '#';
    if (/[a-z]/.test(first)) return first;
    if (/[0-9]/.test(first)) return '#';
    if (/^[\uac00-\ud7a3]$/u.test(first)) return 'ko';
    return 'other';
};

const EXCLUDED_MUSEUMS = ['serpentine gallery', 'british museum'];
const EXCLUDED_EXHIBITION_IDS = ['british-museum', 'the-british-museum', 'bm-collection'];

// Helper to process data items
function processChunk(items: any[]) {
    // Flatten if necessary
    const flat = (items.length > 0 && Array.isArray(items[0])) ? items.flat() : items;

    // Parse optimized
    const parsed = flat.map((art: any) => ({
        id: art.id,
        name: art.n || '',
        artist: art.a || 'Unknown',
        image: art.i || '',
        date: art.d || '',
        museumName: art.m || '',
        exhibitionId: art.e || '',
        sourceUrl: art.u || '',
        searchName: normalizeSearchText(art.n || ''),
        searchArtist: normalizeSearchText(art.a || ''),
    })).map((item: any) => {
        // Double check for blocked images that might have slipped through
        if (item.image && (item.image.includes('no-image') || item.image.includes('placeholder') || item.image.includes('defaut') || item.image.includes('missing'))) {
            item.image = '';
        }
        return item;
    });

    // Add to buffer
    for (const p of parsed) {
        const museumName = (p.museumName || '').toLowerCase();
        const exhibitionId = (p.exhibitionId || '').toLowerCase();
        if (EXCLUDED_MUSEUMS.some(name => museumName.includes(name))) {
            continue;
        }
        if (EXCLUDED_EXHIBITION_IDS.some(id => exhibitionId.includes(id))) {
            continue;
        }
        allArtworks.push(p);
        if (p.id) idMap.set(p.id, p);
    }
}

async function loadWarmData() {
    if (warmLoadStarted) return;
    warmLoadStarted = true;

    try {
        const res = await fetch(withCacheBust('/data/search-warm-prefix.json'), fetchInit());
        if (!res.ok) {
            return;
        }
        const contentType = res.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
            // Silently fail if we got HTML (e.g. index.html fallback)
            return;
        }

        const payload = await res.json();
        const buckets = payload?.buckets || {};

        for (const [prefix, bucket] of Object.entries(buckets)) {
            const typed = bucket as WarmBucket;
            warmBuckets.set(prefix, {
                artworks: Array.isArray(typed?.artworks) ? typed.artworks : [],
                artists: Array.isArray(typed?.artists) ? typed.artists : [],
            });
        }

    } catch (e) {
        console.error('Warm index load error:', e);
    }
}

// ... (loadData function remains same)

// ... (search function remains same)



async function loadData() {
    if (loadStarted) return;
    loadStarted = true;
    try {
        // Try manifest first
        const manifestRes = await fetch(withCacheBust('/data/search-manifest.json'), fetchInit());

        if (!manifestRes.ok) {
            // Fallback
            const res = await fetch(withCacheBust('/data/search-index.json'), fetchInit());
            if (res.ok) {
                const data = await res.json();
                processChunk(data.a || []);
                self.postMessage({ type: 'LOAD_COMPLETE', count: allArtworks.length });
            }
            return;
        }

        const manifest = await manifestRes.json();
        const versionParam = manifest?.t ? encodeURIComponent(manifest.t) : '';

        // Progressive loading: fire all fetches but update on completion individually
        const tasks = (manifest.chunks || []).map((file: string) => runLimited(async () => {
            const baseUrl = `/data/${file}`;
            const chunkUrl = versionParam ? `${baseUrl}?v=${versionParam}` : withCacheBust(baseUrl);
            const res = await fetch(chunkUrl, fetchInit());
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const items = await res.json();
            processChunk(items);
            self.postMessage({ type: 'LOAD_COMPLETE', count: allArtworks.length });
        }).catch(e => console.error(`Chunk failed: ${file}`, e)));

        await Promise.allSettled(tasks);

    } catch (e) {
        console.error('Worker load error:', e);
        self.postMessage({ type: 'ERROR', error: String(e) });
    }
}

function searchWarm(query: string) {
    const q = normalizeSearchText(query);
    if (!q || q.length < 2) {
        return { results: [], artists: [] };
    }

    const prefix = getQueryPrefix(q);
    const bucket = warmBuckets.get(prefix);
    if (!bucket) {
        return { results: [], artists: [] };
    }

    const matchingArtworks = (bucket.artworks || [])
        .map((art: any) => ({
            id: art.id,
            name: art.n || '',
            artist: art.a || 'Unknown',
            image: art.i || '',
            date: art.d || '',
            museumName: art.m || '',
            exhibitionId: art.e || '',
            year: art.d || '',
            sourceUrl: art.u || '',
            searchName: normalizeSearchText(art.n || ''),
            searchArtist: normalizeSearchText(art.a || ''),
        }))
        .filter((art: any) => art.searchName.includes(q) || art.searchArtist.includes(q))
        .slice(0, 60);

    const matchingArtists = (bucket.artists || [])
        .filter((a: WarmArtist) => normalizeSearchText(a.artist).includes(q))
        .slice(0, 5)
        .map((a: WarmArtist) => ({ artist: a.artist, count: a.count }));

    return {
        results: matchingArtworks,
        artists: matchingArtists,
    };
}

function search(query: string) {
    const q = normalizeSearchText(query);
    if (!q || q.length < 2) {
        self.postMessage({ type: 'RESULTS', query, results: [], artists: [], pending: false, source: 'none' });
        return;
    }

    const warm = searchWarm(query);
    if (warm.results.length > 0 || warm.artists.length > 0) {
        self.postMessage({
            type: 'RESULTS',
            query,
            results: warm.results,
            artists: warm.artists,
            pending: allArtworks.length === 0,
            source: 'warm',
        });
    }

    if (allArtworks.length === 0) {
        if (warm.results.length === 0 && warm.artists.length === 0) {
            self.postMessage({ type: 'RESULTS', query, results: [], artists: [], pending: true, source: 'warm' });
        }
        return;
    }
    const results = [];

    // Group artist counts by normalized key
    // Map: normalizedKey -> { variants: Map<originalName, count>, totalCount }
    const artistGroups = new Map<string, { variants: Map<string, number>, totalCount: number }>();

    for (let i = 0; i < allArtworks.length; i++) {
        const art = allArtworks[i];
        let score = 0;

        const nameMatch = art.searchName.includes(q);
        const artistMatch = art.searchArtist.includes(q);

        if (nameMatch) {
            score += 10;
            if (art.searchName === q) score += 30;
            else if (art.searchName.startsWith(q)) score += 15;
        }

        if (artistMatch) {
            score += 5;
            if (art.searchArtist === q) score += 20;

            // Group by normalized artist key
            const artistKey = getArtistKey(art.artist);
            if (artistKey && art.artist !== 'Unknown') {
                if (!artistGroups.has(artistKey)) {
                    artistGroups.set(artistKey, { variants: new Map(), totalCount: 0 });
                }
                const group = artistGroups.get(artistKey)!;
                group.variants.set(art.artist, (group.variants.get(art.artist) || 0) + 1);
                group.totalCount++;
            }
        }

        if (score > 0) {
            results.push({ item: art, score });
        }
    }

    // Sort results by score
    results.sort((a, b) => b.score - a.score);
    const topArtworks = results.slice(0, 30).map(r => r.item);

    // Get top artists: use the most frequent variant name as display name
    const topArtists = Array.from(artistGroups.entries())
        .map(([key, group]) => {
            // Find the variant with highest count -> use as canonical name
            let bestName = '';
            let bestCount = 0;
            for (const [name, count] of group.variants) {
                if (count > bestCount) {
                    bestCount = count;
                    bestName = name;
                }
            }
            return { artist: bestName, count: group.totalCount, key };
        })
        .filter(a => a.artist)
        .sort((a, b) => b.count - a.count)
        .slice(0, 5)
        .map(({ artist, count }) => ({ artist, count }));

    self.postMessage({ type: 'RESULTS', query, results: topArtworks, artists: topArtists, pending: false, source: 'full' });
}

self.onmessage = (e: MessageEvent) => {
    const { type, query, ids, mode: nextMode } = e.data;
    if (type === 'SET_MODE' && nextMode) {
        mode = {
            ...mode,
            ...nextMode,
        };
        return;
    }
    if (type === 'LOAD') {
        loadWarmData();
        loadData();
    } else if (type === 'SEARCH') {
        if (!warmLoadStarted) {
            loadWarmData();
        }
        search(query);
    } else if (type === 'GET_ARTIST_WORKS') {
        // Match by normalized key to include all variants
        const targetKey = getArtistKey(query);
        const works = allArtworks.filter(a => getArtistKey(a.artist) === targetKey);
        self.postMessage({ type: 'ARTIST_WORKS', artist: query, works });
    } else if (type === 'GET_DETAILS_BY_IDS') {
        // Retrieve full artwork objects for the given IDs
        const results: any[] = [];
        if (ids && Array.isArray(ids)) {
            for (const id of ids) {
                const item = idMap.get(id);
                if (item) results.push(item);
            }
        }
        self.postMessage({ type: 'DETAILS_RESULTS', results });
    }
};
