const fs = require('fs');
// const fetch = require('node-fetch'); // or native fetch in node 18+

const BASE = 'https://www.tfam.museum/ashx/Collection.ashx?ddlLang=en-us';
const THEMES = [15, 16, 17, 21, 22];

async function post(payload) {
  const res = await fetch(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Referer': 'https://www.tfam.museum/Collection/CollectionList.aspx?ddlLang=en-us' },
    body: JSON.stringify(payload)
  });
  return res.json();
}

async function getThemeIds(theme) {
  const all = [];
  let page = 1;
  while(true) {
    const json = await post({JJMethod: 'GetCollectionList', pg_num: page, pg_size: 200, MTheme: String(theme)});
    const data = json.Data || [];
    if (data.length === 0) break;
    data.forEach(d => all.push(d.CID));
    if (data.length < 200) break;
    page++;
  }
  return new Set(all);
}

async function findAnimal() {
  // Search main list
  console.log('Searching for Animal Farm in main list...');
  for (let p=1; p<=50; p++) { // Scan first 10000 items (pg_size 200 * 50)
    process.stdout.write(`.${p}`);
    const json = await post({JJMethod: 'GetCollectionList', pg_num: p, pg_size: 200});
    const data = json.Data || [];
    // console.log(`Page ${p}: ${data.length} items`);
    if (data.length === 0) break;
    const found = data.filter(d => /Animal|YSC/i.test(d.Title));
    if (found.length > 0) {
      console.log('\nFound Animal Farm items:', found.length);
      const target = found[0];
      console.log('Target:', target);
      
      // Check which themes allow this item
      for (const t of THEMES) {
        const ids = await getThemeIds(t);
        if (ids.has(target.CID)) {
          console.log(`Item IS in Theme ${t} (Count: ${ids.size})`);
        } else {
          console.log(`Item is NOT in Theme ${t} (Count: ${ids.size})`);
        }
      }
      return;
    }
  }
  console.log('\nNot found in first 50 pages.');
}

findAnimal();
