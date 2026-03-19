const fs = require('fs');
const https = require('https');
const sharp = require('sharp');
const crypto = require('crypto');

const placeholders = [
    'https://www.mori.art.museum/assets_c/2019/05/220_tarekalghoussein_untitled_23-thumb-1280x959-4704.jpg',
    'https://www.mori.art.museum/assets_c/2019/05/219_tarekalghoussein_untitled_15-thumb-1280x851-4998.jpg',
    'https://www.mori.art.museum/assets_c/2019/05/186_katotsubasa_t-thumb-1280x853-4693.jpg' // wait, is this placeholder or real? Let's check a few.
];
const real = [
    'https://www.mori.art.museum/assets_c/2019/05/165_aiweiwei_dropping-thumb-1280x474-4679.jpg',
    'https://www.mori.art.museum/assets_c/2019/05/351_aida_speech-thumb-1280x720-5137.jpg'
];

async function checkUrl(url, label) {
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            const chunks = [];
            res.on('data', d => chunks.push(d));
            res.on('end', async () => {
                try {
                    const buffer = Buffer.concat(chunks);
                    // Resize to 500x500 ignoring aspect ratio, then grab center 200x200, grayscale, and hash
                    const processed = await sharp(buffer)
                        .resize(500, 500, { fit: 'fill' })
                        .extract({ left: 150, top: 150, width: 200, height: 200 })
                        .grayscale()
                        .raw()
                        .toBuffer();

                    const hash = crypto.createHash('md5').update(processed).digest('hex');
                    console.log(label, hash, url);
                    resolve();
                } catch (e) { reject(e); }
            });
        });
    });
}

(async () => {
    for (let u of placeholders) await checkUrl(u, 'TEST');
    for (let u of real) await checkUrl(u, 'REAL');
})();
