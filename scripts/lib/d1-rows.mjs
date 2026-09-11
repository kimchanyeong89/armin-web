// 검색 색인 → D1 행.
//
// 프로덕션 D1 동기화(scripts/sync-d1.mjs)와 개발용 로컬 검색 DB
// (scripts/build-local-search-db.mjs)가 **같은 행**을 만들어야 개발에서 보는 검색 후보와
// 프로덕션 후보가 같다. 그래서 변환을 한 곳에 둔다.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const COLS = ['id', 'name', 'artist', 'museum', 'exhibition_id', 'image', 'date', 'source_url', 'category'];

// 여러 미술관이 같은 id 를 쓸 때 D1 키를 가르는 구분자(␟).
// src/utils/serverKeywordSearch.ts 의 D1_ID_SEP 와 같아야 한다(거기서 원래 id 로 되돌린다).
export const ID_SEP = '␟';

// D1 문장 크기 한도(SQLITE_TOOBIG) 때문에 긴 필드는 자른다. 로컬 DB 도 같은 값을 넣는다.
export const MAX_FIELD_LEN = 1000;

const clip = (v) => String(v ?? '').slice(0, MAX_FIELD_LEN);

/**
 * search-manifest.json 이 가리키는 색인 청크를 읽어 D1 행으로 바꾼다.
 * @returns {{ manifest: any, rows: Map<string, { row: Record<string,string>, hash: string }> }}
 */
export function loadIndexRows(dataDir) {
  const manifest = JSON.parse(fs.readFileSync(path.join(dataDir, 'search-manifest.json'), 'utf8'));
  const rows = new Map();
  for (const chunk of manifest.chunks) {
    for (const x of JSON.parse(fs.readFileSync(path.join(dataDir, chunk), 'utf8'))) {
      if (!x.id) continue;
      // ⚠️ 서로 다른 미술관이 같은 id 를 쓴다(타이베이시립미술관 245 = The Broad 245, 4,721건).
      //    색인은 숫자 245 와 문자 "245" 를 다르게 봐서 둘 다 들어 있지만, D1 의 TEXT PRIMARY
      //    KEY 에선 하나가 다른 하나를 덮어 그 작품이 로딩 전 검색에서 빠졌다. 색인 id 를
      //    바꾸면 좋아요·북마크 참조가 깨지므로 D1 키에만 "␟전시id" 를 붙이고 읽는 쪽이 되돌린다.
      let id = String(x.id);
      if (rows.has(id)) id = `${id}${ID_SEP}${x.e || ''}`;
      if (rows.has(id)) continue; // 같은 전시 안의 진짜 중복
      const row = {
        id,
        name: clip(x.n), artist: clip(x.a), museum: clip(x.m), exhibition_id: clip(x.e),
        image: clip(x.i), date: clip(x.d), source_url: clip(x.u), category: clip(x.c),
      };
      // 필드 경계가 모호하지 않게 배열째 직렬화해 해시한다
      const hash = crypto.createHash('sha1').update(JSON.stringify(COLS.map((c) => row[c]))).digest('hex').slice(0, 12);
      rows.set(id, { row, hash });
    }
  }
  return { manifest, rows };
}
