// 수집 진행 상황을 public/data/scrape-status.json 으로 계속 기록한다.
//
// scripts/.state/*-progress.json 은 dev 서버가 서빙하지 않는 위치라 브라우저에서 못 읽는다.
// 이 스크립트가 주기적으로 요약해 public/data 에 떨어뜨리면 대시보드가 폴링할 수 있다.
//
//   node scripts/write-scrape-status.mjs           # 한 번 쓰고 종료
//   node scripts/write-scrape-status.mjs --watch   # 20초마다 갱신 + http://localhost:5188 대시보드
//
// ⚠️ vite 는 **서버가 뜬 뒤 새로 만들어진** public/ 파일을 정적으로 안 준다(SPA fallback HTML 이 온다).
//    scrape-status.json 이 딱 그 경우라, 대시보드는 vite 대신 이 프로세스가 직접 서빙한다.
//    public/data 에 쓰는 것도 그대로 두었다 — dev 서버를 재시작하면 그쪽으로도 읽힌다.

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const STATE = path.join(ROOT, 'scripts/.state');
const OUT = path.join(ROOT, 'public/data/scrape-status.json');
const PAGE = path.join(ROOT, 'public/scrape-dashboard.html');
const PORT = Number(process.env.STATUS_PORT || 5188);

// 진행 파일 ↔ 표시 이름 ↔ 실행 중인지 확인할 스크립트 이름
const JOBS = [
  { id: 'artsmia', ko: '미니애폴리스 미술관', en: 'Minneapolis Institute of Art', proc: 'scrape-artsmia', total: null },
  { id: 'tokyo-fuji-art', ko: '도쿄후지미술관', en: 'Tokyo Fuji Art Museum', proc: 'scrape-fujibi', total: null },
  { id: 'national-gallery-fix', ko: '내셔널 갤러리 이미지 교정', en: 'National Gallery image fix', proc: 'fix-national-gallery', total: 2654, kind: 'repair' },
];

function running(pattern) {
  try { execSync(`pgrep -f "${pattern}" > /dev/null 2>&1`); return true; } catch { return false; }
}

function summarize(job) {
  const f = path.join(STATE, `${job.id}-progress.json`);
  if (!fs.existsSync(f)) return { ...job, state: 'idle', kept: 0, skipped: 0, byCategory: {}, bySkip: {} };
  let p;
  try { p = JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return { ...job, state: 'reading', kept: 0, skipped: 0, byCategory: {}, bySkip: {} }; }
  const values = Object.values(p);
  const kept = values.filter(v => v.key);
  // ⚠️ 이미지 교정 작업은 수집이 아니다. '이미 정상'(ok:true)을 제외 사유로
  //    묶으면 857건이 "되돌려보낸 것"으로 보여 실제보다 실패한 것처럼 읽힌다.
  const alreadyOk = values.filter(v => v.ok).length;
  const byCategory = {}, bySkip = {};
  for (const v of kept) byCategory[v.category] = (byCategory[v.category] || 0) + 1;
  for (const v of values) if (v.skip) {
    // playwright 오류는 'render-error Call log: - navigating to…' 처럼 스택이 통째로
    // 붙어 온다. 사유 이름만 남겨야 집계가 한 줄로 읽힌다.
    const k = String(v.skip).split(/[:(\n]/)[0].split(/\s+(?=[A-Z])/)[0].trim();
    bySkip[k] = (bySkip[k] || 0) + 1;
  }
  return {
    id: job.id, ko: job.ko, en: job.en, total: job.total,
    state: running(job.proc) ? 'running' : 'stopped',
    processed: values.length,
    kept: kept.length,
    skipped: values.length - kept.length - alreadyOk,
    byCategory, bySkip, alreadyOk,
    kind: job.kind || 'collect',
    updatedAt: fs.statSync(f).mtimeMs,
  };
}

/** 앱에 이미 등록된 미술관 수와 작품 수 */
function appTotals() {
  try {
    const src = fs.readFileSync(path.join(ROOT, 'src/data/exhibitions.js'), 'utf8');
    const museums = (src.match(/^\s{4}id: "/gm) || []).length;
    const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/search-manifest.json'), 'utf8'));
    return { museums, indexed: manifest.c, indexedAt: manifest.t };
  } catch { return { museums: null, indexed: null, indexedAt: null }; }
}

function write() {
  const payload = {
    generatedAt: new Date().toISOString(),
    app: appTotals(),
    jobs: JOBS.map(summarize),
  };
  fs.writeFileSync(OUT, JSON.stringify(payload, null, 1));
  return payload;
}

const first = write();
console.log(`[status] ${path.relative(ROOT, OUT)} — ${first.jobs.filter(j => j.state === 'running').length}개 실행 중`);

if (process.argv.includes('--watch')) {
  http.createServer((req, res) => {
    const url = (req.url || '/').split('?')[0];
    if (url === '/status.json') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify(write()));
      return;
    }
    if (url === '/' || url === '/index.html') {
      // 디스크에서 매번 읽는다 — 페이지를 고치면 새로고침만으로 반영된다.
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(fs.readFileSync(PAGE, 'utf8'));
      return;
    }
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('not found');
  }).listen(PORT, () => console.log(`[status] 대시보드 http://localhost:${PORT}`));

  setInterval(() => {
    const p = write();
    const line = p.jobs.map(j => `${j.ko.slice(0, 6)} ${j.kept}`).join(' · ');
    process.stdout.write(`\r[status] ${new Date().toLocaleTimeString('ko-KR')} ${line}   `);
  }, 20000);
}
