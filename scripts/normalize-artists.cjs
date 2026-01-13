/**
 * Artist Name Normalization Script
 * 
 * This script normalizes artist names across all collection JSON files to:
 * 1. Merge variations of the same artist into a canonical form
 * 2. Remove birth/death years from names
 * 3. Handle "Last, First" vs "First Last" formats
 * 4. Remove "(aka)" and other annotations
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../public/data');

// Canonical artist names mapping
const CANONICAL_ARTISTS = new Map();

// Manual overrides for known artists (canonical form)
const KNOWN_ARTISTS = {
    // Picasso
    'picasso pablo': 'Pablo Picasso',
    'pablo picasso': 'Pablo Picasso',
    'picasso pablo ruiz': 'Pablo Picasso',
    'ruiz picasso pablo': 'Pablo Picasso',

    // Van Gogh
    'van gogh vincent': 'Vincent van Gogh',
    'gogh vincent van': 'Vincent van Gogh',
    'vincent van gogh': 'Vincent van Gogh',

    // Da Vinci
    'da vinci leonardo': 'Leonardo da Vinci',
    'leonardo da vinci': 'Leonardo da Vinci',
    'vinci leonardo da': 'Leonardo da Vinci',

    // Rembrandt
    'rembrandt van rijn': 'Rembrandt van Rijn',
    'rembrandt harmensz van rijn': 'Rembrandt van Rijn',
    'rembrandt harmenszoon van rijn': 'Rembrandt van Rijn',
    'rijn rembrandt van': 'Rembrandt van Rijn',

    // Monet
    'monet claude': 'Claude Monet',
    'claude monet': 'Claude Monet',

    // Manet
    'manet edouard': 'Édouard Manet',
    'edouard manet': 'Édouard Manet',

    // Renoir
    'renoir pierre auguste': 'Pierre-Auguste Renoir',
    'auguste renoir': 'Pierre-Auguste Renoir',
    'renoir auguste': 'Pierre-Auguste Renoir',

    // Cézanne
    'cezanne paul': 'Paul Cézanne',
    'paul cezanne': 'Paul Cézanne',

    // Degas
    'degas edgar': 'Edgar Degas',
    'edgar degas': 'Edgar Degas',

    // Matisse
    'matisse henri': 'Henri Matisse',
    'henri matisse': 'Henri Matisse',

    // Kandinsky
    'kandinsky wassily': 'Wassily Kandinsky',
    'wassily kandinsky': 'Wassily Kandinsky',

    // Klimt
    'klimt gustav': 'Gustav Klimt',
    'gustav klimt': 'Gustav Klimt',

    // Munch
    'munch edvard': 'Edvard Munch',
    'edvard munch': 'Edvard Munch',

    // Dalí
    'dali salvador': 'Salvador Dalí',
    'salvador dali': 'Salvador Dalí',

    // Warhol
    'warhol andy': 'Andy Warhol',
    'andy warhol': 'Andy Warhol',

    // Pollock
    'pollock jackson': 'Jackson Pollock',
    'jackson pollock': 'Jackson Pollock',

    // Rothko
    'rothko mark': 'Mark Rothko',
    'mark rothko': 'Mark Rothko',

    // Caravaggio
    'caravaggio michelangelo merisi': 'Caravaggio',
    'michelangelo merisi da caravaggio': 'Caravaggio',

    // Michelangelo
    'michelangelo buonarroti': 'Michelangelo',
    'buonarroti michelangelo': 'Michelangelo',

    // Raphael
    'raphael sanzio': 'Raphael',
    'raffaello sanzio': 'Raphael',
    'raffaello santi': 'Raphael',

    // Titian
    'titian': 'Titian',
    'tiziano vecellio': 'Titian',
    'tiziano vecelli': 'Titian',

    // Botticelli
    'botticelli sandro': 'Sandro Botticelli',
    'sandro botticelli': 'Sandro Botticelli',

    // Vermeer
    'vermeer johannes': 'Johannes Vermeer',
    'johannes vermeer': 'Johannes Vermeer',
    'jan vermeer': 'Johannes Vermeer',

    // Rubens
    'rubens peter paul': 'Peter Paul Rubens',
    'peter paul rubens': 'Peter Paul Rubens',

    // Goya
    'goya francisco': 'Francisco Goya',
    'francisco goya': 'Francisco Goya',
    'goya y lucientes francisco': 'Francisco Goya',

    // Velázquez
    'velazquez diego': 'Diego Velázquez',
    'diego velazquez': 'Diego Velázquez',
    'velazquez diego rodriguez de silva y': 'Diego Velázquez',

    // El Greco
    'el greco': 'El Greco',
    'theotokopoulos domenikos': 'El Greco',
    'domenikos theotokopoulos': 'El Greco',

    // Turner
    'turner joseph mallord william': 'J.M.W. Turner',
    'jmw turner': 'J.M.W. Turner',
    'turner jmw': 'J.M.W. Turner',
    'william turner': 'J.M.W. Turner',

    // Constable
    'constable john': 'John Constable',
    'john constable': 'John Constable',

    // Dürer
    'durer albrecht': 'Albrecht Dürer',
    'albrecht durer': 'Albrecht Dürer',

    // Holbein
    'holbein hans': 'Hans Holbein the Younger',
    'hans holbein': 'Hans Holbein the Younger',

    // Bosch
    'bosch hieronymus': 'Hieronymus Bosch',
    'hieronymus bosch': 'Hieronymus Bosch',

    // Bruegel
    'bruegel pieter': 'Pieter Bruegel the Elder',
    'pieter bruegel': 'Pieter Bruegel the Elder',
    'brueghel pieter': 'Pieter Bruegel the Elder',

    // German Expressionists (Die Brücke)
    'kirchner ernst ludwig': 'Ernst Ludwig Kirchner',
    'ernst ludwig kirchner': 'Ernst Ludwig Kirchner',
    'ernst kirchner': 'Ernst Ludwig Kirchner',
    'lise gujer ernst ludwig kirchner': 'Ernst Ludwig Kirchner',

    'schmidt rottluff karl': 'Karl Schmidt-Rottluff',
    'karl schmidt rottluff': 'Karl Schmidt-Rottluff',
    'schmidtrottluff karl': 'Karl Schmidt-Rottluff',
    'schmidtrottluff': 'Karl Schmidt-Rottluff',
    'schmidt karl schmidt rottluff karl': 'Karl Schmidt-Rottluff',

    'heckel erich': 'Erich Heckel',
    'erich heckel': 'Erich Heckel',

    'nolde emil': 'Emil Nolde',
    'emil nolde': 'Emil Nolde',

    'pechstein max': 'Max Pechstein',
    'max pechstein': 'Max Pechstein',
    'hermann max pechstein': 'Max Pechstein',

    'mueller otto': 'Otto Mueller',
    'otto mueller': 'Otto Mueller',
    'muller otto': 'Otto Mueller',

    // Der Blaue Reiter
    'marc franz': 'Franz Marc',
    'franz marc': 'Franz Marc',

    'macke august': 'August Macke',
    'august macke': 'August Macke',

    'klee paul': 'Paul Klee',
    'paul klee': 'Paul Klee',

    // Other German/Austrian artists
    'beckmann max': 'Max Beckmann',
    'max beckmann': 'Max Beckmann',

    'dix otto': 'Otto Dix',
    'otto dix': 'Otto Dix',

    'grosz george': 'George Grosz',
    'george grosz': 'George Grosz',

    'schiele egon': 'Egon Schiele',
    'egon schiele': 'Egon Schiele',

    'kokoschka oskar': 'Oskar Kokoschka',
    'oskar kokoschka': 'Oskar Kokoschka',

    // French Impressionists/Post-Impressionists
    'pissarro camille': 'Camille Pissarro',
    'camille pissarro': 'Camille Pissarro',

    'sisley alfred': 'Alfred Sisley',
    'alfred sisley': 'Alfred Sisley',

    'seurat georges': 'Georges Seurat',
    'georges seurat': 'Georges Seurat',

    'signac paul': 'Paul Signac',
    'paul signac': 'Paul Signac',

    'toulouse lautrec henri': 'Henri de Toulouse-Lautrec',
    'henri de toulouse lautrec': 'Henri de Toulouse-Lautrec',
    'lautrec henri de toulouse': 'Henri de Toulouse-Lautrec',

    'gauguin paul': 'Paul Gauguin',
    'paul gauguin': 'Paul Gauguin',

    // Surrealists
    'miro joan': 'Joan Miró',
    'joan miro': 'Joan Miró',

    'magritte rene': 'René Magritte',
    'rene magritte': 'René Magritte',

    'ernst max': 'Max Ernst',
    'max ernst': 'Max Ernst',

    // Modern/Contemporary
    'basquiat jean michel': 'Jean-Michel Basquiat',
    'jean michel basquiat': 'Jean-Michel Basquiat',

    'haring keith': 'Keith Haring',
    'keith haring': 'Keith Haring',

    'hockney david': 'David Hockney',
    'david hockney': 'David Hockney',

    'bacon francis': 'Francis Bacon',
    'francis bacon': 'Francis Bacon',

    'freud lucian': 'Lucian Freud',
    'lucian freud': 'Lucian Freud',

    'richter gerhard': 'Gerhard Richter',
    'gerhard richter': 'Gerhard Richter',

    'kiefer anselm': 'Anselm Kiefer',
    'anselm kiefer': 'Anselm Kiefer',
};

// Normalize a name for comparison
function normalizeForComparison(name) {
    if (!name) return '';
    return name
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z\s]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

// Clean artist name
function cleanArtistName(name) {
    if (!name || typeof name !== 'string') return name;

    let cleaned = name
        .replace(/\s*\(?\d{4}\s*[-–—]\s*\d{4}\)?/g, '')
        .replace(/\s*\(?(?:b\.|d\.|born|died|circa|c\.|ca\.?)?\s*\d{4}\)?/gi, '')
        .replace(/\s*\(?\s*aka\s*\)?\s*/gi, '')
        .replace(/,\s*$/, '')
        .replace(/\s+/g, ' ')
        .trim();

    return cleaned;
}

