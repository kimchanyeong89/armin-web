/**
 * Scrape real exhibition images from gallery websites and upload to R2
 * 
 * This script visits gallery websites, extracts actual exhibition poster images,
 * and uploads them to Cloudflare R2.
 */

import * as fs from 'fs';
import * as path from 'path';
import sharp from 'sharp';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import * as cheerio from 'cheerio';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || 'armin-gallery';
const R2_PUBLIC_URL = 'https://pub-396fad1f96754c2f816f260faf970e63.r2.dev';

const s3Client = new S3Client({
    region: 'auto',
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
        accessKeyId: R2_ACCESS_KEY_ID || '',
        secretAccessKey: R2_SECRET_ACCESS_KEY || '',
    },
});

interface ExhibitionSource {
    exhibitionId: string;
    gallerySlug: string;
    name: string;
    pageUrl: string;
    imageSelector?: string;
}

// Exhibition pages to scrape
const exhibitionSources: ExhibitionSource[] = [
    // Courtauld Gallery
    {
        exhibitionId: 'cg-t1', gallerySlug: 'courtauld', name: 'Goya to Impressionism',
        pageUrl: 'https://courtauld.ac.uk/whats-on/goya-to-impressionism/'
    },
    {
        exhibitionId: 'cg-t5', gallerySlug: 'courtauld', name: 'Wayne Thiebaud',
        pageUrl: 'https://courtauld.ac.uk/whats-on/exh-wayne-thiebaud-american-still-life/'
    },

    // Royal Academy
    {
        exhibitionId: 'ra-t1', gallerySlug: 'royal-academy', name: 'Brasil!',
        pageUrl: 'https://www.royalacademy.org.uk/exhibition/brasil-birth-modernism'
    },
    {
        exhibitionId: 'ra-t4', gallerySlug: 'royal-academy', name: 'Kiefer/Van Gogh',
        pageUrl: 'https://www.royalacademy.org.uk/exhibition/kiefer-van-gogh'
    },

    // Serpentine
    {
        exhibitionId: 'serp-t2', gallerySlug: 'serpentine', name: 'Arpita Singh',
        pageUrl: 'https://www.serpentinegalleries.org/whats-on/arpita-singh-remembering/'
    },
    {
        exhibitionId: 'serp-t5', gallerySlug: 'serpentine', name: 'Peter Doig',
        pageUrl: 'https://www.serpentinegalleries.org/whats-on/peter-doig-house-of-music/'
    },

    // Dulwich Picture Gallery
    {
        exhibitionId: 'dpg-t3', gallerySlug: 'dulwich', name: 'Rachel Jones',
        pageUrl: 'https://www.dulwichpicturegallery.org.uk/whats-on/exhibitions/2025/june/rachel-jones-gated-canyons/'
    },
    {
        exhibitionId: 'dpg-t4', gallerySlug: 'dulwich', name: 'Anna Ancher',
        pageUrl: 'https://www.dulwichpicturegallery.org.uk/whats-on/exhibitions/2025/november/anna-ancher-painting-light/'
    },

    // Walker Art Gallery
    {
        exhibitionId: 'wag-t4', gallerySlug: 'walker', name: 'Turner: Always Contemporary',
        pageUrl: 'https://www.liverpoolmuseums.org.uk/whatson/walker-art-gallery/exhibition/turner-always-contemporary'
    },

    // Tate St Ives
    {
        exhibitionId: 'tsi-t2', gallerySlug: 'tate-st-ives', name: 'Liliane Lijn',
        pageUrl: 'https://www.tate.org.uk/whats-on/tate-st-ives/liliane-lijn-arise-alive'
    },

    // Ashmolean
    {
        exhibitionId: 'ash-t2', gallerySlug: 'ashmolean', name: 'Anselm Kiefer',
        pageUrl: 'https://www.ashmolean.org/anselm-kiefer'
    },
    {
        exhibitionId: 'ash-t3', gallerySlug: 'ashmolean', name: 'Stanley Donwood & Radiohead',
        pageUrl: 'https://www.ashmolean.org/stanley-donwood'
    },

    // Wallace Collection
    {
        exhibitionId: 'wc-t2', gallerySlug: 'wallace', name: 'Grayson Perry',
        pageUrl: 'https://www.wallacecollection.org/whats-on/grayson-perry-delusions-of-grandeur/'
    },

    // Whitechapel Gallery
    {
        exhibitionId: 'wg-t2', gallerySlug: 'whitechapel', name: 'Donald Rodney',
        pageUrl: 'https://www.whitechapelgallery.org/exhibitions/donald-rodney-visceral-canker/'
    },

    // National Portrait Gallery
    {
        exhibitionId: 'npg-temp-1', gallerySlug: 'npg', name: 'Francis Bacon',
        pageUrl: 'https://www.npg.org.uk/whatson/exhibitions/francis-bacon-human-presence'
    },
];

const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

