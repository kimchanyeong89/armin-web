const fs = require('fs');
const http = require('http');
const https = require('https');
const tesseract = require('tesseract.js');

async function processMori() {
    const filePath = 'public/data/mori-collection.json';
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const validArtworks = [];
    const worker = await tesseract.createWorker('eng');

    console.log(`Checking ${data.length} artworks...`);

    // Batch process
    for (let i = 0; i < data.length; i++) {
        const item = data[i];
        if (!item.imageUrl) {
            validArtworks.push(item);
            continue;
        }

        try {
            const url = item.imageUrl.replace('http://', 'https://');

            const buffer = await new Promise((resolve, reject) => {
                https.get(url, (res) => {
                    if (res.statusCode !== 200) {
                        reject(new Error(`Status ${res.statusCode}`));
                        return;
                    }
                    const chunks = [];
                    res.on('data', d => chunks.push(d));
                    res.on('end', () => resolve(Buffer.concat(chunks)));
                }).on('error', reject);
            });

            const { data: { text } } = await worker.recognize(buffer);

            const lowerText = text.toLowerCase();
            // "The image cannot be shown on this website"
            if (lowerText.includes('cannot be shown') || lowerText.includes('website')) {
                console.log(`[REMOVED] ${item.title} - Placeholder detected`);
            } else {
                validArtworks.push(item);
                if (i % 20 === 0) console.log(`[KEEPT] ${item.title} (${i}/${data.length})`);
            }
        } catch (e) {
            console.error(`[ERROR] id=${item.id}:`, e.message);
            validArtworks.push(item); // Keep on error to be safe
        }
    }

    await worker.terminate();

    fs.writeFileSync(filePath, JSON.stringify(validArtworks, null, 2));
    console.log(`Done. Kept ${validArtworks.length} / ${data.length}`);
}

processMori();
