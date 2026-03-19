const https = require('https');
const fs = require('fs');
const path = require('path');

// Usage: node scripts/scrape-scottish-commons-full.cjs <Category> <OutputFilename> [MuseumId]

const BASE_URL = 'https://commons.wikimedia.org/w/api.php';
const DEPTH_LIMIT = 2;
const MAX_ITEMS = 3000;

const args = process.argv.slice(2);
const ROOT_CATEGORY = args[0] || 'Paintings_in_the_Scottish_National_Gallery';
const OUTPUT_FILENAME = args[1] || 'scottish-national-gallery-collection.json';
const MUSEUM_ID = args[2] || 'sng-collection';

const OUTPUT_PATH = path.join(__dirname, '../public/data', OUTPUT_FILENAME);

let processedCats = new Set();
let allFiles = new Map();
let totalItems = 0;

function fetchJson(url) {
    return new Promise((resolve, reject) => {
        const parsedUrl = new URL(url);
        const options = {
            hostname: parsedUrl.hostname,
            path: parsedUrl.pathname + parsedUrl.search,
            method: 'GET',
            headers: { 'User-Agent': 'ScottishGalleryScraper/4.0 (contact@example.com)' }
        };
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    process.stderr.write(`Error parsing JSON from ${url}\n`);
                    resolve({});
                }
            });
        });
        req.on('error', reject);
        req.end();
    });
}

async function getCategoryMembers(category, depth) {
    if (depth > DEPTH_LIMIT || processedCats.has(category)) return;
    processedCats.add(category);
    console.log(`Scanning Category:${category} (Depth ${depth})...`);

    let continueToken = '';

    do {
        const params = new URLSearchParams({
            action: 'query',
            list: 'categorymembers',
            cmtitle: `Category:${category}`,
            cmlimit: '500',
            cmtype: 'page|subcat|file',
            format: 'json',
            origin: '*'
        });
        if (continueToken) params.append('cmcontinue', continueToken);

        const data = await fetchJson(`${BASE_URL}?${params}`);
        const members = data.query?.categorymembers || [];

        for (const member of members) {
            if (member.ns === 14) { // Subcategory
                const subCat = member.title.replace(/^Category:/, '');
                await getCategoryMembers(subCat, depth + 1);
            } else if (member.ns === 6) { // File
                if (!allFiles.has(member.pageid)) {
                    allFiles.set(member.pageid, member.title);
                    totalItems++;
                }
            }
        }

        continueToken = data.continue?.cmcontinue;
        if (totalItems >= MAX_ITEMS) return;
        await new Promise(r => setTimeout(r, 200));
    } while (continueToken && totalItems < MAX_ITEMS);
}

// ------------------------------------------------------------------
// HELPER FUNCTIONS FOR TITLE CLEANING
// ------------------------------------------------------------------

// Remove language prefixes like "Dutch:", "German:", "Spanish:", "Catalan:", etc.
function removeLanguagePrefix(title) {
    if (!title) return '';
    // Common language prefixes found in Wikimedia Commons
    const langPrefixes = /^(?:Dutch|German|Spanish|French|Italian|Catalan|Latin|English|Portuguese|Polish|Russian|Swedish|Norwegian|Danish|Finnish|Hungarian|Czech|Romanian|Greek|Turkish|Arabic|Chinese|Japanese|Korean):\s*/i;
    return title.replace(langPrefixes, '').trim();
}

// Remove multi-language translations from title
// e.g. "Portrait of a Man \"Ritratto di un uomo\" \"Férfi portré\"..." -> "Portrait of a Man"
function removeMultiLanguageTranslations(title) {
    if (!title) return '';

    // If title contains quoted translations, take only the first part
    // Pattern: First non-quoted text, then multiple "quoted translations"
    const firstQuotePos = title.indexOf('"');
    if (firstQuotePos > 0) {
        const beforeQuote = title.substring(0, firstQuotePos).trim();
        // Only use the part before quotes if it's a reasonable title length
        if (beforeQuote.length >= 3) {
            return beforeQuote;
        }
    }

    // Also handle when the title starts with quotes - extract content
    if (title.startsWith('"')) {
        const match = title.match(/"([^"]+)"/);
        if (match && match[1].length >= 3) {
            return match[1].trim();
        }
    }

    return title;
}

