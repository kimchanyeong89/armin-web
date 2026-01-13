/**
 * Enhanced Artist Name Normalization Script
 * 
 * Handles complex cases like:
 * - "dit) NAME" prefixes
 * - Middle names (Claude Oscar Monet → Claude Monet)
 * - Name duplications (Monet Claude-Oscar Monet Claude)
 * - Various parenthetical annotations
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../public/data');

// Known canonical forms (expanded)
const KNOWN_ARTISTS = {
    // Monet variants
    'monet claude': 'Claude Monet',
    'monet claude oscar': 'Claude Monet',
    'monet oscar': 'Claude Monet',

    // Simonet/Sébastien
    'sebastien gabriel': 'Gabriel Sébastien',
    'simonet gabriel sebastien': 'Gabriel Sébastien Simonet',
    'sebastien simonet gabriel': 'Gabriel Sébastien Simonet',

    // Renoir
    'renoir pierre auguste': 'Pierre-Auguste Renoir',
    'renoir auguste': 'Pierre-Auguste Renoir',

    // Manet
    'manet edouard': 'Édouard Manet',

    // Cézanne
    'cezanne paul': 'Paul Cézanne',

    // Goya
    'goya francisco': 'Francisco de Goya',
    'goya francisco jose de y lucientes': 'Francisco de Goya',

    // Add more as needed...
};

// Clean artist name - remove all noise
function cleanArtistName(name) {
    if (!name) return '';

    let cleaned = name;

    // Remove "dit)" prefix and variations
    cleaned = cleaned.replace(/^[(\s]*dit[)\s]*/i, '');
    cleaned = cleaned.replace(/^\([^)]*dit[^)]*\)\s*/i, '');

    // Remove all parenthetical content
    cleaned = cleaned.replace(/\s*\([^)]*\)\s*/g, ' ');

    // Remove years (1881-1973, born 1960, etc.)
    cleaned = cleaned.replace(/\b\d{4}\s*[-–—]\s*\d{4}\b/g, '');
    cleaned = cleaned.replace(/\b(born|b\.|d\.|died|circa|c\.|ca\.?)\s*\d{4}\b/gi, '');
    cleaned = cleaned.replace(/\b\d{4}\b/g, '');

    // Remove location suffixes
    cleaned = cleaned.replace(/[,\s]+(aix-en-provence|paris|london|rome|florence|venice|amsterdam|berlin|madrid|barcelona|new york|los angeles)$/i, '');

    // Remove annotations
    cleaned = cleaned.replace(/\b(studio of|circle of|after|attributed to|follower of|workshop of|school of|manner of|style of|umkreis|kopist|atelier|bottega)\b/gi, '');

    // Clean up punctuation
    cleaned = cleaned.replace(/[,;]+/g, ' ');
    cleaned = cleaned.replace(/\s+/g, ' ');
    cleaned = cleaned.trim();

    return cleaned;
}

// Normalize for grouping - more aggressive
function normalizeForGrouping(name) {
    if (!name) return '';

    // First clean
    let normalized = cleanArtistName(name);

    // Remove accents
    normalized = normalized
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');

    // Lowercase
    normalized = normalized.toLowerCase();

    // Remove all non-letters except spaces
    normalized = normalized.replace(/[^a-z\s]/g, ' ');

    // Split into words
    let words = normalized.split(/\s+/).filter(w => w.length > 1);

    // Remove common particles
    const particles = new Set(['de', 'da', 'di', 'van', 'von', 'el', 'la', 'le', 'del', 'der', 'den', 'des', 'dos', 'und', 'y', 'the']);
    words = words.filter(w => !particles.has(w));

    // Remove duplicates (handles "Monet Claude-Oscar Monet Claude")
    words = [...new Set(words)];

    // Sort for consistent grouping
    words.sort();

    return words.join(' ');
}

// Select best canonical form
function selectCanonical(variants) {
    // Prefer:
    // 1. No word repetition (e.g. "Monet Claude-Oscar Monet Claude" is bad)
    // 2. Proper case (not ALL CAPS)
    // 3. Has accents (more authentic)
    // 4. Shorter (less noise)
    // 5. Higher frequency

    const sorted = [...variants].sort((a, b) => {
        // Check for word repetition
        const hasRepetitionA = hasWordRepetition(a.name);
        const hasRepetitionB = hasWordRepetition(b.name);
        if (hasRepetitionA !== hasRepetitionB) return hasRepetitionA ? 1 : -1;

        // Not all caps
        const allCapsA = a.name === a.name.toUpperCase();
        const allCapsB = b.name === b.name.toUpperCase();
        if (allCapsA !== allCapsB) return allCapsA ? 1 : -1;

        // Has accents (more authentic)
        const hasAccentsA = /[àáâãäåèéêëìíîïòóôõöùúûüýÿñç]/i.test(a.name);
        const hasAccentsB = /[àáâãäåèéêëìíîïòóôõöùúûüýÿñç]/i.test(b.name);
        if (hasAccentsA !== hasAccentsB) return hasAccentsB ? 1 : -1;

        // Shorter
        if (a.name.length !== b.name.length) return a.name.length - b.name.length;

        // Frequency (last resort)
        return b.count - a.count;
    });

    return sorted[0].name;
}

