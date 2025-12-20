import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

// Load .env.local
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const accountId = process.env.R2_ACCOUNT_ID;
const accessKeyId = process.env.R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
const bucketName = process.env.R2_BUCKET_NAME;

if (!accountId || !accessKeyId || !secretAccessKey || !bucketName) {
    console.error("Missing R2 environment variables in .env.local");
    process.exit(1);
}

const S3 = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
        accessKeyId,
        secretAccessKey,
    },
});

const uploadToR2 = async (filePath: string, key: string, contentType: string) => {
    const fileContent = fs.readFileSync(filePath);
    const command = new PutObjectCommand({
        Bucket: bucketName,
        Key: key,
        Body: fileContent,
        ContentType: contentType,
    });

    try {
        await S3.send(command);
        console.log(`✅ Successfully uploaded ${key}`);
        return `https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/${key}`;
    } catch (err) {
        console.error("❌ Error uploading to R2:", err);
        throw err;
    }
};

// Exhibition images
const exhibitionImages = [
    // V&A
    { localPath: 'temp-exhibition-images/vam/design-and-disability.webp', r2Key: 'galleries/vam/exhibitions/design-and-disability.webp', contentType: 'image/webp' },
    { localPath: 'temp-exhibition-images/vam/marie-antoinette.webp', r2Key: 'galleries/vam/exhibitions/marie-antoinette.webp', contentType: 'image/webp' },
    { localPath: 'temp-exhibition-images/vam/david-bowie.webp', r2Key: 'galleries/vam/exhibitions/david-bowie.webp', contentType: 'image/webp' },
    { localPath: 'temp-exhibition-images/vam/schiaparelli.webp', r2Key: 'galleries/vam/exhibitions/schiaparelli.webp', contentType: 'image/webp' },
    { localPath: 'temp-exhibition-images/vam/aardman.webp', r2Key: 'galleries/vam/exhibitions/aardman.webp', contentType: 'image/webp' },
    // Tate Liverpool
    { localPath: 'temp-exhibition-images/tate-liverpool/home-ground.webp', r2Key: 'galleries/tate-liverpool/exhibitions/home-ground.webp', contentType: 'image/webp' },
    { localPath: 'temp-exhibition-images/tate-liverpool/stirling-prize.webp', r2Key: 'galleries/tate-liverpool/exhibitions/stirling-prize.webp', contentType: 'image/webp' },
    { localPath: 'temp-exhibition-images/tate-liverpool/ugo-rondinone.webp', r2Key: 'galleries/tate-liverpool/exhibitions/ugo-rondinone.webp', contentType: 'image/webp' },
    { localPath: 'temp-exhibition-images/tate-liverpool/building-in-focus.webp', r2Key: 'galleries/tate-liverpool/exhibitions/building-in-focus.webp', contentType: 'image/webp' },
    { localPath: 'temp-exhibition-images/tate-liverpool/ed-ruscha.webp', r2Key: 'galleries/tate-liverpool/exhibitions/ed-ruscha.webp', contentType: 'image/webp' },
    { localPath: 'temp-exhibition-images/tate-liverpool/mildred-art-trail.webp', r2Key: 'galleries/tate-liverpool/exhibitions/mildred-art-trail.webp', contentType: 'image/webp' },
    { localPath: 'temp-exhibition-images/tate-liverpool/festive-fowl.webp', r2Key: 'galleries/tate-liverpool/exhibitions/festive-fowl.webp', contentType: 'image/webp' },
    { localPath: 'temp-exhibition-images/tate-liverpool/making-waves.webp', r2Key: 'galleries/tate-liverpool/exhibitions/making-waves.webp', contentType: 'image/webp' },
    { localPath: 'temp-exhibition-images/tate-liverpool/branching-out.webp', r2Key: 'galleries/tate-liverpool/exhibitions/branching-out.webp', contentType: 'image/webp' },
    // Tate St Ives
    { localPath: 'temp-exhibition-images/tate-st-ives/emilija-skarnulyte.webp', r2Key: 'galleries/tate-st-ives/exhibitions/emilija-skarnulyte.webp', contentType: 'image/webp' },
    { localPath: 'temp-exhibition-images/tate-st-ives/aleksandra-kasuba.webp', r2Key: 'galleries/tate-st-ives/exhibitions/aleksandra-kasuba.webp', contentType: 'image/webp' },
    { localPath: 'temp-exhibition-images/tate-st-ives/wilhelmina-barns-graham.webp', r2Key: 'galleries/tate-st-ives/exhibitions/wilhelmina-barns-graham.webp', contentType: 'image/webp' },
    { localPath: 'temp-exhibition-images/tate-st-ives/ahmet-ipek.webp', r2Key: 'galleries/tate-st-ives/exhibitions/ahmet-ipek.webp', contentType: 'image/webp' },
    { localPath: 'temp-exhibition-images/tate-st-ives/anna-farley.webp', r2Key: 'galleries/tate-st-ives/exhibitions/anna-farley.webp', contentType: 'image/webp' },
    { localPath: 'temp-exhibition-images/tate-st-ives/barbara-hepworth.webp', r2Key: 'galleries/tate-st-ives/exhibitions/barbara-hepworth.webp', contentType: 'image/webp' },
    { localPath: 'temp-exhibition-images/tate-st-ives/modern-conversations.webp', r2Key: 'galleries/tate-st-ives/exhibitions/modern-conversations.webp', contentType: 'image/webp' },
    { localPath: 'temp-exhibition-images/tate-st-ives/25secondtate.webp', r2Key: 'galleries/tate-st-ives/exhibitions/25secondtate.webp', contentType: 'image/webp' },
];

(async () => {
    console.log(`🚀 Uploading V&A exhibition images to R2 bucket: ${bucketName}`);
    
    for (const img of exhibitionImages) {
        const fullPath = path.resolve(__dirname, '..', img.localPath);
        if (fs.existsSync(fullPath)) {
            await uploadToR2(fullPath, img.r2Key, img.contentType);
        } else {
            console.log(`⚠️ File not found: ${fullPath}`);
        }
    }
    
    console.log('🎉 Done!');
})();
