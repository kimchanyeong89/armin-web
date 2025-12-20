/**
 * Generate exhibition placeholder images and upload to R2
 * 
 * This script generates simple placeholder images for exhibitions
 * and uploads them to Cloudflare R2.
 */

import * as fs from 'fs';
import * as path from 'path';
import sharp from 'sharp';
import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';

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

interface ExhibitionConfig {
    exhibitionId: string;
    gallerySlug: string;
    name: string;
    color?: string;
}

// Color palette for different galleries
const galleryColors: Record<string, string> = {
    'npg': '#1a365d',           // Dark Blue
    'tate-liverpool': '#dc2626', // Red
    'tate-st-ives': '#0891b2',   // Cyan
    'ashmolean': '#7c3aed',      // Purple
    'fitzwilliam': '#059669',    // Green
    'scottish-national': '#0369a1', // Blue
    'royal-academy': '#b91c1c',  // Dark Red
    'wallace': '#92400e',        // Brown
    'serpentine': '#15803d',     // Forest Green
    'dulwich': '#4338ca',        // Indigo
    'courtauld': '#be185d',      // Pink
    'whitechapel': '#000000',    // Black
    'manchester': '#c2410c',     // Orange
    'walker': '#7c2d12',         // Dark Brown
    'sngma': '#1e40af',          // Royal Blue
};

