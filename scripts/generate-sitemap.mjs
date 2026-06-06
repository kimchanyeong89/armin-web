#!/usr/bin/env node
// 빌드 시 public/sitemap.xml 생성.
// 데이터 소스: src/data/exhibitions.js (단일 출처).
// 환경변수: SITE_URL (기본 https://armin-web.pages.dev).
// 정책 근거: GOALS.md §2.1 Phase 1.
//
// 현재 커버: 정적 라우트 + /exhibition/{museum.id} + /collection/{exhibition.id}.
// 미커버(다음 단계): /work/{id}, /artist-gallery/{name} — 컬렉션 JSON 인덱싱 필요.

import { writeFile, stat } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SITE_URL = (process.env.SITE_URL || 'https://armin-web.pages.dev').replace(/\/$/, '');
const EXHIBITIONS_PATH = join(ROOT, 'src/data/exhibitions.js');
const OUT_PATH = join(ROOT, 'public/sitemap.xml');

const STATIC_ROUTES = [
  { path: '/',                       priority: '1.0', changefreq: 'daily' },
  { path: '/interactive',            priority: '0.9', changefreq: 'weekly' },
  { path: '/exhibitions',            priority: '0.9', changefreq: 'daily' },
  { path: '/ai',                     priority: '0.8', changefreq: 'weekly' },
  { path: '/search',                 priority: '0.7', changefreq: 'weekly' },
  { path: '/community',              priority: '0.6', changefreq: 'daily' },
  { path: '/tate-modern/permanent',  priority: '0.6', changefreq: 'monthly' },
];

function xmlEscape(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function urlEntry({ path, lastmod, priority, changefreq }) {
  const lines = [
    `    <loc>${xmlEscape(SITE_URL + path)}</loc>`,
    lastmod && `    <lastmod>${lastmod}</lastmod>`,
    changefreq && `    <changefreq>${changefreq}</changefreq>`,
    priority && `    <priority>${priority}</priority>`,
  ].filter(Boolean);
  return `  <url>\n${lines.join('\n')}\n  </url>`;
}

async function main() {
  const mod = await import(pathToFileURL(EXHIBITIONS_PATH).href);
  const exhibitions = mod.exhibitions;
  if (!Array.isArray(exhibitions)) {
    throw new Error('src/data/exhibitions.js did not export `exhibitions` array');
  }

  const dataLastmod = (await stat(EXHIBITIONS_PATH)).mtime.toISOString().slice(0, 10);
  const todayLastmod = new Date().toISOString().slice(0, 10);

  const entries = [];

  for (const r of STATIC_ROUTES) {
    entries.push(urlEntry({ ...r, lastmod: todayLastmod }));
  }

  let museumCount = 0;
  let collectionCount = 0;
  for (const m of exhibitions) {
    if (!m?.id) continue;
    museumCount++;
    entries.push(urlEntry({
      path: `/exhibition/${encodeURIComponent(m.id)}`,
      lastmod: dataLastmod,
      priority: '0.8',
      changefreq: 'monthly',
    }));

    const seen = new Set();
    const buckets = [m.permanentExhibitions, m.temporaryExhibitions];
    for (const bucket of buckets) {
      if (!Array.isArray(bucket)) continue;
      for (const c of bucket) {
        if (!c?.id || seen.has(c.id)) continue;
        seen.add(c.id);
        collectionCount++;
        entries.push(urlEntry({
          path: `/collection/${encodeURIComponent(c.id)}`,
          lastmod: dataLastmod,
          priority: '0.7',
          changefreq: 'monthly',
        }));
      }
    }
  }

  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    entries.join('\n') + '\n' +
    `</urlset>\n`;

  await writeFile(OUT_PATH, xml, 'utf8');

  console.log(`[sitemap] wrote ${OUT_PATH}`);
  console.log(`[sitemap] site=${SITE_URL}`);
  console.log(`[sitemap] urls=${entries.length} (static=${STATIC_ROUTES.length}, museums=${museumCount}, collections=${collectionCount})`);
}

main().catch((err) => {
  console.error('[sitemap] FAILED:', err);
  process.exit(1);
});
