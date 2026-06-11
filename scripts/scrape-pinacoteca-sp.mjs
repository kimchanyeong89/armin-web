#!/usr/bin/env node
// Pinacoteca de São Paulo — collection scraper.
// Source: museum's OWN online catalogue at acervo.pinacoteca.org.br/online/
//   (InWeb by Sistemas do Futuro, ASP.NET/IIS, charset ISO-8859-1).
//
//   Listing : session-bound JSON WebMethod. Per category:
//             (1) GET pesquisa.aspx?ns=201000&&lang=BR&&c={cat}&IPR=1287  (cookie jar: sets the
//                 session's search to that category)
//             (2) GET resultado.aspx?ns=201000&lang=BR&c={cat}&IPR=1287 → per-session token via
//                 /GetRecords_Tags\(1,'(\d+)'/  (body field names mapped from the page's own
//                 GetRecords_Tags() jQuery ajax source)
//             (3) POST resultado.aspx/Foo_tags pageIndex=1..N, scroll:'true', refazPesquisa:'sim'
//                 → {d: html} with 49 items/page + total marker 'resultadoPesquisa:N' at tail.
//                 Pages verified disjoint. Items parsed only for ficha ids (titles are truncated
//                 in the listing — ficha is canonical for ALL metadata).
//   Detail  : GET ficha.aspx?id={id}&ns=201000&lang=BR&c={cat}&IPR=1287 — session-FREE (verified),
//             ISO-8859-1. Labeled pairs <div class="ficha_campo">L</div><div class="ficha_descricao">V</div>:
//             Autoria (name + "(birth - death)" parens), Título, Cronologia ("start ; Data final: end ;
//             display"), Designação (Pintura/Desenho/Gravura/Fotografia), Descrição (= technique,
//             e.g. "óleo sobre tela"), Dimensões-Resumo, Aquisição, Nº de Inventário, Tipo de licença.
//   Image   : GET https://gestaoacervo.pinacoteca.org.br/apimultimedia/api/ViewImage
//                 ?iInweb=1&iTipoimagem=3&iIDFicheiro={fileId}   (fileId from the ficha page;
//             iTipoimagem 3 = web-large, 454–1080 px long edge; HEAD returns 405 → always GET.)
//
// SCOPE: flat visual art via the site's own category facets — pintura→painting (ALL, no cap),
//   desenho→drawing, gravura→print, fotografia→photograph (≈2121+2542+5148+1093 = 10,904 in-scope;
//   escultura/instalação/vídeo are separate facets, excluded natively). Monochrome prints
//   (category=print + Hasler-Süsstrunk colorfulness<20 on the downloaded buffer) are skipped
//   BEFORE R2 upload. Drawings always kept regardless of colour; photographs NEVER colour-gated.
//   Portrait-locket miniatures (painting on marfim/vitela/esmalte, max dim ≤14 cm) skipped.
//
// POLITENESS: one global throttle (~3.3 rps, 300 ms interval) across listing POSTs, ficha pages
//   and image GETs (both hosts are the museum's own infrastructure).
//
// RESUMABLE: scripts/.state/pinacoteca-sp-progress.json (per-category pagination + per-work
//   status incl. ok records), atomically rewritten — safe to kill/re-run. Failures append to
//   scripts/.state/pinacoteca-sp-failed.ndjson; error works retry on the next run. min4-missing
//   works retry ONCE on the next run (the server occasionally renders a ficha without the
//   Autoria row — verified transient on id 11066), then skip permanently ("sem data" works).
//
// Usage:
//   node scripts/scrape-pinacoteca-sp.mjs --probe   # first ~20 in-scope works end-to-end (meta + R2 + partial JSON)
//   node scripts/scrape-pinacoteca-sp.mjs --full    # everything in-scope (resumable)

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { autocropToWebp } from './lib/autocrop.mjs';

const require = createRequire(import.meta.url);
const sharp = require('sharp');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const REPO = path.resolve(fileURLToPath(import.meta.url), '../..');
require('dotenv').config({ path: path.join(REPO, '.env.local') });