// Normalize title for deduplication (more aggressive cleaning)
function normalizeTitleForDedup(title) {
    if (!title) return '';
    let normalized = title.toLowerCase();

    // Remove "Artist -" prefix patterns (e.g., "Morisot - A Woman..." -> "a woman...")
    normalized = normalized.replace(/^[a-z]+ - /i, '');

    // Remove "about" and similar qualifiers
    normalized = normalized.replace(/\babout\b/gi, '');

    // Remove "a woman and child" vs "woman and child" differences
    normalized = normalized.replace(/^a\s+/i, '');

    // Remove non-alphanumeric characters
    normalized = normalized.replace(/[^a-z0-9]/g, '');

    return normalized;
}

// Remove date patterns from titles like ", 1635 - 1650" or "c.1650–1675"
// Examples:
// "Princess Elizabeth, 1635 - 1650 and Princess Anne, 1637 - 1640. Daughters of Charles I" 
//    -> "Princess Elizabeth and Princess Anne. Daughters of Charles I"
// "Spanish School - A Boy Drinking from a Flask, c.1650–1675"
//    -> "A Boy Drinking from a Flask"
function cleanTitleFromDates(title) {
    if (!title) return '';
    let cleaned = title;

    // Remove "c." or "circa" prefix from dates
    cleaned = cleaned.replace(/,?\s*(?:c\.?\s*|circa\s+|about\s+)?(\d{4})\s*[-–—]\s*(\d{4})/gi, '');

    // Remove single year references like ", 1650" at the end
    cleaned = cleaned.replace(/,?\s*(?:c\.?\s*|circa\s+|about\s+)?\d{4}\s*$/gi, '');

    // Remove trailing year info like "(1650)" at the end
    cleaned = cleaned.replace(/\s*\(\d{4}\)\s*$/g, '');

    // Handle "X, YYYY and Y, ZZZZ" patterns
    // Split by " and " and clean each part
    if (cleaned.includes(' and ')) {
        const parts = cleaned.split(/\s+and\s+/i);
        const cleanedParts = parts.map(part => {
            // Remove trailing date references from each part
            return part.replace(/,?\s*(?:c\.?\s*|circa\s+|about\s+)?\d{4}(?:\s*[-–—]\s*\d{4})?\s*$/gi, '').trim();
        });
        cleaned = cleanedParts.filter(p => p.length > 0).join(' and ');
    }

    // Clean up extra spaces and punctuation
    cleaned = cleaned.replace(/\s+/g, ' ').trim();
    cleaned = cleaned.replace(/^[,.\s]+|[,.\s]+$/g, '');

    // Remove common suffixes that indicate file versioning
    cleaned = cleaned.replace(/\s*[-–—]\s*(?:Google Art Project|WGA\d+|cropped|detail|crop).*$/i, '');

    return cleaned;
}

// Extract clean title from filename
function extractCleanTitleFromFilename(filename) {
    if (!filename) return '';

    // Remove "File:" prefix and extension
    let title = filename
        .replace(/^File:/i, '')
        .replace(/\.(jpg|jpeg|png|tif|tiff|gif|webp)$/i, '')
        .replace(/_/g, ' ');

    // Try to extract title from "Artist Name - Title" pattern
    const artistTitleMatch = title.match(/^[^-–—]+\s*[-–—]\s+(.+)$/);
    if (artistTitleMatch && artistTitleMatch[1].length > 3) {
        title = artistTitleMatch[1];
    }

    // Apply language prefix and date cleaning
    title = removeLanguagePrefix(title);
    title = cleanTitleFromDates(title);

    // Remove remaining artifacts
    title = title.replace(/\s*[-–—]\s*NG\s+\d+.*$/i, '');
    title = title.replace(/\s*,\s*NG\s+\d+\.?$/i, '');

    // Remove trailing hyphens/dashes
    title = title.replace(/\s*[-–—]+\s*$/g, '');

    return title.trim();
}

