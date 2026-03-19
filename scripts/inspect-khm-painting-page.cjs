const axios = require('axios');
const cheerio = require('cheerio');

function cleanInlineText(s) {
  return String(s || '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\b(DNBarrow_outward|arrow_outward|keyboard_arrow_down)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

(async () => {
  const url = process.argv[2] || 'https://www.khm.at/en/artworks/painting-85433';
  const res = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'text/html,*/*' }, timeout: 20000 });
  const html = String(res.data);
  const $ = cheerio.load(html);

  console.log('status', res.status, 'len', html.length);
  console.log('url', url);
  console.log('h1', $('h1').first().text().trim());
  console.log('dt count', $('dt').length);
  console.log('dl count', $('dl').length);
  console.log('table rows', $('table tr').length);
  console.log('og:image', $('meta[property="og:image"]').attr('content'));

  const ldScripts = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).contents().text();
    if (raw && raw.trim()) ldScripts.push(raw.trim());
  });
  console.log('jsonld scripts', ldScripts.length);
  if (ldScripts.length) {
    try {
      const parsed = JSON.parse(ldScripts[0]);
      const obj = Array.isArray(parsed) ? parsed[0] : parsed;
      console.log('jsonld keys sample', obj ? Object.keys(obj).slice(0, 30) : null);
      console.log('jsonld name', obj && obj.name);
      console.log('jsonld creator', obj && obj.creator);
      console.log('jsonld dateCreated', obj && obj.dateCreated);
      console.log('jsonld material', obj && (obj.material || obj.artMedium));
    } catch (e) {
      console.log('jsonld parse failed', e.message);
      console.log(ldScripts[0].slice(0, 200));
    }
  }

  // Dump KHM's current detail metadata blocks (these are often NOT dt/dd)
  const detailsRows = [];
  $('[class^=details-], [class*=" details-"]').each((_, el) => {
    const cls = String($(el).attr('class') || '')
      .split(/\s+/)
      .find((c) => c.startsWith('details-'));
    if (!cls) return;

    const p = $(el).find('p').first();
    if (!p.length) return;

    const label = cleanInlineText(
      p
        .clone()
        .children('strong')
        .remove()
        .end()
        .text()
        .replace(/:$/g, '')
    );

    const strongClone = p.find('strong').first().clone();
    strongClone.find('.icon, .material-symbols-outlined, svg').remove();
    const value = cleanInlineText(strongClone.text());
    if (!value) return;

    detailsRows.push({ cls, label, value });
  });

  console.log('\ndetails-* blocks:', detailsRows.length);
  for (const r of detailsRows) {
    console.log('-', r.cls, '|', r.label, '=>', r.value);
  }

  // Show first 10 dt/dd pairs
  const pairs = [];
  $('dt').each((i, el) => {
    if (i >= 10) return;
    const key = $(el).text().trim();
    const val = $(el).next('dd').text().trim();
    pairs.push([key, val]);
  });
  console.log('\nfirst dt/dd pairs:');
  for (const [k, v] of pairs) console.log('-', k, '=>', v.slice(0, 120));

  // Try to find obvious metadata blocks
  const candidates = [
    '.object-info',
    '.object-data',
    '.object-details',
    '.detail-data',
    '.artwork-details',
    '.tx-theme-objectdetail',
    '#object-detail',
    '#objectdata',
    '.object-detail',
  ];
  for (const sel of candidates) {
    const el = $(sel).first();
    if (el.length) {
      console.log(`\nfound block ${sel} class=${el.attr('class') || ''}`);
      console.log(el.text().trim().slice(0, 400));
    }
  }
})();
