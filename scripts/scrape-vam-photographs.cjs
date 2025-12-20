const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

async function scrapeVAMPhotographs() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  // Photographs categories (provided URL), images present, V&A venue, 1991–2025
  const baseUrl = 'https://collections.vam.ac.uk/search/?id_category=THES48910&id_category=THES394546&images_exist=true&kw_resident_venue=VA&page_size=15&q=&year_made_from=1991&year_made_to=2025';
  const startPage = Number(process.env.START_PAGE || 1);
  const endPage = Number(process.env.END_PAGE || 999);
  let pageNum = startPage;
  const allItems = [];
  const startedAt = new Date().toISOString();
  const seenIds = new Set();

  // Resume support
  if (process.env.CLEAN !== '1') {
    try {
      const existingPath = path.join(__dirname, '..', 'public', 'data', 'vam-photographs.json');
      if (fs.existsSync(existingPath)) {
        const existing = JSON.parse(fs.readFileSync(existingPath, 'utf8'));
        const items = Array.isArray(existing.items) ? existing.items : [];
        for (const it of items) {
          const rid = String(it.id || '').replace(/^vam-photo-/, '');
          if (rid) seenIds.add(rid);
          allItems.push(it);
        }
        console.log(`Resumed with ${allItems.length} existing photographs.`);
      }
    } catch (e) {
      console.warn('Resume failed (ignored):', e.message);
    }
  } else {
    console.log('CLEAN=1 → starting fresh (no resume).');
  }

  while (true) {
    const url = `${baseUrl}&page=${pageNum}`;
    console.log(`Scraping page ${pageNum}: ${url}`);

    try {
      await page.goto(url, { waitUntil: 'networkidle' });
      await page.waitForSelector('#search-results-grid, #vam-search-results, .g-object-grid', { timeout: 30000 });

      // Wait up to 10s for item cards to render
      const start = Date.now();
      while (Date.now() - start < 10000) {
        const count = await page.evaluate(() => {
          const c = document.querySelector('#search-results-grid') || document.querySelector('#vam-search-results') || document.querySelector('.g-object-grid');
          if (!c) return 0;
          return c.querySelectorAll('li, article, .collection-object, .b-search-results-row, .b-search-results-row--listing').length;
        });
        if (count > 0) break;
        await page.waitForTimeout(500);
      }

      const noResults = await page.locator('text=No results found').count();
      if (noResults > 0) {
        console.log('No more results.');
        break;
      }

      const res = await page.evaluate(() => {
        const items = [];
        let container = document.querySelector('#search-results-grid');
        if (!container) container = document.querySelector('#vam-search-results');
        if (!container) container = document.querySelector('.g-object-grid');
        let cards = container ? container.querySelectorAll('li, article, .collection-object, .b-search-results-row, .b-search-results-row--listing') : document.querySelectorAll('li, article, .collection-object');

        function cleanText(t) {
          return (t || '').replace(/\s+/g, ' ').trim();
        }

        function looksLikeDate(s) {
          if (!s) return false;
          const t = s.toLowerCase();
          if (/\b\d{4}\b/.test(t)) return true; // has a year
          if (/century/.test(t)) return true; // e.g., "19th century"
          if (/^c\.?\s?\d{3,4}/.test(t)) return true; // c 1991, c. 1991
          if (/(early|mid|late)\s+\d{2}(th)?\s*century/.test(t)) return true;
          return false;
        }

        cards.forEach(card => {
          const linkEl = card.querySelector('a[href*="/item/"]') || card.closest('a[href*="/item/"]') || card.querySelector('a');
          const imgEl = card.querySelector('img');
          // Prefer structured caption pieces
          const figcap = card.querySelector('figcaption') || card;
          const titleEl = figcap.querySelector('.b-object-card__caption, .c-card__title, .title, h3, h2') || card.querySelector('h3, h2, .c-card__title, .title');
          const subcaps = Array.from(figcap.querySelectorAll('.b-object-card__subcaption, .c-card__meta-item'));

          if (!linkEl) return;

          let title = cleanText(titleEl?.textContent || '') || cleanText(imgEl?.alt || '');
          // Artist/date from structured subcaptions when available
          let artist = cleanText(subcaps[0]?.textContent || '');
          let date = cleanText(subcaps[1]?.textContent || '');

          // If the first subcaption is actually a date, swap/move
          if (looksLikeDate(artist) && !looksLikeDate(date)) {
            if (!date) date = artist;
            artist = '';
          }

          // Fallback: parse from remaining text, but avoid title
          if (!artist || !date) {
            const metaEl = card.querySelector('.c-card__meta, .b-search-results-row__subcaption') || figcap;
            const metaText = cleanText(metaEl?.textContent || '');
            // Remove title from metaText if present to avoid picking numbers from it
            const metaNoTitle = metaText.replace(title, '').trim();
            if (!artist) {
              // Try before first year marker or separators
              artist = cleanText((metaNoTitle.split(/\b\d{4}\b|—|\||,/)[0] || ''));
            }
            if (!date) {
              const m = metaNoTitle.match(/\b\d{4}\b/);
              date = m ? m[0] : '';
            }
          }

          const image = imgEl?.src || '';
          const url = linkEl?.href || '';

          const yearMatch = (date || '').match(/\b\d{4}\b/);
          const year = yearMatch ? parseInt(yearMatch[0], 10) : null;

          const rawIdMatch = url.match(/\/item\/([^/#?]+)/);
          const rawId = rawIdMatch ? rawIdMatch[1] : null;

          items.push({
            rawId,
            name: title,
            title,
            artist,
            year,
            date,
            image,
            url,
            description: cleanText(`${artist}${date ? ' - ' + date : ''}`),
          });
        });

        return { items, cardCount: cards.length, htmlSnippet: (container?.innerHTML || '').slice(0, 2000) };
      });

      console.log(`Page ${pageNum} debug:`, res.cardCount, 'cards found');
      console.log('HTML snippet:', res.htmlSnippet);

      if (res.items.length === 0) {
        console.log('No photographs found on this page.');
        break;
      }

      let addedThisPage = 0;
      for (const item of res.items) {
        const baseId = item.rawId || `page${pageNum}-${addedThisPage}`;
        if (seenIds.has(baseId)) continue;
        seenIds.add(baseId);
        addedThisPage += 1;
        const finalId = `vam-photo-${baseId}`;
        allItems.push({
          id: finalId,
          name: item.name,
          title: item.title,
          artist: item.artist,
          year: item.year,
          date: item.date,
          image: item.image,
          url: item.url,
          description: item.description,
        });
      }
      console.log(`Found ${addedThisPage} unique photographs on page ${pageNum}`);

      pageNum++;
      if (pageNum > endPage) {
        console.log('Reached page limit.');
        break;
      }
      if (res.items.length < 15) {
        console.log('Fewer than 15 items, likely last page.');
        break;
      }
      if (pageNum % 10 === 0) {
        const outputPath = path.join(__dirname, '..', 'public', 'data', 'vam-photographs.json');
        fs.writeFileSync(outputPath, JSON.stringify({ scrapedAt: startedAt, source: baseUrl, total: allItems.length, items: allItems }, null, 2));
        console.log(`Checkpoint saved at page ${pageNum}: ${allItems.length} photographs`);
      }
    } catch (error) {
      console.error(`Error on page ${pageNum}:`, error);
      break;
    }
  }

  await browser.close();

  const outputPath = path.join(__dirname, '..', 'public', 'data', 'vam-photographs.json');
  fs.writeFileSync(outputPath, JSON.stringify({ scrapedAt: startedAt, source: baseUrl, total: allItems.length, items: allItems }, null, 2));
  console.log(`Saved ${allItems.length} photographs to ${outputPath}`);
}

scrapeVAMPhotographs().catch(console.error);
