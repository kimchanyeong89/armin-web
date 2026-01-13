/**
 * Seoul Museum of Art (SeMA) Collection Scraper
 * Uses the Seoul Open API to fetch all 6,167 artworks
 * Uploads images to R2 and saves metadata to JSON
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

// Configuration
const API_KEY = '755350646863796b313033714d4c434b';
const API_BASE = 'http://openapi.seoul.go.kr:8088';
const SERVICE_NAME = 'SemaPsgudInfoEngInfo';
const BATCH_SIZE = 100;
const OUTPUT_DIR = path.join(__dirname, '..', 'public', 'data', 'collections');
const OUTPUT_FILE = 'seoul-museum-of-art-collection.json';

// R2 Configuration
const R2_ACCOUNT_ID = 'a73e1a7d2df053f99e1bc0e747851308';
const R2_BUCKET = 'armin-web';
const R2_PUBLIC_URL = 'https://pub-396fad1f96754c2f816f260faf970e63.r2.dev';
const R2_ACCESS_KEY = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_KEY = process.env.R2_SECRET_ACCESS_KEY;

// Load S3 client for R2 uploads
let S3Client, PutObjectCommand;

async function loadS3Dependencies() {
    try {
        const s3 = await import('@aws-sdk/client-s3');
        S3Client = s3.S3Client;
        PutObjectCommand = s3.PutObjectCommand;
        console.log('✅ S3 dependencies loaded');
        return true;
    } catch (e) {
        console.log('⚠️ S3 dependencies not available, will use original image URLs');
        return false;
    }
}

function createS3Client() {
    if (!S3Client || !R2_ACCESS_KEY || !R2_SECRET_KEY) return null;

    return new S3Client({
        region: 'auto',
        endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
        credentials: {
            accessKeyId: R2_ACCESS_KEY,
            secretAccessKey: R2_SECRET_KEY,
        },
    });
}

async function fetchJSON(url) {
    return new Promise((resolve, reject) => {
        const client = url.startsWith('https') ? https : http;
        client.get(url, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    reject(new Error(`Failed to parse JSON: ${e.message}`));
                }
            });
        }).on('error', reject);
    });
}

async function fetchImage(url) {
    return new Promise((resolve, reject) => {
        const client = url.startsWith('https') ? https : http;
        client.get(url, (res) => {
            if (res.statusCode === 301 || res.statusCode === 302) {
                return fetchImage(res.headers.location).then(resolve).catch(reject);
            }
            const chunks = [];
            res.on('data', chunk => chunks.push(chunk));
            res.on('end', () => resolve(Buffer.concat(chunks)));
        }).on('error', reject);
    });
}

async function uploadToR2(s3Client, imageBuffer, key) {
    if (!s3Client) return null;

    try {
        await s3Client.send(new PutObjectCommand({
            Bucket: R2_BUCKET,
            Key: key,
            Body: imageBuffer,
            ContentType: 'image/jpeg',
        }));
        return `${R2_PUBLIC_URL}/${key}`;
    } catch (e) {
        console.error(`Failed to upload ${key}:`, e.message);
        return null;
    }
}

function generateArtworkId(index, title) {
    const slug = (title || 'untitled')
        .toLowerCase()
        .replace(/[^a-z0-9가-힣]+/g, '-')
        .replace(/^-|-$/g, '')
        .substring(0, 30);
    return `sema-${String(index).padStart(5, '0')}-${slug}`;
}

function sanitizeFilename(title) {
    return (title || 'untitled')
        .replace(/[^a-zA-Z0-9가-힣\s-]/g, '')
        .replace(/\s+/g, '-')
        .toLowerCase()
        .substring(0, 50);
}

async function fetchAllArtworks() {
    console.log('📊 Fetching total count...');

    // Get total count
    const initialUrl = `${API_BASE}/${API_KEY}/json/${SERVICE_NAME}/1/1/`;
    const initialData = await fetchJSON(initialUrl);

    if (!initialData[SERVICE_NAME] || initialData[SERVICE_NAME].RESULT?.CODE !== 'INFO-000') {
        throw new Error(`API Error: ${JSON.stringify(initialData)}`);
    }

    const totalCount = initialData[SERVICE_NAME].list_total_count;
    console.log(`📚 Total artworks: ${totalCount}`);

    const allArtworks = [];
    const batches = Math.ceil(totalCount / BATCH_SIZE);

    for (let i = 0; i < batches; i++) {
        const start = i * BATCH_SIZE + 1;
        const end = Math.min((i + 1) * BATCH_SIZE, totalCount);

        console.log(`📥 Fetching batch ${i + 1}/${batches} (${start}-${end})...`);

        const url = `${API_BASE}/${API_KEY}/json/${SERVICE_NAME}/${start}/${end}/`;

        try {
            const data = await fetchJSON(url);

            if (data[SERVICE_NAME]?.row) {
                allArtworks.push(...data[SERVICE_NAME].row);
            }

            // Small delay to be nice to the API
            await new Promise(r => setTimeout(r, 100));
        } catch (e) {
            console.error(`Error fetching batch ${i + 1}:`, e.message);
            // Retry once
            await new Promise(r => setTimeout(r, 1000));
            try {
                const data = await fetchJSON(url);
                if (data[SERVICE_NAME]?.row) {
                    allArtworks.push(...data[SERVICE_NAME].row);
                }
            } catch (e2) {
                console.error(`Retry failed for batch ${i + 1}:`, e2.message);
            }
        }
    }

    console.log(`✅ Fetched ${allArtworks.length} artworks`);
    return allArtworks;
}

async function processArtworks(rawArtworks, s3Client) {
    const processed = [];
    const uploadToR2Flag = !!s3Client;

    console.log(`\n🖼️ Processing ${rawArtworks.length} artworks...`);
    console.log(`📤 R2 uploads: ${uploadToR2Flag ? 'ENABLED' : 'DISABLED (using original URLs)'}\n`);

    for (let i = 0; i < rawArtworks.length; i++) {
        const raw = rawArtworks[i];

        const id = generateArtworkId(i + 1, raw.prdct_nm_korean || raw.prdct_nm_eng);
        const titleKorean = raw.prdct_nm_korean || '';
        const titleEnglish = raw.prdct_nm_eng || titleKorean;

        // Determine final image URL
        let finalImageUrl = raw.main_image || raw.thumb_image || '';

        // Upload to R2 if enabled
        if (uploadToR2Flag && finalImageUrl) {
            try {
                const imageBuffer = await fetchImage(finalImageUrl);
                const filename = sanitizeFilename(titleKorean || titleEnglish);
                const r2Key = `galleries/seoul-museum-of-art/artworks/${filename}-${i + 1}.jpg`;

                const r2Url = await uploadToR2(s3Client, imageBuffer, r2Key);
                if (r2Url) {
                    finalImageUrl = r2Url;
                }

                if ((i + 1) % 100 === 0) {
                    console.log(`📤 Uploaded ${i + 1}/${rawArtworks.length} images...`);
                }
            } catch (e) {
                // Keep original URL on error
                console.error(`⚠️ Image upload failed for ${id}:`, e.message);
            }
        }

        const artwork = {
            id,
            title: titleEnglish || titleKorean,
            titleKorean,
            titleEnglish,
            artistName: raw.writr_nm || 'Unknown Artist',
            year: raw.mnfct_year || null,
            dimensions: raw.prdct_stndrd || null,
            medium: raw.matrl_technic || null,
            category: raw.prdct_cl_nm || null,
            image: finalImageUrl,
            thumbnailImage: raw.thumb_image || null,
        };

        processed.push(artwork);

        // Progress every 500
        if ((i + 1) % 500 === 0) {
            console.log(`✨ Processed ${i + 1}/${rawArtworks.length} artworks...`);
        }
    }

    return processed;
}

async function main() {
    console.log('🏛️ Seoul Museum of Art (SeMA) Collection Scraper');
    console.log('================================================\n');

    // Load dependencies
    const hasS3 = await loadS3Dependencies();
    const s3Client = hasS3 ? createS3Client() : null;

    if (!s3Client) {
        console.log('⚠️ R2 upload disabled - using original image URLs\n');
    }

    // Ensure output directory exists
    if (!fs.existsSync(OUTPUT_DIR)) {
        fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }

    // Fetch all artworks from API
    const rawArtworks = await fetchAllArtworks();

    // Process and upload
    const processedArtworks = await processArtworks(rawArtworks, s3Client);

    // Sort by category then by title
    processedArtworks.sort((a, b) => {
        const catA = a.category || '';
        const catB = b.category || '';
        if (catA !== catB) return catA.localeCompare(catB, 'ko');
        return (a.title || '').localeCompare(b.title || '', 'ko');
    });

    // Generate category stats
    const categoryStats = {};
    for (const art of processedArtworks) {
        const cat = art.category || 'Unknown';
        categoryStats[cat] = (categoryStats[cat] || 0) + 1;
    }

    // Save to JSON
    const outputPath = path.join(OUTPUT_DIR, OUTPUT_FILE);
    fs.writeFileSync(outputPath, JSON.stringify(processedArtworks, null, 2));

    console.log('\n📊 Collection Statistics:');
    console.log('========================');
    console.log(`Total artworks: ${processedArtworks.length}`);
    console.log('\nBy category:');
    Object.entries(categoryStats)
        .sort((a, b) => b[1] - a[1])
        .forEach(([cat, count]) => {
            console.log(`  ${cat}: ${count}`);
        });

    console.log(`\n✅ Saved to: ${outputPath}`);
    console.log('\n🎉 Done!');
}

main().catch(console.error);
