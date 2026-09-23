// Render each museum's official homepage in real Chrome and pull logo candidates out of the DOM:
// <img>/<picture> logos, inline <svg> (computed paint inlined, <use> resolved incl. external sprites),
// CSS background logos, JSON-LD "logo", mask-icon/svg favicons. Saves up to 5 scored candidates per
// museum, element screenshots of the top 3, and a downscaled header screenshot for visual review.
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { chromium } from 'playwright';

const S = '/private/tmp/claude-501/-Users-kietzsche-armin-web-main/05be24b5-6b1e-40f7-98f3-75f8d47d8739/scratchpad/logos';
const input = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')); // [{id, url}]
const OUT = process.argv[3] || `${S}/site`;
const CONC = Number(process.argv[4] || 5);
const FORCE = process.argv.includes('--force');
fs.mkdirSync(OUT, { recursive: true });
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36';

const collect = async () => {
  const low = (s) => String(s || '').toLowerCase();
  const attrs = (el) => {
    if (!el || !el.getAttribute) return '';
    const cls = typeof el.className === 'string' ? el.className : (el.className && el.className.baseVal) || '';
    return low([el.tagName, el.id, cls, el.getAttribute('alt'), el.getAttribute('aria-label'), el.getAttribute('title'), el.getAttribute('data-testid')].join(' '));
  };
  const chain = (el, n = 6) => { let s = ''; for (let i = 0, e = el; i < n && e; i++, e = e.parentElement) s += ' ' + attrs(e); return s; };
  const homeLink = (el) => { const a = el.closest('a'); if (!a) return false; try { const u = new URL(a.href, location.href); return u.origin === location.origin && (u.pathname === '/' || /^\/(en|ko|kr|fr|de|it|es|ja|jp|zh|cn|nl|pt|ca|home|index|main)?(\/|\.html?|\.do|\.php)?$/i.test(u.pathname)); } catch { return false; } };
  const visible = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0.05; };
  const bad = /partner|sponsor|social|facebook|instagram|twitter|youtube|linkedin|tiktok|weibo|wechat|kakao|naver|flickr|pinterest|app-?store|google-?play|funder|supporter|ministry|unesco|cookie|payment|visa|mastercard|tripadvisor|search|menu-?icon|hamburger|arrow|close|lang|flag/;
  const good = /logo|brand|site-?title|site-?name|masthead|wordmark|identity|navbar-brand|header__home|home-?link/;
  const cands = [];
  const score = (el, kind, w, h) => {
    const r = el.getBoundingClientRect();
    const c = chain(el);
    let s = 0;
    if (/logo/.test(attrs(el))) s += 5;
    if (good.test(c)) s += 4;
    if (el.closest('header, [role=banner], nav, .header, #header')) s += 3;
    if (el.closest('footer, [role=contentinfo], [class*="footer" i], [id*="footer" i]')) s -= 9;
    const top = r.top + scrollY;
    if (top < 220) s += 3;
    if (top > 1100) s -= 4;
    if (r.left < window.innerWidth * 0.45) s += 1;
    if (homeLink(el)) s += 3;
    if (kind === 'svg') s += 1;
    if (bad.test(c)) s -= 6;
    if (w < 40 || h < 12) s -= 4;
    if (w > window.innerWidth * 0.8) s -= 3;
    if (w / Math.max(h, 1) > 18) s -= 2;
    return { s, top: Math.round(top), left: Math.round(r.left), w: Math.round(w), h: Math.round(h) };
  };
  const PAINT = ['fill', 'stroke', 'stroke-width', 'fill-rule', 'clip-rule', 'opacity', 'fill-opacity', 'stroke-opacity', 'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit'];
  const spriteCache = {};
  async function findSymbol(href) {
    const [file, frag] = href.split('#');
    if (!frag) return null;
    if (!file) return document.getElementById(frag) || document.querySelector(`symbol[id="${CSS.escape(frag)}"]`);
    const url = new URL(file, location.href).href;
    if (!(url in spriteCache)) {
      try { spriteCache[url] = new DOMParser().parseFromString(await (await fetch(url)).text(), 'image/svg+xml'); } catch { spriteCache[url] = null; }
    }
    return spriteCache[url] ? spriteCache[url].getElementById(frag) : null;
  }
  // 1) images
  document.querySelectorAll('img').forEach((img, i) => {
    if (!visible(img)) return;
    const r = img.getBoundingClientRect();
    let src = img.currentSrc || img.src;
    const ss = img.getAttribute('srcset');
    if (ss) {
      const best = ss.split(',').map((p) => p.trim().split(/\s+/)).map(([u, d]) => ({ u, v: parseFloat(d) || 1 })).sort((a, b) => b.v - a.v)[0];
      if (best && best.u) { try { src = new URL(best.u, location.href).href; } catch {} }
    }
    if (!src || src.startsWith('data:image/gif')) return;
    const sc = score(img, 'img', r.width, r.height);
    img.setAttribute('data-colly-cand', 'img' + i);
    cands.push({ kind: 'img', ref: 'img' + i, src, natural: [img.naturalWidth, img.naturalHeight], ...sc });
  });
  // 2) inline svgs (outermost only)
  const svgs = [...document.querySelectorAll('svg')];
  for (let i = 0; i < svgs.length; i++) {
    const svg = svgs[i];
    if (svg.parentElement && svg.parentElement.closest('svg')) continue;
    if (!visible(svg)) continue;
    const r = svg.getBoundingClientRect();
    if (r.width < 30 || r.height < 10) continue;
    const clone = svg.cloneNode(true);
    const live = [svg, ...svg.querySelectorAll('*')];
    const cl = [clone, ...clone.querySelectorAll('*')];
    live.forEach((el, k) => {
      const cs = getComputedStyle(el);
      const t = cl[k];
      if (!t) return;
      if (cs.display === 'none') { t.setAttribute('display', 'none'); return; }
      PAINT.forEach((p) => { const v = cs.getPropertyValue(p); if (v && !(p === 'opacity' && v === '1')) t.setAttribute(p, v); });
    });
    for (const u of [...clone.querySelectorAll('use')]) {
      const href = u.getAttribute('href') || u.getAttribute('xlink:href') || '';
      const target = await findSymbol(href);
      if (!target) continue;
      const isSym = target.tagName.toLowerCase() === 'symbol';
      const g = document.createElementNS('http://www.w3.org/2000/svg', isSym ? 'svg' : 'g');
      if (isSym && target.getAttribute('viewBox')) g.setAttribute('viewBox', target.getAttribute('viewBox'));
      ['x', 'y', 'width', 'height', 'transform', ...PAINT].forEach((a) => u.getAttribute(a) && g.setAttribute(a, u.getAttribute(a)));
      g.innerHTML = target.innerHTML;
      u.replaceWith(g);
    }
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
    if (!clone.getAttribute('viewBox')) clone.setAttribute('viewBox', `0 0 ${r.width} ${r.height}`);
    clone.setAttribute('width', String(Math.round(r.width)));
    clone.setAttribute('height', String(Math.round(r.height)));
    const sc = score(svg, 'svg', r.width, r.height);
    svg.setAttribute('data-colly-cand', 'svg' + i);
    cands.push({ kind: 'svg', ref: 'svg' + i, svg: new XMLSerializer().serializeToString(clone), ...sc });
  }
  // 3) CSS background logos
  document.querySelectorAll('[class*="logo" i], [id*="logo" i], [class*="brand" i]').forEach((el, i) => {
    if (!visible(el)) return;
    for (const node of [el, el.querySelector('a, span, i, div')].filter(Boolean)) {
      const cs = getComputedStyle(node), before = getComputedStyle(node, '::before'), after = getComputedStyle(node, '::after');
      const bg = [cs.backgroundImage, cs.maskImage, cs.webkitMaskImage, before.backgroundImage, before.maskImage, before.webkitMaskImage, after.backgroundImage].find((v) => v && v.includes('url('));
      const m = bg && bg.match(/url\(["']?(.*?)["']?\)/);
      if (!m) continue;
      const r = node.getBoundingClientRect();
      const sc = score(node, 'bg', r.width, r.height);
      node.setAttribute('data-colly-cand', 'bg' + i);
      try { cands.push({ kind: 'bg', ref: 'bg' + i, src: new URL(m[1], location.href).href, ...sc, s: sc.s + 2 }); } catch {}
      break;
    }
  });
  // 4) JSON-LD logo
  document.querySelectorAll('script[type="application/ld+json"]').forEach((sc) => {
    try {
      const walk = (o) => { if (!o || typeof o !== 'object') return; if (o.logo) { const l = typeof o.logo === 'string' ? o.logo : o.logo.url || o.logo.contentUrl; if (l) cands.push({ kind: 'jsonld', src: new URL(l, location.href).href, s: 6, top: 0, left: 0, w: 0, h: 0 }); } Object.values(o).forEach(walk); };
      walk(JSON.parse(sc.textContent));
    } catch {}
  });
  // 5) icons / og
  document.querySelectorAll('link[rel~="mask-icon"], link[rel~="icon"][href$=".svg"], link[type="image/svg+xml"]').forEach((l) => {
    try { cands.push({ kind: 'icon', src: new URL(l.getAttribute('href'), location.href).href, s: 0, top: 0, left: 0, w: 0, h: 0 }); } catch {}
  });
  const og = document.querySelector('meta[property="og:image"]');
  if (og && /logo/i.test(og.content)) { try { cands.push({ kind: 'og', src: new URL(og.content, location.href).href, s: 2, top: 0, left: 0, w: 0, h: 0 }); } catch {} }
  cands.sort((a, b) => b.s - a.s || a.top - b.top || a.left - b.left);
  return { finalUrl: location.href, title: document.title, cands: cands.slice(0, 14) };
};

async function download(url, referer) {
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA, Referer: referer, Accept: 'image/avif,image/webp,image/svg+xml,image/*,*/*;q=0.8' }, signal: AbortSignal.timeout(20000) });
    if (!r.ok) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    return { buf, type: r.headers.get('content-type') || '' };
  } catch { return null; }
}
const extOf = (type, url) => {
  if (/svg/.test(type) || /\.svg(\?|$)/i.test(url)) return 'svg';
  if (/png/.test(type) || /\.png(\?|$)/i.test(url)) return 'png';
  if (/webp/.test(type) || /\.webp(\?|$)/i.test(url)) return 'webp';
  if (/gif/.test(type) || /\.gif(\?|$)/i.test(url)) return 'gif';
  if (/avif/.test(type)) return 'avif';
  if (/icon|ico/.test(type) || /\.ico(\?|$)/i.test(url)) return 'ico';
  return 'jpg';
};

