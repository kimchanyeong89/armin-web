#!/usr/bin/env node
/* eslint-disable no-console */

// Scrapes Kim Younggap Gallery Dumoak works for category=8.
// The page is EUC-KR encoded and shows one image per page with prev/next navigation.

const fs = require('node:fs');
const path = require('node:path');
const iconv = require('iconv-lite');

const BASE = 'http://www.dumoak.co.kr';
const START_URL = `${BASE}/kim-work.php?category=8`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchHtml(url) {
  const res = await fetch(url, {
    headers: {
      // Older site; accept whatever it gives.
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X) AppleWebKit/537.36 (KHTML, like Gecko) Chrome Safari',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  // Site declares euc-kr
  const html = iconv.decode(buf, 'euc-kr');
  return html;
}

function stripSessionParams(href) {
  if (!href) return href;
  try {
    const u = new URL(href, START_URL);
    u.searchParams.delete('PHPSESSID');
    return u.toString();
  } catch {
    return href;
  }
}

function parsePage(html, pageUrl) {
  // image
  const imgMatch = html.match(/<div\s+class="img"[^>]*>\s*<img\s+src="([^"]+bd_num=(\d+)[^"]*)"[^>]*title="([^"]*)"/i);
  if (!imgMatch) throw new Error(`Failed to parse image on ${pageUrl}`);
  const imgSrc = imgMatch[1];
  const bdNum = Number(imgMatch[2]);
  const imgTitle = (imgMatch[3] || '').trim();

  // page indicator: <div class="page"><strong>1</strong>/5</div>
  const pageMatch = html.match(/<div\s+class="page"[^>]*>\s*<strong>(\d+)<\/strong>\s*\/\s*(\d+)\s*<\/div>/i);
  const pageIndex = pageMatch ? Number(pageMatch[1]) : undefined;
  const totalPages = pageMatch ? Number(pageMatch[2]) : undefined;

  // next link: in .etc .btn there are typically two anchors: prev and next.
  // On page 1, prev may be javascript:; on later pages it's a real URL.
  const btnBlock = html.match(/<div\s+class="btn"[^>]*>([\s\S]*?)<\/div>/i);
  const hrefs = btnBlock
    ? Array.from(btnBlock[1].matchAll(/<a\s+href="([^"]+)"/gi)).map((m) => m[1])
    : [];
  const nextHref = hrefs.length >= 2 ? stripSessionParams(hrefs[1]) : '';

  // category label: menu item m8 title
  const catMatch = html.match(/<li\s+class="m8"[^>]*>\s*<a\s+href="\?category=8[^"]*"\s+title="([^"]+)"/i);
  const categoryLabel = (catMatch ? catMatch[1] : '').trim();

  return {
    bdNum,
    imgSrc: new URL(imgSrc, BASE).toString(),
    imgTitle,
    pageIndex,
    totalPages,
    nextUrl: nextHref ? new URL(nextHref, START_URL).toString() : '',
    categoryLabel,
  };
}

async function main() {
  const visited = new Set();
  const items = [];

  let url = START_URL;
  let safety = 0;
  let categoryLabel = '';

  while (url && safety < 50) {
    safety += 1;
    const html = await fetchHtml(url);
    const parsed = parsePage(html, url);

    categoryLabel = parsed.categoryLabel || categoryLabel;

    if (visited.has(parsed.bdNum)) break;
    visited.add(parsed.bdNum);

    const title = (parsed.imgTitle || '').replace(/\s+/g, ' ').trim() || `Work ${parsed.bdNum}`;

    items.push({
      id: `dumoak-${parsed.bdNum}`,
      title,
      artist: '김영갑',
      date: '',
      medium: '',
      dimensions: '',
      description: '',
      category: categoryLabel || 'Dumoak Works',
      imageUrl: parsed.imgSrc,
      detailUrl: `${BASE}/kim-work.php?category=8&num=${parsed.bdNum}`,
      sourceUrl: `${BASE}/kim-work.php?category=8&num=${parsed.bdNum}`,
      raw: {
        bdNum: parsed.bdNum,
        pageIndex: parsed.pageIndex,
        totalPages: parsed.totalPages,
        category: 8,
        categoryLabel: categoryLabel || undefined,
      },
    });

    // Stop if we're at the end
    if (!parsed.nextUrl || (parsed.totalPages && parsed.pageIndex && parsed.pageIndex >= parsed.totalPages)) break;

    url = parsed.nextUrl;
    // be gentle
    await sleep(200);
  }

  console.log(`[dumoak] category=8 collected ${items.length} items`);

  // Write JSON
  const outPath = path.join(process.cwd(), 'public', 'data', 'dumoak-kim-work-category8.json');
  fs.writeFileSync(outPath, JSON.stringify(items, null, 2), 'utf8');
  console.log(`[dumoak] wrote ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
