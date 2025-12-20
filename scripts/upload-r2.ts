import { S3Client, PutObjectCommand, ListBucketsCommand } from "@aws-sdk/client-s3";
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

export const uploadToR2 = async (filePath: string, key: string, contentType?: string) => {
    const fileContent = fs.readFileSync(filePath);
    const command = new PutObjectCommand({
        Bucket: bucketName,
        Key: key,
        Body: fileContent,
        ContentType: contentType || 'image/jpeg', // Default or detect
    });

    try {
        await S3.send(command);
        console.log(`Successfully uploaded ${key} to ${bucketName}`);
        // Return public URL (if public access is enabled or custom domain is set up)
        // For now returning the key
        return key;
    } catch (err) {
        console.error("Error uploading to R2:", err);
        throw err;
    }
};

// Simple test run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
    (async () => {
        try {
            console.log(`Using Account ID: ${accountId?.slice(0, 4)}...${accountId?.slice(-4)}`);

            const localFile = 'public/images/national-gallery-building.jpg';
            const r2Key = 'national-gallery/building.jpg';

            if (fs.existsSync(localFile)) {
                console.log(`Uploading local file ${localFile} to ${r2Key}...`);
                await uploadToR2(localFile, r2Key, 'image/jpeg');
                console.log("Upload SUCCESS!");
            } else {
                console.error(`Local file not found: ${localFile}`);
            }

        } catch (e) {
            console.error("General Error:", e);
        }
    })();
}
