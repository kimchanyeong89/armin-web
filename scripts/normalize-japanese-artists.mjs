// 일본 미술관 컬렉션의 작가명을 로마자 우선으로 정규화한다.
//
// JMAPPS 의 `作家名` 은 "中野四郎 NAKANO Shiro" 처럼 일본어와 로마자를 한 칸에 담는다.
// 그대로 저장하면 (a) 한국 사용자에게 일본어가 그대로 노출되고 (b) 앱의 작가 매칭
// (sorted-token 키 + artists.json Wikidata 한국어 레이블)이 붙지 않는다.
// 로마자 부분을 뽑아 `artist` 로 쓰고, 원문은 metadata.artist_ja 에 보존한다.
//
//   node scripts/normalize-japanese-artists.mjs           # dry-run
//   node scripts/normalize-japanese-artists.mjs --apply

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const TARGETS = ['faam-fukuoka', 'momas-saitama', 'mimoca'];

const JP = /[぀-ヿ㐀-䶿一-鿿]/;
// 로마자 토막: 이니셜(M. V.)과 악센트(MANZÙ), 아포스트로피·하이픈을 포함한다.
const LATIN_RUN = /[A-Za-zÀ-ɏ][A-Za-zÀ-ɏ.'’\- ]*[A-Za-zÀ-ɏ.]/g;

/** 혼합 표기에서 로마자 이름만 뽑는다. 로마자가 없으면 null. */
export function latinPart(name) {
  const runs = String(name || '').match(LATIN_RUN);
  if (!runs) return null;
  // "M. V. ドゥランダール" 처럼 이니셜만 남는 경우는 이름으로 못 쓴다.
  const joined = runs.join(' ').replace(/\s+/g, ' ').trim();
  const letters = joined.replace(/[^A-Za-zÀ-ɏ]/g, '');
  return letters.length >= 3 ? joined : null;
}

// 로마자가 아예 없는 소수는 직접 옮긴다(일본어 읽기 기준 한국어 표기).
const MANUAL_KO = {
  '猪熊弦一郎': 'Inokuma Genichiro',
  'M. V. ドゥランダール': 'M. V. Dhurandhar',
  'P. R. クマーラ・ピッラーイ': 'P. R. Kumara Pillai',
  'ブラーラール・モティーラール・ナトゥドワラ': 'Bhulalal Motilal Nathdwara',
  'ラム・チャンドラ': 'Ram Chandra',
};

const APPLY = process.argv.includes('--apply');
let changed = 0, kept = 0;
const unresolved = new Set();

for (const slug of TARGETS) {
  const file = path.join(ROOT, 'public/data', `${slug}-collection.json`);
  if (!fs.existsSync(file)) { console.log(`  ${slug} — 파일 없음`); continue; }
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  let n = 0;
  const samples = [];

  for (const a of data.artworks) {
    const raw = a.artist || '';
    if (!JP.test(raw)) { kept++; continue; }
    const latin = MANUAL_KO[raw] || latinPart(raw);
    if (!latin) { unresolved.add(raw); continue; }
    if (samples.length < 3) samples.push(`${raw} → ${latin}`);
    if (APPLY) {
      a.metadata = { ...(a.metadata || {}), artist_ja: raw };
      a.artist = latin;
    }
    n++; changed++;
  }

  if (APPLY && n) fs.writeFileSync(file, JSON.stringify(data, null, 2));
  console.log(`  ${slug.padEnd(18)} ${String(n).padStart(5)}건 정규화   ${samples.join(' · ')}`);
}

console.log(`\n합계 ${changed.toLocaleString()}건 정규화 · 원래 로마자 ${kept.toLocaleString()}건 유지`);
if (unresolved.size) console.log(`미해결 ${unresolved.size}종: ${[...unresolved].join(', ')}`);
console.log(APPLY ? '적용됨' : '(dry-run — --apply 로 반영)');
