#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { load as cheerioLoad } from 'cheerio';
import got from 'got';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LIST_URL = 'https://www.tate.org.uk/whats-on?date_range=from_now&gallery_group=tate-modern';

function toYMDSpan(text) {
  if (!text) return { start: '', end: '' };
  const months = {
    jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
    jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12'
  };
  const s = String(text).toLowerCase().replace(/[\u2013\u2014—–]/g, '-').replace(/\s+/g, ' ');
  // 1) Full day range: 10 july 2025 - 11 january 2026
  let m = s.match(/(?:(\d{1,2})\s+([a-z]{3,})\s+(\d{4}))\s*(?:-|to|until)\s*(?:(\d{1,2})\s+([a-z]{3,})\s+(\d{4}))/i);
  if (m) {
    const start = `${m[3]}-${months[m[2].slice(0,3)] || ''}-${String(m[1]).padStart(2,'0')}`;
    const end = `${m[6]}-${months[m[5].slice(0,3)] || ''}-${String(m[4]).padStart(2,'0')}`;
    return { start, end };
  }
  // 2) Month range: july 2025 - january 2026
  m = s.match(/([a-z]{3,})\s+(\d{4})\s*(?:-|to|until)\s*([a-z]{3,})\s+(\d{4})/i);
  if (m) {
    const start = `${m[2]}-${months[m[1].slice(0,3)] || ''}`;
    const end = `${m[4]}-${months[m[3].slice(0,3)] || ''}`;
    return { start, end };
  }
  // 3) UNTIL date (day precision)
  m = s.match(/(?:until|till)\s*(\d{1,2})\s+([a-z]{3,})\s+(\d{4})/i);
  if (m) {
    const end = `${m[3]}-${months[m[2].slice(0,3)] || ''}-${String(m[1]).padStart(2,'0')}`;
    return { start: '', end };
  }
  // 4) UNTIL month
  m = s.match(/(?:until|till)\s*([a-z]{3,})\s+(\d{4})/i);
  if (m) {
    const end = `${m[2]}-${months[m[1].slice(0,3)] || ''}`;
    return { start: '', end };
  }
  // 5) Single full date (start only)
  m = s.match(/(\d{1,2})\s+([a-z]{3,})\s+(\d{4})/i);
  if (m) {
    const start = `${m[3]}-${months[m[2].slice(0,3)] || ''}-${String(m[1]).padStart(2,'0')}`;
    return { start, end: '' };
  }
  // 6) Single month-year
  m = s.match(/([a-z]{3,})\s+(\d{4})/i);
  if (m) {
    const start = `${m[2]}-${months[m[1].slice(0,3)] || ''}`;
    return { start, end: '' };
  }
  return { start: '', end: '' };
}

async function fetchHtml(url) {
  const res = await got(url, {
    headers: {
      'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
    },
    timeout: { request: 20000 }
  });
  return res.body;
}

async function enrichDetail(url) {
  try {
    const html = await fetchHtml(url);
    const $ = cheerioLoad(html);
    const og = $('meta[property="og:image"]').attr('content') || '';
    const title = $('h1').first().text().trim() || '';
    // Try JSON-LD for startDate/endDate
    let ldStart = '', ldEnd = '';
    $('script[type="application/ld+json"]').each((_, el) => {
      try {
        const json = JSON.parse($(el).contents().text());
        const arr = Array.isArray(json) ? json : [json];
        for (const obj of arr) {
          if (obj && (obj.startDate || obj.endDate || (obj.event && (obj.event.startDate || obj.event.endDate)))) {
            const s = obj.startDate || (obj.event && obj.event.startDate) || '';
            const e = obj.endDate || (obj.event && obj.event.endDate) || '';
            if (s && !ldStart) ldStart = String(s);
            if (e && !ldEnd) ldEnd = String(e);
          }
          if (obj && obj['@graph'] && Array.isArray(obj['@graph'])) {
            for (const g of obj['@graph']) {
              const s = g.startDate || '';
              const e = g.endDate || '';
              if (s && !ldStart) ldStart = String(s);
              if (e && !ldEnd) ldEnd = String(e);
            }
          }
        }
      } catch {}
    });
    let dateText = '';
    if (ldStart || ldEnd) {
      // Normalize ISO -> human text for our parser if needed
      const startIso = ldStart ? new Date(ldStart) : null;
      const endIso = ldEnd ? new Date(ldEnd) : null;
      if (startIso && !isNaN(startIso.getTime()) && endIso && !isNaN(endIso.getTime())) {
        dateText = `${startIso.getUTCDate()} ${startIso.toLocaleString('en-US', { month: 'long' })} ${startIso.getUTCFullYear()} - ${endIso.getUTCDate()} ${endIso.toLocaleString('en-US', { month: 'long' })} ${endIso.getUTCFullYear()}`;
      } else if (endIso && !isNaN(endIso.getTime())) {
        dateText = `until ${endIso.getUTCDate()} ${endIso.toLocaleString('en-US', { month: 'long' })} ${endIso.getUTCFullYear()}`;
      } else if (startIso && !isNaN(startIso.getTime())) {
        dateText = `${startIso.getUTCDate()} ${startIso.toLocaleString('en-US', { month: 'long' })} ${startIso.getUTCFullYear()}`;
      }
    }
    if (!dateText) {
      // Look for a Dates section
      const datesHeader = $('*:contains("Dates")').filter((_, el) => /\bDates\b/i.test($(el).text())).first();
      if (datesHeader.length) {
        const block = datesHeader.nextAll().slice(0, 5);
        const txt = block.map((_, e) => $(e).text()).get().join(' ').replace(/\s+/g, ' ').trim();
        if (txt) dateText = txt;
      }
    }
    if (!dateText) {
      // Fallback to any element with a date-like pattern
      const any = $('body *').filter((_, el) => /\d{1,2}\s+[A-Za-z]{3,}\s+\d{4}|[A-Za-z]{3,}\s+\d{4}|until\s+[A-Za-z]/i.test($(el).text())).first();
      if (any.length) dateText = any.text().replace(/\s+/g, ' ').trim();
    }
    return { og, title, date: dateText };
  } catch {
    return { og: '', title: '', date: '' };
  }
}

