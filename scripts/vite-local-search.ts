// 개발 서버 전용: POST /__search-text
//
// 프로덕션 워커의 /search-text 와 **같은 SQL·같은 토큰화**(workers/semantic-search/src/searchText.ts)를
// 로컬 SQLite(.local-search.sqlite)에 돌린다. 개발 환경의 "색인 로딩 전 검색 후보"가 지난 배포
// 시점의 프로덕션 D1 이 아니라 지금 로컬 데이터에서 나오게 하려는 것이다 — 로컬에서 고친
// 르누아르 그림이 처음 목록에서만 옛날 것으로 나왔다.
//
// 색인(search-manifest.json)이 바뀌면 DB 를 백그라운드에서 다시 만들고, 그동안은 503 을 준다.
// 검색 워커는 503 이면 후보 없이 기다렸다가 전체 색인 결과를 보여준다(틀린 목록은 안 뜬다).
// 번역이 필요한 비라틴 질의는 여기로 오지 않는다(워커가 보내지 않는다).

import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import type { Plugin } from 'vite';
import { buildFtsQuery, SEARCH_TEXT_MAX_LIMIT, SEARCH_TEXT_SQL } from '../workers/semantic-search/src/searchText';

export function localSearchText(root: string): Plugin {
  const dbFile = path.join(root, 'workers/semantic-search/.local-search.sqlite');
  const manifestFile = path.join(root, 'public/data/search-manifest.json');
  let db: DatabaseSync | null = null;
  let dbToken = '';
  let building = false;

  const manifestToken = (): string => {
    try {
      return String(JSON.parse(fs.readFileSync(manifestFile, 'utf8')).t || '');
    } catch {
      return '';
    }
  };

  const open = () => {
    try {
      const next = new DatabaseSync(dbFile);
      const row = next.prepare("SELECT v FROM meta WHERE k = 'manifest_t'").get() as { v?: string } | undefined;
      db = next;
      dbToken = row?.v || '';
    } catch {
      db = null;
      dbToken = '';
    }
  };

  const rebuild = () => {
    if (building) return;
    building = true;
    const child = spawn(process.execPath, ['scripts/build-local-search-db.mjs'], { cwd: root, stdio: 'ignore' });
    child.on('exit', () => {
      building = false;
      try { db?.close(); } catch { /* 이미 닫힘 */ }
      db = null;
      open();
    });
  };

  const send = (res: any, status: number, body: unknown) => {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(body));
  };

  return {
    name: 'local-search-text',
    apply: 'serve',
    configureServer(server) {
      open();
      server.middlewares.use('/__search-text', (req, res) => {
        if (req.method !== 'POST') return send(res, 405, { error: 'POST only' });
        let body = '';
        req.on('data', (c) => { body += c; });
        req.on('end', () => {
          const want = manifestToken();
          if (!db || (want && dbToken !== want)) {
            rebuild();
            return send(res, 503, { error: 'local search db is building' });
          }
          try {
            const parsed = JSON.parse(body || '{}');
            const query = String(parsed.query || '').trim();
            const limit = Math.max(1, Math.min(SEARCH_TEXT_MAX_LIMIT, Number(parsed.limit) || 50));
            const fts = query.length >= 2 ? buildFtsQuery(query) : '';
            const results = fts ? db.prepare(SEARCH_TEXT_SQL).all(fts, limit) : [];
            send(res, 200, { results, query, count: results.length });
          } catch (e: any) {
            send(res, 500, { error: String(e?.message || e) });
          }
        });
      });
    },
  };
}
