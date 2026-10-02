#!/usr/bin/env node
/**
 * publish-live.mjs — src/data/exhibitions.js 의 미술관별 전시 목록을 semantic-search 워커에 올린다.
 *
 * 앱은 켜질 때 GET /exhibitions-data 를 읽어 번들에 든 목록과 바꿔 끼운다(src/data/liveExhibitions.ts).
 * 그래서 전시가 바뀌어도 앱을 다시 배포하지 않는다. 매일 아침 scripts/exhibitions/daily.sh 가
 * 동기화(sync.mjs) 뒤에 부른다. 손으로 돌려도 된다.
 *
 * 사용법:
 *   node scripts/exhibitions/publish-live.mjs            # 올린다
 *   node scripts/exhibitions/publish-live.mjs --dry-run  # 만들기만 하고 크기·건수만 보여 준다
 *   node scripts/exhibitions/publish-live.mjs --force    # 전시가 절반 넘게 줄어도 올린다
 *
 * 인증: workers/semantic-search/.env 의 ADMIN_TOKEN (또는 환경 변수 TASTE_ADMIN_TOKEN).
 */

import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(fileURLToPath(import.meta.url), '../../..');
const WORKER = process.env.TASTE_WORKER_URL || 'https://armin-semantic-search.armin-art.workers.dev';
const argv = process.argv.slice(2);
const DRY_RUN = argv.includes('--dry-run');
const FORCE = argv.includes('--force');

function adminToken() {
  if (process.env.TASTE_ADMIN_TOKEN) return process.env.TASTE_ADMIN_TOKEN;
  const file = join(ROOT, 'workers/semantic-search/.env');
  const line = existsSync(file) && readFileSync(file, 'utf8').split('\n').find((l) => l.startsWith('ADMIN_TOKEN='));
  return line ? line.slice('ADMIN_TOKEN='.length).trim() : '';
}

async function main() {
  // 같은 프로세스에서 동기화가 파일을 막 바꿨을 수 있으니 캐시를 피해 새로 읽는다.
  const url = pathToFileURL(join(ROOT, 'src/data/exhibitions.js'));
  url.searchParams.set('t', String(Date.now()));
  const { exhibitions } = await import(url.href);

  // 목록을 가진 미술관은 비었더라도 넣는다. 빠지면 앱이 번들의 옛 목록을 그대로 쓴다.
  const museums = {};
  let shows = 0;
  for (const m of exhibitions) {
    if (!Array.isArray(m.temporaryExhibitions) && !Array.isArray(m.pastExhibitions)) continue;
    const temporaryExhibitions = m.temporaryExhibitions || [];
    const pastExhibitions = m.pastExhibitions || [];
    museums[m.id] = { temporaryExhibitions, pastExhibitions };
    shows += temporaryExhibitions.length + pastExhibitions.length;
  }
  // 지금 워커에 올라간 취향 점수 데이터의 버전. 앱은 기기에 보관한 점수가 이 버전으로 만든 것이 아니면
  // 다시 묻는다(새 전시가 들어온 날 점수가 비지 않게). daily.sh 는 취향 빌드를 이 스크립트보다 먼저 돌린다.
  const published = (() => {
    try { return JSON.parse(readFileSync(join(ROOT, 'scripts/taste/.store/published.json'), 'utf8')); } catch { return {}; }
  })();
  const tasteVersion = String(published.exhibitions?.key || '').split(':').pop() || undefined;
  const payload = { version: new Date().toISOString(), tasteVersion, museums };
  const body = JSON.stringify(payload);
  const summary = `미술관 ${Object.keys(museums).length}곳 · 전시 ${shows}건 · ${(body.length / 1024).toFixed(0)}KB · 취향 데이터 ${tasteVersion || '없음'}`;

  if (DRY_RUN) {
    console.log(`dry-run — ${summary}`);
    return;
  }
  const token = adminToken();
  if (!token) throw new Error('ADMIN_TOKEN 이 없습니다 (workers/semantic-search/.env 또는 환경 변수 TASTE_ADMIN_TOKEN).');

  const res = await fetch(`${WORKER}/exhibitions-data${FORCE ? '?force=1' : ''}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'x-admin-token': token },
    body,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status} ${text.slice(0, 300)}`);
  console.log(`올림 — ${summary} (${payload.version})`);
}

main().catch((err) => {
  console.error(`💥 전시 목록 올리기 실패: ${err.message}`);
  process.exit(1);
});
