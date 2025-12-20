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

// Upload gallery images
const galleryImages = [
    { localPath: 'temp-gallery-images/tate-modern.webp', r2Key: 'galleries/tate-modern/building.webp', contentType: 'image/webp' },
    { localPath: 'temp-gallery-images/tate-britain.webp', r2Key: 'galleries/tate-britain/building.webp', contentType: 'image/webp' },
    { localPath: 'temp-gallery-images/npg.webp', r2Key: 'galleries/npg/building.webp', contentType: 'image/webp' },
];

(async () => {
    console.log(`🚀 Uploading gallery images to R2 bucket: ${bucketName}`);
    
    for (const img of galleryImages) {
        const fullPath = path.resolve(__dirname, '..', img.localPath);
        if (fs.existsSync(fullPath)) {
            const url = await uploadToR2(fullPath, img.r2Key, img.contentType);
            console.log(`   URL: ${url}`);
        } else {
            console.error(`❌ File not found: ${fullPath}`);
        }
    }
    
    console.log('\n✨ Done!');
})();