// All exhibitions that need images
const exhibitions: ExhibitionConfig[] = [
    // NPG
    { exhibitionId: 'npg-temp-1', gallerySlug: 'npg', name: 'Francis Bacon: Human Presence' },
    { exhibitionId: 'npg-temp-2', gallerySlug: 'npg', name: 'Taylor Wessing Photo Portrait Prize 2024' },
    { exhibitionId: 'npg-temp-3', gallerySlug: 'npg', name: 'Cecil Beaton\'s Fashionable World' },
    { exhibitionId: 'npg-temp-4', gallerySlug: 'npg', name: 'Lucian Freud: Drawing into Painting' },

    // Tate Liverpool
    { exhibitionId: 'tl-t1', gallerySlug: 'tate-liverpool', name: 'The Plant that Stowed Away' },
    { exhibitionId: 'tl-t2', gallerySlug: 'tate-liverpool', name: 'Liverpool Biennial 2025' },
    { exhibitionId: 'tl-t3', gallerySlug: 'tate-liverpool', name: 'Ugo Rondinone: Liverpool Mountain' },

    // Tate St Ives
    { exhibitionId: 'tsi-t1', gallerySlug: 'tate-st-ives', name: 'Ithell Colquhoun' },
    { exhibitionId: 'tsi-t2', gallerySlug: 'tate-st-ives', name: 'Liliane Lijn: Arise Alive' },
    { exhibitionId: 'tsi-t3', gallerySlug: 'tate-st-ives', name: 'Emma Critchley: Soundings' },
    { exhibitionId: 'tsi-t4', gallerySlug: 'tate-st-ives', name: 'Emilija Škarnulytė' },

    // Ashmolean
    { exhibitionId: 'ash-t1', gallerySlug: 'ashmolean', name: 'Kabuki Kimono' },
    { exhibitionId: 'ash-t2', gallerySlug: 'ashmolean', name: 'Anselm Kiefer: Early Works' },
    { exhibitionId: 'ash-t3', gallerySlug: 'ashmolean', name: 'Stanley Donwood & Radiohead' },
    { exhibitionId: 'ash-t4', gallerySlug: 'ashmolean', name: 'IN BLOOM' },

    // Fitzwilliam
    { exhibitionId: 'fitz-t1', gallerySlug: 'fitzwilliam', name: 'Rise Up: Resistance, Revolution, Abolition' },
    { exhibitionId: 'fitz-t2', gallerySlug: 'fitzwilliam', name: 'Discovering Dürer' },
    { exhibitionId: 'fitz-t3', gallerySlug: 'fitzwilliam', name: 'Made in Ancient Egypt' },
    { exhibitionId: 'fitz-t4', gallerySlug: 'fitzwilliam', name: 'Bound Together' },

    // Scottish National Gallery
    { exhibitionId: 'sng-t1', gallerySlug: 'scottish-national', name: 'Turner in January' },
    { exhibitionId: 'sng-t2', gallerySlug: 'scottish-national', name: 'Your Art World' },
    { exhibitionId: 'sng-t3', gallerySlug: 'scottish-national', name: 'Andy Goldsworthy: Fifty Years' },

    // Royal Academy
    { exhibitionId: 'ra-t1', gallerySlug: 'royal-academy', name: 'Brasil! The Birth of Modernism' },
    { exhibitionId: 'ra-t2', gallerySlug: 'royal-academy', name: 'Victor Hugo Drawings' },
    { exhibitionId: 'ra-t3', gallerySlug: 'royal-academy', name: 'Summer Exhibition 2025' },
    { exhibitionId: 'ra-t4', gallerySlug: 'royal-academy', name: 'Kiefer/Van Gogh' },
    { exhibitionId: 'ra-t5', gallerySlug: 'royal-academy', name: 'Kerry James Marshall' },

    // Wallace Collection
    { exhibitionId: 'wc-t1', gallerySlug: 'wallace', name: 'Clocks by Boulle' },
    { exhibitionId: 'wc-t2', gallerySlug: 'wallace', name: 'Grayson Perry: Delusions of Grandeur' },
    { exhibitionId: 'wc-t3', gallerySlug: 'wallace', name: 'Caravaggio\'s Cupid' },

    // Serpentine
    { exhibitionId: 'serp-t1', gallerySlug: 'serpentine', name: 'Dr Esther Mahlangu' },
    { exhibitionId: 'serp-t2', gallerySlug: 'serpentine', name: 'Arpita Singh: Remembering' },
    { exhibitionId: 'serp-t3', gallerySlug: 'serpentine', name: 'Giuseppe Penone' },
    { exhibitionId: 'serp-t4', gallerySlug: 'serpentine', name: 'THE DELUSION' },
    { exhibitionId: 'serp-t5', gallerySlug: 'serpentine', name: 'Peter Doig: House of Music' },

    // Dulwich
    { exhibitionId: 'dpg-t1', gallerySlug: 'dulwich', name: 'Tirzah Garwood: Beyond Ravilious' },
    { exhibitionId: 'dpg-t2', gallerySlug: 'dulwich', name: 'Somaya Critchlow: The Chamber' },
    { exhibitionId: 'dpg-t3', gallerySlug: 'dulwich', name: 'Rachel Jones: Gated Canyons' },
    { exhibitionId: 'dpg-t4', gallerySlug: 'dulwich', name: 'Anna Ancher: Painting Light' },

    // Courtauld
    { exhibitionId: 'cg-t1', gallerySlug: 'courtauld', name: 'Goya to Impressionism' },
    { exhibitionId: 'cg-t2', gallerySlug: 'courtauld', name: 'Henri Michaux: The Mescaline Drawings' },
    { exhibitionId: 'cg-t3', gallerySlug: 'courtauld', name: 'The Barber in London' },
    { exhibitionId: 'cg-t4', gallerySlug: 'courtauld', name: 'Abstract Erotic' },
    { exhibitionId: 'cg-t5', gallerySlug: 'courtauld', name: 'Wayne Thiebaud: American Still Life' },

    // Whitechapel
    { exhibitionId: 'wg-t1', gallerySlug: 'whitechapel', name: '15 Years of Duchamp & Sons' },
    { exhibitionId: 'wg-t2', gallerySlug: 'whitechapel', name: 'Donald Rodney: Visceral Canker' },
    { exhibitionId: 'wg-t3', gallerySlug: 'whitechapel', name: 'Hamad Butt: Apprehensions' },
    { exhibitionId: 'wg-t4', gallerySlug: 'whitechapel', name: 'The London Open Live' },
    { exhibitionId: 'wg-t5', gallerySlug: 'whitechapel', name: 'Joy Gregory' },

    // Manchester
    { exhibitionId: 'mag-t1', gallerySlug: 'manchester', name: 'Trading Station' },
    { exhibitionId: 'mag-t2', gallerySlug: 'manchester', name: 'Holly Graham: The Warp/The Weft/The Wake' },

    // Walker
    { exhibitionId: 'wag-t1', gallerySlug: 'walker', name: 'Conversations' },
    { exhibitionId: 'wag-t2', gallerySlug: 'walker', name: 'Vivienne Westwood: Designer in Focus' },
    { exhibitionId: 'wag-t3', gallerySlug: 'walker', name: 'John Moores Painting Prize 2025' },
    { exhibitionId: 'wag-t4', gallerySlug: 'walker', name: 'Turner: Always Contemporary' },

    // SNGMA
    { exhibitionId: 'sngma-t1', gallerySlug: 'sngma', name: 'Women in Revolt!' },
    { exhibitionId: 'sngma-t2', gallerySlug: 'sngma', name: 'Bruce McLean: I Want My Crown' },
    { exhibitionId: 'sngma-t3', gallerySlug: 'sngma', name: 'Ian Hamilton Finlay' },
    { exhibitionId: 'sngma-t4', gallerySlug: 'sngma', name: 'Resistance' },
    { exhibitionId: 'sngma-t5', gallerySlug: 'sngma', name: 'ARTIST ROOMS' },
];