async function fetchPage(url: string): Promise<string | null> {
    try {
        console.log(`  Fetching page: ${url}`);
        const response = await fetch(url, {
            headers: {
                'User-Agent': USER_AGENT,
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
            },
        });

        if (!response.ok) {
            console.error(`  ❌ Page fetch failed: ${response.status}`);
            return null;
        }

        return await response.text();
    } catch (error) {
        console.error(`  ❌ Error fetching page:`, error);
        return null;
    }
}

function extractImageUrl(html: string, baseUrl: string): string | null {
    const $ = cheerio.load(html);

    // Try various selectors for exhibition images
    const selectors = [
        'meta[property="og:image"]',           // Open Graph image (most reliable)
        'meta[name="twitter:image"]',           // Twitter card image
        '.exhibition-hero img',
        '.hero-image img',
        '.exhibition-image img',
        '.banner-image img',
        'article img',
        '.main-image img',
        'picture source',
        '.header-image img',
    ];

    for (const selector of selectors) {
        const element = $(selector).first();
        if (element.length) {
            let imageUrl = element.attr('content') || element.attr('src') || element.attr('srcset')?.split(' ')[0];

            if (imageUrl) {
                // Convert relative URL to absolute
                if (imageUrl.startsWith('//')) {
                    imageUrl = 'https:' + imageUrl;
                } else if (imageUrl.startsWith('/')) {
                    const urlObj = new URL(baseUrl);
                    imageUrl = `${urlObj.protocol}//${urlObj.host}${imageUrl}`;
                }

                console.log(`  Found image via ${selector}: ${imageUrl.substring(0, 80)}...`);
                return imageUrl;
            }
        }
    }

    return null;
}

async function downloadImage(url: string): Promise<Buffer | null> {
    try {
        console.log(`  Downloading image...`);
        const response = await fetch(url, {
            headers: {
                'User-Agent': USER_AGENT,
                'Accept': 'image/*,*/*',
            },
        });

        if (!response.ok) {
            console.error(`  ❌ Image download failed: ${response.status}`);
            return null;
        }

        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        console.log(`  ✓ Downloaded ${Math.round(buffer.byteLength / 1024)}KB`);
        return buffer;
    } catch (error) {
        console.error(`  ❌ Download error:`, error);
        return null;
    }
}

async function convertToWebp(buffer: Buffer, width = 400, height = 500): Promise<Buffer> {
    return sharp(buffer)
        .resize(width, height, { fit: 'cover', position: 'center' })
        .webp({ quality: 85 })
        .toBuffer();
}

async function uploadToR2(buffer: Buffer, key: string): Promise<string> {
    const command = new PutObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: key,
        Body: buffer,
        ContentType: 'image/webp',
    });

    await s3Client.send(command);
    return `${R2_PUBLIC_URL}/${key}`;
}

async function processExhibition(source: ExhibitionSource): Promise<string | null> {
    const r2Key = `exhibitions/${source.gallerySlug}/${source.exhibitionId}.webp`;
    const r2Url = `${R2_PUBLIC_URL}/${r2Key}`;

    console.log(`\n📷 ${source.name} (${source.exhibitionId})`);

    // Fetch the exhibition page
    const html = await fetchPage(source.pageUrl);
    if (!html) return null;

    // Extract image URL
    const imageUrl = extractImageUrl(html, source.pageUrl);
    if (!imageUrl) {
        console.log(`  ⚠️  No image found on page`);
        return null;
    }

    // Download image
    const imageBuffer = await downloadImage(imageUrl);
    if (!imageBuffer) return null;

    // Convert and upload
    try {
        const webpBuffer = await convertToWebp(imageBuffer);
        console.log(`  ✓ Converted to WebP (${Math.round(webpBuffer.byteLength / 1024)}KB)`);

        await uploadToR2(webpBuffer, r2Key);
        console.log(`  ✅ Uploaded to R2: ${r2Key}`);

        return r2Url;
    } catch (error) {
        console.error(`  ❌ Processing error:`, error);
        return null;
    }
}

async function main() {
    console.log('🎨 Real Exhibition Image Scraper');
    console.log('=================================\n');
    console.log(`Total exhibitions to scrape: ${exhibitionSources.length}`);

    const results: Record<string, string> = {};
    let successCount = 0;

    for (const source of exhibitionSources) {
        const url = await processExhibition(source);
        if (url) {
            results[source.exhibitionId] = url;
            successCount++;
        }

        // Rate limiting delay
        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    console.log('\n\n========== SUMMARY ==========');
    console.log(`✅ Successful: ${successCount}/${exhibitionSources.length}`);

    // Save results
    const outputPath = path.join(__dirname, '../public/data/scraped-exhibition-images.json');
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
    console.log(`📁 Saved to: ${outputPath}`);

    // Print results for updating exhibitions.js
    console.log('\n\nUpdate exhibitions.js with these image URLs:');
    for (const [id, url] of Object.entries(results)) {
        console.log(`  "${id}": "${url}"`);
    }
}

main().catch(console.error);
