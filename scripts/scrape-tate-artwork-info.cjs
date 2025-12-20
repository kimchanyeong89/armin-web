/**
 * Scrape Tate Britain Artwork Information
 * 
 * Fetches detailed artwork info from individual Tate artwork pages:
 * - Artist full name
 * - Artwork title
 * - Year (4-digit number only)
 * - Image URL (validates it's not blank/white)
 * 
 * Downloads images and uploads to R2 for permanent storage.
 * 
 * Target displays:
 * - JMW Turner
 * - Historic and Early Modern British Art
 * - Modern and Contemporary British Art
 * - Art Around the Building
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const DISPLAYS_FILE = path.join(__dirname, '../public/data/tate-britain.json');
const IMAGES_DIR = path.join(__dirname, '../temp-tate-images');
const R2_WORKER_URL = 'https://armin-r2-upload.kietzsche.workers.dev';

// Target display IDs
const TARGET_DISPLAYS = [
    'tate-britain-display-jmw-turner',
    'tate-britain-display-historic-early-modern',
    'tate-britain-display-modern-contemporary',
    'tate-britain-display-art-around-building'
];

// Ensure temp images directory exists
if (!fs.existsSync(IMAGES_DIR)) {
    fs.mkdirSync(IMAGES_DIR, { recursive: true });
}

/**
 * Extract 4-digit year from date text
 */
function extractYear(dateText) {
    if (!dateText) return null;
    const match = dateText.match(/\b([12]\d{3})\b/);
    return match ? match[1] : null;
}

/**
 * Fetch artwork details from Tate artwork page
 */
async function fetchArtworkDetails(page, artworkUrl) {
    const result = {
        title: null,
        artist: null,
        year: null,
        imageUrl: null
    };

    try {
        await page.goto(artworkUrl, { waitUntil: 'networkidle', timeout: 30000 });

        // Wait for the main content to load
        await page.waitForSelector('h1', { timeout: 10000 }).catch(() => { });

        const details = await page.evaluate(() => {
            const data = {
                title: null,
                artist: null,
                dateText: null,
                imageUrl: null
            };

            // Get title from h1
            const h1 = document.querySelector('h1');
            if (h1) {
                data.title = h1.textContent.trim();
            }

            // Get artist name - look for "More by [Artist Name]" link
            const artistLink = document.querySelector('a[aria-label^="More by"]');
            if (artistLink) {
                data.artist = artistLink.textContent.trim();
            }

            // Alternative: get artist from page text structure
            if (!data.artist) {
                // Look for the artist name near the title
                const heroSection = document.querySelector('.artwork-hero, .artwork-page-hero, [class*="artwork-hero"]');
                if (heroSection) {
                    const text = heroSection.innerText;
                    // Pattern: Title\nc.1799, More by Artist Name
                    const artistMatch = text.match(/More by\s+(.+?)(?:\n|$)/i);
                    if (artistMatch) {
                        data.artist = artistMatch[1].trim();
                    }
                }
            }

            // Get date text
            const pageText = document.body.innerText;

            // Pattern 1: "c.1799" or "1799" near "More by"
            let dateMatch = pageText.match(/\b(c\.?\s*)?([12]\d{3})(?:–\d+)?\s*,?\s*More by/i);
            if (dateMatch) {
                data.dateText = dateMatch[1] ? `c.${dateMatch[2]}` : dateMatch[2];
            }

            // Pattern 2: Just look for year before comma
            if (!data.dateText) {
                const titleMatch = pageText.match(/^(.+?)\s*(c\.?\s*)?([12]\d{3})/m);
                if (titleMatch && titleMatch[3]) {
                    data.dateText = titleMatch[2] ? `c.${titleMatch[3]}` : titleMatch[3];
                }
            }

            // Get image URL
            const artworkImg = document.querySelector('.artwork-image__container img, [class*="artwork-image"] img, img[alt]');
            if (artworkImg) {
                // Get the largest available image
                data.imageUrl = artworkImg.src;

                // Try to get high-res version
                if (data.imageUrl) {
                    // Replace size suffix with larger version
                    data.imageUrl = data.imageUrl.replace(/_\d+\.jpg/i, '_10.jpg');
                }
            }

            return data;
        });

        result.title = details.title;
        result.artist = details.artist;
        result.year = extractYear(details.dateText);
        result.imageUrl = details.imageUrl;

        // Build high-res image URL from artwork ID if not found
        if (!result.imageUrl && artworkUrl) {
            const idMatch = artworkUrl.match(/([a-z]\d+)$/);
            if (idMatch) {
                const tateId = idMatch[1].toUpperCase();
                const prefix = tateId.charAt(0);
                const midPart = tateId.substring(0, 3);
                result.imageUrl = `https://media.tate.org.uk/art/images/work/${prefix}/${midPart}/${tateId}_10.jpg`;
            }
        }

    } catch (error) {
        console.error(`Error fetching ${artworkUrl}:`, error.message);
    }

    return result;
}

