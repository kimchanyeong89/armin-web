
import { normalizeSearchText, looksNonEnglish } from "../utils/textNormalize";
import { searchTextServer } from "../utils/serverKeywordSearch";
import { SEARCH_TEXT_MAX_LIMIT as SEARCH_TEXT_CANDIDATES } from "../../workers/semantic-search/src/searchText";

// 개발 서버에선 로딩 전 후보를 로컬 데이터로 만든 검색 DB(scripts/vite-local-search.ts)에서 받는다.
// 프로덕션 D1 은 지난 배포 시점 데이터라, 로컬에서 고친 게 처음 목록에 안 보였다(옛 르누아르).
const SEARCH_TEXT_ENDPOINT = import.meta.env.DEV ? '/__search-text' : undefined;

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
    'rodin': 'rodin',
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
let idMap = new Map<string, any[]>(); // Optimize ID lookups while preserving duplicate IDs across collections

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

// True once the full artwork index has finished loading. Until then search()
// returns warm results only — never a partial scan — so the result list and
// the artist work-count appear once, complete, instead of creeping upward.
let indexLoadComplete = false;

// Caches the most recent artist-browse sample (see isArtistBrowseQuery). The
// same query reuses it, so internal re-searches (LOAD_COMPLETE refresh, React
// dependency re-fires) never reshuffle the list under the user; a different
// query produces a fresh sample, preserving per-search variety.
let lastArtistBrowse: { query: string; artworks: any[] } = { query: '', artworks: [] };

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

    // Any Unicode letter counts — [a-z] alone silently dropped every
    // non-Latin artist name (e.g. 김태), hiding them from artist results.
    const alphaTokens = tokens.filter((token) => /\p{L}/u.test(token));
    if (alphaTokens.length === 0) return false;
    if (alphaTokens.every((token) => token.length === 1)) return false;

    return true;
}

let artistVariantCounts = new Map<string, Map<string, number>>();

// Helper to process data items
/**
 * 색인 레코드(n/a/i/m/e/…) → 검색 항목. 제외 대상이면 null.
 *
 * ⚠️ 로컬 청크와 서버(D1) 후보가 **반드시 이 함수 하나**를 거쳐야 한다. 같은 변환·
 *    같은 점수를 받아야 색인 로딩 전(서버 후보)과 후(전체)의 목록이 똑같이 나온다.
 */
function toSearchItem(art: any): any | null {
    const museumName = art.m || '';
    const exhibitionId = art.e || '';
    const museumLower = museumName.toLowerCase();
    const exhibitionLower = exhibitionId.toLowerCase();
    if (EXCLUDED_MUSEUMS.some(name => museumLower.includes(name))) return null;
    if (EXCLUDED_EXHIBITION_IDS.some(id => exhibitionLower.includes(id))) return null;

    const rawArtist = art.a || 'Unknown';
    const artist = isLowQualityArtistLabel(rawArtist) ? 'Unknown' : rawArtist;
    let image = art.i || '';
    // Double check for blocked images that might have slipped through
    if (image && (image.includes('no-image') || image.includes('placeholder') || image.includes('defaut') || image.includes('missing'))) {
        image = '';
    }
    return {
        id: art.id,
        name: art.n || '',
        artist,
        image,
        date: art.d || '',
        museumName,
        exhibitionId,
        category: art.c || '',
        sourceUrl: art.u || '',
        searchName: normalizeSearchText(art.n || ''),
        searchArtist: artist === 'Unknown' ? '' : normalizeSearchText(artist),
    };
}

// 청크 처리(res.json() 뒤 processChunk)는 전부 마이크로태스크라, 쉬지 않으면 여러 청크가
// 연달아 돌며 검색 메시지·서버 응답(매크로태스크)을 몇 초씩 굶긴다 — 첫 결과가 4.5초
// 걸렸다. 40ms 넘게 일했을 때만 한 번 양보한다(매번 양보하면 로딩이 느려진다).
let lastYieldAt = 0;
async function yieldIfBusy(): Promise<void> {
    if (performance.now() - lastYieldAt < 40) return;
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    lastYieldAt = performance.now();
}

