/**
 * Fetch exhibition poster images from gallery websites and upload to R2
 * 
 * This script:
 * 1. Searches for exhibition poster images using web search
 * 2. Downloads and converts them to WebP format
 * 3. Uploads them to Cloudflare R2
 * 4. Updates exhibitions.js with the R2 URLs
 */

import * as fs from 'fs';
import * as path from 'path';
import sharp from 'sharp';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import * as dotenv from 'dotenv';

dotenv.config();

const R2_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
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

// Exhibition images to fetch - mapping exhibition ID to search query
interface ExhibitionImage {
    exhibitionId: string;
    gallerySlug: string;
    searchQuery: string;
    imageUrl?: string; // Direct URL if known
}

const exhibitionImages: ExhibitionImage[] = [
    // Tate Liverpool
    { exhibitionId: 'tl-t1', gallerySlug: 'tate-liverpool', searchQuery: 'The Plant that Stowed Away Tate Liverpool exhibition poster' },
    { exhibitionId: 'tl-t2', gallerySlug: 'tate-liverpool', searchQuery: 'Liverpool Biennial 2025 exhibition poster' },
    { exhibitionId: 'tl-t3', gallerySlug: 'tate-liverpool', searchQuery: 'Ugo Rondinone Liverpool Mountain Tate' },

    // Tate St Ives
    { exhibitionId: 'tsi-t1', gallerySlug: 'tate-st-ives', searchQuery: 'Ithell Colquhoun Tate St Ives exhibition' },
    { exhibitionId: 'tsi-t2', gallerySlug: 'tate-st-ives', searchQuery: 'Liliane Lijn Arise Alive exhibition' },
    { exhibitionId: 'tsi-t3', gallerySlug: 'tate-st-ives', searchQuery: 'Emma Critchley Soundings Tate' },

    // Ashmolean Museum
    { exhibitionId: 'ash-t1', gallerySlug: 'ashmolean', searchQuery: 'Kabuki Kimono Bando Tamasaburo Ashmolean' },
    { exhibitionId: 'ash-t2', gallerySlug: 'ashmolean', searchQuery: 'Anselm Kiefer Early Works Ashmolean exhibition' },
    { exhibitionId: 'ash-t3', gallerySlug: 'ashmolean', searchQuery: 'Stanley Donwood Radiohead This Is What You Get Ashmolean' },

    // Fitzwilliam Museum
    { exhibitionId: 'fitz-t1', gallerySlug: 'fitzwilliam', searchQuery: 'Rise Up Resistance Revolution Abolition Fitzwilliam Museum' },
    { exhibitionId: 'fitz-t2', gallerySlug: 'fitzwilliam', searchQuery: 'Albrecht Durer prints Fitzwilliam Museum' },
    { exhibitionId: 'fitz-t3', gallerySlug: 'fitzwilliam', searchQuery: 'Made in Ancient Egypt Fitzwilliam exhibition' },

    // Scottish National Gallery
    { exhibitionId: 'sng-t1', gallerySlug: 'scottish-national', searchQuery: 'Turner Vaughan Bequest Scottish National Gallery' },
    { exhibitionId: 'sng-t3', gallerySlug: 'scottish-national', searchQuery: 'Andy Goldsworthy Fifty Years exhibition' },

    // Royal Academy
    { exhibitionId: 'ra-t1', gallerySlug: 'royal-academy', searchQuery: 'Brasil Birth of Modernism Royal Academy exhibition' },
    { exhibitionId: 'ra-t2', gallerySlug: 'royal-academy', searchQuery: 'Victor Hugo Drawings Royal Academy' },
    { exhibitionId: 'ra-t3', gallerySlug: 'royal-academy', searchQuery: 'Royal Academy Summer Exhibition 2025' },
    { exhibitionId: 'ra-t4', gallerySlug: 'royal-academy', searchQuery: 'Kiefer Van Gogh Royal Academy exhibition' },

    // Wallace Collection
    { exhibitionId: 'wc-t2', gallerySlug: 'wallace', searchQuery: 'Grayson Perry Delusions of Grandeur Wallace Collection' },
    { exhibitionId: 'wc-t3', gallerySlug: 'wallace', searchQuery: 'Caravaggio Cupid Amor Vincit Omnia' },

    // Serpentine Gallery
    { exhibitionId: 'serp-t1', gallerySlug: 'serpentine', searchQuery: 'Esther Mahlangu Serpentine mural' },
    { exhibitionId: 'serp-t2', gallerySlug: 'serpentine', searchQuery: 'Arpita Singh Remembering Serpentine exhibition' },
    { exhibitionId: 'serp-t3', gallerySlug: 'serpentine', searchQuery: 'Giuseppe Penone Serpentine exhibition' },
    { exhibitionId: 'serp-t5', gallerySlug: 'serpentine', searchQuery: 'Peter Doig House of Music Serpentine' },

    // Dulwich Picture Gallery
    { exhibitionId: 'dpg-t1', gallerySlug: 'dulwich', searchQuery: 'Tirzah Garwood Beyond Ravilious Dulwich exhibition' },
    { exhibitionId: 'dpg-t2', gallerySlug: 'dulwich', searchQuery: 'Somaya Critchlow The Chamber Dulwich' },
    { exhibitionId: 'dpg-t3', gallerySlug: 'dulwich', searchQuery: 'Rachel Jones Gated Canyons Dulwich' },
    { exhibitionId: 'dpg-t4', gallerySlug: 'dulwich', searchQuery: 'Anna Ancher Painting Light Dulwich' },

    // Courtauld Gallery
    { exhibitionId: 'cg-t1', gallerySlug: 'courtauld', searchQuery: 'Goya to Impressionism Oskar Reinhart Courtauld' },
    { exhibitionId: 'cg-t5', gallerySlug: 'courtauld', searchQuery: 'Wayne Thiebaud American Still Life Courtauld' },
    { exhibitionId: 'cg-p1', gallerySlug: 'courtauld', searchQuery: 'Monet London Views Thames Courtauld exhibition' },

    // Whitechapel Gallery
    { exhibitionId: 'wg-t2', gallerySlug: 'whitechapel', searchQuery: 'Donald Rodney Visceral Canker Whitechapel' },
    { exhibitionId: 'wg-t5', gallerySlug: 'whitechapel', searchQuery: 'Joy Gregory Catching Flies Honey Whitechapel' },

    // Manchester Art Gallery
    { exhibitionId: 'mag-t1', gallerySlug: 'manchester', searchQuery: 'Trading Station Hot Drinks Manchester Art Gallery' },

    // Walker Art Gallery
    { exhibitionId: 'wag-t1', gallerySlug: 'walker', searchQuery: 'Conversations Black British women artists Walker Art Gallery' },
    { exhibitionId: 'wag-t2', gallerySlug: 'walker', searchQuery: 'Vivienne Westwood Designer Walker Art Gallery' },
    { exhibitionId: 'wag-t4', gallerySlug: 'walker', searchQuery: 'Turner Always Contemporary Walker Art Gallery Liverpool' },

    // Scottish National Gallery of Modern Art
    { exhibitionId: 'sngma-t1', gallerySlug: 'sngma', searchQuery: 'Women in Revolt Art Activism Scottish National Gallery Modern Art' },
    { exhibitionId: 'sngma-t5', gallerySlug: 'sngma', searchQuery: 'ARTIST ROOMS Louise Bourgeois Robert Mapplethorpe' },
];

