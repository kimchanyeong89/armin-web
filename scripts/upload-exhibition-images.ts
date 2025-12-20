/**
 * Bulk download exhibition poster images and upload to R2
 * 
 * This script downloads exhibition images from known URLs,
 * converts them to WebP format, and uploads to Cloudflare R2.
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

interface ExhibitionImageConfig {
    exhibitionId: string;
    gallerySlug: string;
    name: string;
    imageUrl: string;
}

// Exhibition images with direct URLs (from Wikipedia Commons, gallery press images, etc.)
const exhibitionImages: ExhibitionImageConfig[] = [
    // ========== National Portrait Gallery ==========
    {
        exhibitionId: 'npg-temp-1', gallerySlug: 'npg', name: 'Francis Bacon: Human Presence',
        imageUrl: 'https://upload.wikimedia.org/wikipedia/en/d/d4/Three_Studies_for_Figures_at_the_Base_of_a_Crucifixion.jpg'
    },
    {
        exhibitionId: 'npg-temp-2', gallerySlug: 'npg', name: 'Taylor Wessing Photo Portrait Prize 2024',
        imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/33/NPG_London_-_Main_Hall.jpg/1280px-NPG_London_-_Main_Hall.jpg'
    },
    {
        exhibitionId: 'npg-temp-3', gallerySlug: 'npg', name: 'Cecil Beaton\'s Fashionable World',
        imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/53/Princess_Margaret_1967_portrait_by_Cecil_Beaton.jpg/800px-Princess_Margaret_1967_portrait_by_Cecil_Beaton.jpg'
    },
    {
        exhibitionId: 'npg-temp-4', gallerySlug: 'npg', name: 'Lucian Freud: Drawing into Painting',
        imageUrl: 'https://upload.wikimedia.org/wikipedia/en/5/52/Lucian_Freud_photo.jpg'
    },

    // ========== Tate Liverpool ==========
    {
        exhibitionId: 'tl-t1', gallerySlug: 'tate-liverpool', name: 'The Plant that Stowed Away',
        imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/6d/Tate_Liverpool.jpg/1280px-Tate_Liverpool.jpg'
    },
    {
        exhibitionId: 'tl-t2', gallerySlug: 'tate-liverpool', name: 'Liverpool Biennial 2025',
        imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/84/Royal_Albert_Dock%2C_Liverpool_2019-2.jpg/1280px-Royal_Albert_Dock%2C_Liverpool_2019-2.jpg'
    },
    {
        exhibitionId: 'tl-t3', gallerySlug: 'tate-liverpool', name: 'Ugo Rondinone: Liverpool Mountain',
        imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a7/Seven_Magic_Mountains_2016.jpg/800px-Seven_Magic_Mountains_2016.jpg'
    },

    // ========== Tate St Ives ==========
    {
        exhibitionId: 'tsi-t1', gallerySlug: 'tate-st-ives', name: 'Ithell Colquhoun',
        imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3c/Tate_St_Ives_2.jpg/1280px-Tate_St_Ives_2.jpg'
    },
    {
        exhibitionId: 'tsi-t2', gallerySlug: 'tate-st-ives', name: 'Liliane Lijn: Arise Alive',
        imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0e/Woman_of_War%2C_Liliane_Lijn_-_geograph.org.uk_-_4827227.jpg/800px-Woman_of_War%2C_Liliane_Lijn_-_geograph.org.uk_-_4827227.jpg'
    },
    {
        exhibitionId: 'tsi-t3', gallerySlug: 'tate-st-ives', name: 'Emma Critchley: Soundings',
        imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8f/St_Ives_harbour_and_town.jpg/1280px-St_Ives_harbour_and_town.jpg'
    },
    {
        exhibitionId: 'tsi-t4', gallerySlug: 'tate-st-ives', name: 'Emilija Škarnulytė',
        imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3c/Tate_St_Ives_2.jpg/1280px-Tate_St_Ives_2.jpg'
    },

    // ========== Ashmolean Museum ==========
    {
        exhibitionId: 'ash-t1', gallerySlug: 'ashmolean', name: 'Kabuki Kimono',
        imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/aa/Kimono_back_Kyoto.jpg/800px-Kimono_back_Kyoto.jpg'
    },
    {
        exhibitionId: 'ash-t2', gallerySlug: 'ashmolean', name: 'Anselm Kiefer: Early Works',
        imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e8/Anselm_Kiefer_2019_fot_Mariusz_Kubik_05.jpg/800px-Anselm_Kiefer_2019_fot_Mariusz_Kubik_05.jpg'
    },
    {
        exhibitionId: 'ash-t3', gallerySlug: 'ashmolean', name: 'Stanley Donwood & Radiohead',
        imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a0/Radiohead_%40_NOS_Alive_2016_%28cropped%29.jpg/800px-Radiohead_%40_NOS_Alive_2016_%28cropped%29.jpg'
    },
    {
        exhibitionId: 'ash-t4', gallerySlug: 'ashmolean', name: 'IN BLOOM: How Plants Changed Our World',
        imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/7c/Ashmolean_Museum_Oxford.jpg/1280px-Ashmolean_Museum_Oxford.jpg'
    },

    // ========== Fitzwilliam Museum ==========
    {
        exhibitionId: 'fitz-t1', gallerySlug: 'fitzwilliam', name: 'Rise Up: Resistance, Revolution, Abolition',
        imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/ca/Official_medallion_of_the_British_Anti-Slavery_Society_%281795%29.jpg/800px-Official_medallion_of_the_British_Anti-Slavery_Society_%281795%29.jpg'
    },
    {
        exhibitionId: 'fitz-t2', gallerySlug: 'fitzwilliam', name: 'Discovering Dürer',
        imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/48/Albrecht_D%C3%BCrer_-_1500_self-portrait_%28High_resolution_and_detail%29.jpg/800px-Albrecht_D%C3%BCrer_-_1500_self-portrait_%28High_resolution_and_detail%29.jpg'
    },
    {
        exhibitionId: 'fitz-t3', gallerySlug: 'fitzwilliam', name: 'Made in Ancient Egypt',
        imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e5/All_Gizah_Pyramids.jpg/1280px-All_Gizah_Pyramids.jpg'
    },
    {
        exhibitionId: 'fitz-t4', gallerySlug: 'fitzwilliam', name: 'Bound Together',
        imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a3/The_Fitzwilliam_Museum.jpg/1280px-The_Fitzwilliam_Museum.jpg'
    },

    // ========== Scottish National Gallery ==========
    {
        exhibitionId: 'sng-t1', gallerySlug: 'scottish-national', name: 'Turner in January',
        imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/94/Turner%2C_J._M._W._-_The_Fighting_Temeraire.jpg/1280px-Turner%2C_J._M._W._-_The_Fighting_Temeraire.jpg'
    },
    {
        exhibitionId: 'sng-t2', gallerySlug: 'scottish-national', name: 'Your Art World',
        imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ae/Scottish_National_Gallery%2C_The_Mound.jpg/1280px-Scottish_National_Gallery%2C_The_Mound.jpg'
    },
    {
        exhibitionId: 'sng-t3', gallerySlug: 'scottish-national', name: 'Andy Goldsworthy: Fifty Years',
        imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d5/Andy_Goldsworthy_installation_%28geograph_4104889%29.jpg/1280px-Andy_Goldsworthy_installation_%28geograph_4104889%29.jpg'
    },

    // ========== Royal Academy ==========
    {
        exhibitionId: 'ra-t1', gallerySlug: 'royal-academy', name: 'Brasil! The Birth of Modernism',
        imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/fe/Abaporu.jpg/800px-Abaporu.jpg'
    },
    {
        exhibitionId: 'ra-t2', gallerySlug: 'royal-academy', name: 'Victor Hugo Drawings',
        imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/25/Victor_Hugo_by_%C3%89tienne_Carjat_1876_-_full.jpg/800px-Victor_Hugo_by_%C3%89tienne_Carjat_1876_-_full.jpg'
    },
    {
        exhibitionId: 'ra-t3', gallerySlug: 'royal-academy', name: 'Summer Exhibition 2025',
        imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/39/Burlington_House_from_Piccadilly.jpg/1280px-Burlington_House_from_Piccadilly.jpg'
    },
    {
        exhibitionId: 'ra-t4', gallerySlug: 'royal-academy', name: 'Kiefer/Van Gogh',
        imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b1/Van_Gogh_-_Starry_Night_-_Google_Art_Project.jpg/1280px-Van_Gogh_-_Starry_Night_-_Google_Art_Project.jpg'
    },
    {
        exhibitionId: 'ra-t5', gallerySlug: 'royal-academy', name: 'Kerry James Marshall',
        imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/39/Burlington_House_from_Piccadilly.jpg/1280px-Burlington_House_from_Piccadilly.jpg'
    },

    // ========== Wallace Collection ==========
    {
        exhibitionId: 'wc-t1', gallerySlug: 'wallace', name: 'Clocks by Boulle',
        imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4b/Boulle_armoire.jpg/800px-Boulle_armoire.jpg'
    },
    {
        exhibitionId: 'wc-t2', gallerySlug: 'wallace', name: 'Grayson Perry',
        imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0f/Grayson_Perry_in_2014.jpg/800px-Grayson_Perry_in_2014.jpg'
    },
    {
        exhibitionId: 'wc-t3', gallerySlug: 'wallace', name: 'Caravaggio\'s Cupid',
        imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a3/Michelangelo_Caravaggio_065.jpg/800px-Michelangelo_Caravaggio_065.jpg'
    },

    // ========== Serpentine Gallery ==========
    {
        exhibitionId: 'serp-t1', gallerySlug: 'serpentine', name: 'Esther Mahlangu',
        imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d2/Ndebele_house_decoration.jpg/1280px-Ndebele_house_decoration.jpg'
    },
    {
        exhibitionId: 'serp-t2', gallerySlug: 'serpentine', name: 'Arpita Singh',
        imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/62/Serpentine_Galleries_North_2016.jpg/1280px-Serpentine_Galleries_North_2016.jpg'
    },
    {
        exhibitionId: 'serp-t3', gallerySlug: 'serpentine', name: 'Giuseppe Penone',
        imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/fc/Penone_Tree.jpg/800px-Penone_Tree.jpg'
    },
    {
        exhibitionId: 'serp-t4', gallerySlug: 'serpentine', name: 'THE DELUSION',
        imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/62/Serpentine_Galleries_North_2016.jpg/1280px-Serpentine_Galleries_North_2016.jpg'
    },
    {
        exhibitionId: 'serp-t5', gallerySlug: 'serpentine', name: 'Peter Doig',
        imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/62/Serpentine_Galleries_North_2016.jpg/1280px-Serpentine_Galleries_North_2016.jpg'
    },

    // ========== Dulwich Picture Gallery ==========
    {
        exhibitionId: 'dpg-t1', gallerySlug: 'dulwich', name: 'Tirzah Garwood',
        imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/89/Dulwich_Picture_Gallery.jpg/1280px-Dulwich_Picture_Gallery.jpg'
    },
    {
        exhibitionId: 'dpg-t2', gallerySlug: 'dulwich', name: 'Somaya Critchlow',
        imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/89/Dulwich_Picture_Gallery.jpg/1280px-Dulwich_Picture_Gallery.jpg'
    },
    {
        exhibitionId: 'dpg-t3', gallerySlug: 'dulwich', name: 'Rachel Jones',
        imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/89/Dulwich_Picture_Gallery.jpg/1280px-Dulwich_Picture_Gallery.jpg'
    },
    {
        exhibitionId: 'dpg-t4', gallerySlug: 'dulwich', name: 'Anna Ancher',
        imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/78/Ancher_pigen_i_kokkenet.jpg/800px-Ancher_pigen_i_kokkenet.jpg'
    },

    // ========== Courtauld Gallery ==========
    {
        exhibitionId: 'cg-t1', gallerySlug: 'courtauld', name: 'Goya to Impressionism',
        imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/79/Francisco_de_Goya_-_Infante_Don_Luis_de_Borb%C3%B3n_-_WGA10046.jpg/800px-Francisco_de_Goya_-_Infante_Don_Luis_de_Borb%C3%B3n_-_WGA10046.jpg'
    },
    {
        exhibitionId: 'cg-t2', gallerySlug: 'courtauld', name: 'Henri Michaux',
        imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/38/Somerset_House.jpg/1280px-Somerset_House.jpg'
    },
    {
        exhibitionId: 'cg-t3', gallerySlug: 'courtauld', name: 'The Barber in London',
        imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/38/Somerset_House.jpg/1280px-Somerset_House.jpg'
    },
    {
        exhibitionId: 'cg-t4', gallerySlug: 'courtauld', name: 'Abstract Erotic',
        imageUrl: 'https://upload.wikimedia.org/wikipedia/en/5/5f/Louise_Bourgeois_Maman.jpg'
    },
    {
        exhibitionId: 'cg-t5', gallerySlug: 'courtauld', name: 'Wayne Thiebaud',
        imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/38/Somerset_House.jpg/1280px-Somerset_House.jpg'
    },

    // ========== Whitechapel Gallery ==========
    {
        exhibitionId: 'wg-t1', gallerySlug: 'whitechapel', name: 'Duchamp & Sons',
        imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3b/Whitechapel_Gallery.jpg/1280px-Whitechapel_Gallery.jpg'
    },
    {
        exhibitionId: 'wg-t2', gallerySlug: 'whitechapel', name: 'Donald Rodney',
        imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3b/Whitechapel_Gallery.jpg/1280px-Whitechapel_Gallery.jpg'
    },
    {
        exhibitionId: 'wg-t3', gallerySlug: 'whitechapel', name: 'Hamad Butt',
        imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3b/Whitechapel_Gallery.jpg/1280px-Whitechapel_Gallery.jpg'
    },
    {
        exhibitionId: 'wg-t4', gallerySlug: 'whitechapel', name: 'London Open Live',
        imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3b/Whitechapel_Gallery.jpg/1280px-Whitechapel_Gallery.jpg'
    },
    {
        exhibitionId: 'wg-t5', gallerySlug: 'whitechapel', name: 'Joy Gregory',
        imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3b/Whitechapel_Gallery.jpg/1280px-Whitechapel_Gallery.jpg'
    },

    // ========== Manchester Art Gallery ==========
    {
        exhibitionId: 'mag-t1', gallerySlug: 'manchester', name: 'Trading Station',
        imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/e/e7/Manchester_Art_Gallery_-_geograph.org.uk_-_1748756.jpg'
    },
    {
        exhibitionId: 'mag-t2', gallerySlug: 'manchester', name: 'Holly Graham',
        imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/e/e7/Manchester_Art_Gallery_-_geograph.org.uk_-_1748756.jpg'
    },

    // ========== Walker Art Gallery ==========
    {
        exhibitionId: 'wag-t1', gallerySlug: 'walker', name: 'Conversations',
        imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c3/Walker_Art_Gallery_2018-2.jpg/1280px-Walker_Art_Gallery_2018-2.jpg'
    },
    {
        exhibitionId: 'wag-t2', gallerySlug: 'walker', name: 'Vivienne Westwood',
        imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0a/Vivienne_Westwood_2020.jpg/800px-Vivienne_Westwood_2020.jpg'
    },
    {
        exhibitionId: 'wag-t3', gallerySlug: 'walker', name: 'John Moores Painting Prize',
        imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c3/Walker_Art_Gallery_2018-2.jpg/1280px-Walker_Art_Gallery_2018-2.jpg'
    },
    {
        exhibitionId: 'wag-t4', gallerySlug: 'walker', name: 'Turner: Always Contemporary',
        imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/94/Turner%2C_J._M._W._-_The_Fighting_Temeraire.jpg/1280px-Turner%2C_J._M._W._-_The_Fighting_Temeraire.jpg'
    },

    // ========== Scottish National Gallery of Modern Art ==========
    {
        exhibitionId: 'sngma-t1', gallerySlug: 'sngma', name: 'Women in Revolt!',
        imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/82/Scottish_National_Gallery_of_Modern_Art%2C_Modern_One.jpg/1280px-Scottish_National_Gallery_of_Modern_Art%2C_Modern_One.jpg'
    },
    {
        exhibitionId: 'sngma-t2', gallerySlug: 'sngma', name: 'Bruce McLean',
        imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/82/Scottish_National_Gallery_of_Modern_Art%2C_Modern_One.jpg/1280px-Scottish_National_Gallery_of_Modern_Art%2C_Modern_One.jpg'
    },
    {
        exhibitionId: 'sngma-t3', gallerySlug: 'sngma', name: 'Ian Hamilton Finlay',
        imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8d/Little_Sparta_frontcrop.jpg/1280px-Little_Sparta_frontcrop.jpg'
    },
    {
        exhibitionId: 'sngma-t4', gallerySlug: 'sngma', name: 'Resistance',
        imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/82/Scottish_National_Gallery_of_Modern_Art%2C_Modern_One.jpg/1280px-Scottish_National_Gallery_of_Modern_Art%2C_Modern_One.jpg'
    },
    {
        exhibitionId: 'sngma-t5', gallerySlug: 'sngma', name: 'ARTIST ROOMS',
        imageUrl: 'https://upload.wikimedia.org/wikipedia/en/5/5f/Louise_Bourgeois_Maman.jpg'
    },
];

async function downloadImage(url: string): Promise<Buffer | null> {
    try {
        console.log(`  Downloading from: ${url.substring(0, 80)}...`);
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'image/*,*/*',
                'Accept-Language': 'en-US,en;q=0.9',
            },
        });

        if (!response.ok) {
            console.error(`  ❌ Download failed: ${response.status} ${response.statusText}`);
            return null;
        }

        const contentType = response.headers.get('content-type') || '';
        if (!contentType.includes('image')) {
            console.error(`  ❌ Not an image: ${contentType}`);
            return null;
        }

        const arrayBuffer = await response.arrayBuffer();
        console.log(`  ✓ Downloaded ${Math.round(arrayBuffer.byteLength / 1024)}KB`);
        return Buffer.from(arrayBuffer);
    } catch (error) {
        console.error(`  ❌ Error downloading:`, error);
        return null;
    }
}

