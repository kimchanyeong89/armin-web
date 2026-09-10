// Wellcome 작가명을 도서관 목록 표기에서 사람 이름으로 정리한다.
//
// Wellcome 의 contributors 는 MARC 규칙을 그대로 따라
//   "Dahlsteen, Augustin, 1720-1769.; William Hamilton"
//   "D'Alton, Christopher, active 1847-1871"
//   "Berend, H. W. (Heimann Wolff), 1809-1873.; L. Haase & Co ..."
// 처럼 성-이름 도치 + 생몰년 + 마침표 + 세미콜론 다중저자가 한 칸에 들어간다.
// 앱의 prettifyArtistName 은 도치만 풀 뿐 생몰년·active 표기는 못 떼서 화면에 그대로 나온다.
//
//   node scripts/clean-wellcome-artists.mjs           # dry-run
//   node scripts/clean-wellcome-artists.mjs --apply

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILE = path.join(ROOT, 'public/data/wellcome-collection-collection.json');

/** 한 사람 몫의 표기에서 생몰년·활동연도·역할 주석을 떼고 "First Last" 로 되돌린다. */
export function cleanOne(raw) {
  let s = String(raw || '').trim();
  if (!s) return '';

  // 연도 표기의 변종이 많다:
  //   "1720-1769."  "active 1847-1871"  "active approximately 1567-1574."
  //   "1886?-1961."  "1885-1988 or 1989."  "1796-"  "fl. 1850"
  // 한정어(approximately/circa)와 물음표, "or 1989" 꼬리까지 함께 떼야 이름만 남는다.
  const QUAL = '(?:active|fl\\.?|flourished|b\\.|d\\.|c\\.|ca\\.|circa|approximately|approx\\.?)';
  s = s.replace(new RegExp(`,?\\s*\\b${QUAL}(?:\\s+${QUAL})*\\s*\\d{3,4}\\??(?:\\s*-\\s*\\d{0,4}\\??)?(?:\\s+or\\s+\\d{3,4})?\\.?`, 'gi'), '');
  s = s.replace(/,?\s*\b\d{3,4}\??\s*-\s*\d{0,4}\??(?:\s+or\s+\d{3,4})?\.?/g, '');
  s = s.replace(/,?\s*\b\d{4}\??\.?\s*$/g, '');
  // 연도만 떼고 남은 한정어(", active" 처럼 꼬리로 남는 경우)
  s = s.replace(new RegExp(`,?\\s*\\b${QUAL}(?:\\s+${QUAL})*\\s*$`, 'gi'), '');

  // 역할 주석 "(engraver)" 는 떼고, 이름 확장 "(Heimann Wolff)" 는 살린다.
  s = s.replace(/\s*\((?:engraver|artist|printer|publisher|photographer|lithographer|after|attributed to)[^)]*\)/gi, '');

  s = s.replace(/[.,;\s]+$/, '').trim();

  // "Last, First Middle" → "First Middle Last". 쉼표가 둘 이상이면 손대지 않는다.
  const parts = s.split(',');
  if (parts.length === 2) {
    const last = parts[0].trim();
    const first = parts[1].trim();
    // "Smith, and Sons" 같은 회사명은 도치가 아니다
    if (first && last && !/^\s*(and|&|Ltd|Inc|Co)\b/i.test(first)) {
      s = `${first} ${last}`;
    }
  }
  return s.replace(/\s+/g, ' ').trim();
}

/** 세미콜론 다중저자를 나눠 각각 정리하고 다시 "; " 로 잇는다. */
export function cleanArtist(raw) {
  const s = String(raw || '').trim();
  if (!s || s === 'Unknown') return 'Unknown';
  const people = s.split(';').map(cleanOne).filter(Boolean);
  if (!people.length) return 'Unknown';
  // 이름 같지 않은 것(문자가 3자 미만, 숫자뿐)은 버린다
  const kept = people.filter(p => p.replace(/[^A-Za-zÀ-ɏ]/g, '').length >= 3);
  return kept.length ? kept.join('; ') : 'Unknown';
}

// 스크래퍼가 cleanArtist 만 가져다 쓰므로, 직접 실행할 때만 파일을 고친다.
if (process.argv[1] !== fileURLToPath(import.meta.url)) {
  // 모듈로 import 된 경우: 아래 실행부를 건너뛴다.
} else {
const APPLY = process.argv.includes('--apply');
const data = JSON.parse(fs.readFileSync(FILE, 'utf8'));
let changed = 0;
const samples = [];

for (const a of data.artworks) {
  const next = cleanArtist(a.artist);
  if (next === a.artist) continue;
  if (samples.length < 10) samples.push(`${a.artist}  →  ${next}`);
  if (APPLY) a.artist = next;
  changed++;
}

if (APPLY) fs.writeFileSync(FILE, JSON.stringify(data, null, 2));

console.log(`정리 ${changed.toLocaleString()} / ${data.artworks.length.toLocaleString()}건`);
samples.forEach(s => console.log('  ' + s));
console.log(APPLY ? '\n적용됨' : '\n(dry-run — --apply 로 반영)');
}