async function downloadImage(url: string): Promise<Buffer | null> {
    try {
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
                'Accept': 'image/*',
            },
        });

        if (!response.ok) {
            console.error(`Failed to download ${url}: ${response.status}`);
            return null;
        }

        const arrayBuffer = await response.arrayBuffer();
        return Buffer.from(arrayBuffer);
    } catch (error) {
        console.error(`Error downloading ${url}:`, error);
        return null;
    }
}

async function convertToWebp(buffer: Buffer, width = 400, height = 500): Promise<Buffer> {
    return sharp(buffer)
        .resize(width, height, { fit: 'cover' })
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

async function processExhibitionImage(item: ExhibitionImage): Promise<string | null> {
    const r2Key = `exhibitions/${item.gallerySlug}/${item.exhibitionId}.webp`;
    const r2Url = `${R2_PUBLIC_URL}/${r2Key}`;

    // If we have a direct URL, use it
    if (item.imageUrl) {
        console.log(`Downloading ${item.exhibitionId} from ${item.imageUrl}...`);
        const imageBuffer = await downloadImage(item.imageUrl);

        if (imageBuffer) {
            try {
                const webpBuffer = await convertToWebp(imageBuffer);
                await uploadToR2(webpBuffer, r2Key);
                console.log(`✅ Uploaded ${item.exhibitionId} to ${r2Url}`);
                return r2Url;
            } catch (error) {
                console.error(`Failed to process ${item.exhibitionId}:`, error);
                return null;
            }
        }
    }

    console.log(`⏭️  Skipping ${item.exhibitionId} - no direct URL provided`);
    return null;
}

async function main() {
    console.log('🖼️  Fetching exhibition images and uploading to R2...\n');

    const results: Record<string, string> = {};

    for (const item of exhibitionImages) {
        if (item.imageUrl) {
            const url = await processExhibitionImage(item);
            if (url) {
                results[item.exhibitionId] = url;
            }
        }
    }

    // Save results to a JSON file for reference
    const outputPath = path.join(__dirname, '../public/data/exhibition-images.json');
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));

    console.log(`\n✅ Saved ${Object.keys(results).length} image URLs to ${outputPath}`);
    console.log('\n📝 To update exhibitions.js, add the "image" property to each exhibition with these URLs.');
}

main().catch(console.error);
