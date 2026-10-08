#!/usr/bin/env node
/**
 * fix-vam-card-text.mjs — V&A 상설 파일에서 작품 카드의 글자 덩어리가 제목 칸에 통째로 들어간 기록을 바로잡는다.
 *
 * 잘못 긁힌 기록(id 가 vam-painting-/vam-poster-/vam-portrait-/vam-photo- 로 시작)은
 *   title  = "제목\n 작가\n 연도\n V&A South Kensington"
 *   artist = 그 글자 덩어리의 첫 쉼표 앞(대개 제목 조각)
 * 이다. 네 줄은 V&A API(api.vam.ac.uk/v2/museumobject/<O번호>)의 제목·제작자·제작 연도와 그대로 일치한다
 * (2026-10-08 표본 대조). 줄을 제 칸으로 옮긴다: title ← 1행, artist ← 2행(비었거나 unknown 이면 Unknown), date ← 3행.
 *
 *   node scripts/fix-vam-card-text.mjs            # 무엇이 바뀌는지만 본다
 *   node scripts/fix-vam-card-text.mjs --apply    # 고친다(원본은 scripts/.state/vam-permanent-exhibitions.before-card-fix.json)
 *   node scripts/fix-vam-card-text.mjs --restore  # 되돌린다
 */
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(import.meta.url), '../..');
const FILE = resolve(ROOT, 'public/data/vam-permanent-exhibitions.json');
const BACKUP = resolve(ROOT, 'scripts/.state/vam-permanent-exhibitions.before-card-fix.json');

if (process.argv.includes('--restore')) {
  copyFileSync(BACKUP, FILE);
  console.log('restored from', BACKUP);
  process.exit(0);
}

const works = JSON.parse(readFileSync(FILE, 'utf8'));
let fixed = 0, unknown = 0;
const samples = [];
for (const work of works) {
  const lines = String(work.title || '').split('\n').map((line) => line.trim());
  if (lines.length < 4) continue;
  const [title, maker, date] = lines;
  const artist = !maker || /^unknown$/i.test(maker) ? 'Unknown' : maker;
  if (artist === 'Unknown') unknown += 1;
  if (samples.length < 6) samples.push({ id: work.id, was: String(work.artist).replace(/\s+/g, ' ').slice(0, 40), title, artist, date });
  work.title = title || 'Untitled';
  work.artist = artist;
  if (date) work.date = date;
  fixed += 1;
}
console.log(`${fixed} of ${works.length} records put right (${unknown} with no maker named)`);
console.table(samples);
if (!process.argv.includes('--apply')) { console.log('nothing written: run with --apply'); process.exit(0); }
if (!existsSync(BACKUP)) copyFileSync(FILE, BACKUP);
writeFileSync(FILE, JSON.stringify(works));
console.log('written; the original is at', BACKUP);
