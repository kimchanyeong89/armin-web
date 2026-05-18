const { chromium } = require('playwright');

(async () => {
  const baseUrl = process.env.SEARCH_VALIDATE_URL || 'http://127.0.0.1:5173';
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 393, height: 852 } });
  await page.goto(`${baseUrl}/search`, { waitUntil: 'domcontentloaded', timeout: 45000 });

  const input = page.locator('#global-search-input');
  try {
    await input.waitFor({ timeout: 30000 });
  } catch (_err) {
    const diagnostics = await page.evaluate(() => {
      const inputs = Array.from(document.querySelectorAll('input')).map((el) => ({
        id: el.id || '',
        name: el.getAttribute('name') || '',
        placeholder: el.getAttribute('placeholder') || '',
      }));
      return {
        title: document.title,
        url: window.location.href,
        inputCount: inputs.length,
        inputs: inputs.slice(0, 10),
      };
    });
    console.error('Search input not found:', JSON.stringify(diagnostics, null, 2));
    await browser.close();
    process.exit(1);
  }

  await input.click();
  await input.fill('');
  await page.keyboard.type('vincent', { delay: 40 });
  try {
    await page.waitForFunction(() => {
      const body = (document.body?.innerText || '').replace(/\s+/g, ' ');
      return /ARTISTS\s*\d+/i.test(body)
        || /ARTWORKS\s*\d+/i.test(body);
    }, { timeout: 15000 });
  } catch (_err) {
    await page.waitForTimeout(8000);
  }

  // Wait for at least one visible result image to decode, otherwise metrics can race too early.
  try {
    await page.waitForFunction(() => {
      const textOf = (el) => (el && el.textContent ? el.textContent : '').replace(/\s+/g, ' ').trim();
      const buttons = Array.from(document.querySelectorAll('button'));
      const candidate = buttons.find((btn) => {
        const t = textOf(btn);
        return (/\bworks\b/i.test(t) && !t.includes('ⓘ') && !/더보기|접기/.test(t)) || t.includes('ⓘ');
      });
      if (!candidate) return false;
      const imgs = Array.from(candidate.querySelectorAll('img'));
      return imgs.some((img) => img.complete && img.naturalWidth > 0);
    }, { timeout: 12000 });
  } catch (_err) {
    // best effort only
  }

  const collectMetrics = () => page.evaluate(() => {
    const textOf = (el) => (el && el.textContent ? el.textContent : '').replace(/\s+/g, ' ').trim();
    const allDivs = Array.from(document.querySelectorAll('div'));
    const startsWithLabel = (text, label) => {
      const compact = String(text || '').replace(/\s+/g, '').toLowerCase();
      return compact.startsWith(label.toLowerCase());
    };

    const artistsHeader = allDivs.find((el) => {
      const t = textOf(el);
      return startsWithLabel(t, 'artists');
    }) || null;

    const allButtons = Array.from(document.querySelectorAll('button'));
    const chipButtons = allButtons.filter((btn) => {
      const t = textOf(btn);
      if (!/\bworks\b/i.test(t) || /더보기|접기/.test(t) || t.includes('ⓘ')) return false;
      return true;
    });

    const chipStats = chipButtons.slice(0, 12).map((btn) => {
      const r = btn.getBoundingClientRect();
      const imgs = Array.from(btn.querySelectorAll('img'));
      const loaded = imgs.filter((img) => img.complete && img.naturalWidth > 0);
      const nonDataLoaded = loaded.filter((img) => !(String(img.src || '').startsWith('data:image')));
      return {
        text: textOf(btn).slice(0, 70),
        width: Math.round(r.width),
        top: Math.round(r.top),
        imgCount: imgs.length,
        loadedCount: loaded.length,
        nonDataLoadedCount: nonDataLoaded.length,
        hasProgressivePair: imgs.length >= 2,
      };
    });

    const uniqueRowTops = Array.from(new Set(chipStats.map((s) => s.top)));

    const worksHeader = allDivs.find((el) => {
      const t = textOf(el);
      return startsWithLabel(t, 'artworks');
    }) || null;

    let workItemStats = null;
    if (worksHeader || true) {
      const workButtons = allButtons.filter((btn) => {
        const txt = textOf(btn);
        if (!txt || /더보기|접기|Open in museum|Details/i.test(txt)) return false;
        if (!txt.includes('ⓘ')) return false;
        return btn.querySelector('img') !== null;
      });

      const first = workButtons[0];
      if (first) {
        const imgs = Array.from(first.querySelectorAll('img'));
        workItemStats = {
          text: textOf(first).slice(0, 90),
          imgCount: imgs.length,
          hasProgressivePair: imgs.length >= 2,
          loadedCount: imgs.filter((img) => img.complete && img.naturalWidth > 0).length,
          nonDataLoadedCount: imgs.filter((img) => img.complete && img.naturalWidth > 0 && !String(img.src || '').startsWith('data:image')).length,
        };
      }
    }

    const moreBtn = allButtons.find((btn) => /더보기|접기/.test(textOf(btn))) || null;

    const searchInput = document.querySelector('#global-search-input');
    const bodyText = (document.body?.innerText || '').replace(/\s+/g, ' ');

    return {
      query: searchInput && 'value' in searchInput ? searchInput.value : '',
      foundArtistsSection: !!artistsHeader || chipButtons.length > 0,
      chipCount: chipButtons.length,
      uniqueRowCount: uniqueRowTops.length,
      chipStats,
      hasMoreButton: !!moreBtn,
      moreButtonText: moreBtn ? textOf(moreBtn) : '',
      workItemStats,
      bodyHasArtistsToken: /ARTISTS\s*\d+/i.test(bodyText),
      bodyHasArtworksToken: /ARTWORKS\s*\d+/i.test(bodyText),
    };
  });

  let metrics = await collectMetrics();
  if (!metrics.bodyHasArtistsToken && !metrics.bodyHasArtworksToken) {
    await page.waitForTimeout(7000);
    metrics = await collectMetrics();
  }

  console.log(JSON.stringify(metrics, null, 2));
  await browser.close();
})();
