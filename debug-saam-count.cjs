const https = require('node:https');
const readline = require('node:readline');
const fs = require('node:fs');
const path = require('node:path');

// We'll just check the first 5 files to get a ratio
const FILES_TO_CHECK = 10;
const INDEX_URL = 'https://smithsonian-open-access.s3-us-west-2.amazonaws.com/metadata/edan/saam/index.txt';

async function fetchText(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode !== 200) { res.resume(); reject(new Error(res.statusCode)); return; }
      res.setEncoding('utf8');
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

async function processFile(url) {
    const stats = {
        total: 0,
        saam: 0,
        paintings: 0,
        withImage: 0,
        withoutImage: 0
    };

    return new Promise((resolve) => {
        https.get(url, (res) => {
            const rl = readline.createInterface({ input: res, crlfDelay: Infinity });
            rl.on('line', (line) => {
                if(!line.trim()) return;
                try {
                    const doc = JSON.parse(line);
                    stats.total++;
                    if(doc.unitCode !== 'SAAM' || doc.type !== 'edanmdm') return;
                    stats.saam++;

                    const content = doc.content || {};
                    const objectTypes = content.indexedStructured?.object_type || [];
                    let isPainting = objectTypes.some(t => /painting/i.test(t));
                    if (!isPainting && content.freetext?.objectType) {
                        isPainting = content.freetext.objectType.some(t => /painting/i.test(t.content || ''));
                    }

                    if (isPainting) {
                        stats.paintings++;
                        const media = content.descriptiveNonRepeating?.online_media?.media || [];
                        if (media.length > 0) {
                            stats.withImage++;
                        } else {
                            stats.withoutImage++;
                        }
                    }
                } catch(e) {}
            });
            rl.on('close', () => resolve(stats));
        });
    });
}

async function main() {
    console.log('Fetching index...');
    const index = await fetchText(INDEX_URL);
    const urls = index.split(/\s+/).filter(s => s.endsWith('.txt')).slice(0, FILES_TO_CHECK);
    
    console.log(`Checking ${urls.length} files...`);
    const totalStats = { total: 0, saam: 0, paintings: 0, withImage: 0, withoutImage: 0 };
    
    for (const url of urls) {
        const s = await processFile(url);
        totalStats.total += s.total;
        totalStats.saam += s.saam;
        totalStats.paintings += s.paintings;
        totalStats.withImage += s.withImage;
        totalStats.withoutImage += s.withoutImage;
        console.log(`File stats: Paintings=${s.paintings}, WithImg=${s.withImage}, NoImg=${s.withoutImage}`);
    }
    
    console.log('--- FINAL SAMPLE STATS ---');
    console.log(JSON.stringify(totalStats, null, 2));
    const ratio = totalStats.withImage / totalStats.paintings;
    console.log(`Image Availability Ratio: ${(ratio * 100).toFixed(1)}%`);
}

main();
