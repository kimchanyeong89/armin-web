#!/usr/bin/env node
// MuCEM Fine Arts Scraper (Playwright + HTTP)
// Phase 1: Playwright DOM loading (click btn-show-more until 1412+ cards)
// Phase 2: Fetch detail pages for each item
// Output: /public/data/mucem-fine-arts-collection.json

import { chromium } from '/Users/kietzsche/armin-web-main/node_modules/playwright/index.mjs';
import { writeFileSync, readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dir, '..');
const OUT = join(ROOT, 'public/data/mucem-fine-arts-collection.json');
const IDS_FILE = '/tmp/mucem-fine-arts-ids.json';

const BASE = 'http://lescollections.mucem.org';
// New URL: filter by annotation_representation (painting subject refs) + nature 024793
// Tableau URL: returns items classified as "tableau" (actual painted canvases/boards)
// Previous Peinture URL returned photographic documentation of paintings (type: "photographie") — not actual paintings
const NEW_PARAMS = 'term=Tableau&filter=annotation_representation%255C2%22http%253A%255C0%255C0data.mucem.org%255C0ref%255C06837-http%253A%255C0%255C0data.mucem.org%255C0ref%255C06906-http%253A%255C0%255C0data.mucem.org%255C0ref%255C06908-http%253A%255C0%255C0data.mucem.org%255C0ref%255C06919-http%253A%255C0%255C0data.mucem.org%255C0ref%255C06922%22%2526nature%255C2%22http%253A%255C0%255C0data.mucem.org%255C0ref%255C024793%22';
const TARGET = `${BASE}/search?${NEW_PARAMS}`;
const TOTAL = 3000;  // upper bound; scraper stops when no more items load
const DETAIL_CONCURRENCY = 8;

// ============ PHASE 1: DOM Loading via Playwright ============

async function phase1CollectIds() {
  console.log('\n=== PHASE 1: Loading all items via Playwright ===');
  
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ 
    locale: 'fr-FR', 
    viewport: { width: 1400, height: 900 },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });
  const page = await browser.newPage();
  
  console.log('Loading search page...');
  await page.goto(TARGET, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);
  
  const getCardCount = () => page.evaluate(() => 
    document.querySelectorAll('a[href*="/objet"]').length
  );
  
  let prevCount = 0;
  let currentCount = await getCardCount();
  console.log(`Initial items: ${currentCount}`);
  
  let attempts = 0;
  let noNewItems = 0;
  const MAX_ATTEMPTS = 120;
  
  while (currentCount < TOTAL && attempts < MAX_ATTEMPTS) {
    attempts++;
    
    // Try to click btn-show-more using multiple strategies
    const clicked = await page.evaluate(() => {
      // Strategy 1: direct class selector
      const btn = document.querySelector('.btn-show-more, .btn.btn-show-more');
      if (btn) { btn.click(); return 'class:' + btn.className; }
      
      // Strategy 2: text content search
      const allBtns = [...document.querySelectorAll('a, button')];
      const textBtn = allBtns.find(el => 
        el.textContent?.toLowerCase().includes('suivant') || 
        el.textContent?.toLowerCase().includes('plus') ||
        el.textContent?.toLowerCase().includes('suite') ||
        el.className.includes('show-more') ||
        el.className.includes('next')
      );
      if (textBtn) { textBtn.click(); return 'text:' + textBtn.className?.substring(0, 50); }
      
      return null;
    });
    
    if (!clicked) {
      console.log(`Attempt ${attempts}: No load-more button found`);
      noNewItems++;
      if (noNewItems >= 3) break;
      await page.waitForTimeout(2000);
      continue;
    }
    
    // Wait for new items to appear (up to 3s)
    try {
      const targetCount = currentCount + 1; // at least 1 new item
      await page.waitForFunction(
        (target) => document.querySelectorAll('a[href*="/objet"]').length >= target,
        targetCount,
        { timeout: 5000 }
      );
    } catch (e) {
      // Timeout waiting for new items
    }
    
    await page.waitForTimeout(500);
    
    prevCount = currentCount;
    currentCount = await getCardCount();
    
    if (currentCount > prevCount) {
      noNewItems = 0;
      process.stdout.write(`\r  Items: ${currentCount}/${TOTAL} (+${currentCount-prevCount})  `);
    } else {
      noNewItems++;
      if (noNewItems >= 5) {
        console.log(`\nNo new items after 5 attempts, stopping`);
        break;
      }
    }
  }
  process.stdout.write('\n');
  
  // Extract all item URIs
  const uris = await page.evaluate(() => {
    return [...new Set([...document.querySelectorAll('a[href*="/objet"]')].map(a => {
      const m = a.href.match(/uri=([^&]+)/);
      return m ? decodeURIComponent(decodeURIComponent(m[1])) : null;
    }).filter(Boolean))];
  });
  
  console.log(`\nTotal links: ${currentCount}, unique URIs: ${uris.length}`);
  
  await browser.close();
  return uris;
}