/**
 * Download image and check if it's valid (not blank/white)
 */
async function downloadAndValidateImage(imageUrl) {
    return new Promise((resolve) => {
        if (!imageUrl) {
            resolve(null);
            return;
        }

        const protocol = imageUrl.startsWith('https') ? https : http;
        const options = {
            timeout: 30000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
            }
        };

        const request = protocol.get(imageUrl, options, (response) => {
            if (response.statusCode === 301 || response.statusCode === 302) {
                // Follow redirect
                downloadAndValidateImage(response.headers.location).then(resolve);
                return;
            }

            if (response.statusCode !== 200) {
                resolve(null);
                return;
            }

            const chunks = [];
            response.on('data', (chunk) => chunks.push(chunk));
            response.on('end', () => {
                const buffer = Buffer.concat(chunks);

                // Check if image is too small (likely placeholder)
                if (buffer.length < 5000) {
                    resolve(null);
                    return;
                }

                // Basic check for mostly white/blank images
                // JPEG files start with FFD8
                if (buffer[0] === 0xFF && buffer[1] === 0xD8) {
                    // Count bytes to estimate image content
                    let nonWhitePixels = 0;
                    for (let i = 0; i < Math.min(buffer.length, 10000); i++) {
                        if (buffer[i] < 240) nonWhitePixels++;
                    }

                    // If more than 20% of sampled bytes are non-white, consider it valid
                    if (nonWhitePixels / Math.min(buffer.length, 10000) < 0.2) {
                        resolve(null);
                        return;
                    }
                }

                resolve(buffer);
            });
        });

        request.on('error', () => resolve(null));
        request.on('timeout', () => {
            request.destroy();
            resolve(null);
        });
    });
}

/**
 * Upload image buffer to R2
 */
async function uploadToR2(imageBuffer, filename) {
    try {
        const FormData = (await import('form-data')).default;
        const fetch = (await import('node-fetch')).default;

        const formData = new FormData();
        formData.append('file', imageBuffer, { filename: `${filename}.jpg`, contentType: 'image/jpeg' });
        formData.append('exhibitionId', 'tate-britain-display');
        formData.append('submissionId', filename);

        const response = await fetch(`${R2_WORKER_URL}/upload`, {
            method: 'POST',
            body: formData.getBuffer(),
            headers: formData.getHeaders()
        });

        if (response.ok) {
            const result = await response.json();
            return result.url;
        }
    } catch (error) {
        console.error('R2 upload error:', error.message);
    }
    return null;
}

/**
 * Save image locally as backup
 */
function saveImageLocally(imageBuffer, tateId) {
    const filepath = path.join(IMAGES_DIR, `${tateId}.jpg`);
    fs.writeFileSync(filepath, imageBuffer);
    return filepath;
}