// Escape special regex characters
function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Remove artist name prefix from title (e.g., "Morisot - Title" -> "Title")
function removeArtistPrefix(title, artist) {
    if (!title || !artist) return title;

    // Get the artist's last name (commonly used in filenames)
    const artistParts = artist.split(/\s+/);
    const lastName = artistParts[artistParts.length - 1];

    // Only try if lastName looks like a normal word (no numbers or special chars)
    if (!/^[a-zA-Z]+$/.test(lastName)) return title;

    // Check if title starts with artist's last name followed by " - "
    const escapedLastName = escapeRegExp(lastName);
    const prefixPattern = new RegExp(`^${escapedLastName}\\s*[-–—]\\s*`, 'i');
    if (prefixPattern.test(title)) {
        const cleaned = title.replace(prefixPattern, '').trim();
        if (cleaned.length >= 3) {
            return cleaned;
        }
    }

    // Also check for first name pattern
    if (artistParts.length > 1) {
        const firstName = artistParts[0];
        if (/^[a-zA-Z]+$/.test(firstName)) {
            const escapedFirstName = escapeRegExp(firstName);
            const firstNamePattern = new RegExp(`^${escapedFirstName}\\s*[-–—]\\s*`, 'i');
            if (firstNamePattern.test(title)) {
                const cleaned = title.replace(firstNamePattern, '').trim();
                if (cleaned.length >= 3) {
                    return cleaned;
                }
            }
        }
    }

    return title;
}

// ------------------------------------------------------------------
// WIKITEXT PARSING HELPERS
// ------------------------------------------------------------------

function extractTemplateParam(wikitext, paramName) {
    const artworkStart = wikitext.search(/{{Artwork/i);
    if (artworkStart === -1) return null;

    let braceCount = 0;
    let endIndex = -1;
    for (let i = artworkStart; i < wikitext.length; i++) {
        if (wikitext[i] === '{' && wikitext[i + 1] === '{') {
            braceCount++;
            i++;
        } else if (wikitext[i] === '}' && wikitext[i + 1] === '}') {
            braceCount--;
            i++;
            if (braceCount === 0) {
                endIndex = i;
                break;
            }
        }
    }

    if (endIndex === -1) return null;
    const artworkBlock = wikitext.substring(artworkStart + 9, endIndex);

    const regex = new RegExp(`\\|\\s*${paramName}\\s*=\\s*`, 'i');
    const match = artworkBlock.match(regex);
    if (!match) return null;

    const startPos = match.index + match[0].length;

    let depth = 0;
    let valEnd = -1;
    for (let i = startPos; i < artworkBlock.length; i++) {
        const char = artworkBlock[i];
        if (char === '{' || char === '[') depth++;
        if (char === '}' || char === ']') depth--;

        if (depth === 0 && char === '|') {
            valEnd = i;
            break;
        }
    }

    if (valEnd === -1) valEnd = artworkBlock.length;

    return artworkBlock.substring(startPos, valEnd).trim();
}

function cleanWikiMarkup(text) {
    if (!text) return '';
    let result = text;
    result = result.replace(/<!--[\s\S]*?-->/g, '');

    const parseMultiLangTemplate = (templateName) => {
        const regex = new RegExp(`{{${templateName}\\|([\\s\\S]*?)}}`, 'gi');
        result = result.replace(regex, (match, content) => {
            const enMatch = content.match(/\|en\s*=\s*([^|{}]+)/i);
            if (enMatch) return enMatch[1].trim();
            if (!content.includes('=')) {
                return content.replace(/^\|/, '').trim();
            }
            const parts = content.split('|');
            for (let part of parts) {
                if (part.includes('=')) {
                    const [key, val] = part.split('=');
                    if (val && val.length > 1) return val.trim();
                } else if (part.trim().length > 0) {
                    return part.trim();
                }
            }
            return '';
        });
    };

    if (result.match(/{{title/i)) parseMultiLangTemplate('title');
    if (result.match(/{{label/i)) parseMultiLangTemplate('label');
    if (result.match(/{{object type/i)) parseMultiLangTemplate('object type');

    if (result.match(/QS:P\d+/)) {
        const enMatch = result.match(/,en:"([^"]+)"/);
        if (enMatch) return enMatch[1].trim();
        const anyMatch = result.match(/QS:P\d+,[^:]+:"([^"]+)"/);
        if (anyMatch) return anyMatch[1].trim();
    }

    // Explicit label QS cleaning
    if (result.includes('label QS:')) {
        const labelMatch = result.match(/label QS:Len,"([^"]+)"/);
        if (labelMatch) return labelMatch[1].trim();
        result = result.replace(/label QS:[^"]+"/g, '');
    }

    let prev;
    let loops = 0;
    do {
        prev = result;
        loops++;
        if (loops > 20) break;
        result = result.replace(/{{[a-z]{2,3}\|(?:1=)?(.*?)}}/gi, '$1');
        result = result.replace(/{{Creator:([^}|]+)(?:\|[^}]+)?}}/gi, '$1');
        result = result.replace(/{{Institution:([^}|]+)(?:\|[^}]+)?}}/gi, '$1');
        result = result.replace(/{{Technique\|([^}|]+)(?:\|([^}|]+))?.*}}/i, '$1 $2');
        if (result.match(/{{Size/i)) {
            result = result.replace(/{{Size\|(\w+)\|([^|]+)\|([^|]+)(?:\|.*)?}}/i, '$2 x $3 $1');
        }
        result = result.replace(/{{[^|{}]+\|([^|{}]+)}}/g, '$1');
        result = result.replace(/{{([^|{}]+)}}/g, '$1');
        result = result.replace(/\[\[(?:[^\]]*\|)?([^\]]+)\]\]/g, '$1');
    } while (result !== prev && (result.includes('{{') || result.includes('[[')));

    result = result.replace(/<[^>]+>/g, '');
    result = result.replace(/lang=[a-z]{2,3}\s*/gi, '');
    result = result.replace(/1=/g, '');
    result = result.replace(/''/g, '');
    result = result.replace(/&nbsp;/g, ' ');
    result = result.replace(/{{/g, '').replace(/}}/g, '');

    return result.replace(/\s+/g, ' ').trim();
}

