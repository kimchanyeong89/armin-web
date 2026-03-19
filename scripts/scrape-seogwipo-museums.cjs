const fs = require('fs');
const path = require('path');
const axios = require('axios');
const cheerio = require('cheerio');

const BASE_URL = 'https://ssam.seogwipo.go.kr';

// ------------------------------------------------------------------
// Basic Headers (User-Agent, Accept, etc.) + X-Requested-With
// ------------------------------------------------------------------
const BASE_HEADERS = {
    'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'X-Requested-With': 'XMLHttpRequest',
};

// ------------------------------------------------------------------
// Cookie Store and Request Wrapper
// ------------------------------------------------------------------
function createClient() {
    const cookieStore = {};

    async function fetchWithCookies(url, options = {}) {
        const mergedHeaders = { ...BASE_HEADERS, ...options.headers };
        const cookieHeader = Object.entries(cookieStore)
            .map(([k, v]) => `${k}=${v}`)
            .join('; ');
        if (cookieHeader) mergedHeaders['Cookie'] = cookieHeader;

        try {
            const resp = await axios({
                url,
                ...options,
                headers: mergedHeaders,
                maxRedirects: 5,
                validateStatus: (status) => status < 400,
            });

            // Update cookie store
            if (resp.headers['set-cookie']) {
                resp.headers['set-cookie'].forEach((c) => {
                    const [pair] = c.split(';');
                    const [k, v] = pair.split('=');
                    if (k && v) cookieStore[k] = v;
                });
            }
            return resp;
        } catch (e) {
            console.error(`Request failed for ${url}: ${e.message}`);
            throw e;
        }
    }

    return {
        get: (url, cfg) => fetchWithCookies(url, { ...cfg, method: 'GET' }),
        post: (url, data, cfg) =>
            fetchWithCookies(url, { ...cfg, method: 'POST', data }),
    };
}

// ------------------------------------------------------------------
// Obtain CSRF Token (refreshed per page)
// ------------------------------------------------------------------
async function getCsrfToken(client) {
    try {
        const resp = await client.get(`${BASE_URL}/workart/list`);
        const $ = cheerio.load(resp.data);
        const token = $('input[name=_csrf]').val();
        // console.log('CSRF token:', token);
        return token || '';
    } catch (e) {
        console.error('Failed to obtain CSRF token:', e.message);
        return '';
    }
}

// ------------------------------------------------------------------
// Image URL Extraction (src, data-src, data-original, srcset)
// ------------------------------------------------------------------
function resolveImageUrl($img) {
    if (!$img || $img.length === 0) return null;
    let src =
        $img.attr('src') ||
        $img.attr('data-src') ||
        $img.attr('data-original') ||
        $img.attr('srcset');

    if (!src) return null;

    // srcset -> use first URL
    if (src.includes(',')) src = src.split(',')[0].trim().split(' ')[0];

    if (!src.startsWith('http')) src = BASE_URL + src;
    return src;
}

// ------------------------------------------------------------------
// Metadata Key Mapping (Multi-label support)
// ------------------------------------------------------------------
const KEY_MAP = {
    artist: ['작가명', '작가', 'Artist', 'Artist Name'],
    date: ['제작년도', '작품 연도', '작품연도', '연도', 'Date', '제작연도'],
    medium: ['재료', '재료/기법', '재료 및 기법', 'Medium', '재료·기법'],
    dimensions: ['규격', '작품 규격', '크기', 'Dimensions'],
    category: [
        '작품 구분',
        '작품구분',
        '분류',
        '장르',
        '작품 장르',
        '작품장르',
        'Category',
        '분류명',
    ],
};

function firstMatch(obj, keys) {
    for (const k of keys) if (obj[k]) return obj[k];
    return '';
}

// ------------------------------------------------------------------
// Category Normalization (Ignore whitespace/case)
// ------------------------------------------------------------------
function normalizeCategory(cat) {
    const txt = (cat || '').replace(/\s+/g, '').toLowerCase();
    if (/(회화|유화|수묵|채색)/.test(txt)) return 'Painting';
    if (/(조각|소조)/.test(txt)) return 'Sculpture';
    if (/서예/.test(txt)) return 'Calligraphy';
    if (/공예/.test(txt)) return 'Craft';
    if (/사진/.test(txt)) return 'Photography';
    if (/판화/.test(txt)) return 'Print';
    return 'Artwork';
}

