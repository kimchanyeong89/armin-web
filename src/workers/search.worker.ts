
import { normalizeSearchText } from "../utils/textNormalize";

// Web Worker for handling search operations off the main thread

// Detect mobile to avoid loading 16 × ~11MB chunks (~176MB) → iOS tab crash
const IS_MOBILE_WORKER = typeof navigator !== 'undefined' && (
    navigator.maxTouchPoints > 1 ||
    /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
);

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
    // Examples and fixes
    'soutine': 'soutine',
    'simonet': 'simonet',
    'desportes': 'desportes',
    'rottluff': 'schmidt-rottluff',
    'ofrembrandt': 'rembrandt',
    'manetti': 'manetti',
    'paik': 'paik',
};

// Normalize artist name to a canonical key for grouping
function getArtistKey(name: string): string {
    if (!name) return '';

    let stripped = name.replace(/(?:^|\s)dit\)\s*/i, ' ');

    // Drop parentheses if they seem to contain biographical data (years, countries, etc.)
    const bioRegex = /\([^)]*(\d+|active|born|died|century|france|italy|germany|spain|dutch|flemish|british|lithuania|american|english)[^)]*(\)|$)/ig;
    stripped = stripped.replace(bioRegex, ' ');

    // For any remaining parentheses (e.g. pseudonyms, real names), just remove the brackets to preserve the text
    stripped = stripped.replace(/[()]/g, ' ');

    // Inverted names: "Lastname, Firstname" -> "Firstname Lastname"
    if (stripped.includes(',') && !stripped.includes(' and ') && !stripped.includes('&')) {
        const parts = stripped.split(',');
        if (parts.length >= 2) {
            stripped = parts[1] + ' ' + parts[0];
        }
    }

    let normalized = normalizeSearchText(stripped);

    // Remove attribution text in English/French/Norwegian
    normalized = normalized
        .replace(/\b(attributed to|workshop of|circle of|follower of|manner of|style of|pupil of|school of|after)\b/g, '')
        .replace(/\b(attribue a|atelier de|entourage de|d apres|ecole de|skole|verksted|tilskrevet|nach)\b/g, '')
        .replace(/\b(workshop ofrembrandt)\b/g, 'rembrandt')
        .replace(/\brembrandts\b/g, 'rembrandt');

    // Tokenize
    const tokens = normalized.split(/[\s-]+/).filter(t => t.length > 2 && !['the', 'van', 'der', 'von', 'and', 'und', 'la', 'le'].includes(t));

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
let globalArtistCounts = new Map<string, number>(); // Store total artworks per artist
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
let loadedManifestToken = '';
let lastManifestCheckAt = 0;
let refreshInFlight: Promise<void> | null = null;
const MANIFEST_CHECK_INTERVAL_MS = 15000;

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

const TRUSTED_ARTIST_EXCEPTIONS = new Set(['man ray']);
const ARTIST_SUGGESTION_SUBJECT_HINTS = new Set([
    'flower', 'flowers', 'fruit', 'fruits', 'woman', 'women', 'portrait',
    'landscape', 'still', 'life', 'sunflower', 'sunflowers', 'blossom',
    'blossoms', 'bird', 'birds', 'nest', 'market', 'lady', 'elderly',
    'seated', 'nude', 'holding', 'blue', 'hat', 'painting', 'paintings',
    'study', 'untitled', 'unknown', 'artist',
]);

function isLowQualityArtistLabel(name: string): boolean {
    const normalized = normalizeSearchText(name || '');
    if (!normalized) return true;
    if (TRUSTED_ARTIST_EXCEPTIONS.has(normalized)) return false;
    if (normalized === 'unknown' || normalized === 'unknown artist' || normalized === 'artist unknown') return true;
    if (normalized.includes('portrait miniature of an unknown woman')) return true;
    if (normalized.includes('portrait of an unknown woman')) return true;
    if (/\bunknown woman\b/.test(normalized)) return true;
    if (/^(painting|paintings|woman|women|unknown|artist|anonymous|anon|unidentified|school|workshop|atelier|follower|circle|manner|style)(\b|$)/.test(normalized)) return true;
    if (/^man\b/.test(normalized) && normalized !== 'man ray') return true;
    return false;
}

