/**
 * NTMoFA (National Taiwan Museum of Fine Arts) collection scraper.
 * Source: https://ntmofa-collections.ntmofa.gov.tw/en/Search.aspx
 * Test run: 100 items. Uses list cards (ArtWorkListItem) + GalData link + img alt.
 */
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

const BASE_URL = 'https://ntmofa-collections.ntmofa.gov.tw/en';
const SEARCH_URL = `${BASE_URL}/Search.aspx`;
const OUTPUT_FILE = path.join(__dirname, '../public/data/ntmofa-collection.json');
const PROGRESS_FILE = path.join(__dirname, '../downloads/ntmofa-progress.json');

const LIMIT = 100000;
const DELAY_MS = 1500;

function loadProgress() {
  if (fs.existsSync(PROGRESS_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
    } catch (e) { }
  }
  // Fallback: Load from existing collection if available to resume/deduplicate
  if (fs.existsSync(OUTPUT_FILE)) {
    try {
      const params = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf8'));
      if (Array.isArray(params) && params.length > 0) {
        const ids = params.map(p => p.metadata?.artworkId || p.id.replace('ntmofa-', ''));
        // Estimate page: if 5000 items, and 30 per page -> 166. Start at 160 to be safe?
        // Or just start at 1 and let it skip quickly (better for completeness check).
        // Let's start at Math.floor(params.length / 30) but be conservative.
        const estimatedPage = Math.floor(params.length / 30) + 1;
        console.log(`Loaded ${params.length} existing items. Resuming from estimated Page ${estimatedPage}...`);
        return {
          artworks: params,
          page: estimatedPage,
          processedIds: ids
        };
      }
    } catch (e) { console.log('Error reading existing output file:', e.message); }
  }
  return { artworks: [], page: 1, processedIds: [] };
}

function saveProgress(p) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify({ ...p, processedIds: Array.from(p.processedIds || []) }, null, 2));
}

