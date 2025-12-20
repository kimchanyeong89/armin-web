const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

async function scrapeVAMPaintings() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  // Painting-only, images present, V&A venue, 1800–2025 range
  const baseUrl = 'https://collections.vam.ac.uk/search/?id_category=THES48917&images_exist=true&kw_resident_venue=VA&page_size=15&q=&year_made_from=1800&year_made_to=2025';
  const startPage = Number(process.env.START_PAGE || 1);
  const endPage = Number(process.env.END_PAGE || 665);
  let pageNum = startPage;
  const allPaintings = [];
  const startedAt = new Date().toISOString();
  const seenIds = new Set();

  // Load existing output to resume/avoid duplicates, unless CLEAN=1
  if (process.env.CLEAN !== '1') {
    try {
      const existingPath = path.join(__dirname, '..', 'public', 'data', 'vam-paintings.json');
      if (fs.existsSync(existingPath)) {
        const existing = JSON.parse(fs.readFileSync(existingPath, 'utf8'));
        const items = Array.isArray(existing.items) ? existing.items : [];
        for (const it of items) {
          const rid = String(it.id || '').replace(/^vam-painting-/, '');
          if (rid) seenIds.add(rid);
          allPaintings.push(it);
        }
        console.log(`Resumed with ${allPaintings.length} existing items.`);
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
      // Wait for search containers
      await page.waitForSelector('#search-results-grid, #vam-search-results, .g-object-grid', { timeout: 30000 });
      // Poll for items to appear (up to ~10s)
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

      // Check if there are results
      const noResults = await page.locator('text=No results found').count();
      if (noResults > 0) {
        console.log('No more results.');
        break;
      }

      // Extract paintings from the page
      const paintings = await page.evaluate(() => {
        const items = [];
        // Prefer image grid when available
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
          if (!title && imgEl) {
            title = imgEl.alt || '';
          }
          const metaText = metaEl?.textContent?.trim() || '';
          // Heuristic split: try to separate artist and date
          let artist = '';
          let date = '';
          const metaYearMatch = metaText.match(/\b\d{4}\b/);
          if (metaYearMatch) date = metaYearMatch[0];
          // crude artist extraction: take leading segment before year or dash
          artist = metaText.split(/\b\d{4}\b|—|\||\,/)[0]?.trim() || '';
          const image = imgEl?.src || '';
          const url = linkEl?.href || '';

          // Extract year from date if possible
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

      console.log(`Page ${pageNum} debug:`, paintings.cardCount, 'cards found');
      console.log('HTML snippet:', paintings.htmlSnippet);

      if (paintings.items.length === 0) {
        console.log('No paintings found on this page.');
        break;
      }

      let addedThisPage = 0;
      for (const item of paintings.items) {
        const baseId = item.rawId || `page${pageNum}-${addedThisPage}`;
        if (seenIds.has(baseId)) continue;
        seenIds.add(baseId);
        addedThisPage += 1;
        const finalId = `vam-painting-${baseId}`;
        allPaintings.push({
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
      console.log(`Found ${addedThisPage} unique paintings on page ${pageNum}`);

      // Check for next page
      // Since the site might not have visible next button, we'll try up to a reasonable limit
      pageNum++;
      if (pageNum > endPage) { // Safety limit per request
        console.log('Reached page limit.');
        break;
      }

      // Optional: check if current page has fewer items (might indicate last page)
      if (paintings.items.length < 15) {
        console.log('Fewer than 15 items, likely last page.');
        break;
      }
      // Periodically checkpoint to disk
      if (pageNum % 10 === 0) {
        const outputPath = path.join(__dirname, '..', 'public', 'data', 'vam-paintings.json');
        fs.writeFileSync(outputPath, JSON.stringify({ scrapedAt: startedAt, source: baseUrl, total: allPaintings.length, items: allPaintings }, null, 2));
        console.log(`Checkpoint saved at page ${pageNum}: ${allPaintings.length} items`);
      }
    } catch (error) {
      console.error(`Error on page ${pageNum}:`, error);
      break;
    }
  }

  await browser.close();

  // Save to JSON
  const outputPath = path.join(__dirname, '..', 'public', 'data', 'vam-paintings.json');
  fs.writeFileSync(outputPath, JSON.stringify({ scrapedAt: startedAt, source: baseUrl, total: allPaintings.length, items: allPaintings }, null, 2));
  console.log(`Saved ${allPaintings.length} paintings to ${outputPath}`);
}

scrapeVAMPaintings().catch(console.error);