// ============ PHASE 2: Fetch detail pages ============

// Decode HTML entities to plain text
function decodeHtml(s) {
  return (s || '')
    .replace(/&amp;/g, '&').replace(/&#038;/g, '&')
    .replace(/&quot;/g, '"').replace(/&#034;/g, '"')
    .replace(/&#039;/g, "'").replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .trim();
}

// Strip all HTML tags
function stripHtml(s) {
  return (s || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function parseDetailPage(html, uri) {
  // Title: og:title is cleaner (no entity issues), format: "Type - Artwork Title"
  const ogM = html.match(/property="og:title"\s+content="([^"]+)"/);
  const ogTitle = ogM ? decodeHtml(ogM[1]) : '';

  // Also try h1 (may have HTML entities)
  const h1M = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/);
  const h1Text = h1M ? decodeHtml(stripHtml(h1M[1])) : '';

  // Prefer og:title (cleaner), fall back to h1
  const titleSource = ogTitle || h1Text;
  const dashIdx = titleSource.indexOf(' - ');
  const type = dashIdx >= 0 ? titleSource.substring(0, dashIdx).toLowerCase().trim() : '';
  let title = dashIdx >= 0 ? titleSource.substring(dashIdx + 3).trim() : '';
  // If still no title, use h1 as-is (some objects have no artwork name)
  if (!title) title = h1Text || ogTitle;

  // Image: first AFS content image
  const imgM = html.match(/src="(https:\/\/mucem\.afs-antidot\.net\/content\?[^"]+)"[^>]+alt="([^"]+)"/);
  const imageUrl = imgM?.[1]?.replace(/&amp;/g, '&') || '';

  // Artist: extract from participant-identite span, stripping <span class="precision"> biographical info
  // Use \s*<\/p> at the end to ensure we capture the FULL participant-identite span content
  // (including the nested precision span with its closing tag) — not just up to the first </span>
  const artistBlockM = html.match(
    /(?:Peintre|Dessinateur|Sculpteur|Auteur|Artiste|Graveur|Photographe)\s*:<\/label>[\s\S]{0,400}?class="participant-identite">([\s\S]{0,400}?)<\/span>\s*<\/p>/i
  );
  let artist = '';
  if (artistBlockM) {
    // Remove <span class="precision">...</span> (birth/death dates) and all remaining HTML
    let raw = artistBlockM[1].replace(/<span[^>]*class="precision"[^>]*>[\s\S]*?<\/span>/gi, '');
    artist = stripHtml(decodeHtml(raw)).replace(/\s+/g, ' ').trim();
    // Fallback: strip any residual date patterns (dd/mm/yyyy and everything after)
    artist = artist.replace(/\s+\d{1,2}\/\d{1,2}\/\d{4}[\s\S]*$/, '').trim();
  }

  // Date: prefer labeled format DD/MM/YYYY
  const dateM = html.match(/<label[^>]*class="date"[^>]*>Date\s*:<\/label>[\s\S]{0,50}?<p>(\d{2})\/(\d{2})\/(\d{4})<\/p>/);
  const dateFallM = !dateM && html.match(/Date\s*:<\/label>[\s\S]{0,100}?(\d{4})/);
  const year = dateM?.[3] || dateFallM?.[1] || '';

  // Medium: Matériaux et techniques field
  const mediumM = html.match(/Mat[eé]riaux et techniques\s*:<\/label>[\s\S]{0,80}?<p>([\s\S]{0,300}?)<\/p>/i);
  const medium = mediumM ? decodeHtml(stripHtml(mediumM[1])) : '';

  // Dimensions
  const hautM = html.match(/Hauteur\s*:\s*([\d.,]+)\s*cm/i);
  const largM = html.match(/Largeur\s*:\s*([\d.,]+)\s*cm/i);
  const epaM  = html.match(/[EÉ]paisseur\s*:\s*([\d.,]+)\s*cm/i);
  let dimensions = '';
  if (hautM) {
    dimensions = `H. ${hautM[1]} cm`;
    if (largM) dimensions += `; l. ${largM[1]} cm`;
    if (epaM)  dimensions += `; ép. ${epaM[1]} cm`;
  }

  // ID from URI
  const idM = uri.match(/\/([a-z]\/\d+)$/);
  const id = idM?.[1]?.replace('/', '-') || uri.split('/').pop();
  
  return {
    id: `mucem-${id}`,
    title,
    type,
    category: 'Painting',  // new URL guarantees only paintings
    artist,
    year,
    medium,
    dimensions,
    imageUrl,
    sourceUrl: `${BASE}/objet?uri=${encodeURIComponent(uri)}`,
    uri,
    museum: 'MuCEM, Marseille'
  };
}

async function fetchDetail(uri, retries = 3) {
  const url = `${BASE}/objet?uri=${encodeURIComponent(uri)}`;
  
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const resp = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
          'Accept': 'text/html'
        }
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const html = await resp.text();
      return parseDetailPage(html, uri);
    } catch(e) {
      if (attempt === retries) {
        return { id: `mucem-err-${uri.split('/').pop()}`, title: '', error: e.message, uri };
      }
      await new Promise(r => setTimeout(r, 800 * attempt));
    }
  }
}