// Convert "Last, First" to "First Last"
function normalizeNameOrder(name) {
    if (!name) return name;

    if (name.includes(',')) {
        const parts = name.split(',').map(p => p.trim());
        if (parts.length === 2 && parts[0] && parts[1]) {
            const firstName = parts[1].replace(/\s*\([^)]*\)\s*$/, '').trim();
            const lastName = parts[0];
            return `${firstName} ${lastName}`;
        }
    }

    return name;
}

// Get canonical name for an artist
function getCanonicalName(originalName) {
    if (!originalName || typeof originalName !== 'string') return originalName;
    if (originalName.trim() === '' || originalName.toLowerCase() === 'unknown') {
        return 'Unknown';
    }

    let cleaned = cleanArtistName(originalName);
    let normalized = normalizeNameOrder(cleaned);
    const searchKey = normalizeForComparison(normalized);

    if (KNOWN_ARTISTS[searchKey]) {
        return KNOWN_ARTISTS[searchKey];
    }

    if (CANONICAL_ARTISTS.has(searchKey)) {
        return CANONICAL_ARTISTS.get(searchKey);
    }

    CANONICAL_ARTISTS.set(searchKey, normalized);
    return normalized;
}

// Process a single collection file
function processCollectionFile(filePath, dryRun = false) {
    const fileName = path.basename(filePath);
    let modified = false;
    let changeCount = 0;

    try {
        const content = fs.readFileSync(filePath, 'utf-8');
        let data = JSON.parse(content);

        let items = [];
        let dataType = 'unknown';

        if (Array.isArray(data)) {
            items = data;
            dataType = 'array';
        } else if (data.objects) {
            items = data.objects;
            dataType = 'objects';
        } else if (data.artworks) {
            items = data.artworks;
            dataType = 'artworks';
        } else if (data.rooms) {
            dataType = 'rooms';
            for (const room of data.rooms) {
                if (room.artworks) {
                    for (const artwork of room.artworks) {
                        const fields = ['artist', 'artistName', 'creator'];
                        for (const field of fields) {
                            if (artwork[field] && typeof artwork[field] === 'string') {
                                const original = artwork[field];
                                const canonical = getCanonicalName(original);
                                if (canonical !== original) {
                                    if (!dryRun) artwork[field] = canonical;
                                    modified = true;
                                    changeCount++;
                                }
                            }
                        }
                    }
                }
            }
        }

        if (dataType !== 'rooms' && items.length > 0) {
            for (const item of items) {
                const fields = ['artist', 'artistName', 'creator'];
                for (const field of fields) {
                    if (item[field] && typeof item[field] === 'string') {
                        const original = item[field];
                        const canonical = getCanonicalName(original);
                        if (canonical !== original) {
                            if (!dryRun) item[field] = canonical;
                            modified = true;
                            changeCount++;
                        }
                    }
                }
            }
        }

        if (modified && !dryRun) {
            fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
        }

        return { success: true, modified, changeCount };

    } catch (e) {
        return { success: false, error: e.message };
    }
}