function hexToRgb(hex: string): { r: number; g: number; b: number } {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : { r: 100, g: 100, b: 100 };
}

async function createPlaceholderImage(name: string, color: string): Promise<Buffer> {
    const width = 400;
    const height = 500;

    const rgb = hexToRgb(color);

    // Create gradient SVG with text
    const svg = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:rgb(${rgb.r},${rgb.g},${rgb.b});stop-opacity:1" />
          <stop offset="100%" style="stop-color:rgb(${Math.max(0, rgb.r - 40)},${Math.max(0, rgb.g - 40)},${Math.max(0, rgb.b - 40)});stop-opacity:1" />
        </linearGradient>
      </defs>
      <rect width="100%" height="100%" fill="url(#grad)"/>
      <text 
        x="50%" 
        y="50%" 
        font-family="Arial, sans-serif" 
        font-size="24" 
        font-weight="bold"
        fill="white" 
        text-anchor="middle" 
        dominant-baseline="middle"
        style="filter: drop-shadow(2px 2px 4px rgba(0,0,0,0.5))"
      >
        ${escapeXml(name.length > 30 ? name.substring(0, 27) + '...' : name)}
      </text>
      <text 
        x="50%" 
        y="90%" 
        font-family="Arial, sans-serif" 
        font-size="12" 
        fill="rgba(255,255,255,0.7)" 
        text-anchor="middle"
      >
        EXHIBITION
      </text>
    </svg>
  `;

    return sharp(Buffer.from(svg))
        .webp({ quality: 85 })
        .toBuffer();
}

function escapeXml(str: string): string {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

async function checkExists(key: string): Promise<boolean> {
    try {
        await s3Client.send(new HeadObjectCommand({
            Bucket: R2_BUCKET_NAME,
            Key: key,
        }));
        return true;
    } catch {
        return false;
    }
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

async function processExhibition(config: ExhibitionConfig, skipExisting = true): Promise<string | null> {
    const r2Key = `exhibitions/${config.gallerySlug}/${config.exhibitionId}.webp`;
    const r2Url = `${R2_PUBLIC_URL}/${r2Key}`;

    console.log(`📷 Processing: ${config.name} (${config.exhibitionId})`);

    // Check if already exists
    if (skipExisting) {
        const exists = await checkExists(r2Key);
        if (exists) {
            console.log(`  ⏭️  Already exists`);
            return r2Url;
        }
    }

    // Generate placeholder
    const color = galleryColors[config.gallerySlug] || '#374151';

    try {
        const imageBuffer = await createPlaceholderImage(config.name, color);
        console.log(`  ✓ Generated placeholder (${Math.round(imageBuffer.byteLength / 1024)}KB)`);

        // Upload to R2
        await uploadToR2(imageBuffer, r2Key);
        console.log(`  ✅ Uploaded to R2`);

        return r2Url;
    } catch (error) {
        console.error(`  ❌ Error:`, error);
        return null;
    }
}

async function main() {
    console.log('🖼️  Exhibition Placeholder Image Generator');
    console.log('==========================================\n');
    console.log(`Total exhibitions: ${exhibitions.length}`);
    console.log(`R2 Bucket: ${R2_BUCKET_NAME}\n`);

    const urlMapping: Record<string, string> = {};
    let successCount = 0;

    for (const config of exhibitions) {
        const url = await processExhibition(config, false); // Don't skip existing for now
        if (url) {
            urlMapping[config.exhibitionId] = url;
            successCount++;
        }
    }

    console.log('\n\n========== SUMMARY ==========');
    console.log(`✅ Successful: ${successCount}/${exhibitions.length}`);

    // Save mapping to JSON
    const outputPath = path.join(__dirname, '../public/data/exhibition-image-urls.json');
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, JSON.stringify(urlMapping, null, 2));
    console.log(`📁 Saved URL mapping to: ${outputPath}`);

    // Generate code snippet for updating exhibitions.js
    console.log('\n\n========== ADD TO EXHIBITIONS.JS ==========');
    console.log('Add "image" property to each exhibition:\n');

    for (const [id, url] of Object.entries(urlMapping)) {
        console.log(`  // ${id}`);
        console.log(`  image: "${url}",`);
    }
}

main().catch(console.error);