async function main() {
  let uris;
  
  // Check if we have saved IDs from a previous run
  if (existsSync(IDS_FILE)) {
    uris = JSON.parse(readFileSync(IDS_FILE, 'utf8'));
    console.log(`Loaded ${uris.length} URIs from cache (${IDS_FILE})`);
    console.log('Delete', IDS_FILE, 'to re-run phase 1');
  } else {
    uris = await phase1CollectIds();
    writeFileSync(IDS_FILE, JSON.stringify(uris, null, 2));
    console.log(`Saved ${uris.length} URIs to ${IDS_FILE}`);
  }
  
  if (uris.length === 0) {
    console.error('No URIs collected, aborting');
    process.exit(1);
  }
  
  // Phase 2: Fetch details
  console.log(`\n=== PHASE 2: Fetching ${uris.length} detail pages (concurrency=${DETAIL_CONCURRENCY}) ===`);
  
  const RESUME_FILE = '/tmp/mucem-detail-resume.json';
  let startIdx = 0;
  let items = [];
  
  if (existsSync(RESUME_FILE)) {
    const resume = JSON.parse(readFileSync(RESUME_FILE, 'utf8'));
    startIdx = resume.nextIdx;
    items = resume.items;
    console.log(`Resuming from idx ${startIdx} (${items.length} done)`);
  }
  
  for (let i = startIdx; i < uris.length; i += DETAIL_CONCURRENCY) {
    const batch = uris.slice(i, i + DETAIL_CONCURRENCY);
    const results = await Promise.all(batch.map(uri => fetchDetail(uri)));
    items.push(...results);
    
    const pct = Math.round((i + batch.length) / uris.length * 100);
    process.stdout.write(`\r  ${i + batch.length}/${uris.length} (${pct}%)  `);
    
    if (i % 100 < DETAIL_CONCURRENCY) {
      writeFileSync(RESUME_FILE, JSON.stringify({ nextIdx: i + DETAIL_CONCURRENCY, items }));
    }
    
    await new Promise(r => setTimeout(r, 200));
  }
  process.stdout.write('\n');
  
  // Filter out errors
  const valid = items.filter(item => item.title && !item.error);
  const errors = items.filter(item => item.error);
  
  console.log(`\nValid items: ${valid.length}, errors: ${errors.length}`);
  
  const output = {
    museum: 'MuCEM',
    location: 'Marseille, France',
    scrapedAt: new Date().toISOString(),
    filter: 'Paintings (annotation_representation painting subjects + nature ref 024793)',
    totalObjects: valid.length,
    objects: valid
  };
  
  writeFileSync(OUT, JSON.stringify(output, null, 2));
  console.log(`Saved to ${OUT}`);
}

main().catch(console.error);
