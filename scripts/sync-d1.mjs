// D1(armin-text-search)을 로컬 검색 색인과 **똑같이** 맞춘다.
//
// 왜 색인에서 만드나: 예전 build-d1-index.mjs 는 컬렉션 JSON 을 따로 훑어 자기
// 필드 매핑으로 D1 을 만들었다. 로컬 색인(generate-search-index.cjs)과 두 벌이라
// 어긋났다 — NGA 는 작가·이미지가 비고, 교정한 르누아르는 옛 그림, 새 미술관은 없었다.
// 검색은 색인 로딩 전엔 D1, 로딩 후엔 로컬을 보므로 결과가 20초 뒤 바뀌었다.
// 이제 D1 은 search-index-part-*.json 레코드를 그대로 옮긴다(한 벌).
//
// 증분: 지난번 보낸 행의 해시(d1-snapshot.json)와 비교해 바뀐 행만 UPSERT, 사라진
// 행만 DELETE 한다. 예전의 DELETE-all 후 재삽입은 10~15분 동안 서버 검색이 일부만
// 돌려줬다. 스냅샷이 없으면(첫 실행·다른 기계) D1 의 id 목록을 받아 비교한다.
//
// ⚠️ INSERT OR REPLACE 를 쓰지 않는다. REPLACE 는 행을 지웠다 새 rowid 로 다시 넣는데
//    재귀 트리거가 꺼져 있어 FTS 삭제 트리거가 돌지 않고 FTS 에 옛 항목이 쌓인다.
//    UPSERT(ON CONFLICT DO UPDATE)는 UPDATE 트리거를 타고 rowid 도 유지한다
//    (워커 /search-text 는 fts.rowid 로 JOIN 한다).
//
//   node scripts/sync-d1.mjs           # dry-run: 바뀐 행 수 계산 + SQL 파일 생성
//   node scripts/sync-d1.mjs --apply   # D1 반영 (wrangler 가 kietzland 계정이어야 함)

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { COLS, MAX_FIELD_LEN, loadIndexRows } from './lib/d1-rows.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = path.join(ROOT, 'public/data');
const WORKER_DIR = path.join(ROOT, 'workers/semantic-search');
const SNAPSHOT = path.join(WORKER_DIR, 'd1-snapshot.json');
const SQL_FILE = path.join(WORKER_DIR, 'd1-sync.sql');
const DB = 'armin-text-search';
const UPSERT_BATCH = 50;       // D1 문장 크기 한도(SQLITE_TOOBIG) 안쪽
const DELETE_BATCH = 100;

const APPLY = process.argv.includes('--apply');