// ------------------------------------------------------------------
// Retry Helper
// ------------------------------------------------------------------
async function safeRequest(fn, retries = 3, delay = 800) {
    for (let i = 0; i < retries; i++) {
        try {
            return await fn();
        } catch (e) {
            console.warn(`Retry ${i + 1}/${retries}: ${e.message}`);
            await new Promise((r) => setTimeout(r, delay));
        }
    }
    throw new Error('All retries failed');
}

// ------------------------------------------------------------------
// Scrape Detail Page
// ------------------------------------------------------------------
async function scrapeDetail(client, url, museum) {
    try {
        const resp = await client.get(url, {
            headers: { Referer: `${BASE_URL}/workart/list` },
        });
        const $ = cheerio.load(resp.data);

        // ---- Title ----
        let title = $('.subject h4').text().trim() || $('.subject').text().trim();

        // Remove doubled title if present (e.g. "TitleTitle")
        if (title && title.length > 0 && title.length % 2 === 0) {
            const half = title.length / 2;
            if (title.slice(0, half) === title.slice(half)) title = title.slice(0, half);
        }

        // ---- Metadata (DL, LI, etc.) ----
        const metadata = {};

        // 1) <dl> format
        $('.view-dl dl').each((_, dl) => {
            const key = $(dl).find('dt').text().trim();
            const value = $(dl).find('dd').text().trim();
            if (key) metadata[key] = value;
        });

        // 2) <li> + <span class="it">KEY</span><span class="is">VALUE</span>
        // NOTE: Values are often inside <span class="is">. The previous approach removed ALL spans,
        // which also removed the value and resulted in empty fields.
        $('.view-txt li, .art-info li, .info-list li, ul li').each((_, li) => {
            const $li = $(li);
            const $key = $li.find('span.it, span.tit').first();
            if ($key.length) {
                const key = $key.text().replace(/[:\s]+$/, '').trim();
                let value = $li.find('span.is').first().text().trim();

                // Fallback for pages where value is not in span.is
                if (!value) {
                    const clone = $li.clone();
                    clone.find('span.it, span.tit').remove();
                    value = clone.text().trim();
                }

                if (key && value) metadata[key] = value;
            }
        });

        // fallback for artist
        if (!metadata['작가명'] && !metadata['작가']) {
            const artistFallback = $('.artist .name').text().trim();
            if (artistFallback) metadata['작가명'] = artistFallback;
        }

        // ---- Extract fields using KEY_MAP ----
        const artist = firstMatch(metadata, KEY_MAP.artist) || '';
        const date = firstMatch(metadata, KEY_MAP.date) || '';
        const medium = firstMatch(metadata, KEY_MAP.medium) || '';
        const dimensions = firstMatch(metadata, KEY_MAP.dimensions) || '';
        let category = firstMatch(metadata, KEY_MAP.category) || 'Artwork';

        // ---- Image URL ----
        const $img = $(
            '.view-img img, .art-view .img img, .iv-item img, .titem img, .swiper-slide img'
        ).first();
        const imageUrl = resolveImageUrl($img);

        // ---- Description ----
        let description = $('.view-cont, .art-desc').text().trim();
        description = description.replace(/작품설명\s*작품설명보기/g, '').trim();

        // ---- Clean values (remove leading punctuation/spaces) ----
        const clean = (s) => (s ? s.replace(/^[:\s]+/, '') : '');
        const cleanObj = {
            title: clean(title),
            artist: clean(artist),
            date: clean(date),
            medium: clean(medium),
            dimensions: clean(dimensions),
            category: clean(category),
        };

        // ---- Normalize category ----
        cleanObj.category = normalizeCategory(cleanObj.category);

        // If we have neither title nor artist, discard entry
        if (!cleanObj.title && !cleanObj.artist) return null;

        return {
            ...cleanObj,
            description,
            imageUrl,
            meta: metadata,
            source: museum.name,
            detailUrl: url,
        };
    } catch (e) {
        console.error(`Failed to scrape ${url}: ${e.message}`);
        return null;
    }
}

