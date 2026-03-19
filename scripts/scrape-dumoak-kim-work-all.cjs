#!/usr/bin/env node
/* eslint-disable no-console */

// Scrapes Kim Younggap Gallery Dumoak works from the underlying rg4_board "work" board.
// This is the only reliable way to get the full set of works (the kim-work.php slideshow shows a small subset).

const fs = require('node:fs');
const path = require('node:path');
const iconv = require('iconv-lite');

const BASE = 'http://www.dumoak.co.kr';
const LIST_URL = `${BASE}/bbs/rg4_board/list.php?bbs_code=work`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchHtml(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X) AppleWebKit/537.36 (KHTML, like Gecko) Chrome Safari',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  return iconv.decode(buf, 'euc-kr');
}

function stripSessionParams(url, baseUrl) {
  if (!url) return url;
  try {
    const u = new URL(url, baseUrl);
    u.searchParams.delete('PHPSESSID');
    return u.toString();
  } catch {
    return url;
  }
}

function stripTagsToText(html) {
  if (!html) return '';
  return String(html)
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\s*\/p\s*>/gi, '\n')
    .replace(/<\s*p\b[^>]*>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/\s+\n/g, '\n')
    .replace(/\n\s+/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function parseListBdNums(html) {
  // list pages include view links with bd_num=NNNN
  const nums = [];
  for (const m of html.matchAll(/bd_num=(\d+)/g)) {
    const n = Number(m[1]);
    if (Number.isFinite(n)) nums.push(n);
  }
  return [...new Set(nums)];
}

function parseMaxPage(html) {
  const pages = [];
  for (const m of html.matchAll(/\bpage=(\d+)\b/g)) {
    const n = Number(m[1]);
    if (Number.isFinite(n)) pages.push(n);
  }
  return pages.length ? Math.max(...pages) : 1;
}

async function fetchAllBdNums() {
  const all = [];
  const seen = new Set();
  let page = 1;
  let maxPage = 1;

  while (page <= maxPage && page <= 1000) {
    const url = `${LIST_URL}&page=${page}`;
    const html = await fetchHtml(url);
    const nums = parseListBdNums(html);
    if (page === 1) {
      maxPage = Math.max(maxPage, parseMaxPage(html));
    } else {
      maxPage = Math.max(maxPage, parseMaxPage(html));
    }

    let added = 0;
    for (const n of nums) {
      if (seen.has(n)) continue;
      seen.add(n);
      all.push(n);
      added += 1;
    }

    if (!nums.length || added === 0) break;
    page += 1;
    await sleep(120);
  }

  // Typically newest-first; keep descending for stability
  all.sort((a, b) => b - a);
  return all;
}

function parseViewPage(html, bdNum) {
  // Title line example:
  // <td><div style="float:left;">[바람]바람5</div><div style="float:right;">조회수 ...
  const titleLineMatch = html.match(/float:left;">\s*([^<]+)\s*<\/div>/i);
  const titleLine = titleLineMatch ? titleLineMatch[1].replace(/\s+/g, ' ').trim() : '';
  const catTitleMatch = titleLine.match(/^\[([^\]]+)\]\s*(.+)$/);
  const categoryLabel = catTitleMatch ? catTitleMatch[1].trim().replace(/\s+/g, ' ') : '';
  const title = (catTitleMatch ? catTitleMatch[2] : titleLine).trim() || `Work ${bdNum}`;

  const imgMatch = html.match(/down\.php\?[^"']*bbs_code=work[^"']*bd_num=\d+[^"']*mode=view/gi);
  const imageRel = imgMatch && imgMatch.length ? imgMatch[0] : '';
  const imageUrl = imageRel ? new URL(imageRel, `${BASE}/bbs/rg4_board/`).toString() : '';

  // Description/content: prefer the actual content container if present.
  // Many rg4_board skins wrap content in a dedicated element like <div id="ct"> ... </div>.
  let description = '';
  const ct = html.match(/<div\s+id=["']ct["'][^>]*>([\s\S]*?)<\/div>/i);
  if (ct) {
    const cleaned = ct[1].replace(/<img[^>]*>/gi, '');
    description = stripTagsToText(cleaned);
  } else {
    // Fallback: capture the main content cell and strip tags, excluding images.
    const contentCell = html.match(/<td\s+colspan="2"[^>]*style=['"][^'"]*word-break:break-all[^'"]*['"][^>]*>([\s\S]*?)<\/td>/i);
    if (contentCell) {
      const cleaned = contentCell[1]
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<img[^>]*>/gi, '')
        .replace(/<a\b[^>]*>\s*<img[^>]*>\s*<\/a>/gi, '');
      description = stripTagsToText(cleaned);
    }
  }

  return {
    title,
    categoryLabel,
    imageUrl,
    description,
  };
}

async function main() {
  const bdNums = await fetchAllBdNums();
  console.log(`[dumoak] discovered ${bdNums.length} board entries`);

  const usedIds = new Set();

  const rows = [];
  for (const bdNum of bdNums) {
    const url = `${BASE}/bbs/rg4_board/view.php?&bbs_code=work&bd_num=${bdNum}`;
    const html = await fetchHtml(url);
    const parsed = parseViewPage(html, bdNum);

    const baseId = `dumoak-${bdNum}`;
    const id = usedIds.has(baseId) ? `${baseId}-dup` : baseId;
    usedIds.add(id);

    rows.push({
      id,
      title: parsed.title,
      artist: '김영갑',
      date: '',
      medium: '',
      dimensions: '',
      description: parsed.description || '',
      category: parsed.categoryLabel || 'Dumoak Works',
      imageUrl: parsed.imageUrl,
      detailUrl: url,
      sourceUrl: url,
      raw: {
        bdNum,
        categoryLabel: parsed.categoryLabel || undefined,
      },
    });

    await sleep(80);
  }

  const all = rows.filter((r) => r && r.imageUrl);

  console.log(`[dumoak] total collected ${all.length} items from board`);

  const outPath = path.join(process.cwd(), 'public', 'data', 'dumoak-kim-work-all.json');
  fs.writeFileSync(outPath, JSON.stringify(all, null, 2), 'utf8');
  console.log(`[dumoak] wrote ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
