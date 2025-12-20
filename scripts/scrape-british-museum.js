#!/usr/bin/env node
/**
 * Scrape British Museum exhibitions (basic) and write to public/data/british-museum.json
 * Non-destructive: if site changes or request fails, we keep existing file.
 */
import fs from 'fs';
import path from 'path';
import * as cheerio from 'cheerio';
import pLimit from 'p-limit';

const root = process.cwd();
const outPath = path.join(root, 'public', 'data', 'british-museum.json');

async function fetchHtml(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.text();
}

function mapItem($, el) {
  const $el = $(el);
  const name = $el.find('h3, h2, .promo__title').first().text().trim() || $el.attr('aria-label') || '';
  const url = $el.find('a').first().attr('href') || '';
  const img = $el.find('img').first().attr('src') || '';
  const dateText = $el.find('.date, .promo__meta, time').map((i, t) => $(t).text().trim()).get().join(' ').trim();
  // Very light date parsing, fallback to empty strings
  const parsedDates = (dateText || '').match(/(\d{1,2}\s\w+\s\d{4})/g) || [];
  const startDate = parsedDates[0] ? new Date(parsedDates[0]).toISOString().slice(0,10) : '';
  const endDate = parsedDates[1] ? new Date(parsedDates[1]).toISOString().slice(0,10) : '';
  return {
    id: (name || url || Math.random().toString(36).slice(2)).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,''),
    name: name || 'Exhibition',
    title: name || 'Exhibition',
    description: '',
    startDate,
    endDate,
    image: img && img.startsWith('http') ? img : (img ? `https://www.britishmuseum.org${img}` : undefined),
    url: url && url.startsWith('http') ? url : (url ? `https://www.britishmuseum.org${url}` : undefined)
  };
}

async function scrape() {
  try {
    const base = 'https://www.britishmuseum.org';
    const listUrl = `${base}/exhibitions`;
    const html = await fetchHtml(listUrl);
    const $ = cheerio.load(html);
    const candidates = $('.promo, .teaser, article, li');
    const items = [];
    candidates.each((i, el) => {
      try {
        const it = mapItem($, el);
        if (it && it.name && it.url && /exhibition|exhibitions|display|event/i.test(it.url)) {
          items.push(it);
        }
      } catch {}
    });

    // Deduplicate by URL
    const dedup = Object.values(items.reduce((acc, it) => {
      if (!it.url) return acc;
      acc[it.url] = acc[it.url] || it;
      return acc;
    }, {}));

    // Keep a small, clean set
    const payload = {
      description: 'British Museum exhibitions and displays (scraped) — light parser.',
      items: dedup.slice(0, 24),
      past: []
    };

    fs.writeFileSync(outPath, JSON.stringify(payload, null, 2));
    console.log(`Wrote ${outPath} with ${payload.items.length} items.`);
  } catch (e) {
    console.error('British Museum scrape failed:', e?.message || e);
    // keep existing file
  }
}

scrape();