async function processChunk(items: any[]): Promise<void> {
    // Flatten if necessary
    const flat = (items.length > 0 && Array.isArray(items[0])) ? items.flat() : items;

    // Add to buffer
    for (let i = 0; i < flat.length; i++) {
        if (i % 500 === 0) await yieldIfBusy();
        const p = toSearchItem(flat[i]);
        if (!p) continue;
        allArtworks.push(p);
        if (p.id) {
            const existing = idMap.get(p.id);
            if (existing) existing.push(p);
            else idMap.set(p.id, [p]);
        }

        const artistKey = getArtistKey(p.artist);
        if (artistKey && p.artist !== 'Unknown' && isMeaningfulArtistSuggestion(p.artist)) {
            globalArtistCounts.set(artistKey, (globalArtistCounts.get(artistKey) || 0) + 1);
            
            if (!artistVariantCounts.has(artistKey)) {
                artistVariantCounts.set(artistKey, new Map());
            }
            const vc = artistVariantCounts.get(artistKey)!;
            vc.set(p.artist, (vc.get(p.artist) || 0) + 1);
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



// Final pass to canonicalize artist names
function finalizeArtists() {
    for (const art of allArtworks) {
        const artistKey = getArtistKey(art.artist);
        if (artistKey && artistVariantCounts.has(artistKey)) {
            const vc = artistVariantCounts.get(artistKey)!;
            let bestName = art.artist;
            let bestCount = 0;
            for (const [name, count] of vc.entries()) {
                if (count > bestCount) {
                    bestCount = count;
                    bestName = name;
                }
            }
            if (art.artist !== bestName) {
                art.artist = bestName;
                art.searchArtist = normalizeSearchText(bestName);
            }
        }
    }
}

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
                await processChunk(data.a || []);
                finalizeArtists();
                indexLoadComplete = true;
                self.postMessage({ type: 'LOAD_COMPLETE', count: allArtworks.length });
            }
            return;
        }

        const manifest = await manifestRes.json();
        // 방금 받은 manifest 를 '확인'으로 친다. 안 그러면 첫 검색이 maybeRefreshData 에서
        // 같은 manifest 를 또 받느라, 로딩 중인 워커 뒤에 줄을 한 번 더 선다.
        lastManifestCheckAt = Date.now();
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
            await processChunk(items);
            self.postMessage({ type: 'LOAD_PROGRESS', count: allArtworks.length });
        };

        if (IS_MOBILE_WORKER) {
            // Mobile: the full ~170MB chunked index pushes iOS WebView memory
            // past ~1.2GB and triggers jetsam (the system memory killer) →
            // app force-quits back to the dev menu.  Skip the heavy chunks
            // entirely.  Mobile keyword search relies on:
            //   1. The 385KB warm-prefix bucket (already loaded above) for
            //      instant artist + top-artwork suggestions per letter
            //   2. The Cloudflare Worker's /search-text endpoint (D1 + FTS5)
            //      for full-coverage keyword search once that is deployed
            //   3. The Cloudflare Worker's /search-by-text endpoint for
            //      semantic / AI-mode search
            // Result: mobile holds ~few MB instead of 170MB and never crashes.
            indexLoadComplete = true;
            self.postMessage({ type: 'LOAD_COMPLETE', count: allArtworks.length });
            return;
        }

        // Desktop / non-constrained path: parallel loading with bounded concurrency.
        const tasks = chunkFiles.map((file: string) => runLimited(async () => {
            await loadChunk(file);
        }).catch(e => console.error(`Chunk failed: ${file}`, e)));

        await Promise.allSettled(tasks);
        finalizeArtists();
        indexLoadComplete = true;
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
            indexLoadComplete = false;
            lastArtistBrowse = { query: '', artworks: [] };
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

    // Artworks: still bucketed by query prefix (warm-prefix file is small,
    // 45 artworks per bucket — searching all buckets here is fine but
    // mostly redundant for artworks).
    const matchingArtworks = bucket
        ? (bucket.artworks || [])
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
            .slice(0, 60)
        : [];

    // Artists: search ACROSS ALL buckets so a query like "Gogh" surfaces
    // "Vincent van Gogh" (whose normalized name starts with V — warm-prefix
    // would only ever return him for queries starting with V).  The total
    // artist pool is small (~8 artists × 28 buckets = 224 max), so a
    // full-scan is cheap.  Dedupe by canonical artist key (getArtistKey) so
    // name-order / casing variants of the same artist — e.g. "Henri Matisse"
    // and "MATISSE Henri" — collapse into one suggestion instead of two.
    const seenArtists = new Set<string>();
    const matchingArtists: Array<{ artist: string; count: number }> = [];
    for (const b of warmBuckets.values()) {
        for (const a of (b.artists || [])) {
            if (!isMeaningfulArtistSuggestion(a.artist)) continue;
            if (!normalizeSearchText(a.artist).includes(q)) continue;
            const dedupeKey = getArtistKey(a.artist) || a.artist.toLowerCase();
            if (seenArtists.has(dedupeKey)) continue;
            seenArtists.add(dedupeKey);
            matchingArtists.push({ artist: a.artist, count: a.count });
            if (matchingArtists.length >= 12) break;
        }
        if (matchingArtists.length >= 12) break;
    }

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