const SLUG = 'pinacoteca-sp';
const COLLECTION_STEM = `${SLUG}-collection`;
const BASE = 'https://acervo.pinacoteca.org.br/online';
const IMG_API = 'https://gestaoacervo.pinacoteca.org.br/apimultimedia/api/ViewImage';
const NS = '201000';
const NUM = '1287';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const R2_PUBLIC = 'https://pub-396fad1f96754c2f816f260faf970e63.r2.dev';
const R2_BUCKET = process.env.R2_BUCKET_NAME || 'armin-gallery-images';
const STATE_DIR = path.join(REPO, 'scripts/.state');
const PROGRESS = path.join(STATE_DIR, `${SLUG}-progress.json`);
const FAILED = path.join(STATE_DIR, `${SLUG}-failed.ndjson`);
const OUT_PATH = path.join(REPO, 'public/data', `${COLLECTION_STEM}.json`);

const CATS = ['pintura', 'desenho', 'gravura', 'fotografia'];
const CAT_MAP = { pintura: 'painting', desenho: 'drawing', gravura: 'print', fotografia: 'photograph' };
const PAGE_SIZE = 49;

const REQ_INTERVAL_MS = 300;   // global throttle (~3.3 rps) across both museum hosts
const CONCURRENCY = 3;
const CF_THRESHOLD = 20;       // colorfulness below this = monochrome print → skip
const MIN_IMG_PX = 400;        // long-edge floor (iTipoimagem=3 observed 454–1080)

const args = process.argv.slice(2);
const MODE = args.includes('--full') ? 'full' : 'probe';
const PROBE_TARGET = parseInt(process.env.PROBE_TARGET || '20', 10);

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

const NAMED_ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…',
  ndash: '–', mdash: '—', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”',
  aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú',
  atilde: 'ã', otilde: 'õ', ntilde: 'ñ', ccedil: 'ç', Ccedil: 'Ç',
  Aacute: 'Á', Eacute: 'É', Iacute: 'Í', Oacute: 'Ó', Uacute: 'Ú',
  agrave: 'à', egrave: 'è', acirc: 'â', ecirc: 'ê', ocirc: 'ô', uuml: 'ü', ouml: 'ö',
};
const decodeEntities = (s) => (s || '')
  .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
  .replace(/&([a-zA-Z]+);/g, (m, name) => NAMED_ENTITIES[name] ?? m);
const stripTags = (s) => decodeEntities((s || '').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();

// ---------- global throttle ----------
let nextSlot = 0;
async function throttle() {
  const now = Date.now();
  const wait = nextSlot - now;
  nextSlot = Math.max(now, nextSlot) + REQ_INTERVAL_MS;
  if (wait > 0) await sleep(wait);
}

// Site is ISO-8859-1 → always decode response bodies as latin1.
async function fetchLatin1(url, opts = {}) {
  for (let att = 1; att <= 3; att++) {
    await throttle();
    try {
      const r = await fetch(url, { ...opts, headers: { 'User-Agent': UA, ...(opts.headers || {}) } });
      if (r.status === 404) return { status: 404, text: null, headers: r.headers };
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const text = Buffer.from(await r.arrayBuffer()).toString('latin1');
      return { status: r.status, text, headers: r.headers };
    } catch (e) {
      if (att === 3) throw e;
      await sleep(2000 * att);
    }
  }
}

async function dlImage(url) {
  for (let att = 1; att <= 3; att++) {
    await throttle();
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA } }); // GET only (HEAD → 405)
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length < 3000) throw new Error(`tiny ${buf.length}b`);
      return buf;
    } catch (e) {
      if (att === 3) throw e;
      await sleep(1500 * att);
    }
  }
}

async function uploadR2(key, buffer) {
  for (let att = 1; att <= 4; att++) {
    try {
      await s3.send(new PutObjectCommand({ Bucket: R2_BUCKET, Key: key, Body: buffer, ContentType: 'image/webp', CacheControl: 'public, max-age=31536000' }));
      return;
    } catch (e) { if (att === 4) throw e; await sleep(500 * att); }
  }
}