async function main() {
  const pages = [1, 2, 3, 4];
  const items = [];
  const seen = new Set();
  const base = 'https://www.tate.org.uk';

  function collectFrom($) {
    // Prefer anchors in the main content area if present; otherwise search all
    const scopes = ['main a[href*="/whats-on/tate-modern/"]', 'a[href*="/whats-on/tate-modern/"]'];
    for (const sel of scopes) {
      const anchors = $(sel);
      if (!anchors.length) continue;
      anchors.each((_, aEl) => {
        const hrefRaw = ($(aEl).attr('href') || '').trim();
        if (!hrefRaw) return;
        const hrefAbs = hrefRaw.startsWith('http') ? hrefRaw : base + hrefRaw;
        try {
          const u = new URL(hrefAbs);
          // Keep only canonical exhibition slugs: /whats-on/tate-modern/<slug>
          if (!/^\/whats-on\/tate-modern\/[^\/]+$/i.test(u.pathname)) return;
          const key = u.pathname.toLowerCase();
          if (seen.has(key)) return;
          seen.add(key);
          const container = $(aEl).closest('article, li, div');
          let title = container.find('h2, h3').first().text().trim();
          if (!title) title = $(aEl).text().trim();
          const dateText = container.find('[class*="date" i]').first().text().replace(/\s+/g, ' ').trim();
          const imgEl = container.find('img').first();
          const img = (imgEl.attr('src') || imgEl.attr('data-src') || '').trim();
          items.push({ href: u.toString(), title, dateText, img });
        } catch {
          // ignore invalid URLs
        }
      });
      if (items.length) break; // got some from this scope
    }
  }

  for (const p of pages) {
    const pageUrl = p === 1 ? LIST_URL : `${LIST_URL}&page=${p}`;
    // Try AJAX fragment first
    const ajaxUrl = `${LIST_URL}&ajax=1&ajax_scope=card-group&page=${p}`;
    let parsed = false;
    try {
      const ajaxHtml = await fetchHtml(ajaxUrl);
      const $f = cheerioLoad(ajaxHtml);
      collectFrom($f);
      parsed = true;
    } catch {
      // ignore and fallback
    }
    if (!parsed) {
      try {
        const listHtml = await fetchHtml(pageUrl);
        const $ = cheerioLoad(listHtml);
        collectFrom($);
      } catch {
        // continue
      }
    }
  }

  const out = [];
  for (const it of items.slice(0, 60)) {
    const url = it.href.startsWith('http') ? it.href : `https://www.tate.org.uk${it.href}`;
    const detail = await enrichDetail(url);
    const dates = toYMDSpan(detail.date || it.dateText || '');
    out.push({
      title: detail.title || it.title,
      url,
      startDate: dates.start,
      endDate: dates.end,
      image: detail.og || it.img || ''
    });
  }

  const pubDir = path.join(process.cwd(), 'public', 'data');
  fs.mkdirSync(pubDir, { recursive: true });
  const file = path.join(pubDir, 'tate-modern.json');
  fs.writeFileSync(file, JSON.stringify({ scrapedAt: new Date().toISOString(), items: out }, null, 2));
  console.log('Saved', file, 'items:', out.length);
}

main().catch((e) => { console.error(e); process.exit(1); });
