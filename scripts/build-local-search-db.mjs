// 개발 서버용 로컬 검색 DB 를 만든다.
//
// 개발 환경의 "색인 로딩 전 검색 후보"가 프로덕션 D1(= 지난 배포 시점 데이터)에서 오면,
// 로컬에서 고친 데이터가 처음 목록에 안 보인다 — 로컬인데 옛날 르누아르가 떴다.
// 그래서 개발에선 프로덕션과 같은 스키마(workers/semantic-search/schema.sql)·같은 행
// (scripts/lib/d1-rows.mjs)으로 SQLite 파일을 만들고, 개발 서버가 /__search-text 로
// 같은 SQL 을 돌린다(scripts/vite-local-search.ts). 개발 서버가 색인이 바뀐 걸 보면
// 이 스크립트를 스스로 다시 돌린다.
//
//   node scripts/build-local-search-db.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { COLS, loadIndexRows } from './lib/d1-rows.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = path.join(ROOT, 'public/data');
const WORKER_DIR = path.join(ROOT, 'workers/semantic-search');
const OUT = path.join(WORKER_DIR, '.local-search.sqlite');
const TMP = `${OUT}.building`;

const t0 = Date.now();
const { manifest, rows } = loadIndexRows(DATA_DIR);

fs.rmSync(TMP, { force: true });
const db = new DatabaseSync(TMP);
db.exec('PRAGMA journal_mode = OFF; PRAGMA synchronous = OFF;'); // 한 번 쓰고 버리는 파일이라 빠르게
db.exec(fs.readFileSync(path.join(WORKER_DIR, 'schema.sql'), 'utf8'));
db.exec('CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT NOT NULL)');

const insert = db.prepare(`INSERT INTO artworks (${COLS.join(', ')}) VALUES (${COLS.map(() => '?').join(', ')})`);
let n = 0;
db.exec('BEGIN');
for (const { row } of rows.values()) {
  insert.run(...COLS.map((c) => row[c]));
  if (++n % 100000 === 0) {
    db.exec('COMMIT');
    db.exec('BEGIN');
    process.stdout.write(`\r[local-search] ${n.toLocaleString()}/${rows.size.toLocaleString()}`);
  }
}
db.exec('COMMIT');
db.prepare("INSERT OR REPLACE INTO meta (k, v) VALUES ('manifest_t', ?)").run(String(manifest.t || ''));
db.close();

// 다 만든 뒤에 바꿔 끼운다 — 개발 서버가 반쯤 만든 파일을 읽지 않게
fs.renameSync(TMP, OUT);
console.log(`\n[local-search] ${n.toLocaleString()}행 · ${((Date.now() - t0) / 1000).toFixed(0)}초 · ${path.relative(ROOT, OUT)}`);
