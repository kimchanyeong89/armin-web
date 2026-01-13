
// Web Worker for handling search operations off the main thread

// Transliteration logic (duplicated here to be self-contained)
const transliterate = (text: string): string => {
    if (!text) return '';
    const normalized = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const replacements: Record<string, string> = {
        'ø': 'o', 'Ø': 'O', 'æ': 'ae', 'Æ': 'AE', 'œ': 'oe', 'Œ': 'OE',
        'ß': 'ss', 'ð': 'd', 'Ð': 'D', 'þ': 'th', 'Þ': 'TH', 'ł': 'l', 'Ł': 'L',
    };
    let result = normalized;
    for (const [from, to] of Object.entries(replacements)) {
        result = result.split(from).join(to);
    }
    return result.toLowerCase();
};

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

    // Transliterate and lowercase
    let normalized = transliterate(name);

    // Remove parentheses content and special prefixes
    normalized = normalized
        .replace(/\([^)]*\)/g, '')    // Remove (content)
        .replace(/^dit\)\s*/i, '')     // Remove "dit)" prefix
        .replace(/[^a-z\s-]/g, ' ')    // Keep only letters, spaces, hyphens
        .replace(/\s+/g, ' ')          // Normalize whitespace
        .trim();

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
        searchName: transliterate(art.n || ''),
        searchArtist: transliterate(art.a || ''),
    }));

    // Add to buffer
    for (const p of parsed) {
        allArtworks.push(p);
    }
}

async function loadData() {
    try {
        // Try manifest first
        const manifestRes = await fetch('/data/search-manifest.json');

        if (!manifestRes.ok) {
            // Fallback
            const res = await fetch('/data/search-index.json');
            if (res.ok) {
                const data = await res.json();
                processChunk(data.a || []);
                self.postMessage({ type: 'LOAD_COMPLETE', count: allArtworks.length });
            }
            return;
        }

        const manifest = await manifestRes.json();

        // Progressive loading: fire all fetches but update on completion individually
        manifest.chunks.forEach((file: string) => {
            fetch(`/data/${file}`)
                .then(r => r.json())
                .then(items => {
                    processChunk(items);
                    self.postMessage({ type: 'LOAD_COMPLETE', count: allArtworks.length });
                })
                .catch(e => console.error(`Chunk failed: ${file}`, e));
        });

    } catch (e) {
        console.error('Worker load error:', e);
        self.postMessage({ type: 'ERROR', error: String(e) });
    }
}

function search(query: string) {
    if (allArtworks.length === 0 || !query || query.length < 2) {
        self.postMessage({ type: 'RESULTS', results: [], artists: [] });
        return;
    }

    const q = transliterate(query);
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

    self.postMessage({ type: 'RESULTS', results: topArtworks, artists: topArtists });
}

self.onmessage = (e: MessageEvent) => {
    const { type, query } = e.data;
    if (type === 'LOAD') {
        loadData();
    } else if (type === 'SEARCH') {
        search(query);
    } else if (type === 'GET_ARTIST_WORKS') {
        // Match by normalized key to include all variants
        const targetKey = getArtistKey(query);
        const works = allArtworks.filter(a => getArtistKey(a.artist) === targetKey);
        self.postMessage({ type: 'ARTIST_WORKS', artist: query, works });
    }
};