async function main() {
    console.log('=== Scraping Tate Britain Artwork Details ===\n');

    const data = JSON.parse(fs.readFileSync(DISPLAYS_FILE, 'utf-8'));
    const items = data.items || [];

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });
    const page = await context.newPage();

    let totalProcessed = 0;
    let totalUpdated = 0;
    let imagesDownloaded = 0;
    let imagesSkipped = 0;

    for (const item of items) {
        // Only process target displays
        if (!TARGET_DISPLAYS.includes(item.id)) continue;

        console.log(`\n📁 Processing: ${item.title || item.id}`);
        console.log('='.repeat(50));

        if (!Array.isArray(item.rooms)) continue;

        for (const room of item.rooms) {
            if (!Array.isArray(room.artworks)) continue;

            console.log(`\n  🏛️  Room: ${room.name} (${room.artworks.length} artworks)`);

            for (let i = 0; i < room.artworks.length; i++) {
                const artwork = room.artworks[i];
                const url = artwork.url;

                if (!url) {
                    console.log(`    ⏭️  [${i + 1}] No URL, skipping`);
                    continue;
                }

                totalProcessed++;

                // Check if already has complete info
                const hasTitle = artwork.title && artwork.title !== 'Untitled' && !artwork.title.includes('\n');
                const hasArtist = artwork.artist && artwork.artist.length > 3;
                const hasYear = artwork.year && /^\d{4}$/.test(artwork.year);
                const hasValidImage = artwork.r2Image || (artwork.image && !artwork.image.includes('_10.jpg'));

                if (hasTitle && hasArtist && hasYear && hasValidImage) {
                    process.stdout.write(`    ✓ [${i + 1}] Already complete\r`);
                    continue;
                }

                // Fetch artwork details
                console.log(`    🔍 [${i + 1}] Fetching ${url.split('/').pop()}...`);

                const details = await fetchArtworkDetails(page, url);

                let updated = false;

                // Update title
                if (details.title && (!hasTitle || artwork.title === 'Untitled')) {
                    artwork.title = details.title;
                    updated = true;
                }

                // Update artist
                if (details.artist && !hasArtist) {
                    artwork.artist = details.artist;
                    updated = true;
                }

                // Update year (4-digit only)
                if (details.year && !hasYear) {
                    artwork.year = details.year;
                    updated = true;
                }

                // Download and validate image
                if (details.imageUrl && !hasValidImage) {
                    const imageBuffer = await downloadAndValidateImage(details.imageUrl);

                    if (imageBuffer) {
                        // Extract Tate ID for filename
                        const idMatch = url.match(/([a-z]\d+)$/);
                        const tateId = idMatch ? idMatch[1].toUpperCase() : `artwork-${i}`;

                        // Save locally first
                        const localPath = saveImageLocally(imageBuffer, tateId);
                        console.log(`       📥 Downloaded: ${tateId}.jpg (${Math.round(imageBuffer.length / 1024)}KB)`);

                        // Set local path for now (R2 upload can be done in batch later)
                        artwork.image = details.imageUrl;
                        artwork.localImage = localPath;
                        imagesDownloaded++;
                        updated = true;
                    } else {
                        console.log(`       ⚠️  Invalid/blank image, skipping`);
                        imagesSkipped++;
                    }
                }

                if (updated) {
                    totalUpdated++;
                    console.log(`       ✅ Updated: "${details.title}" by ${details.artist || 'Unknown'} (${details.year || 'year unknown'})`);
                }

                // Small delay to be respectful
                await new Promise(r => setTimeout(r, 500));
            }
        }
    }

    await browser.close();

    // Save updated data
    fs.writeFileSync(DISPLAYS_FILE, JSON.stringify(data, null, 2));

    console.log('\n' + '='.repeat(50));
    console.log('=== Summary ===');
    console.log(`Total processed: ${totalProcessed}`);
    console.log(`Total updated: ${totalUpdated}`);
    console.log(`Images downloaded: ${imagesDownloaded}`);
    console.log(`Images skipped (blank/invalid): ${imagesSkipped}`);
    console.log(`\nData saved to: ${DISPLAYS_FILE}`);
    console.log(`Images saved to: ${IMAGES_DIR}`);
}

main().catch(console.error);