// ---------- colorfulness (Hasler-Süsstrunk) on the downloaded buffer, pre-upload ----------
async function colorfulness(buf) {
  const { data } = await sharp(buf, { limitInputPixels: false }).resize(80, 80, { fit: 'inside' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const rg = [], yb = [];
  for (let i = 0; i < data.length; i += 3) {
    const R = data[i], G = data[i + 1], B = data[i + 2];
    rg.push(R - G); yb.push(0.5 * (R + G) - B);
  }
  const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
  const sd = (a) => { const mu = mean(a); return Math.sqrt(mean(a.map((v) => (v - mu) ** 2))); };
  return Math.sqrt(sd(rg) ** 2 + sd(yb) ** 2) + 0.3 * Math.sqrt(mean(rg) ** 2 + mean(yb) ** 2);
}

// ---------- per-category listing session ----------
function cookiesFrom(headers, jar = {}) {
  for (const sc of headers.getSetCookie?.() || []) {
    const kv = sc.split(';')[0];
    const eq = kv.indexOf('=');
    if (eq > 0) jar[kv.slice(0, eq).trim()] = kv.slice(eq + 1).trim();
  }
  return jar;
}
const cookieHeader = (jar) => Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');

// GET pesquisa (sets session search to the category) + GET resultado (carries the token).
async function openCategorySession(cat) {
  const jar = {};
  const p = await fetchLatin1(`${BASE}/pesquisa.aspx?ns=${NS}&&lang=BR&&c=${cat}&IPR=${NUM}`);
  cookiesFrom(p.headers, jar);
  const r = await fetchLatin1(`${BASE}/resultado.aspx?ns=${NS}&lang=BR&c=${cat}&IPR=${NUM}`, { headers: { Cookie: cookieHeader(jar) } });
  cookiesFrom(r.headers, jar);
  const tok = (r.text || '').match(/GetRecords_Tags\(1,'(\d+)'/);
  if (!tok) throw new Error(`no GetRecords_Tags token for c=${cat}`);
  return { jar, token: tok[1] };
}

// POST Foo_tags — body field names from the page's own GetRecords_Tags() ajax call.
async function fooTags(session, pageIndex) {
  const t = session.token;
  const body = JSON.stringify({
    pageIndex: String(pageIndex), sNSTarefa: NS, sFiltro: '', tipo: t, valor: '',
    navegacao: 'nao', valorInicial: '', valorFinal: '', fieldname: t, termo: t,
    modoVisualizacao: 'album', tituloTag: t, museu: '', tipoPesquisa: '', valorTexto: '',
    // Empirically verified (4 pages × 49 disjoint ids): refazPesquisa MUST be 'sim' on EVERY
    // page — the server re-runs the search and honours pageIndex. 'nao' re-serves page 1.
    ordenacao: '2511', ordenacaoAZ: 'asc', filtro: '', refazPesquisa: 'sim',
    tipoFiltroPesquisa: '', textoPesquisa: '', designacaoPesquisa: '', todosRegistos: 'false',
    tabelaDisplay: '', valorFicha: '', tabelaFicha: '', fieldnameFicha: '', tags: 'nao',
    filtroCampo: t, filtroFicha: t, pesquisaGeral: '0', nome: '', nomeMuseu: '',
    filtroTags: '', apagaFiltroBase: '', nsmenu: '', num: NUM, scroll: 'true',
  });
  const r = await fetchLatin1(`${BASE}/resultado.aspx/Foo_tags`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8', Cookie: cookieHeader(session.jar) },
    body,
  });
  const d = JSON.parse(r.text).d || '';
  const total = parseInt(d.match(/resultadoPesquisa:(\d+)/)?.[1] || '0', 10);
  const ids = [...new Set([...d.matchAll(/ficha\.aspx\?id=(\d+)/g)].map((m) => m[1]))];
  const done = d.includes('_tags_SEMRESULTADOS|') || d.trim() === '';
  return { ids, total, done };
}

// ---------- ficha (detail) parsing — session-free ----------
const fichaUrl = (id, cat) => `${BASE}/ficha.aspx?id=${id}&ns=${NS}&lang=BR&c=${cat}&IPR=${NUM}`;

function parseFicha(html) {
  const fields = {};
  for (const [, lbl, val] of html.matchAll(/class="ficha_campo d-table-cell">([\s\S]*?)<\/div><div class="ficha_descricao[^"]*"[^>]*>([\s\S]*?)<\/div>/g)) {
    fields[stripTags(lbl).replace(/:\s*$/, '')] = stripTags(val);
  }
  const out = { fields };

  out.title = (fields['Título'] || '').replace(/\s*;\s*$/, '');

  // Autoria: "Name (birth – death) ; Name2 (…) ;" → names; life data → metadata
  const names = [], lives = [];
  for (const seg of (fields['Autoria'] || '').split(';')) {
    const s = seg.trim();
    if (!s) continue;
    const life = s.match(/\(([^()]*\d{3,4}[^()]*)\)\s*$/);
    const name = s.replace(/\s*\([^()]*\)\s*$/, '').trim();
    if (!name) continue;
    names.push(name);
    if (life) lives.push(life[1].trim());
  }
  out.artist = [...new Set(names)].join('; ');
  out.artistLife = lives.join('; ');

  // Cronologia: "1892-00-00 ; Data final: 1892-00-00 ; 1892 ;" → display = last bare segment
  const cron = fields['Cronologia'] || '';
  const segs = cron.split(';').map((s) => s.trim()).filter((s) => s && !/^Data final/i.test(s));
  let dateStr = segs.length ? segs[segs.length - 1] : '';
  dateStr = dateStr.replace(/-00-00$/, '').replace(/^sem data$/i, '');
  const y = cron.match(/\b(1[0-9]{3}|20[0-2][0-9])\b/);
  out.year = y ? parseInt(y[1], 10) : null;
  out.dateStr = dateStr;

  out.designacao = (fields['Designação'] || '').replace(/\s*;\s*$/, '').trim();

  // "Descrição" on this catalogue holds the technique ("óleo sobre tela"). Guard: a long
  // sentence is a curatorial description, not a medium.
  const desc = (fields['Descrição'] || '').replace(/\s*;\s*$/, '').trim();
  out.medium = fields['Técnica'] ? (fields['Técnica'] || '').replace(/\s*;\s*$/, '').trim()
    : (desc.length <= 160 ? desc : '');
  out.description = desc.length > 160 ? desc : '';

  out.dimensions = (fields['Dimensões-Resumo'] || '').replace(/\s*;\s*$/, '').trim();
  out.objectNumber = (fields['Nº de Inventário'] || '').trim();
  out.license = (fields['Tipo de licença'] || '').replace(/\s*;\s*$/, '').trim();
  out.credit = (fields['Aquisição'] || '').trim();

  const f = html.match(/iIDFicheiro=(\d+)/); // first = primary image (iTipoimagem=3 on ficha)
  out.fileId = f ? f[1] : null;
  return out;
}

const maxDimCm = (dim) => {
  if (!dim || !/cm/i.test(dim)) return null;
  const nums = (dim.match(/\d+(?:[.,]\d+)?/g) || []).map((n) => parseFloat(n.replace(',', '.')));
  return nums.length ? Math.max(...nums) : null;
};

// Portrait-locket miniature heuristic (guide §1): painting on ivory/vellum/enamel, ≤14 cm.
function isPortraitMiniature(d) {
  if (!/(marfim|vitela|velino|esmalte)/i.test(d.medium) || /papel[- ]vitela/i.test(d.medium)) return false;
  const mx = maxDimCm(d.dimensions);
  return mx != null && mx <= 14;
}

// ---------- progress state ----------
function loadProgress() {
  if (fs.existsSync(PROGRESS)) return JSON.parse(fs.readFileSync(PROGRESS, 'utf8'));
  const cats = {};
  for (const c of CATS) cats[c] = { nextPage: 1, complete: false, total: null, noFresh: 0 };
  return { cats, ids: [], idCat: {}, works: {} };
}
let lastSave = 0;
function saveProgress(prog, force = false) {
  if (!force && Date.now() - lastSave < 5000) return;
  lastSave = Date.now();
  const tmp = PROGRESS + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(prog));
  fs.renameSync(tmp, PROGRESS);
}
const appendFailed = (obj) => fs.appendFileSync(FAILED, JSON.stringify(obj) + '\n');
const countOk = (prog) => Object.values(prog.works).filter((w) => w.status === 'ok').length;

// ---------- enumeration (per category, session-bound, resumable by page) ----------
async function enumerateCategory(prog, cat, { onePageOnly = false } = {}) {
  const st = prog.cats[cat];
  if (st.complete) return;
  let session = await openCategorySession(cat);
  while (!st.complete) {
    await new Promise((r) => setTimeout(r, 800)); // verified pacing — too-fast pages re-serve p1
    const { ids, total, done } = await fooTags(session, st.nextPage);
    if (st.total == null && total > 0) { st.total = total; console.log(`[enum] ${cat}: total=${total}`); }
    const fresh = ids.filter((id) => !(id in prog.idCat));
    for (const id of fresh) {
      prog.idCat[id] = cat;
      prog.ids.push(id);
    }
    const catCount = prog.ids.filter((i) => prog.idCat[i] === cat).length;
    if (done) {
      st.complete = true;
      console.log(`[enum] ${cat} p${st.nextPage}: SEMRESULTADOS → complete (${catCount} ids)`);
    } else if (fresh.length === 0) {
      st.noFresh = (st.noFresh || 0) + 1;
      // transient server hiccups re-serve page 1 — reopen the session and retry the SAME
      // page up to 3 times before declaring the category complete
      if (st.noFresh >= 4 || (st.total && st.nextPage > Math.ceil(st.total / PAGE_SIZE) + 3) || ids.length === 0) {
        st.complete = true;
        console.log(`[enum] ${cat} p${st.nextPage}: no new ids → complete (${catCount} ids of total ${st.total})`);
      } else {
        console.log(`[enum] ${cat} p${st.nextPage}: stale page (retry ${st.noFresh}/3, fresh session)`);
        await new Promise((r) => setTimeout(r, 1500));
        session = await openCategorySession(cat);
      }
    } else {
      st.noFresh = 0;
      if (st.nextPage % 10 === 0 || st.nextPage === 1) console.log(`[enum] ${cat} p${st.nextPage}: +${fresh.length} (cat ${catCount}/${st.total})`);
      st.nextPage++;
      if (st.total && st.nextPage > Math.ceil(st.total / PAGE_SIZE) + 3) {
        st.complete = true;
        console.log(`[enum] ${cat}: page cap reached → complete (${catCount} ids of total ${st.total})`);
      }
    }
    saveProgress(prog, true);
    if (onePageOnly) return;
  }
}

// ---------- one work end-to-end ----------
function mark(prog, id, status, reason) {
  prog.works[id] = reason !== undefined ? { status, reason } : { status };
  saveProgress(prog);
}

async function processWork(prog, id) {
  const cat = prog.idCat[id];
  const sourceUrl = fichaUrl(id, cat);
  try {
    const { status, text: html } = await fetchLatin1(sourceUrl);
    if (status === 404 || !html) return mark(prog, id, 'skip', 'detail-404');
    const d = parseFicha(html);
    if (!d.title) return mark(prog, id, 'skip', 'no-title');

    // category from the museum's own Designação; facet as fallback
    const category = CAT_MAP[d.designacao.toLowerCase()] || CAT_MAP[cat];
    if (!category) return mark(prog, id, 'skip', `out-of-scope:${d.designacao || cat}`);

    const missing = [];
    if (!d.artist) missing.push('artist');
    if (d.year == null) missing.push('year');
    if (missing.length) {
      const attempts = ((prog.works[id] && prog.works[id].attempts) || 0) + 1;
      appendFailed({ id, stage: 'meta', err: `min4-missing:${missing.join(',')}`, attempt: attempts, date: d.dateStr, url: sourceUrl });
      if (attempts < 2) { // transient guard: server sometimes renders ficha without a field row
        prog.works[id] = { status: 'min4', reason: `min4-missing:${missing.join(',')}`, attempts };
        saveProgress(prog);
        return;
      }
      return mark(prog, id, 'skip', `min4-missing:${missing.join(',')}`);
    }
    if (category === 'painting' && isPortraitMiniature(d)) return mark(prog, id, 'skip', 'portrait-miniature');
    if (!d.fileId) return mark(prog, id, 'skip', 'no-image');

    const imgUrl = `${IMG_API}?iInweb=1&iTipoimagem=3&iIDFicheiro=${d.fileId}`;
    const buf = await dlImage(imgUrl);
    const meta = await sharp(buf, { limitInputPixels: false }).metadata();
    if (Math.max(meta.width || 0, meta.height || 0) < MIN_IMG_PX) {
      return mark(prog, id, 'skip', `img-too-small ${meta.width}x${meta.height}`);
    }
    if (category === 'print') {
      const cf = await colorfulness(buf);
      if (cf >= 0 && cf < CF_THRESHOLD) {
        return mark(prog, id, 'skip', `grayscale-print cf=${cf.toFixed(1)}`); // before upload
      }
    }

    const gid = `${SLUG}-${id}`; // globally unique id
    const { buffer } = await autocropToWebp(buf); // webp 2048/q85 (trim off by default)
    const key = `artworks/${COLLECTION_STEM}/${gid}-${sha(imgUrl).slice(0, 8)}-imageUrl.webp`;
    await uploadR2(key, buffer);

    prog.works[id] = {
      status: 'ok',
      artwork: {
        id: gid,
        objectNumber: d.objectNumber || '',
        title: d.title,
        artist: d.artist,
        date: d.dateStr,
        year: d.year,
        medium: d.medium,
        dimensions: d.dimensions,
        category,
        description: d.description || '',
        imageUrl: `${R2_PUBLIC}/${key}`,
        thumbnailUrl: `${IMG_API}?iInweb=1&iTipoimagem=1&iIDFicheiro=${d.fileId}`,
        onDisplay: false,
        displayLocation: '',
        sourceUrl,
        metadata: {
          record_id: id,
          file_id: d.fileId,
          designacao: d.designacao,
          artist_life: d.artistLife,
          license: d.license,
          credit: d.credit,
          src_px: `${meta.width}x${meta.height}`,
        },
        original_imageUrl: imgUrl,
      },
    };
    saveProgress(prog);
  } catch (e) {
    prog.works[id] = { status: 'error', error: String(e.message || e) };
    appendFailed({ id, stage: 'work', err: String(e.message || e), url: sourceUrl });
    saveProgress(prog);
  }
}

// ---------- output ----------
function writeCollection(prog) {
  const artworks = prog.ids
    .map((id) => prog.works[id])
    .filter((w) => w && w.status === 'ok')
    .map((w) => w.artwork)
    .sort((a, b) => Number(a.metadata.record_id) - Number(b.metadata.record_id));
  const cats = {};
  for (const w of artworks) cats[w.category] = (cats[w.category] || 0) + 1;
  const payload = {
    museum: 'Pinacoteca de São Paulo',
    collection: 'Acervo',
    website: 'https://acervo.pinacoteca.org.br/online/',
    scraped_date: new Date().toISOString().slice(0, 10),
    total_count: artworks.length,
    source_type: 'json-api',
    category_breakdown: cats,
    artworks,
  };
  fs.writeFileSync(OUT_PATH, JSON.stringify(payload, null, 2));
  console.log(`[write] ${OUT_PATH} (${artworks.length} works) breakdown=`, cats);
}

function summarize(prog) {
  const tally = {};
  for (const w of Object.values(prog.works)) {
    const k = w.status === 'skip' ? `skip:${(w.reason || '').split(':')[0].split(' ')[0]}` : w.status;
    tally[k] = (tally[k] || 0) + 1;
  }
  console.log('[summary]', tally);
}

// ---------- main ----------
async function main() {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  const prog = loadProgress();
  const target = MODE === 'probe' ? PROBE_TARGET : Infinity;
  console.log(`[${MODE}] resume: ${prog.ids.length} ids known, ${countOk(prog)} ok`);

  if (MODE === 'full') {
    for (const cat of CATS) await enumerateCategory(prog, cat);
    const perCat = {};
    for (const id of prog.ids) perCat[prog.idCat[id]] = (perCat[prog.idCat[id]] || 0) + 1;
    console.log(`[enum] complete: ${prog.ids.length} in-scope ids`, perCat);
  } else {
    // probe: page 1 of each category is plenty for ~20 works
    for (const cat of CATS) {
      if (prog.cats[cat].nextPage === 1 && !prog.cats[cat].complete) {
        await enumerateCategory(prog, cat, { onePageOnly: true });
      }
    }
  }

  // probe interleaves categories round-robin (exercises all 4 paths incl. the print colour
  // gate); full keeps discovery order.
  let order = prog.ids;
  if (MODE === 'probe') {
    const byCat = CATS.map((c) => prog.ids.filter((id) => prog.idCat[id] === c));
    order = [];
    for (let i = 0; i < Math.max(...byCat.map((a) => a.length)); i++) {
      for (const arr of byCat) if (arr[i]) order.push(arr[i]);
    }
  }

  let qi = 0, processed = 0, lastCp = countOk(prog);
  const nextId = () => {
    while (qi < order.length) {
      const id = order[qi++];
      const st = prog.works[id];
      if (!st || st.status === 'error' || st.status === 'min4') return id; // errors + first-attempt min4 retry on re-run
    }
    return null;
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    while (countOk(prog) < target) {
      const id = nextId();
      if (id == null) break;
      await processWork(prog, id);
      processed++;
      if (processed % 50 === 0) {
        console.log(`  …${processed} processed this run (ok ${countOk(prog)}/${prog.ids.length} known)`);
      }
      if (MODE === 'full' && countOk(prog) - lastCp >= 500) {
        lastCp = countOk(prog);
        writeCollection(prog); // periodic checkpoint of the public JSON
      }
    }
  }));

  saveProgress(prog, true);
  writeCollection(prog);
  summarize(prog);
  console.log(`[${MODE}] DONE. in-scope ok=${countOk(prog)} of ${prog.ids.length} discovered works.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
