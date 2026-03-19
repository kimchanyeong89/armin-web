const fs = require('fs');
const https = require('https');
const FILES = ['smb-bode-museum-collection.json', 'hamburger-kunsthalle-paintings.json', 'hamburger-kunsthalle-drawings.json', 'hamburger-kunsthalle-video.json', 'pinakothek-moderne-collection.json'];
const dataDir = './public/data';

function checkUrl(url) {
  return new Promise((resolve) => {
    try {
      let target = url;
      if(target.startsWith('//')) target = 'https:' + target;
      if(!target.startsWith('http')) target = 'https://' + target;
      const parsedUrl = new URL(target);
      const req = https.request({
        method: 'HEAD',
        hostname: parsedUrl.hostname,
        path: parsedUrl.pathname + parsedUrl.search,
        timeout: 5000,
        headers: { 'User-Agent': 'Mozilla/5.0' }
      }, (res) => {
        resolve({ ok: res.statusCode >= 200 && res.statusCode < 400, status: res.statusCode, url });
      });
      req.on('error', (e) => resolve({ ok: false, error: e.message, url }));
      req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: 'Timeout', url }); });
      req.end();
    } catch(e) { resolve({ok:false, error: e.message, url}); }
  });
}

(async () => {
    for (let f of FILES) {
        if(!fs.existsSync(`${dataDir}/${f}`)) continue;
        let originalData = JSON.parse(fs.readFileSync(`${dataDir}/${f}`));
        let items = Array.isArray(originalData) ? originalData : (originalData.objects || originalData.items || originalData.artworks || []);
        
        let missing = [];
        for(let i of items) {
           let img = i.image || i.imageUrl || i.thumb || i.imageURL || i.thumbnail || i.original_imageUrl;
           if(img && !img.includes('armin-r2') && !img.includes('.r2.dev')) missing.push({id: i.id || i.objectID, url: img});
        }
        console.log(`\n--- ${f} ---`);
        console.log(`Missing R2 Images: ${missing.length}`);
        
        if(missing.length) {
            let sample = missing.slice(0, 50);
            let ok=0; let fail=0; let errs=new Set();
            for(let m of sample) {
               let r = await checkUrl(m.url);
               if(r.ok) ok++; else { fail++; errs.add(r.status || r.error); }
            }
            console.log(`Connection test (${sample.length}): OK=${ok} FAIL=${fail} (Errors: ${[...errs].join(',')})`);
            if (ok > 0) {
               console.log("Images on source are accessible! An upload workflow needs to be executed for this collection.");
            } else {
               console.log("Images appear broken or protected by anti-bot. We cannot easily pull these missing images right now.");
            }
        }
    }
})();