// Fisher-Yates in-place shuffle — used to return a fresh random sample of an
// artist's works for artist-name queries (see searchArtistBrowse).
const shuffleInPlace = <T>(arr: T[]): T[] => {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const tmp = arr[i];
        arr[i] = arr[j];
        arr[j] = tmp;
    }
    return arr;
};

// ── Per-artist file search ─────────────────────────────────────────────────
// An artist-name query loads that artist's small pre-built file (e.g.
// /artists/picasso.json, ~2MB) instead of waiting on / scanning the ~177MB
// streaming index. One fast fetch — so the artwork list and the work-count
// appear once, quickly, and never creep or reload while the big index streams.
const artistFileCache = new Map<string, any[] | null>();
const artistFileInflight = new Map<string, Promise<any[] | null>>();

// Returns the per-artist file key for a short artist-name query, else ''.
const getArtistBrowseFileKey = (q: string): string => {
    const tokens = tokenizeQueryForMatch(q);
    if (tokens.length === 0 || tokens.length > 2) return '';
    for (const token of tokens) {
        const key = KNOWN_ARTIST_KEYS[token];
        if (key) return key;
    }
    return '';
};

const loadArtistFile = async (fileKey: string): Promise<any[] | null> => {
    if (artistFileCache.has(fileKey)) return artistFileCache.get(fileKey) ?? null;
    const inflight = artistFileInflight.get(fileKey);
    if (inflight) return inflight;
    const promise = (async (): Promise<any[] | null> => {
        try {
            const res = await fetch(`/artists/${encodeURIComponent(fileKey)}.json`);
            if (!res.ok) return null;
            const raw = await res.json();
            if (!Array.isArray(raw)) return null;
            const seen = new Set<string>();
            const mapped: any[] = [];
            for (const art of raw) {
                const id = String(art?.id || '');
                const image = String(art?.i || '');
                if (!id || !image || seen.has(id)) continue;
                seen.add(id);
                mapped.push({
                    id,
                    name: art?.n || '',
                    artist: art?.a || '',
                    image,
                    date: art?.d || '',
                    museumName: art?.m || '',
                    exhibitionId: art?.e || '',
                    sourceUrl: art?.u || '',
                });
            }
            return mapped;
        } catch {
            return null;
        }
    })();
    artistFileInflight.set(fileKey, promise);
    const result = await promise;
    artistFileInflight.delete(fileKey);
    artistFileCache.set(fileKey, result);
    return result;
};

// Posts a random sample of an artist's works from their pre-built file. The
// sample is cached per query, so internal re-searches reuse it (the list never
// reshuffles under the user) while a new query gets a fresh sample. Returns
// false — caller falls through to the index path — when the file is missing.
async function searchArtistBrowse(
    query: string,
    q: string,
    fileKey: string,
    warmArtists: Array<{ artist: string; count: number; image?: string }>,
    requestId?: string,
): Promise<boolean> {
    const works = await loadArtistFile(fileKey);
    if (!works || works.length < 12) return false;

    let topArtworks: any[];
    if (lastArtistBrowse.query === q && lastArtistBrowse.artworks.length > 0) {
        topArtworks = lastArtistBrowse.artworks;
    } else {
        topArtworks = shuffleInPlace(works.slice()).slice(0, 100);
        lastArtistBrowse = { query: q, artworks: topArtworks };
    }

    const artists = warmArtists.length > 0
        ? warmArtists
        : [{ artist: works[0]?.artist || query, count: works.length, image: works[0]?.image || '' }];

    self.postMessage({
        type: 'RESULTS',
        query,
        results: topArtworks,
        artists,
        pending: false,
        source: 'full',
        ...(requestId ? { requestId } : {}),
    });
    return true;
}