// Check if a name has repeated words
function hasWordRepetition(name) {
    const words = name.toLowerCase().split(/[\s-]+/).filter(w => w.length > 2);
    return words.length !== new Set(words).size;
}

// Collect all artists
function collectArtists() {
    const artistCounts = new Map();

    const files = fs.readdirSync(DATA_DIR)
        .filter(f => f.endsWith('.json') && !f.includes('search-index'));

    for (const file of files) {
        try {
            const content = fs.readFileSync(path.join(DATA_DIR, file), 'utf-8');
            const data = JSON.parse(content);

            let items = [];
            if (Array.isArray(data)) items = data;
            else if (data.objects) items = data.objects;
            else if (data.artworks) items = data.artworks;
            else if (data.rooms) {
                for (const room of data.rooms) {
                    if (room.artworks) items.push(...room.artworks);
                }
            }

            for (const item of items) {
                const artist = item.artist || item.artistName || item.creator;
                if (artist && typeof artist === 'string' && artist.trim()) {
                    const trimmed = artist.trim();
                    artistCounts.set(trimmed, (artistCounts.get(trimmed) || 0) + 1);
                }
            }
        } catch (e) {
            // Skip
        }
    }

    return artistCounts;
}

// Group artists
function groupArtists(artistCounts) {
    const groups = new Map();

    for (const [name, count] of artistCounts) {
        const key = normalizeForGrouping(name);
        if (!key) continue;

        if (!groups.has(key)) {
            groups.set(key, []);
        }
        groups.get(key).push({ name, count });
    }

    return groups;
}

// Build mapping
function buildMapping(groups) {
    const mapping = new Map();

    for (const [key, variants] of groups) {
        if (variants.length <= 1) continue;

        // Check known artists first
        let canonical = KNOWN_ARTISTS[key];

        if (!canonical) {
            canonical = selectCanonical(variants);
        }

        for (const variant of variants) {
            if (variant.name !== canonical) {
                mapping.set(variant.name, canonical);
            }
        }
    }

    return mapping;
}

// Apply mapping
function applyMapping(mapping, dryRun = false) {
    let totalChanges = 0;
    let modifiedFiles = 0;

    const files = fs.readdirSync(DATA_DIR)
        .filter(f => f.endsWith('.json') && !f.includes('search-index'));

    for (const file of files) {
        const filePath = path.join(DATA_DIR, file);
        try {
            const content = fs.readFileSync(filePath, 'utf-8');
            let data = JSON.parse(content);
            let modified = false;
            let changeCount = 0;

            const processItem = (item) => {
                for (const field of ['artist', 'artistName', 'creator']) {
                    if (item[field] && typeof item[field] === 'string') {
                        const original = item[field].trim();
                        if (mapping.has(original)) {
                            if (!dryRun) item[field] = mapping.get(original);
                            modified = true;
                            changeCount++;
                        }
                    }
                }
            };

            if (Array.isArray(data)) data.forEach(processItem);
            else if (data.objects) data.objects.forEach(processItem);
            else if (data.artworks) data.artworks.forEach(processItem);
            else if (data.rooms) {
                for (const room of data.rooms) {
                    if (room.artworks) room.artworks.forEach(processItem);
                }
            }

            if (modified) {
                if (!dryRun) fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
                console.log(`✅ ${file}: ${changeCount} changes`);
                totalChanges += changeCount;
                modifiedFiles++;
            }
        } catch (e) {
            // Skip
        }
    }

    return { totalChanges, modifiedFiles };
}

// Main
async function main() {
    const args = process.argv.slice(2);
    const dryRun = args.includes('--dry-run');

    console.log('🎨 Enhanced Artist Normalization');
    console.log('='.repeat(45));
    if (dryRun) console.log('⚠️  DRY RUN MODE\n');

    console.log('Step 1: Collecting artists...');
    const artistCounts = collectArtists();
    console.log(`   Found ${artistCounts.size.toLocaleString()} unique names\n`);

    console.log('Step 2: Grouping...');
    const groups = groupArtists(artistCounts);
    const multipleVariants = [...groups.values()].filter(v => v.length > 1);
    console.log(`   Found ${multipleVariants.length.toLocaleString()} groups\n`);

    console.log('Step 3: Building mapping...');
    const mapping = buildMapping(groups);
    console.log(`   Created ${mapping.size.toLocaleString()} replacements\n`);

    // Show samples
    console.log('Sample mappings:');
    let shown = 0;
    for (const [from, to] of mapping) {
        if (shown >= 20) break;
        if (from !== to && (from.includes('Monet') || from.includes('Sébastien') || from.includes('SIMONET'))) {
            console.log(`   "${from}" → "${to}"`);
            shown++;
        }
    }
    console.log('');

    console.log('Step 4: Applying...');
    const { totalChanges, modifiedFiles } = applyMapping(mapping, dryRun);

    console.log('\n' + '='.repeat(45));
    console.log(`📊 Summary:`);
    console.log(`   - Groups: ${multipleVariants.length}`);
    console.log(`   - Mappings: ${mapping.size}`);
    console.log(`   - Files modified: ${modifiedFiles}`);
    console.log(`   - Total changes: ${totalChanges}`);

    if (dryRun) {
        console.log('\n⚠️  Dry run. Run without --dry-run to apply.');
    } else if (totalChanges > 0) {
        console.log('\n✅ Done! Regenerate search-index.json');
    }
}

main().catch(console.error);