// ------------------------------------------------------------------
// Main Loop (Refresh CSRF + Detect consecutive empty pages)
// ------------------------------------------------------------------
async function scrapeMuseum(museum) {
    console.log(`=== Starting Scrape: ${museum.name} ===`);
    const client = createClient();

    let allArtworks = [];
    let page = 1;
    let hasMore = true;
    let emptyStreak = 0; // Consecutive empty page counter

    while (hasMore) {
        // Get fresh CSRF token every page
        const csrf = await getCsrfToken(client);

        const params = new URLSearchParams();
        if (csrf) params.append('_csrf', csrf);
        params.append('pageInfo.page', page);
        params.append('search.orderColumn', '');
        params.append('search.orderDirection', '');
        params.append('filter[0].filterTarget', 'FROMMUSEUM');
        params.append('filter[0].filterValue', museum.code);
        params.append('filter[1].filterTarget', 'ISSOURCE');
        params.append('filter[1].filterValue', 'ALL');

        // POST Request (with retries)
        const resp = await safeRequest(() =>
            client.post(`${BASE_URL}/workart/list`, params.toString(), {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    Referer: `${BASE_URL}/workart/list`,
                },
            })
        );

        const $ = cheerio.load(resp.data);
        const items = $('.art-list .item, .list li').toArray();

        // Check for empty items
        if (items.length === 0) {
            emptyStreak++;
            console.log(`Page ${page} has no items (Streak: ${emptyStreak}).`);
            if (emptyStreak >= 2) {
                hasMore = false;
                break;
            }
        } else {
            emptyStreak = 0; // reset
        }

        // Safety Break
        if (page > 50) {
            console.log('Reached safety limit of 50 pages.');
            hasMore = false;
            break;
        }

        console.log(`Processing Page ${page}... (${items.length} items found)`);

        for (const item of items) {
            try {
                const $item = $(item);
                const link = $item.find('a');
                let onclick = link.attr('onclick') || $item.attr('onclick');
                const href = link.attr('href');

                // If onclick missing but href is javascript call
                if (!onclick && href && href.startsWith('javascript:fnWorkartDetail')) {
                    onclick = href;
                }

                const match = onclick ? onclick.match(/fnWorkartDetail\('?(\d+)'?\)/) : null;
                if (!match) continue;

                const id = match[1];
                const detailUrl = `${BASE_URL}/workart/${id}`;

                const detail = await scrapeDetail(client, detailUrl, museum);
                if (detail) {
                    allArtworks.push(detail);
                }

                // Short delay to respect server
                await new Promise((r) => setTimeout(r, 120));
            } catch (e) {
                console.error('Item processing error:', e.message);
            }
        }

        page++;
    }

    console.log(`✅ ${museum.name}: Collected ${allArtworks.length} artworks.`);

    // ------------------------------------------------------------
    // Save File (Absolute Path)
    // ------------------------------------------------------------
    const PROJECT_ROOT = path.resolve(__dirname, '..');
    const outputPath = path.join(PROJECT_ROOT, 'public', 'data', museum.file);
    fs.writeFileSync(outputPath, JSON.stringify(allArtworks, null, 2));
    console.log(`-> Saved to ${outputPath}`);
}

// ------------------------------------------------------------
// Target Museums
// ------------------------------------------------------------
const MUSEUMS = [
    {
        name: 'Lee Jung-seop Art Museum',
        code: 'CO-MUS-LJS',
        file: 'lee-jung-seop-collection.json',
    },
    {
        name: 'Gidang Art Museum',
        code: 'CO-MUS-GDM',
        file: 'gidang-collection.json',
    },
    {
        name: 'Soam Memorial Hall',
        code: 'CO-MUS-SAM',
        file: 'soam-memorial-collection.json',
    },
];

// ------------------------------------------------------------
// Main Execution
// ------------------------------------------------------------
(async () => {
    for (const m of MUSEUMS) {
        await scrapeMuseum(m);
        // Wait between museums
        await new Promise((r) => setTimeout(r, 2000));
    }
})();
