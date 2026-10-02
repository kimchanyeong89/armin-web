#!/usr/bin/env node
/**
 * build-artist-bio-names.mjs — 작가 한국어 소개글의 첫머리에서 한국어 이름을 뽑아
 * public/data/i18n/artist-names-bio.json ({ 작가 키(artistKey.js): 한국어 이름 }) 을 만든다.
 * 키로 찾으므로 같은 작가의 다른 표기(Chaïm/Chaim, "Amiet, Cuno")도 같은 이름을 얻는다.
 *
 * 소개글은 "쿠노 아미에트(Cuno Amiet, 1868–1961)는 …" 처럼 시작한다. 괄호 안 영어 이름의
 * 성이 작가 키에 있을 때만 쓴다. 소개글이 가운데 이름까지
 * 적은 전체 이름이면(칼 빌헬름 빌헬름손 ← Carl Wilhelm Wilhelmson), 단어 수가 같을 때
 * 앱 이름에 있는 단어만 남긴다(칼 빌헬름손).
 *
 * 화면 표시용이다. 한국어 검색이 쓰는 위키데이터 이름표(artists.json)는 건드리지 않는다.
 *
 *   node scripts/i18n/build-artist-bio-names.mjs
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(import.meta.url), '../../..');
const BIOS = join(ROOT, 'public/data/artist-bios');
const plain = (s) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

const bios = {};
for (const f of readdirSync(BIOS).filter((f) => f.endsWith('.json'))) Object.assign(bios, JSON.parse(readFileSync(join(BIOS, f), 'utf8')));
const HEAD = /^([가-힣][가-힣·\s]{0,30}?)\s*\(([^,()]+)/;
const out = {};
let kept = 0, trimmed = 0, skipped = 0;
/* a bio's key is the artist's key (artistKey.js): its words are the name the app shows */
for (const [k, bio] of Object.entries(bios)) {
  const t = String(bio?.t || '').trim();
  const m = t.match(HEAD);
  if (!m) continue;
  const ko = m[1].replace(/\s+/g, ' ').trim();
  const full = plain(m[2]).split(' ');
  const shown = plain(k.replace(/_/g, ' ')).split(' ');
  /* the surname must be in the key, or the paragraph is about someone else */
  if (!full.length || !shown.includes(full[full.length - 1])) { skipped++; continue; }
  let name = ko;
  const koWords = ko.split(' ');
  /* a full name with middle names comes down to the words the key keeps (not for a surname-only key) */
  if (shown.length >= 2 && koWords.length === full.length && shown.length < full.length && shown.every((w) => full.includes(w))) {
    name = full.map((w, i) => (shown.includes(w) ? koWords[i] : null)).filter(Boolean).join(' ');
    trimmed++;
  }
  out[k] = name;
  kept++;
}
writeFileSync(join(ROOT, 'public/data/i18n/artist-names-bio.json'), JSON.stringify(out));
console.log(`kept ${kept} (trimmed ${trimmed}), skipped ${skipped} whose surname did not match`);