// Image settings - preserve aspect ratio, max 2400px on longest side, 85% WebP quality
const MAX_IMAGE_SIZE = 2400;
const WEBP_QUALITY = 85;

async function convertToWebp(buffer: Buffer): Promise<Buffer> {
    // Preserve original aspect ratio, only downscale if larger than max size
    return sharp(buffer)
        .resize({
            width: MAX_IMAGE_SIZE,
            height: MAX_IMAGE_SIZE,
            fit: 'inside',           // Preserve aspect ratio
            withoutEnlargement: true // Don't upscale smaller images
        })
        .webp({ quality: WEBP_QUALITY })
        .toBuffer();
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

async function processImage(config: ExhibitionImageConfig, skipExisting = true): Promise<string | null> {
    const r2Key = `exhibitions/${config.gallerySlug}/${config.exhibitionId}.webp`;
    const r2Url = `${R2_PUBLIC_URL}/${r2Key}`;

    console.log(`\n📷 Processing: ${config.name} (${config.exhibitionId})`);

    // Check if already exists
    if (skipExisting) {
        const exists = await checkExists(r2Key);
        if (exists) {
            console.log(`  ⏭️  Already exists, skipping`);
            return r2Url;
        }
    }

    // Download
    const imageBuffer = await downloadImage(config.imageUrl);
    if (!imageBuffer) {
        return null;
    }

    // Convert to WebP
    try {
        console.log(`  Converting to WebP (max ${MAX_IMAGE_SIZE}px, ${WEBP_QUALITY}% quality, preserving aspect ratio)...`);
        const webpBuffer = await convertToWebp(imageBuffer);
        console.log(`  ✓ Converted to ${Math.round(webpBuffer.byteLength / 1024)}KB WebP`);

        // Upload to R2
        console.log(`  Uploading to R2: ${r2Key}`);
        await uploadToR2(webpBuffer, r2Key);
        console.log(`  ✅ Uploaded successfully!`);

        return r2Url;
    } catch (error) {
        console.error(`  ❌ Processing error:`, error);
        return null;
    }
}

async function main() {
    console.log('🖼️  Exhibition Image Uploader');
    console.log('================================\n');
    console.log(`Total images to process: ${exhibitionImages.length}`);
    console.log(`R2 Bucket: ${R2_BUCKET_NAME}`);
    console.log(`Public URL: ${R2_PUBLIC_URL}\n`);

    const results: { id: string; url: string | null; name: string }[] = [];
    let successCount = 0;
    let failCount = 0;

    for (const config of exhibitionImages) {
        const url = await processImage(config, true);
        results.push({ id: config.exhibitionId, url, name: config.name });

        if (url) {
            successCount++;
        } else {
            failCount++;
        }

        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 200));
    }

    // Summary
    console.log('\n\n========== SUMMARY ==========');
    console.log(`✅ Successful: ${successCount}`);
    console.log(`❌ Failed: ${failCount}`);
    console.log(`Total: ${exhibitionImages.length}`);

    // Generate update snippet for exhibitions.js
    console.log('\n\n========== R2 URL MAPPING ==========');
    console.log('Add these image URLs to your exhibitions in exhibitions.js:\n');

    const urlMapping: Record<string, string> = {};
    for (const result of results) {
        if (result.url) {
            urlMapping[result.id] = result.url;
            console.log(`"${result.id}": "${result.url}"`);
        }
    }

    // Save mapping to JSON
    const outputPath = path.join(__dirname, '../public/data/exhibition-image-urls.json');
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, JSON.stringify(urlMapping, null, 2));
    console.log(`\n\n📁 Saved URL mapping to: ${outputPath}`);
}

main().catch(console.error);
