import { uploadToR2 } from './upload-r2.js';
import fs from 'fs';
import path from 'path';
import https from 'https';

const downloadFile = (url: string, dest: string) => {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(dest);
        const options = {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
                'Referer': 'https://commons.wikimedia.org/'
            }
        };
        https.get(url, options, (response) => {
            if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                // Handle redirect manually if needed, though https.get doesn't follow by default without logic
                // Simple retry for redirect could be added here but keeping it simple for now
                // Wikimedia usually gives direct link if format is right
            }
            if (response.statusCode !== 200) {
                reject(new Error(`Failed to download: ${response.statusCode}`));
                return;
            }
            response.pipe(file);
            file.on('finish', () => {
                file.close();
                resolve(true);
            });
        }).on('error', (err) => {
            fs.unlink(dest, () => { });
            reject(err);
        });
    });
};

const IMAGES = [
    {
        name: "National Gallery Building",
        url: "https://upload.wikimedia.org/wikipedia/commons/2/23/London_National_Gallery_2011.jpg",
        key: "national-gallery/building.jpg"
    },
    {
        name: "Van Gogh Sunflowers",
        url: "https://upload.wikimedia.org/wikipedia/commons/thumb/4/46/Vincent_Willem_van_Gogh_127.jpg/800px-Vincent_Willem_van_Gogh_127.jpg",
        key: "national-gallery/sunflowers.jpg"
    }
];

(async () => {
    console.log("Starting National Gallery Image Migration...");

    for (const img of IMAGES) {
        const tempFile = path.resolve('temp_image.jpg');
        try {
            console.log(`Downloading ${img.name}...`);
            await downloadFile(img.url, tempFile);

            console.log(`Uploading to R2: ${img.key}...`);
            await uploadToR2(tempFile, img.key, 'image/jpeg');

            console.log(`✅ Uploaded ${img.name}`);
        } catch (err) {
            console.error(`❌ Failed ${img.name}:`, err);
        } finally {
            if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
        }
    }

    console.log("Migration complete!");
})();