async function search(query: string, requestId?: string) {
    const q = normalizeSearchText(query);
    if (!q || q.length < 2) {
        self.postMessage({ type: 'RESULTS', query, results: [], artists: [], pending: false, source: 'none', ...(requestId ? { requestId } : {}) });
        return;
    }

    const warm = searchWarm(query);
    // warm 은 색인이 없을 때의 임시 답이다. 곧 더 나은 답(서버 후보·전체 검색)이 올 땐 먼저
    // 그리지 않는다 — 흔한 단어("portrait")는 warm 12점이 떴다가 30점으로, 로딩이 끝나면
    // 다시 12점 → 30점으로 목록이 두 번 흔들렸다. 모바일은 전체 색인이 없어 warm 이 본 답이다.
    const willAskServer = !indexLoadComplete && !IS_MOBILE_WORKER && !looksNonEnglish(query);
    const postWarmFirst = IS_MOBILE_WORKER || (!indexLoadComplete && !willAskServer);
    if (postWarmFirst && (warm.results.length > 0 || warm.artists.length > 0)) {
        self.postMessage({
            type: 'RESULTS',
            query,
            results: warm.results,
            artists: warm.artists,
            pending: !indexLoadComplete,
            source: 'warm',
            ...(requestId ? { requestId } : {}),
        });
    }

    // Artist-name query → load that artist's small pre-built file instead of
    // scanning the streaming index, so results appear in one fast fetch.
    const artistFileKey = getArtistBrowseFileKey(q);
    if (artistFileKey) {
        const handled = await searchArtistBrowse(query, q, artistFileKey, warm.artists, requestId);
        if (handled) return;
        // File unavailable → fall through to the normal index path.
    }

    // 색인이 다 올라오기 전(데스크톱 ~20초)에는 서버(D1)에서 후보만 받아 와
    // **아래 전체 검색과 똑같은 변환·점수 함수**로 정렬한다. D1 은 이 색인에서
    // 만들어지므로(scripts/sync-d1.mjs) 같은 작품·같은 필드이고, 로딩이 끝나
    // 재검색해도 목록이 그대로다.
    // ⚠️ 예전엔 컴포넌트가 서버 결과를 따로 받아 D1 순서대로 붙였다가 20초 뒤
    //    로컬 결과로 통째로 갈아엎었다. 틀린 목록이 먼저 뜨고 나중에 바뀌었다.
    // 모바일(IS_MOBILE_WORKER)은 청크를 아예 안 받고, 비라틴 질의는 번역이
    // 필요해서 둘 다 컴포넌트의 서버 보강 경로를 그대로 쓴다.
    let pool: any[] = allArtworks;
    let fromServer = false;
    if (allArtworks.length === 0 || !indexLoadComplete) {
        const rows = willAskServer ? await searchTextServer(query, SEARCH_TEXT_CANDIDATES, undefined, SEARCH_TEXT_ENDPOINT) : [];
        if (rows.length === 0) {
            // 서버가 비었으면(오류·백오프) 그때 warm 으로 답한다. 이미 warm 을 보냈으면 다시 안 보낸다.
            if (willAskServer || (warm.results.length === 0 && warm.artists.length === 0)) {
                self.postMessage({ type: 'RESULTS', query, results: willAskServer ? warm.results : [], artists: willAskServer ? warm.artists : [], pending: !indexLoadComplete, source: 'warm', ...(requestId ? { requestId } : {}) });
            }
            return;
        }
        const seen = new Set<string>();
        pool = [];
        for (const row of rows) {
            const item = toSearchItem(row);
            if (!item || !item.id || seen.has(item.id)) continue;
            seen.add(item.id);
            pool.push(item);
        }
        fromServer = true;
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
        previewImage: string;
    }>();

    for (let i = 0; i < pool.length; i++) {
        const art = pool[i];
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
        } else if (strongArtistTokens.length > 0 && nameTokenMatches === 0) {
            // 작가명으로도, 제목으로도 안 맞는 항목만 강하게 눌러 작가 검색의
            // 정확도를 지킨다.
            // ⚠️ 예전에는 제목이 맞아도 -80 을 먹여서, 4글자 이상 제목 단어를
            //    검색하면 결과가 통째로 사라졌다("skiff" -40, "sunflowers" -10
            //    → score > 0 문턱 미달). 제목이 맞으면 페널티를 주지 않는다.
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
                        previewImage: '',
                    });
                }
                const group = artistGroups.get(artistKey)!;
                group.variants.set(art.artist, (group.variants.get(art.artist) || 0) + 1);
                group.totalCount++;
                if (!group.previewImage && art.image) {
                    group.previewImage = art.image;
                }

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
    // ⚠️ 동점 순서를 입력 순서에 맡기면 안 된다. 서버 후보(D1 FTS 순)와 전체 색인(id 순)은
    //    들어오는 순서가 달라서, 같은 작품·같은 점수여도 안정 정렬이 서로 다른 순서를
    //    남겼다 — 색인 로딩이 끝나면 목록이 뒤섞였다("Deux skiffs" 4번째 → 9번째).
    //    점수 → 짧은 제목(더 가까운 일치) → id 로 고정한다.
    results.sort((a, b) =>
        (b.score - a.score) ||
        (a.item.searchName.length - b.item.searchName.length) ||
        (String(a.item.id) < String(b.item.id) ? -1 : String(a.item.id) > String(b.item.id) ? 1 : 0));
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
            // Compute prefix-match strength against the QUERY directly. Without
            // this, short queries like "tor ref" lose all strong-match bonuses
            // (because tokens < 4 chars are filtered out at line 538), so a
            // 11-work artist named "Tor Refsum" gets out-ranked by a 842-work
            // artist who happens to have "tor" as a substring (e.g. "Vic-tor").
            // Prefix is the strongest possible signal — it beats any volume.
            const bestNameNorm = normalizeSearchText(bestName || '');
            const prefixMatch = bestNameNorm.length > 0 && bestNameNorm.startsWith(q);
            // Tier 2: each whitespace-separated word of the artist starts with
            // the query. Lets "ref" prioritize "Refsum" even when the artist's
            // first name is something else.
            const wordPrefixMatch = !prefixMatch && bestNameNorm
                .split(' ')
                .some((word) => word.startsWith(q) && word.length >= q.length);
            // Tier 3: query is a substring of the name (already handled by
            // existing relevance, but we capture it here as a tie-breaker).
            const substringMatch = !prefixMatch && !wordPrefixMatch && bestNameNorm.includes(q);

            // Use the global count for the artist, not just the search hits
            const totalGlobalCount = globalArtistCounts.get(key) || group.totalCount;
            // Keep both relevance and total count: relevance decides ordering,
            // global count is only for display.
            return {
                artist: bestName,
                count: totalGlobalCount,
                image: group.previewImage,
                sortScore: group.totalCount,
                relevanceScore: group.relevanceScore,
                exactMatchCount: group.exactMatchCount,
                fullStrongMatchCount: group.fullStrongMatchCount,
                strongMatchCount: group.strongMatchCount,
                prefixMatch,
                wordPrefixMatch,
                substringMatch,
                key,
            };
        })
        .filter(a => a.artist && isMeaningfulArtistSuggestion(a.artist))
        .sort((a, b) => {
            // Strongest signal first: prefix match against the query.
            if (a.prefixMatch !== b.prefixMatch) return a.prefixMatch ? -1 : 1;
            // Within prefix matches, prefer shorter names (closer to the
            // query — "Tor Refsum" beats "Tor Refsum Andersen").
            if (a.prefixMatch && b.prefixMatch) {
                const aLen = normalizeSearchText(a.artist || '').length;
                const bLen = normalizeSearchText(b.artist || '').length;
                if (aLen !== bLen) return aLen - bLen;
            }
            if (a.wordPrefixMatch !== b.wordPrefixMatch) return a.wordPrefixMatch ? -1 : 1;
            if (a.substringMatch !== b.substringMatch) return a.substringMatch ? -1 : 1;
            if (b.exactMatchCount !== a.exactMatchCount) return b.exactMatchCount - a.exactMatchCount;
            if (b.fullStrongMatchCount !== a.fullStrongMatchCount) return b.fullStrongMatchCount - a.fullStrongMatchCount;
            if (b.strongMatchCount !== a.strongMatchCount) return b.strongMatchCount - a.strongMatchCount;
            if (b.relevanceScore !== a.relevanceScore) return b.relevanceScore - a.relevanceScore;
            if (b.sortScore !== a.sortScore) return b.sortScore - a.sortScore;
            return b.count - a.count;
        })
        .slice(0, 12)
        .map(({ artist, count, image }) => ({ artist, count, image }));

    // 서버 후보일 땐 작가 목록을 warm 것으로 둔다. 로딩 중엔 작가별 작품 수가
    // 부분 집계라, 여기서 만들면 로딩이 끝날 때 숫자가 튄다.
    self.postMessage({ type: 'RESULTS', query, results: topArtworks, artists: fromServer ? warm.artists : topArtists, pending: fromServer ? !indexLoadComplete : false, source: fromServer ? 'server' : 'full', ...(requestId ? { requestId } : {}) });
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
    const { type, query, ids, count, onlyWithImage, mode: nextMode, exhibitionIds, requestId } = e.data;
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
            await search(query, requestId);
        })();
    } else if (type === 'GET_ARTIST_WORKS') {
        // Match by normalized key to include all variants
        const targetKey = getArtistKey(query);
        const works = allArtworks.filter(a => getArtistKey(a.artist) === targetKey);

        // On mobile allArtworks is intentionally empty (chunks not loaded to save memory).
        // Fall back to the pre-built per-artist static file shipped with the app.
        if (works.length === 0 && IS_MOBILE_WORKER && targetKey) {
            const safeKey = targetKey.replace(/[^\w\-]/g, '_');
            fetch(`/artists/${safeKey}.json`)
                .then(r => r.ok ? r.json() : [])
                .then((items: any[]) => {
                    if (!Array.isArray(items) || items.length === 0) {
                        self.postMessage({ type: 'ARTIST_WORKS', artist: query, works: [] });
                        return;
                    }
                    const mapped = items.map((art: any) => ({
                        id: art.id || '',
                        name: art.n || '',
                        artist: art.a || query,
                        image: art.i || '',
                        date: art.d || '',
                        museumName: art.m || '',
                        exhibitionId: art.e || '',
                        sourceUrl: art.u || '',
                        searchName: normalizeSearchText(art.n || ''),
                        searchArtist: normalizeSearchText(art.a || query),
                    }));
                    self.postMessage({ type: 'ARTIST_WORKS', artist: query, works: mapped });
                })
                .catch(() => {
                    self.postMessage({ type: 'ARTIST_WORKS', artist: query, works: [] });
                });
            return; // response sent asynchronously above
        }

        self.postMessage({ type: 'ARTIST_WORKS', artist: query, works });
    } else if (type === 'GET_DETAILS_BY_IDS') {
        // Retrieve full artwork objects for the given IDs
        const results: any[] = [];
        const seen = new Set<string>();
        if (ids && Array.isArray(ids)) {
            for (const id of ids) {
                const items = idMap.get(id);
                if (!items || items.length === 0) continue;
                for (const item of items) {
                    const key = `${item?.id || ''}|${item?.exhibitionId || ''}|${item?.name || ''}`;
                    if (seen.has(key)) continue;
                    seen.add(key);
                    results.push(item);
                }
            }
        }
        self.postMessage({ type: 'DETAILS_RESULTS', results, ...(requestId ? { requestId } : {}) });
    } else if (type === 'GET_RANDOM_ARTWORKS') {
        const limit = Number.isFinite(Number(count)) ? Number(count) : 36;
        const safeLimit = Math.max(1, Math.min(180, limit));
        const results = getRandomArtworkResults(safeLimit, Boolean(onlyWithImage));
        self.postMessage({ type: 'RANDOM_ARTWORKS', results });
    } else if (type === 'GET_EXHIBITION_SAMPLE') {
        // Return one sample image per requested exhibitionId from in-memory allArtworks.
        // Fast in-memory scan — no I/O. If allArtworks not yet loaded, returns empty map.
        const result: Record<string, string> = {};
        if (Array.isArray(exhibitionIds) && allArtworks.length > 0) {
            const needed = new Set<string>(exhibitionIds);
            for (const art of allArtworks) {
                if (!needed.size) break;
                const exId = art.exhibitionId;
                if (needed.has(exId) && art.image) {
                    result[exId] = art.image;
                    needed.delete(exId);
                }
            }
        }
        self.postMessage({ type: 'EXHIBITION_SAMPLE_RESULT', result });
    }
};
