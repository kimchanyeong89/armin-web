// 수집된 컬렉션의 빈 year 를 date 문자열에서 다시 채운다.
//
// 처음 수집할 때 쓴 연도 파서가 두 가지 표기를 놓쳤다:
//   NGA    — "late 16th or early 17th century", "early to mid nineteenth century" (세기 표기)
//   ColBase — "Edo ", "Kamakura " (세기 없이 시대명만)
// 이미지는 그대로 두고 JSON 의 year 만 보정하므로 재수집이 필요 없다.
//
//   node scripts/backfill-years.mjs                 # dry-run
//   node scripts/backfill-years.mjs --apply

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const TARGETS = [
  'nga', 'kyoto-national-museum', 'faam-fukuoka', 'aichi-pmoa',
  'momas-saitama', 'mimoca', 'barnes-foundation',
];

const ORDINAL_WORDS = {
  first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7,
  eighth: 8, ninth: 9, tenth: 10, eleventh: 11, twelfth: 12, thirteenth: 13,
  fourteenth: 14, fifteenth: 15, sixteenth: 16, seventeenth: 17, eighteenth: 18,
  nineteenth: 19, twentieth: 20, twentyfirst: 21,
};

// 일본 시대 시작 연도. 범위 표기가 없을 때 "가장 이른 추정치"로 쓴다.
const JP_ERAS = [
  ['Jomon', -10000], ['Yayoi', -300], ['Kofun', 250], ['Asuka', 592],
  ['Nara', 710], ['Heian', 794], ['Kamakura', 1185], ['Nanbokuch', 1336],
  ['Muromachi', 1336], ['Momoyama', 1573], ['Azuchi', 1573], ['Edo', 1603],
  ['Meiji', 1868], ['Taish', 1912], ['Showa', 1926], ['Shōwa', 1926],
  ['Heisei', 1989], ['Reiwa', 2019],
];

// 중국 왕조 (교토국립박물관은 동아시아 회화를 폭넓게 소장한다)
const CN_DYNASTIES = [
  ['Tang', 618], ['Song', 960], ['Yuan', 1271], ['Ming', 1368], ['Qing', 1644],
  ['Northern Song', 960], ['Southern Song', 1127], ['Goryeo', 918], ['Joseon', 1392],
];

/** date 문자열에서 가장 이른 서기 연도를 뽑는다. 못 뽑으면 null. */
export function parseYear(date) {
  const s = String(date || '').trim();
  if (!s) return null;

  // 1) 명시적 4자리 연도가 가장 정확
  const abs = s.match(/\b(\d{3,4})\b/);
  if (abs) {
    const y = Number(abs[1]);
    if (y >= 100 && y <= 2100) return y;
  }

  // 2) 숫자 서수 세기 — "16th", "late 17th century". 범위면 앞의 것.
  const cent = s.match(/(\d{1,2})\s*(?:st|nd|rd|th)/i);
  if (cent) return (Number(cent[1]) - 1) * 100;

  // 3) 영어 단어 세기 — "early to mid nineteenth century"
  const word = s.toLowerCase().replace(/[-\s]/g, '').match(/(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth|thirteenth|fourteenth|fifteenth|sixteenth|seventeenth|eighteenth|nineteenth|twentieth|twentyfirst)century/);
  if (word) return (ORDINAL_WORDS[word[1]] - 1) * 100;

  // 4) 일본 시대 / 중국·한국 왕조 이름
  for (const [name, y] of [...JP_ERAS, ...CN_DYNASTIES]) {
    if (new RegExp(`\\b${name}`, 'i').test(s)) return y;
  }
  return null;
}

const APPLY = process.argv.includes('--apply');
let totalFixed = 0;

for (const slug of TARGETS) {
  const file = path.join(ROOT, 'public/data', `${slug}-collection.json`);
  if (!fs.existsSync(file)) { console.log(`  ${slug.padEnd(24)} 파일 없음`); continue; }
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  const arts = data.artworks || [];
  const before = arts.filter(a => a.year == null).length;

  let fixed = 0;
  const samples = [];
  for (const a of arts) {
    if (a.year != null) continue;
    const y = parseYear(a.date);
    if (y == null) continue;
    if (samples.length < 3) samples.push(`"${a.date}" → ${y}`);
    if (APPLY) a.year = y;
    fixed++;
  }

  if (APPLY && fixed) fs.writeFileSync(file, JSON.stringify(data, null, 2));
  totalFixed += fixed;
  const pct = arts.length ? Math.round((arts.length - before + fixed) / arts.length * 100) : 0;
  console.log(`  ${slug.padEnd(24)} 결측 ${String(before).padStart(5)} → 보정 ${String(fixed).padStart(5)} (연도 보유 ${pct}%)  ${samples.join(' · ')}`);
}

console.log(`\n합계 ${totalFixed.toLocaleString()}건 보정${APPLY ? ' — 적용됨' : ' (dry-run, --apply 로 반영)'}`);
