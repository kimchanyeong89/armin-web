const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

async function scrapeVAMPosters() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  // Posters-only category (user-provided URL), images present, V&A venue, 1901–2025
  const baseUrl = 'https://collections.vam.ac.uk/search/?id_category=THES252963&images_exist=true&kw_resident_venue=VA&page_size=15&q=&year_made_from=1901&year_made_to=2025';
  const startPage = Number(process.env.START_PAGE || 1);
  const endPage = Number(process.env.END_PAGE || 999); // unknown max; stop when fewer than 15 results
  let pageNum = startPage;
  const allItems = [];
  const startedAt = new Date().toISOString();
  const seenIds = new Set();

  // Resume support
  if (process.env.CLEAN !== '1') {
    try {
      const existingPath = path.join(__dirname, '..', 'public', 'data', 'vam-posters.json');
      if (fs.existsSync(existingPath)) {
        const existing = JSON.parse(fs.readFileSync(existingPath, 'utf8'));
        const items = Array.isArray(existing.items) ? existing.items : [];
        for (const it of items) {
          const rid = String(it.id || '').replace(/^vam-poster-/, '');
          if (rid) seenIds.add(rid);
          allItems.push(it);
        }
        console.log(`Resumed with ${allItems.length} existing posters.`);
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

        cards.forEach(card => {
          const linkEl = card.querySelector('a[href*="/item/"]') || card.closest('a[href*="/item/"]') || card.querySelector('a');
          const imgEl = card.querySelector('img');
          const titleEl = card.querySelector('h3, h2, .c-card__title, figcaption, .title') || linkEl;
          const metaEl = card.querySelector('figcaption, .c-card__meta, .b-search-results-row__subcaption') || card;

          if (!linkEl) return;
          let title = titleEl?.textContent?.trim() || '';
          if (!title && imgEl) title = imgEl.alt || '';
          const metaText = metaEl?.textContent?.trim() || '';
          let artist = '';
          let date = '';
          const metaYearMatch = metaText.match(/\b\d{4}\b/);
          if (metaYearMatch) date = metaYearMatch[0];
          artist = metaText.split(/\b\d{4}\b|—|\||\,/)[0]?.trim() || '';
          const image = imgEl?.src || '';
          const url = linkEl?.href || '';

          const dateYearMatch = date.match(/\b\d{4}\b/);
          const year = dateYearMatch ? parseInt(dateYearMatch[0]) : null;

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
            description: `${artist} - ${date}`.trim(),
          });
        });

        return { items, cardCount: cards.length, htmlSnippet: (container?.innerHTML || '').slice(0, 2000) };
      });

      console.log(`Page ${pageNum} debug:`, res.cardCount, 'cards found');
      console.log('HTML snippet:', res.htmlSnippet);

      if (res.items.length === 0) {
        console.log('No posters found on this page.');
        break;
      }

      let addedThisPage = 0;
      for (const item of res.items) {
        const baseId = item.rawId || `page${pageNum}-${addedThisPage}`;
        if (seenIds.has(baseId)) continue;
        seenIds.add(baseId);
        addedThisPage += 1;
        const finalId = `vam-poster-${baseId}`;
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
      console.log(`Found ${addedThisPage} unique posters on page ${pageNum}`);

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
        const outputPath = path.join(__dirname, '..', 'public', 'data', 'vam-posters.json');
        fs.writeFileSync(outputPath, JSON.stringify({ scrapedAt: startedAt, source: baseUrl, total: allItems.length, items: allItems }, null, 2));
        console.log(`Checkpoint saved at page ${pageNum}: ${allItems.length} posters`);
      }
    } catch (error) {
      console.error(`Error on page ${pageNum}:`, error);
      break;
    }
  }

  await browser.close();

  const outputPath = path.join(__dirname, '..', 'public', 'data', 'vam-posters.json');
  fs.writeFileSync(outputPath, JSON.stringify({ scrapedAt: startedAt, source: baseUrl, total: allItems.length, items: allItems }, null, 2));
  console.log(`Saved ${allItems.length} posters to ${outputPath}`);
}

scrapeVAMPosters().catch(console.error);
