const fs = require('fs');
const { S3Client, ListObjectsV2Command } = require('@aws-sdk/client-s3');
require('dotenv').config({ path: '.env.local' });

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY
  }
});
const BUCKET = 'armin-gallery-images';

async function fetchKeys(prefix) {
    let keys = [];
    let token;
    console.log(`Fetching keys for ${prefix}...`);
    do {
        const res = await s3.send(new ListObjectsV2Command({ Bucket: BUCKET, Prefix: prefix, ContinuationToken: token }));
        if(res.Contents) res.Contents.forEach(c => keys.push(c.Key));
        token = res.NextContinuationToken;
    } while(token);
    console.log(`Fetched ${keys.length} for ${prefix}`);
    return keys;
}

async function syncVam() {
    const p = 'public/data/vam-permanent-exhibitions.json';
    if(!fs.existsSync(p)) return;
    const data = JSON.parse(fs.readFileSync(p, 'utf8'));
    const keys = await fetchKeys('artworks/vam-permanent-exhibitions/');
    
    // Create multiple indexing strategies for keys
    const keyMap = {};
    keys.forEach(k => {
        const f = k.split('/').pop();
        const base = f.replace('-image.webp', '').toLowerCase();
        keyMap[base] = k; // "vam-painting-o206175"
        
        const first = f.split('-')[0].toLowerCase();
        keyMap[first] = k; // "o100773"
        
        // if it's vam-painting-o206175, also add "o206175"
        const parts = base.split('-');
        if(parts.length > 0) keyMap[parts[parts.length-1]] = k;
    });

    let matched = 0;
    data.forEach(it => {
        if (it.image && it.image.includes('r2.dev')) { matched++; return; }
        
        const idLower = it.id.toLowerCase(); // vam-painting-o206175 or o100773
        const fallbackId = idLower.split('-').pop(); // o206175 or o100773
        
        const match = keyMap[idLower] || keyMap[fallbackId];
        
        if (match) {
            it.image = `https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/${match}`;
            matched++;
        }
    });
    fs.writeFileSync(p, JSON.stringify(data, null, 2));
    console.log(`VAM: ${matched}/${data.length}`);
}

async function syncHuntington() {
    const p = 'public/data/huntington-collection.json';
    if(!fs.existsSync(p)) return;
    const data = JSON.parse(fs.readFileSync(p, 'utf8'));
    const keys = await fetchKeys('artworks/huntington-collection/');
    
    const keyMap = {};
    keys.forEach(k => {
        const base = k.split('/').pop().replace('-image.webp', '').toLowerCase();
        keyMap[base] = k; 
    });

    let matched = 0;
    data.forEach(it => {
        if (it.image && it.image.includes('r2.dev')) { matched++; return; }
        
        let rId = (it.objectID || it.id).toString().toLowerCase(); // mus-61621
        let rNum = rId.replace('mus-', ''); // 61621
        
        const match = keyMap[rId] || keyMap[rNum] || keys.find(k => k.toLowerCase().includes('/' + rId + '-') || k.toLowerCase().includes('/' + rNum + '-'));
        if (match) {
            it.image = `https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/${match}`;
            matched++;
        }
    });
    fs.writeFileSync(p, JSON.stringify(data, null, 2));
    console.log(`Huntington: ${matched}/${data.length}`);
}

async function run() {
    await syncVam();
    await syncHuntington();
}
run();