const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--disable-blink-features=AutomationControlled'] });
const results = fs.existsSync(`${OUT}/results.json`) ? JSON.parse(fs.readFileSync(`${OUT}/results.json`, 'utf8')) : {};
let idx = 0;
async function visit(page, url) {
  await page.goto(url, { waitUntil: 'commit', timeout: 45000 });
  await page.waitForLoadState('domcontentloaded', { timeout: 25000 }).catch(() => {});
  await page.waitForTimeout(Number(process.env.WAIT_MS || 5000));
}
async function worker() {
  while (idx < input.length) {
    const m = input[idx++];
    if (!FORCE && results[m.id]?.ok && results[m.id]?.saved?.length) continue;
    const ctx = await browser.newContext({ userAgent: UA, viewport: { width: 1440, height: 900 }, deviceScaleFactor: 3, locale: 'en-US', ignoreHTTPSErrors: true });
    const page = await ctx.newPage();
    const rec = { id: m.id, url: m.url, ok: false, saved: [] };
    try {
      try { await visit(page, m.url); } catch (e) { await visit(page, m.url); }
      const data = await page.evaluate(collect);
      rec.finalUrl = data.finalUrl; rec.title = data.title;
      const dir = path.join(OUT, m.id);
      fs.rmSync(dir, { recursive: true, force: true });
      fs.mkdirSync(dir, { recursive: true });
      try {
        const shot = await page.screenshot({ clip: { x: 0, y: 0, width: 1440, height: 240 }, timeout: 10000 });
        await sharp(shot).resize(1440).jpeg({ quality: 70 }).toFile(path.join(dir, 'header.jpg'));
      } catch {}
      let n = 0;
      const seen = new Set();
      for (const c of data.cands) {
        if (n >= 5) break;
        if (c.s < 3 && n >= 2) break;
        const key = c.src || c.svg?.slice(0, 600);
        if (seen.has(key)) continue;
        seen.add(key);
        const base = `${String(n).padStart(2, '0')}-${c.kind}`;
        const entry = { file: null, shot: null, kind: c.kind, score: c.s, src: c.src || null, box: [c.left, c.top, c.w, c.h], natural: c.natural || null };
        if (c.kind === 'svg') {
          fs.writeFileSync(path.join(dir, base + '.svg'), c.svg);
          entry.file = base + '.svg';
        } else if (c.src && c.src.startsWith('data:')) {
          const mm = c.src.match(/^data:([^;,]+)(;base64)?,(.*)$/s);
          if (mm) { const f = `${base}.${extOf(mm[1], '')}`; fs.writeFileSync(path.join(dir, f), mm[2] ? Buffer.from(mm[3], 'base64') : decodeURIComponent(mm[3])); entry.file = f; }
        } else if (c.src) {
          const d = await download(c.src, data.finalUrl);
          if (d && d.buf.length > 200) { const f = `${base}.${extOf(d.type, c.src)}`; fs.writeFileSync(path.join(dir, f), d.buf); entry.file = f; }
        }
        if (c.ref && n < 3) {
          try {
            const el = await page.$(`[data-colly-cand="${c.ref}"]`);
            if (el) { await el.screenshot({ path: path.join(dir, base + '-shot.png'), timeout: 8000 }); entry.shot = base + '-shot.png'; }
          } catch {}
        }
        if (entry.file || entry.shot) { rec.saved.push(entry); n++; }
      }
      rec.ok = true;
    } catch (e) {
      rec.error = String(e.message || e).split('\n')[0].slice(0, 160);
    }
    results[m.id] = rec;
    fs.writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 1));
    console.log(`${idx}/${input.length}`, m.id, rec.ok ? `saved ${rec.saved.length}` : `ERR ${rec.error}`);
    await ctx.close().catch(() => {});
  }
}
await Promise.all(Array.from({ length: CONC }, worker));
await browser.close();
console.log('DONE ok', Object.values(results).filter((r) => r.ok && r.saved.length).length, 'of', input.length);