async function scrape() {
  console.log('=== NTMoFA Collection Scraper (Full Collection with Filters) ===\n');
  const progress = loadProgress();
  const processedIds = new Set(progress.processedIds || []);
  const artworks = progress.artworks || [];
  let pageIndex = progress.page || 1;

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9' });

    // Initial navigation
    await page.goto(SEARCH_URL, { waitUntil: 'networkidle2', timeout: 60000 });

    if (pageIndex === 1 && artworks.length === 0) {
      console.log('Setting up Advanced Search filters...');

      // 1. Open Advanced Search
      await page.evaluate(() => {
        const advBtn = document.querySelector('a[href="#AdvancedSearch"]');
        if (advBtn) advBtn.click();
      });
      await new Promise(r => setTimeout(r, 1000));

      // 2. Select specific categories
      /*
        Checked: Ink Painting, Photography, New Media, Watercolor, Drawing, 
                 Acrylic, Print, Conceptual Art, Graphic Design, Oil Painting, Pastel
      */
      await page.evaluate(() => {
        const targets = [
          'repAATAB1_ctl00_chkSelect', // Ink Painting
          'repAATAB1_ctl05_chkSelect', // Photography
          'repAATAB1_ctl10_chkSelect', // New Media
          'repAATAB1_ctl15_chkSelect', // Watercolor
          'repAATAB1_ctl07_chkSelect', // Drawing
          'repAATAB1_ctl17_chkSelect', // Acrylic
          'repAATAB1_ctl16_chkSelect', // Print
          'repAATAB1_ctl03_chkSelect', // Conceptual Art
          'repAATAB1_ctl04_chkSelect', // Graphic Design
          'repAATAB1_ctl14_chkSelect', // Oil Painting
          'repAATAB1_ctl18_chkSelect'  // Pastel
        ];

        targets.forEach(id => {
          const cb = document.getElementById(id);
          if (cb && !cb.checked) cb.click();
        });
      });
      await new Promise(r => setTimeout(r, 500));

      // 3. Click Search
      try {
        await Promise.all([
          page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 }),
          page.evaluate(() => {
            const btn = document.getElementById('btnAdvSearch');
            if (btn) btn.click();
          })
        ]);
      } catch (e) {
        console.log('Navigation timeout on search submit, proceeding check...');
      }

      // 4. Log Total Count
      const totalCount = await page.evaluate(() => {
        const lbl = document.getElementById('lblTotalCount');
        return lbl ? parseInt(lbl.innerText.replace(/[^0-9]/g, '')) : 0;
      });
      console.log(`  Total items found on site: ${totalCount}`);

    } else if (pageIndex > 1) {
      // Restore session/page state if resuming? 
      // Note: Resuming ASP.NET WebForms session is hard. 
      // For simplicity, if interrupted, we might need to restart or use a more complex resume logic.
      // But the user asked for a "full scrape", let's assume valid session or restart.
      // Ideally we would need to re-apply filters and navigate to page X.
      // For now, let's assume single run success or simple resume logic might fail on session.
      // If resuming is critical, we'd need to re-run filter setup then look for page jump.
      if (pageIndex > 1) {
        console.log('Resuming: Re-applying filters to get back to state...');
        // Re-apply logic same as above
        await page.evaluate(() => {
          const advBtn = document.querySelector('a[href="#AdvancedSearch"]');
          if (advBtn) advBtn.click();
        });
        await new Promise(r => setTimeout(r, 1000));
        await page.evaluate(() => {
          const targets = [
            'repAATAB1_ctl00_chkSelect', 'repAATAB1_ctl05_chkSelect', 'repAATAB1_ctl10_chkSelect',
            'repAATAB1_ctl15_chkSelect', 'repAATAB1_ctl07_chkSelect', 'repAATAB1_ctl17_chkSelect',
            'repAATAB1_ctl16_chkSelect', 'repAATAB1_ctl03_chkSelect', 'repAATAB1_ctl04_chkSelect',
            'repAATAB1_ctl14_chkSelect', 'repAATAB1_ctl18_chkSelect'
          ];
          targets.forEach(id => {
            const cb = document.getElementById(id);
            if (cb && !cb.checked) cb.click();
          });
        });
        await Promise.all([
          page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 }),
          page.evaluate(() => document.getElementById('btnAdvSearch').click())
        ]);

        console.log(`Warning: Jumping to page ${pageIndex} is tricky in ASP.NET. Attempting to fast-forward...`);
        // Simple loop to click next until pageIndex is reached
        let currentP = 1;
        while (currentP < pageIndex) {
          try {
            await Promise.all([
              page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 }),
              page.evaluate((nextPageNum) => {
                const links = Array.from(document.querySelectorAll('a, input[type="submit"]'));
                const nextBtn = links.find((a) => {
                  const t = (a.textContent || a.value || '').trim();
                  return /^Next$/i.test(t) || t === '>' || t === '»';
                });
                if (nextBtn) nextBtn.click();
              }, currentP + 1)
            ]);
            currentP++;
            process.stdout.write(`\rSkipped to page ${currentP}...`);
          } catch (e) {
            console.log('Error fast-forwarding:', e.message);
            break;
          }
        }
        console.log('\nResumed at page', pageIndex);
      }
    }

    while (artworks.length < LIMIT) {
      console.log('\n[Page %d] Loading...', pageIndex);
      // Wait for content load
      await new Promise(r => setTimeout(r, 2000));
      const pageData = await page.evaluate((baseUrl) => {
        const items = [];
        const listItems = document.querySelectorAll('.ArtWorkListItem');
        listItems.forEach((div) => {
          const a = div.querySelector('a[href*="GalData"]');
          if (!a) return;
          const href = a.getAttribute('href');
          if (!href) return;
          const fullUrl = href.startsWith('http') ? href : new URL(href, baseUrl).href;

          // ID extraction: RNO parameter or fallback
          const rnoMatch = href.match(/RNO=([^&\s]+)/i);
          const rno = rnoMatch ? rnoMatch[1] : '';
          const id = rno || fullUrl.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 40);

          const img = div.querySelector('.ArtWorkImg img');
          const imgSrc = img?.src || img?.getAttribute('data-src') || '';

          // Metadata extraction using specific classes
          const title = (div.querySelector('.name')?.textContent || '').trim();
          const creator = (div.querySelector('.creator')?.textContent || '').trim();
          const yearStr = (div.querySelector('.year')?.textContent || '').trim();
          const type = (div.querySelector('.type')?.textContent || '').trim();

          let year = null;
          if (yearStr && /^\d{4}$/.test(yearStr)) {
            year = parseInt(yearStr, 10);
          } else if (yearStr) {
            const yMatch = yearStr.match(/\d{4}/);
            if (yMatch) year = parseInt(yMatch[0], 10);
          }

          items.push({
            id: id,
            title: title || 'Untitled',
            creator,
            year,
            category: type || 'Artwork',
            image: imgSrc,
            sourceUrl: fullUrl,
          });
        });
        return items;
      }, BASE_URL);

      let newCount = 0;
      for (const item of pageData) {
        const uid = item.id || item.sourceUrl;
        if (processedIds.has(uid)) continue;
        if (artworks.length >= LIMIT) break;
        processedIds.add(uid);
        newCount++;

        const artwork = {
          id: `ntmofa-${item.id}`,
          name: item.title || 'Untitled',
          artist: item.creator || '',
          year: item.year,
          image: item.image || '',
          category: item.category || 'Artwork',
          type: (item.category || '').toLowerCase().includes('sculpture') ? '3D' : '2D',
          museum: 'National Taiwan Museum of Fine Arts',
          exhibitionName: 'Collection',
          exhibitionTitle: 'Collection',
          roomId: 'ntmofa-collection',
          sourceUrl: item.sourceUrl || SEARCH_URL,
          metadata: {
            artworkId: item.id,
            museum: 'National Taiwan Museum of Fine Arts',
            location: 'Taichung, Taiwan',
          },
        };
        artworks.push(artwork);
      }

      console.log('  Found %d items, %d new (total: %d)', pageData.length, newCount, artworks.length);

      if (artworks.length >= LIMIT) break;

      const hasNext = await page.evaluate((nextPageNum) => {
        const links = Array.from(document.querySelectorAll('a, input[type="submit"]'));
        return links.some((a) => {
          const t = (a.textContent || a.value || '').trim();
          return /^Next$/i.test(t) || t === '>' || t === '»' || t === String(nextPageNum);
        });
      }, pageIndex + 1);
      if (!hasNext || pageData.length === 0) break;

      let clickedNext = false;
      try {
        await Promise.all([
          page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 }),
          page.evaluate((nextPageNum) => {
            const links = Array.from(document.querySelectorAll('a, input[type="submit"]'));
            const nextBtn = links.find((a) => {
              const t = (a.textContent || a.value || '').trim();
              return /^Next$/i.test(t) || t === '>' || t === '»';
            });
            if (nextBtn) { nextBtn.click(); return true; }
            const numBtn = links.find((a) => (a.textContent || '').trim() === String(nextPageNum));
            if (numBtn) { numBtn.click(); return true; }
            return false;
          }, pageIndex + 1).then(res => clickedNext = res)
        ]);
      } catch (e) {
        console.log('Navigation timeout on pagination, continuing if possibly loaded...', e.message);
        // If timeout, assume stick found/clicked but netidle2 failed? or failed to find button.
        // But result of evaluate is lost if we don't catch it from Promise.all? 
        // Actually Promise.all fails if one fails.
        // We can assume if no error, it clicked. If error, maybe valid or not.
        // Let's rely on hasNext check next turn?
        clickedNext = true; // Assume success to continue loop, hasNext will fail if not true.
      }
      if (!clickedNext) break;
      pageIndex++;
      await new Promise((r) => setTimeout(r, DELAY_MS));
      saveProgress({ artworks, page: pageIndex, processedIds });
    }

    await browser.close();
  } catch (e) {
    console.error('Scrape error:', e);
    try { await browser.close(); } catch (_) { }
  }

  const byId = new Map();
  artworks.forEach((a) => byId.set(a.id, a));
  const final = Array.from(byId.values()).slice(0, LIMIT);
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(final, null, 2));
  console.log('\n✅ Done. Total: %d. Saved to %s', final.length, OUTPUT_FILE);
  if (fs.existsSync(PROGRESS_FILE)) fs.unlinkSync(PROGRESS_FILE);
}

scrape().catch(console.error);
