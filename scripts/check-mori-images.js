const fs = require('fs');
const https = require('https');
const sharp = require('sharp');

const placeholders = [
  'https://www.mori.art.museum/assets_c/2019/05/220_tarekalghoussein_untitled_23-thumb-1280x959-4704.jpg',
  'https://www.mori.art.museum/assets_c/2019/05/219_tarekalghoussein_untitled_15-thumb-1280x851-4998.jpg'
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
          const stats = await sharp(buffer).stats();
          // stats.channels[0].mean (0..255)
          const means = stats.channels.map(c => Math.round(c.mean));
          const stdevs = stats.channels.map(c => Math.round(c.stdev));
          console.log(label, means, stdevs, url);
          resolve();
        } catch(e) { reject(e); }
      });
    });
  });
}

(async () => {
  for (let u of placeholders) await checkUrl(u, 'PLACEHOLDER');
  for (let u of real) await checkUrl(u, 'REAL       ');
})();