function cleanTitle(raw) {
    if (!raw) return '';
    let t = cleanWikiMarkup(raw);
    if (t.includes('title QS:')) t = t.split('title QS:')[0].trim();
    t = t.replace(/^"+|"+$/g, '').replace(/,$/, '');
    t = t.replace(/^1=/, '');
    t = t.replace(/^lang=[a-z]{2}\s*/i, '');

    // Safe HTML Tag Split
    t = t.split('<')[0].trim();

    // Apply our cleaning functions
    t = removeLanguagePrefix(t);
    t = cleanTitleFromDates(t);

    if (t.match(/^lang=[a-z]{2}\s*\(\d{4}\)$/i) || t.length < 2) return '';
    return t;
}

// ------------------------------------------------------------------
// DATA PARSER
// ------------------------------------------------------------------

async function getDetailedMetadata(pageIds) {
    const batches = [];
    const ids = Array.from(pageIds);
    while (ids.length > 0) batches.push(ids.splice(0, 50));

    const results = [];
    // Track unique artworks by title + artist combination
    const seenArtworks = new Set();

    for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        console.log(`Fetching rich metadata for batch ${i + 1}/${batches.length}...`);

        const params = new URLSearchParams({
            action: 'query',
            pageids: batch.join('|'),
            prop: 'revisions|imageinfo|categories',
            rvprop: 'content',
            iiprop: 'url|size|extmetadata',
            cllimit: 'max',
            format: 'json',
            origin: '*',
            uselang: 'en' // Proactively request English
        });

        const data = await fetchJson(`${BASE_URL}?${params}`);
        const pages = data.query?.pages || {};

        for (const pid in pages) {
            const page = pages[pid];
            const info = page.imageinfo?.[0];
            const revision = page.revisions?.[0];
            const wikitext = revision?.['*'] || '';
            const cats = page.categories ? page.categories.map(c => c.title.replace(/^Category:/, '')) : [];

            if (!info) continue;

            const extract = (param) => wikitext ? extractTemplateParam(wikitext, param) : null;
            const rawTitle = extract('title');
            const rawArtist = extract('artist');
            const rawYear = extract('date');
            const rawMedium = extract('medium');
            const rawDimensions = extract('dimensions');
            const rawDesc = extract('description');
            const rawObjType = extract('object type');

            const meta = info.extmetadata || {};

            const cleaner = (val, type) => {
                if (!val) return '';

                let decoded = val.replace(/&lt;/g, '<')
                    .replace(/&gt;/g, '>')
                    .replace(/&quot;/g, '"')
                    .replace(/&amp;/g, '&')
                    .replace(/&nbsp;/g, ' ');

                // 1. QS - Typed English
                const qsLenMatches = decoded.match(new RegExp(`${type}\\s*QS:Len,"([^"]+)"`, 'i'));
                if (qsLenMatches) return qsLenMatches[1];
                const qsEnMatches = decoded.match(new RegExp(`${type}\\s*QS:.*?,en:"([^"]+)"`, 'i'));
                if (qsEnMatches) return qsEnMatches[1];

                // 2. Fallback: Clean HTML tags
                let text = decoded;
                // If the value is wrapped in a tag (e.g. <div class="fn">...</div>), strip tags to get content
                if (text.trim().startsWith('<')) {
                    text = text.replace(/<[^>]+>/g, ' ');
                } else {
                    // Otherwise, if tags appear later (e.g. "Title <span hidden>..."), truncate to avoid garbage
                    text = text.split('<')[0];
                }

                // 3. Remove "label QS:..." garbage
                text = text.replace(/(?:title|label)\s*QS:[^"]+/gi, '');
                text = text.replace(/(?:title|label)\s*QS:[^\s,]+/gi, '');

                return text.replace(/\s+/g, ' ').trim();
            };

            const fileNameTitle = page.title.replace(/^File:/, '').replace(/\.(jpg|jpeg|png|tif|tiff)$/i, '').replace(/_/g, ' ');

            // --- TITLE EXTRACTION (IMPROVED) ---
            let title = '';

            // 1. Try extmetadata.ObjectName first (usually has the cleanest title)
            if (meta.ObjectName?.value) {
                let objName = cleaner(meta.ObjectName.value, 'title');
                if (!objName) objName = cleaner(meta.ObjectName.value, 'label');

                // Clean the ObjectName
                objName = removeLanguagePrefix(objName);
                objName = cleanTitleFromDates(objName);

                if (objName && objName.length >= 3 && objName !== 'null') {
                    title = objName;
                }
            }

            // 2. Try raw title from wikitext {{Artwork}} template
            if (!title && rawTitle) {
                let cleaned = cleanTitle(rawTitle);
                if (cleaned && cleaned.length >= 3) {
                    title = cleaned;
                }
            }

            // 3. Try meta.Title
            if (!title && meta.Title?.value) {
                let metaTitle = cleaner(meta.Title.value, 'title');
                metaTitle = removeLanguagePrefix(metaTitle);
                metaTitle = cleanTitleFromDates(metaTitle);
                if (metaTitle && metaTitle.length >= 3) {
                    title = metaTitle;
                }
            }

            // 4. Category Fallback: Look for "Title by Artist" in categories
            if (!title || title.length < 3 || title === 'null') {
                for (const cat of cats) {
                    const byMatch = cat.match(/^(.*?) by (.*?)(?: \(.*|$)/);
                    if (byMatch) {
                        const candidate = byMatch[1].trim();
                        // Filter out unlikely titles
                        const badTitles = ['Paintings', 'Portrait paintings', 'Genre paintings', 'Landscape paintings', 'Religious paintings', 'History paintings', 'Mythological paintings'];
                        const badPattern = /^(?:\d+(?:st|nd|rd|th)-century|\d{4}|Oil on|Watercolor on|Drawings by|Sketches by|Studies by)/i;

                        if (!badTitles.includes(candidate) && candidate.length > 2 && !candidate.match(/^\d+s paintings/) && !candidate.match(badPattern)) {
                            title = cleanTitleFromDates(candidate);
                            break;
                        }
                    }
                }
            }

            // 5. Final fallback: Extract from filename
            if (!title || title.length < 2) {
                title = extractCleanTitleFromFilename(fileNameTitle);
            }

            // Safety cleaning - apply all cleaning functions one more time
            title = removeLanguagePrefix(title);
            title = removeMultiLanguageTranslations(title);
            title = cleanTitleFromDates(title);
            title = title.replace(/title\s*QS:.*$/i, '').replace(/^"+|"+$/g, '').trim();
            if (title.includes('<')) title = title.split('<')[0].trim();
            if (title === 'null' || title.length < 2) title = extractCleanTitleFromFilename(fileNameTitle);

            // Final cleanup - remove any remaining artifacts
            title = title.replace(/\s+/g, ' ').trim();


            // --- ARTIST ---
            const artist = cleanWikiMarkup(rawArtist || cleaner(meta.Artist?.value) || 'Unknown');

            // Remove artist name prefix from title (e.g., "Morisot - Title" -> "Title")
            title = removeArtistPrefix(title, artist);

            // --- DEDUPLICATION CHECK ---
            // Create a normalized key for deduplication (using improved normalization)
            const normalizedTitle = normalizeTitleForDedup(title);
            const normalizedArtist = artist.toLowerCase().replace(/[^a-z0-9]/g, '');
            const artworkKey = `${normalizedTitle}|${normalizedArtist}`;

            if (seenArtworks.has(artworkKey)) {
                console.log(`  Skipping duplicate: "${title}" by ${artist}`);
                continue;
            }
            seenArtworks.add(artworkKey);

            // --- DATE (Year only) ---
            const rawDateVal = rawYear || cleaner(meta.DateTimeOriginal?.value) || cleaner(meta.DateTime?.value) || '';
            const dateMatch = rawDateVal.match(/\b(1\d{3}|20\d{2})\b/g);
            let year = '';
            let dateDisplay = '';
            // Prefer the first valid 4-digit year found
            if (dateMatch && dateMatch.length > 0) {
                year = dateMatch[0];
                dateDisplay = year;
            }

            // --- MEDIUM ---
            const medium = cleanWikiMarkup(rawMedium || cleaner(meta.Medium?.value));

            // --- OBJECT TYPE ---
            let objectType = cleanWikiMarkup(rawObjType || cleaner(meta.ObjectType?.value, 'object type'));

            // Infer from Medium if not found
            if (!objectType && medium) {
                const lowerMed = medium.toLowerCase();
                if (lowerMed.includes('oil') || lowerMed.includes('canvas') || lowerMed.includes('panel') || lowerMed.includes('tempera')) {
                    objectType = 'Painting';
                }
            }
            // Infer from Categories if still not found
            if (!objectType) {
                if (cats.some(c => c.toLowerCase().includes('paintings'))) objectType = 'Painting';
            }

            // Normalize the object type
            if (objectType) {
                objectType = objectType.charAt(0).toUpperCase() + objectType.slice(1).toLowerCase();
                if (objectType === 'Paintings') objectType = 'Painting';
            }

            // Ensure objectType is always at the front of categories if it exists
            const finalCats = [...cats];
            if (objectType) {
                // Remove any existing instance of objectType (case-insensitive)
                const typeLower = objectType.toLowerCase();
                const filteredCats = finalCats.filter(c => c.toLowerCase() !== typeLower);
                filteredCats.unshift(objectType);
                finalCats.length = 0;
                finalCats.push(...filteredCats);
            }

            // If categories is empty, at least add "Painting" for paintings collection
            if (finalCats.length === 0) {
                finalCats.push('Painting');
            }

            const dimensions = cleanWikiMarkup(rawDimensions || cleaner(meta.Dimensions?.value));
            const description = cleanWikiMarkup(rawDesc || cleaner(meta.ImageDescription?.value));

            results.push({
                startYear: year ? parseInt(year) : null,
                itemTitle: title || 'Untitled',
                year: year,
                date: dateDisplay,
                institution: MUSEUM_ID,
                artist: artist,
                image: info.url,
                thumb: info.thumburl || info.url,
                source: page.title.replace(/ /g, '_'),
                dimensions: dimensions || (info.width && info.height ? `${info.width} x ${info.height}` : ''),
                medium: medium,
                description: description,
                categories: finalCats,
                id: String(page.pageid),
                museumId: MUSEUM_ID
            });
        }
        await new Promise(r => setTimeout(r, 200));
    }
    return results;
}

(async () => {
    try {
        console.log(`Starting RICH scrape for ${ROOT_CATEGORY} -> ${OUTPUT_FILENAME}`);
        await getCategoryMembers(ROOT_CATEGORY, 0);
        console.log(`Found ${allFiles.size} files. Fetching metadata...`);

        const details = await getDetailedMetadata(allFiles.keys());

        const output = {
            museumId: MUSEUM_ID,
            scrapedAt: new Date().toISOString(),
            totalObjects: details.length,
            objects: details
        };

        fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2));
        console.log(`Saved ${details.length} rich items to ${OUTPUT_PATH}`);

    } catch (e) {
        console.error('Fatal error:', e);
    }
})();