const q = (v) => "'" + String(v ?? '').slice(0, MAX_FIELD_LEN).replace(/'/g, "''") + "'";

function wrangler(args) {
  return execFileSync('npx', ['wrangler', 'd1', 'execute', DB, '--remote', ...args], {
    cwd: WORKER_DIR, encoding: 'utf8', maxBuffer: 512 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function query(sql) {
  const out = wrangler(['--json', '--command', sql]);
  const parsed = JSON.parse(out.slice(out.indexOf('[')));
  return (parsed[0] && parsed[0].results) || [];
}

// ── 1. 로컬 색인 → 행 (개발용 로컬 검색 DB 와 같은 변환: scripts/lib/d1-rows.mjs)
const { manifest, rows: local } = loadIndexRows(DATA_DIR);
console.log(`[d1] 로컬 색인 ${local.size.toLocaleString()}행 (색인 시각 ${manifest.t})`);

// ── 2. 원격 상태
if (APPLY) {
  try {
    const n = query('SELECT COUNT(*) AS n FROM artworks')[0]?.n;
    console.log(`[d1] 원격 D1 ${Number(n).toLocaleString()}행`);
  } catch (e) {
    const msg = String(e.stderr || e.message || e);
    console.error('\n[d1] ✘ D1 에 접속하지 못했다.');
    if (/7403|not authorized|Authentication|9109|10000/.test(msg)) {
      console.error('    wrangler 가 D1 소유 계정(kietzland@gmail.com)으로 로그인돼 있지 않다.');
      console.error('    브라우저에서 Cloudflare 에 kietzland 계정으로 들어간 뒤 `npx wrangler login` 을 실행하라.');
    } else console.error('   ', msg.split('\n').filter(Boolean).slice(-3).join('\n    '));
    process.exit(1);
  }
}
let remote;          // id → hash(모르면 null)
let remoteSource;
if (fs.existsSync(SNAPSHOT)) {
  remote = new Map(Object.entries(JSON.parse(fs.readFileSync(SNAPSHOT, 'utf8'))));
  remoteSource = '지난 동기화 스냅샷';
} else if (APPLY) {
  // 스냅샷이 없으면 D1 의 id 를 전부 받아 온다. 내용은 모르니 로컬 행은 전부 UPSERT.
  remote = new Map();
  let last = '';
  for (;;) {
    const rows = query(`SELECT id FROM artworks WHERE id > ${q(last)} ORDER BY id LIMIT 50000`);
    for (const r of rows) remote.set(String(r.id), null);
    process.stdout.write(`\r[d1] 원격 id 목록 ${remote.size.toLocaleString()}개`);
    if (rows.length < 50000) break;
    last = String(rows[rows.length - 1].id);
  }
  console.log('');
  remoteSource = 'D1 id 목록(내용 미상 → 전부 UPSERT)';
} else {
  remote = new Map();
  remoteSource = '없음(dry-run 이라 D1 에 묻지 않음 → 첫 동기화로 가정)';
}

// ── 3. 차이
const upserts = [];
for (const [id, { row, hash }] of local) if (remote.get(id) !== hash) upserts.push(row);
const deletes = [];
for (const id of remote.keys()) if (!local.has(id)) deletes.push(id);
console.log(`[d1] 기준: ${remoteSource}`);
console.log(`[d1] UPSERT ${upserts.length.toLocaleString()}행 · DELETE ${deletes.length.toLocaleString()}행`);

// ── 4. SQL
const out = fs.createWriteStream(SQL_FILE);
out.write('-- scripts/sync-d1.mjs 가 만든 증분 동기화. 직접 고치지 말 것.\n');
const set = COLS.filter(c => c !== 'id').map(c => `${c}=excluded.${c}`).join(', ');
for (let i = 0; i < upserts.length; i += UPSERT_BATCH) {
  const values = upserts.slice(i, i + UPSERT_BATCH).map(r => '(' + COLS.map(c => q(r[c])).join(',') + ')').join(',\n');
  out.write(`INSERT INTO artworks (${COLS.join(', ')}) VALUES\n${values}\nON CONFLICT(id) DO UPDATE SET ${set};\n`);
}
for (let i = 0; i < deletes.length; i += DELETE_BATCH) {
  out.write(`DELETE FROM artworks WHERE id IN (${deletes.slice(i, i + DELETE_BATCH).map(q).join(',')});\n`);
}
await new Promise(res => out.end(res));
console.log(`[d1] SQL ${path.relative(ROOT, SQL_FILE)} (${(fs.statSync(SQL_FILE).size / 1048576).toFixed(1)}MB)`);

if (!APPLY) { console.log('(dry-run — 반영하려면 --apply)'); process.exit(0); }

// ── 5. 반영
const snapshot = () => fs.writeFileSync(SNAPSHOT, JSON.stringify(Object.fromEntries([...local].map(([id, v]) => [id, v.hash]))));
if (!upserts.length && !deletes.length) { snapshot(); console.log('[d1] 바뀐 행 없음'); process.exit(0); }
const t0 = Date.now();
try {
  wrangler([`--file=./${path.basename(SQL_FILE)}`]);
} catch (e) {
  console.error('[d1] ✘ SQL 실행 실패 — 스냅샷을 갱신하지 않았으니 다시 돌리면 이어서 맞춘다.');
  console.error('   ', String(e.stderr || e.message).split('\n').filter(Boolean).slice(-4).join('\n    '));
  process.exit(1);
}
snapshot();
const after = query('SELECT COUNT(*) AS n FROM artworks')[0]?.n;
console.log(`[d1] ✓ 반영 ${((Date.now() - t0) / 60000).toFixed(1)}분 · D1 ${Number(after).toLocaleString()}행 / 로컬 ${local.size.toLocaleString()}행`);
