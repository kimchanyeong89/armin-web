// 후쿠오카 컬렉션에 남은 일본어 필드를 정리한다.
//
//  1) metadata.country — 「日本・インド」 조합형. 나라 이름 사전으로 옮긴다.
//  2) description      — 1,533건의 일본어 해설. **화면 어디에도 안 나오고**
//     검색 색인에도 안 들어가는데 파일의 20%(약 870KB)를 차지한다.
//     원문은 scripts/.state/faam-fukuoka-progress.json 의 desc 에 그대로 남아
//     있으므로, 나중에 번역해 쓰기로 하면 거기서 복구하면 된다.
//
//   node scripts/clean-faam-fields.mjs           # dry-run
//   node scripts/clean-faam-fields.mjs --apply

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILE = path.join(ROOT, 'public/data/faam-fukuoka-collection.json');

const COUNTRY = {
  インド: ['인도', 'India'], 中国: ['중국', 'China'], 日本: ['일본', 'Japan'],
  韓国: ['한국', 'South Korea'], 北朝鮮: ['북한', 'North Korea'], 台湾: ['대만', 'Taiwan'],
  パキスタン: ['파키스탄', 'Pakistan'], ベトナム: ['베트남', 'Vietnam'],
  バングラデシュ: ['방글라데시', 'Bangladesh'], スリランカ: ['스리랑카', 'Sri Lanka'],
  インドネシア: ['인도네시아', 'Indonesia'], フィリピン: ['필리핀', 'Philippines'],
  ネパール: ['네팔', 'Nepal'], シンガポール: ['싱가포르', 'Singapore'],
  タイ: ['태국', 'Thailand'], ミャンマー: ['미얀마', 'Myanmar'], モンゴル: ['몽골', 'Mongolia'],
  マレーシア: ['말레이시아', 'Malaysia'], カンボジア: ['캄보디아', 'Cambodia'],
  ラオス: ['라오스', 'Laos'], ブルネイ: ['브루나이', 'Brunei'], ブータン: ['부탄', 'Bhutan'],
  モルディブ: ['몰디브', 'Maldives'], イギリス: ['영국', 'United Kingdom'],
  フランス: ['프랑스', 'France'], ドイツ: ['독일', 'Germany'], イタリア: ['이탈리아', 'Italy'],
  スウェーデン: ['스웨덴', 'Sweden'], アメリカ: ['미국', 'United States'],
  ヨーロッパ: ['유럽', 'Europe'], リヨン: ['리옹', 'Lyon'],
  'ドイツ?': ['독일(추정)', 'Germany (presumed)'],
};

function translateCountry(raw) {
  const parts = String(raw || '').split('・').map(s => s.trim()).filter(Boolean);
  const ko = [], en = [];
  for (const p of parts) {
    // 「インド（ドイツ?）」처럼 괄호가 붙은 꼴
    const m = p.match(/^(.+?)（(.+?)）$/);
    const base = m ? m[1] : p;
    const note = m ? m[2] : '';
    const hit = COUNTRY[base];
    if (!hit) return null;
    const n = note ? COUNTRY[note] : null;
    ko.push(note ? `${hit[0]}(${n ? n[0] : note})` : hit[0]);
    en.push(note ? `${hit[1]} (${n ? n[1] : note})` : hit[1]);
  }
  return [ko.join(' · '), en.join(', ')];
}

const APPLY = process.argv.includes('--apply');
const before = fs.statSync(FILE).size;
const data = JSON.parse(fs.readFileSync(FILE, 'utf8'));

let countries = 0, descs = 0;
const missed = new Set();

for (const a of data.artworks) {
  const c = a.metadata && a.metadata.country;
  if (c) {
    const hit = translateCountry(c);
    if (hit) { a.metadata.country = hit[0]; a.metadata.country_en = hit[1]; countries++; }
    else missed.add(c);
  }
  if (a.description) { delete a.description; descs++; }
}

const out = JSON.stringify(data, null, 2);
console.log(`나라 표기 ${countries}건 변환 · 미매칭 ${missed.size}종 ${[...missed].join(', ')}`);
console.log(`일본어 해설 ${descs}건 제거`);
console.log(`파일 ${Math.round(before / 1024)}KB → ${Math.round(Buffer.byteLength(out) / 1024)}KB`);
if (APPLY) { fs.writeFileSync(FILE, out); console.log('적용했다.'); }
else console.log('(dry-run — 적용하려면 --apply)');