function isMeaningfulArtistSuggestion(name: string): boolean {
    const normalized = normalizeSearchText(name || '');
    if (!normalized) return false;
    if (isLowQualityArtistLabel(normalized)) return false;
    if (/\bunknown\b/.test(normalized) || /\bunkno\w*\b/.test(normalized)) return false;

    const tokens = normalized.split(' ').filter(Boolean);
    if (tokens.length === 0 || tokens.length > 5) return false;

    if (tokens.length >= 4) {
        const hintMatches = tokens.reduce((acc, token) => acc + (ARTIST_SUGGESTION_SUBJECT_HINTS.has(token) ? 1 : 0), 0);
        if (hintMatches > 0) return false;
    }

    const alphaTokens = tokens.filter((token) => /[a-z]/.test(token));
    if (alphaTokens.length === 0) return false;
    if (alphaTokens.every((token) => token.length === 1)) return false;

    return true;
}

// Helper to process data items
function processChunk(items: any[]) {
    // Flatten if necessary
    const flat = (items.length > 0 && Array.isArray(items[0])) ? items.flat() : items;

    // Parse optimized
    const parsed = flat.map((art: any) => {
        const rawArtist = art.a || 'Unknown';
        const artist = isLowQualityArtistLabel(rawArtist) ? 'Unknown' : rawArtist;
        return {
            id: art.id,
            name: art.n || '',
            artist,
            image: art.i || '',
            date: art.d || '',
            museumName: art.m || '',
            exhibitionId: art.e || '',
            category: art.c || '',
            sourceUrl: art.u || '',
            searchName: normalizeSearchText(art.n || ''),
            searchArtist: artist === 'Unknown' ? '' : normalizeSearchText(artist),
        };
    }).map((item: any) => {
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

        const artistKey = getArtistKey(p.artist);
        if (artistKey && p.artist !== 'Unknown' && isMeaningfulArtistSuggestion(p.artist)) {
            globalArtistCounts.set(artistKey, (globalArtistCounts.get(artistKey) || 0) + 1);
        }
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
                artists: Array.isArray(typed?.artists)
                    ? typed.artists.filter((a) => isMeaningfulArtistSuggestion(String(a?.artist || '')))
                    : [],
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
        const manifestToken = manifest?.t ? String(manifest.t) : '';
        if (manifestToken) {
            loadedManifestToken = manifestToken;
        }
        const versionParam = manifestToken ? encodeURIComponent(manifestToken) : '';

        const chunkFiles: string[] = Array.isArray(manifest.chunks) ? manifest.chunks : [];
        const loadChunk = async (file: string) => {
            const baseUrl = `/data/${file}`;
            const chunkUrl = versionParam ? `${baseUrl}?v=${versionParam}` : withCacheBust(baseUrl);
            const res = await fetch(chunkUrl, fetchInit());
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const items = await res.json();
            processChunk(items);
            self.postMessage({ type: 'LOAD_PROGRESS', count: allArtworks.length });
        };

        if (IS_MOBILE_WORKER) {
            // Mobile: load chunks one-by-one to avoid parallel decode/memory spikes.
            for (const file of chunkFiles) {
                try {
                    await loadChunk(file);
                } catch (e) {
                    console.error(`Chunk failed: ${file}`, e);
                }
                // Yield between chunks so UI thread can breathe on lower-end devices.
                await new Promise((resolve) => setTimeout(resolve, 12));
            }
            self.postMessage({ type: 'LOAD_COMPLETE', count: allArtworks.length });
            return;
        }

        // Desktop / non-constrained path: parallel loading with bounded concurrency.
        const tasks = chunkFiles.map((file: string) => runLimited(async () => {
            await loadChunk(file);
        }).catch(e => console.error(`Chunk failed: ${file}`, e)));

        await Promise.allSettled(tasks);
        self.postMessage({ type: 'LOAD_COMPLETE', count: allArtworks.length });

    } catch (e) {
        console.error('Worker load error:', e);
        self.postMessage({ type: 'ERROR', error: String(e) });
    }
}

async function maybeRefreshData(): Promise<void> {
    if (!loadStarted) return;

    const now = Date.now();
    if (now - lastManifestCheckAt < MANIFEST_CHECK_INTERVAL_MS) return;
    lastManifestCheckAt = now;

    if (refreshInFlight) {
        return refreshInFlight;
    }

    refreshInFlight = (async () => {
        try {
            const manifestRes = await fetch(withCacheBust('/data/search-manifest.json'), fetchInit());
            if (!manifestRes.ok) return;

            const manifest = await manifestRes.json();
            const latestToken = manifest?.t ? String(manifest.t) : '';
            if (!latestToken || !loadedManifestToken || latestToken === loadedManifestToken) {
                return;
            }

            // Refresh in-memory index when deployed manifest changes.
            allArtworks = [];
            idMap.clear();
            globalArtistCounts.clear();
            loadStarted = false;
            await loadData();
        } catch (e) {
            console.error('Manifest refresh check error:', e);
        } finally {
            refreshInFlight = null;
        }
    })();

    return refreshInFlight;
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
        .map((art: any) => {
            const rawArtist = art.a || 'Unknown';
            const artist = isLowQualityArtistLabel(rawArtist) ? 'Unknown' : rawArtist;
            return {
                id: art.id,
                name: art.n || '',
                artist,
                image: art.i || '',
                date: art.d || '',
                museumName: art.m || '',
                exhibitionId: art.e || '',
                year: art.d || '',
                sourceUrl: art.u || '',
                searchName: normalizeSearchText(art.n || ''),
                searchArtist: artist === 'Unknown' ? '' : normalizeSearchText(artist),
            };
        })
        .filter((art: any) => art.searchName.includes(q) || art.searchArtist.includes(q))
        .slice(0, 60);

    const matchingArtists = (bucket.artists || [])
        .filter((a: WarmArtist) => isMeaningfulArtistSuggestion(a.artist) && normalizeSearchText(a.artist).includes(q))
        .slice(0, 5)
        .map((a: WarmArtist) => ({ artist: a.artist, count: a.count }));

    return {
        results: matchingArtworks,
        artists: matchingArtists,
    };
}

const SEARCH_STOP_TOKENS = new Set([
    'a', 'an', 'the', 'of', 'and', 'or', 'to', 'for', 'in', 'on', 'at', 'by',
    'with', 'without', 'de', 'la', 'le', 'du', 'des', 'der', 'die', 'das',
    'van', 'von', 'da', 'di', 'del', 'della',
    'painting', 'paintings', 'artwork', 'artworks', 'work', 'works', 'piece', 'pieces',
]);

const NON_ARTIST_HINT_TOKENS = new Set([
    'flower', 'flowers', 'painting', 'paintings', 'portrait', 'landscape',
    'still', 'life', 'sunflower', 'sunflowers', 'blossom', 'blossoms',
    'parasol', 'umbrella', 'woman', 'man', 'self', 'study', 'untitled',
]);

const tokenizeQueryForMatch = (value: string): string[] =>
    (value || '')
        .split(' ')
        .map((token) => token.trim())
        .filter((token) => token.length >= 2 && !SEARCH_STOP_TOKENS.has(token));

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
    const queryTokens = tokenizeQueryForMatch(q);
    const tokenCount = queryTokens.length;
    const strongArtistTokens = queryTokens.filter(
        (token) => token.length >= 4 && !NON_ARTIST_HINT_TOKENS.has(token)
    );

    // Group artist counts by normalized key.
    // Keep relevance stats so exact/full artist-name matches outrank generic token matches.
    const artistGroups = new Map<string, {
        variants: Map<string, number>;
        totalCount: number;
        relevanceScore: number;
        exactMatchCount: number;
        fullStrongMatchCount: number;
        strongMatchCount: number;
    }>();

    for (let i = 0; i < allArtworks.length; i++) {
        const art = allArtworks[i];
        let score = 0;

        const nameMatch = art.searchName.includes(q);
        const artistMatch = art.searchArtist.includes(q);
        let nameTokenMatches = 0;
        let artistTokenMatches = 0;
        let strongArtistMatches = 0;

        if (tokenCount > 0) {
            for (const token of queryTokens) {
                if (art.searchName.includes(token)) nameTokenMatches += 1;
                if (art.searchArtist.includes(token)) artistTokenMatches += 1;
            }
        }
        if (strongArtistTokens.length > 0) {
            for (const token of strongArtistTokens) {
                if (art.searchArtist.includes(token)) strongArtistMatches += 1;
            }
        }
        const totalTokenMatches = nameTokenMatches + artistTokenMatches;

        if (nameMatch) {
            score += 10;
            if (art.searchName === q) score += 30;
            else if (art.searchName.startsWith(q)) score += 15;
        }

        if (nameTokenMatches > 0) {
            score += nameTokenMatches * 6;
        }

        if (artistMatch) {
            score += 5;
            if (art.searchArtist === q) score += 20;
        }

        if (artistTokenMatches > 0) {
            score += artistTokenMatches * 10;
        }

        if (strongArtistMatches > 0) {
            score += strongArtistMatches * 40;
            if (strongArtistMatches >= strongArtistTokens.length) {
                score += 30;
            }
        } else if (strongArtistTokens.length > 0) {
            score -= 80;
        }

        if (tokenCount > 0) {
            if (totalTokenMatches >= tokenCount) {
                score += 24;
            } else if (tokenCount >= 2 && totalTokenMatches >= tokenCount - 1) {
                score += 12;
            }
        }

        if ((artistMatch || artistTokenMatches > 0) && isMeaningfulArtistSuggestion(art.artist)) {
            // Group by normalized artist key
            const artistKey = getArtistKey(art.artist);
            if (artistKey && art.artist !== 'Unknown') {
                if (!artistGroups.has(artistKey)) {
                    artistGroups.set(artistKey, {
                        variants: new Map(),
                        totalCount: 0,
                        relevanceScore: 0,
                        exactMatchCount: 0,
                        fullStrongMatchCount: 0,
                        strongMatchCount: 0,
                    });
                }
                const group = artistGroups.get(artistKey)!;
                group.variants.set(art.artist, (group.variants.get(art.artist) || 0) + 1);
                group.totalCount++;

                const exactArtistMatch = art.searchArtist === q;
                const hasStrongTokens = strongArtistTokens.length > 0;
                const fullStrongMatch = hasStrongTokens && strongArtistMatches >= strongArtistTokens.length;

                const artistRelevance =
                    (exactArtistMatch ? 500 : 0) +
                    (fullStrongMatch ? 220 : 0) +
                    (strongArtistMatches * 80) +
                    (artistTokenMatches * 35) +
                    (artistMatch ? 20 : 0);

                group.relevanceScore += artistRelevance;
                if (exactArtistMatch) group.exactMatchCount += 1;
                if (strongArtistMatches > 0) group.strongMatchCount += 1;
                if (fullStrongMatch) group.fullStrongMatchCount += 1;
            }
        }

        if (score > 0) {
            results.push({ item: art, score });
        }
    }

    // Sort results by score
    results.sort((a, b) => b.score - a.score);
    const topArtworks = results.slice(0, 100).map(r => r.item);

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
            // Use the global count for the artist, not just the search hits
            const totalGlobalCount = globalArtistCounts.get(key) || group.totalCount;
            // Keep both relevance and total count: relevance decides ordering,
            // global count is only for display.
            return {
                artist: bestName,
                count: totalGlobalCount,
                sortScore: group.totalCount,
                relevanceScore: group.relevanceScore,
                exactMatchCount: group.exactMatchCount,
                fullStrongMatchCount: group.fullStrongMatchCount,
                strongMatchCount: group.strongMatchCount,
                key,
            };
        })
        .filter(a => a.artist && isMeaningfulArtistSuggestion(a.artist))
        .sort((a, b) => {
            if (b.exactMatchCount !== a.exactMatchCount) return b.exactMatchCount - a.exactMatchCount;
            if (b.fullStrongMatchCount !== a.fullStrongMatchCount) return b.fullStrongMatchCount - a.fullStrongMatchCount;
            if (b.strongMatchCount !== a.strongMatchCount) return b.strongMatchCount - a.strongMatchCount;
            if (b.relevanceScore !== a.relevanceScore) return b.relevanceScore - a.relevanceScore;
            if (b.sortScore !== a.sortScore) return b.sortScore - a.sortScore;
            return b.count - a.count;
        })
        .slice(0, 12)
        .map(({ artist, count }) => ({ artist, count }));

    self.postMessage({ type: 'RESULTS', query, results: topArtworks, artists: topArtists, pending: false, source: 'full' });
}

function getRandomArtworkResults(limit: number, onlyWithImage: boolean): any[] {
    const source = onlyWithImage
        ? allArtworks.filter((item) => !!item.image)
        : allArtworks;

    if (source.length === 0) return [];

    const pickCount = Math.max(1, Math.min(limit, source.length));
    const pickedIndices = new Set<number>();
    const results: any[] = [];

    while (results.length < pickCount && pickedIndices.size < source.length) {
        const index = Math.floor(Math.random() * source.length);
        if (pickedIndices.has(index)) continue;
        pickedIndices.add(index);
        results.push(source[index]);
    }

    return results;
}

self.onmessage = (e: MessageEvent) => {
    const { type, query, ids, count, onlyWithImage, mode: nextMode } = e.data;
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
        (async () => {
            await maybeRefreshData();
            search(query);
        })();
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
    } else if (type === 'GET_RANDOM_ARTWORKS') {
        const limit = Number.isFinite(Number(count)) ? Number(count) : 36;
        const safeLimit = Math.max(1, Math.min(180, limit));
        const results = getRandomArtworkResults(safeLimit, Boolean(onlyWithImage));
        self.postMessage({ type: 'RANDOM_ARTWORKS', results });
    }
};