// Main function
async function main() {
    const args = process.argv.slice(2);
    const dryRun = args.includes('--dry-run');

    console.log('🎨 Artist Name Normalization Script');
    console.log('===================================');
    if (dryRun) {
        console.log('⚠️  DRY RUN MODE - No files will be modified\n');
    }

    const files = fs.readdirSync(DATA_DIR)
        .filter(f => f.endsWith('.json') && !f.includes('search-index'))
        .map(f => path.join(DATA_DIR, f));

    console.log(`Found ${files.length} collection files to process\n`);

    let totalChanges = 0;
    let modifiedFiles = 0;

    for (const file of files) {
        const result = processCollectionFile(file, dryRun);
        const fileName = path.basename(file);

        if (result.success) {
            if (result.modified) {
                console.log(`✅ ${fileName}: ${result.changeCount} artist names normalized`);
                totalChanges += result.changeCount;
                modifiedFiles++;
            }
        } else {
            console.log(`❌ ${fileName}: ${result.error}`);
        }
    }

    console.log('\n===================================');
    console.log(`📊 Summary:`);
    console.log(`   - Files processed: ${files.length}`);
    console.log(`   - Files modified: ${modifiedFiles}`);
    console.log(`   - Total changes: ${totalChanges}`);

    if (dryRun) {
        console.log('\n⚠️  This was a dry run. Run without --dry-run to apply changes.');
    } else if (totalChanges > 0) {
        console.log('\n✅ Changes applied. Remember to regenerate search-index.json');
    }
}

main().catch(console.error);
