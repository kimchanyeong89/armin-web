#!/usr/bin/env node
/**
 * test.mjs — 전시 동기화 파이프라인 자체 점검 (네트워크 불필요)
 *
 * 실행: node scripts/exhibitions/test.mjs
 *
 * 날짜 파싱과 exhibitions.js 패치는 잘못되면 데이터 파일을 망가뜨리므로
 * 실제 데이터 파일을 대상으로 검증한다.
 */

import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

import {
  attr,
  computeStatus,
  decodeEntities,
  firstImage,
  metaContent,
  normalizeDate,
  parseDateRange,
  splitBlocks,
  stripTags,
} from './lib/parse.mjs';
import { extractCards, isNoiseTitle } from './lib/extract.mjs';
import { parseMuseumBlocks, findArrayRange, replaceExhibitionArray } from './lib/patch.mjs';
import { findExisting, findMissingFields, mergeMuseum, normalizeTitle } from './lib/merge.mjs';
import { coverKey } from './lib/images.mjs';
import { MANAGED_MUSEUMS, MUSEUM_LABELS, SOURCES } from './sources/index.mjs';

const ROOT = resolve(fileURLToPath(import.meta.url), '../../..');
const EXHIBITIONS_JS = join(ROOT, 'src/data/exhibitions.js');
const R2 = 'https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/exhibitions/covers/';
const TODAY = '2026-09-11';

let passed = 0;
const failures = [];

function check(condition, label) {
  if (condition) passed++;
  else failures.push(label);
}
function eq(got, want, label) {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g === w) passed++;
  else failures.push(`${label}\n     got  ${g}\n     want ${w}`);
}

// ── 날짜/HTML 파싱 ───────────────────────────────────────────────
function testParse() {
  eq(parseDateRange('2026.04.16 ~ 2026.11.22'), { startDate: '2026-04-16', endDate: '2026-11-22', openEnded: false }, '점 구분 기간');
  eq(parseDateRange('2026-04-16~2026-11-22'), { startDate: '2026-04-16', endDate: '2026-11-22', openEnded: false }, '대시 구분 기간');
  eq(parseDateRange('2026. 4. 16 - 2026. 11. 22'), { startDate: '2026-04-16', endDate: '2026-11-22', openEnded: false }, '공백 포함 기간');
  eq(parseDateRange('26.04.16(목) ~ 26.11.22(일)'), { startDate: '2026-04-16', endDate: '2026-11-22', openEnded: false }, '두자리 연도+요일');
  eq(parseDateRange('2026.04.16 ~ 11.22'), { startDate: '2026-04-16', endDate: '2026-11-22', openEnded: false }, '종료 연도 생략');
  eq(parseDateRange('2026.11.16 ~ 01.22'), { startDate: '2026-11-16', endDate: '2027-01-22', openEnded: false }, '해 넘김');
  eq(parseDateRange('2026년 4월 16일 ~ 2026년 11월 22일'), { startDate: '2026-04-16', endDate: '2026-11-22', openEnded: false }, '한글 날짜');
  eq(parseDateRange('2026.04.16 ~ 상설'), { startDate: '2026-04-16', endDate: '', openEnded: true }, '상설 전시');
  eq(normalizeDate('20260416'), '2026-04-16', '압축 날짜');
  eq(normalizeDate('2026.4.6'), '2026-04-06', '한자리 월일');
  eq(normalizeDate('없음'), '', '날짜 아님');

  eq(computeStatus('2026-04-16', '2026-11-22', TODAY), 'ongoing', '진행중 판정');
  eq(computeStatus('2026-10-01', '2027-02-07', TODAY), 'upcoming', '예정 판정');
  eq(computeStatus('2025-01-01', '2026-06-30', TODAY), 'past', '종료 판정');

  eq(stripTags('<p>가나<br>다라</p>'), '가나 다라', '태그 제거');
  eq(decodeEntities('A&amp;B &#48120;&#49696;&#44288;'), 'A&B 미술관', 'HTML 엔티티');
  eq(metaContent('<meta property="og:image" content="https://x/y.jpg">', 'og:image'), 'https://x/y.jpg', 'og:image');
  eq(firstImage('<img src="/blank.gif"><img data-src="/a/b.jpg">', 'https://m.kr'), 'https://m.kr/a/b.jpg', '빈 이미지 건너뛰기');
  eq(splitBlocks('<li class="ex">A</li><li class="ex">B</li>', '<li class="ex">').length, 2, '블록 분할');
  eq(attr('<img alt="전시 제목" src="a.jpg">', 'alt'), '전시 제목', '속성 추출');
}

// ── 잡음 제거 ────────────────────────────────────────────────────
function testNoise() {
  // 실제 수집에서 전시로 잘못 잡혔던 값들
  check(isNoiseTitle('환경경영시스템 인증서'), '인증서 제외');
  check(isNoiseTitle("' + r.title +'"), '스크립트 조각 제외');
  check(isNoiseTitle('3전시 임시 휴관 안내(7.5.)'), '휴관 안내 제외');
  check(isNoiseTitle('대관 안내'), '대관 안내 제외');
  check(isNoiseTitle('${item.name}'), '템플릿 리터럴 제외');
  check(isNoiseTitle('관람료 안내'), '관람료 제외');
  check(!isNoiseTitle('추사 김정희와 그의 동반자'), '정상 전시 통과');
  check(!isNoiseTitle('미라, 봉인된 신비'), '쉼표 포함 제목 통과');
  check(!isNoiseTitle('유영국: 산은 내 안에 있다'), '콜론 포함 제목 통과');

  // <script> 안의 HTML 템플릿이 카드로 잡히면 안 된다
  const html = `
    <script>var h = '<li class="item"><strong>' + r.title + '</strong><span>2026.01.01 ~ 2026.12.31</span></li>';</script>
    <li class="item"><strong>진짜 전시</strong><span>2026.04.16 ~ 2026.11.22</span>
      <img src="/p.jpg"><a href="/d/1">보기</a></li>`;
  const cards = extractCards(html, 'https://m.kr');
  eq(cards.length, 1, '스크립트 블록은 카드로 잡히지 않음');
  eq(cards[0].title, '진짜 전시', '실제 전시만 추출');
  eq(cards[0].startDate, '2026-04-16', '기간 추출');
  eq(cards[0].posterUrl, 'https://m.kr/p.jpg', '포스터 추출');
}

// ── exhibitions.js 패치 ─────────────────────────────────────────
async function importText(text) {
  const dir = mkdtempSync(join(tmpdir(), 'armin-test-'));
  const file = join(dir, 'e.mjs');
  writeFileSync(file, text, 'utf8');
  return import(pathToFileURL(file).href);
}

async function testPatch() {
  const text = readFileSync(EXHIBITIONS_JS, 'utf8');
  const { exhibitions } = await import(pathToFileURL(EXHIBITIONS_JS).href);
  const blocks = parseMuseumBlocks(text);

  eq(blocks.length, exhibitions.length, '미술관 블록 수 일치');
  eq(blocks.map((b) => b.id), exhibitions.map((m) => m.id), '미술관 id 순서 일치');

  const target = 'seoul-museum-of-art';
  const block = blocks.find((b) => b.id === target);
  check(!!block, `${target} 블록 탐색`);
  const range = findArrayRange(text, block, 'temporaryExhibitions');
  check(!!range && text[range.open] === '[' && text[range.close] === ']', '배열 범위 정확');

  // 특수문자가 섞인 값이 왕복해도 보존되는지
  const sample = [
    {
      id: 'test-1',
      title: '따옴표 "테스트" 전시',
      titleEn: 'Quote "Test"',
      description: '백슬래시 \\ 와 줄바꿈\n그리고 괄호 (1916–2002)',
      venue: '서소문본관',
      startDate: '2026-09-01',
      endDate: '2026-12-31',
      coverImage: `${R2}x.jpg`,
      officialUrl: 'https://sema.seoul.go.kr',
      status: 'ongoing',
    },
  ];
  const patched = replaceExhibitionArray(text, target, 'temporaryExhibitions', sample);
  const mod = await importText(patched);

  eq(mod.exhibitions.length, exhibitions.length, '패치 후 미술관 수 유지');
  const sema = mod.exhibitions.find((m) => m.id === target);
  eq(sema.temporaryExhibitions.length, 1, '배열 교체 반영');
  eq(sema.temporaryExhibitions[0].title, '따옴표 "테스트" 전시', '따옴표 보존');
  check(sema.temporaryExhibitions[0].description.includes('\n'), '줄바꿈 보존');
  eq(sema.temporaryExhibitions[0].venue, '서소문본관', '추가 필드 보존');
  eq(sema.permanentExhibitions.length, 1, '상설 전시 미변경');

  const others = exhibitions.filter((m) => m.id !== target);
  const changed = others.filter(
    (m) => JSON.stringify(m) !== JSON.stringify(mod.exhibitions.find((x) => x.id === m.id))
  );
  eq(changed.length, 0, '다른 미술관 데이터 불변');

  const emptied = await importText(replaceExhibitionArray(text, target, 'temporaryExhibitions', []));
  eq(emptied.exhibitions.find((m) => m.id === target).temporaryExhibitions.length, 0, '빈 배열 처리');
}

// ── 병합 규칙 ────────────────────────────────────────────────────
function testMerge() {
  const existingTemp = [
    {
      id: 'sema-2026-gana-tech',
      title: '가나아트컬렉션: 기술의 저변 — 경계에 선 장면들',
      titleEn: 'Gana Art Collection',
      description: '손으로 다듬은 한국어 소개문.',
      startDate: '2026-04-16',
      endDate: '2026-11-22',
      coverImage: `${R2}old.jpg`,
      officialUrl: 'https://sema.seoul.go.kr',
      status: 'ongoing',
    },
    { id: 'sema-ended', title: '이미 끝난 전시', description: '설명', startDate: '2026-01-01', endDate: '2026-03-01', coverImage: `${R2}e.jpg`, officialUrl: 'x', status: 'ongoing' },
  ];
  const cards = [
    { museumId: 'seoul-museum-of-art', id: 'a1', title: '가나아트컬렉션: 기술의 저변 — 경계에 선 장면들', description: '', startDate: '2026-04-16', endDate: '2026-12-20', coverImage: `${R2}new.jpg`, venue: '서소문본관' },
    { museumId: 'seoul-museum-of-art', id: 'a2', title: '신규 전시', description: '수집된 설명', startDate: '2026-09-01', endDate: '2026-12-31', coverImage: `${R2}n.jpg` },
  ];

  const r = mergeMuseum(existingTemp, [], cards, { today: TODAY, museumId: 'seoul-museum-of-art' });
  const gana = r.temporary.find((e) => e.id === 'sema-2026-gana-tech');
  eq(gana.description, '손으로 다듬은 한국어 소개문.', '큐레이션 설명 보존');
  eq(gana.titleEn, 'Gana Art Collection', '큐레이션 영문 제목 보존');
  eq(gana.endDate, '2026-12-20', '기간 연장 반영');
  eq(gana.coverImage, `${R2}new.jpg`, '포스터 갱신');
  eq(gana.venue, '서소문본관', '빈 필드 보강');
  check(!!r.temporary.find((e) => e.title === '신규 전시'), '신규 전시 추가');
  eq(r.past.length, 1, '종료 전시 보관');
  check(!r.temporary.some((e) => e.title === '이미 끝난 전시'), '종료 전시는 진행 목록에서 제거');

  // 수집 0건 — 기존 데이터를 지우면 안 된다
  const empty = mergeMuseum(existingTemp, [], [], { today: TODAY });
  eq(empty.temporary.length, 1, '수집 0건이어도 진행중 전시 유지');

  // --no-new 모드
  const noNew = mergeMuseum(existingTemp, [], cards, { today: TODAY, allowNew: false });
  check(!noNew.temporary.some((e) => e.title === '신규 전시'), 'allowNew=false 면 신규 미추가');
  check(noNew.changes.some((c) => c.type === 'pending-new'), '보류된 신규 전시 기록');
  eq(noNew.temporary.find((e) => e.id === 'sema-2026-gana-tech').endDate, '2026-12-20', 'allowNew=false 여도 기존 전시는 갱신');

  // 보관된 전시가 기간 연장으로 다시 열리면 되돌아와야 한다
  const revivedPast = [{ id: 'r1', title: '재개 전시', description: 'd', startDate: '2026-01-01', endDate: '2026-03-01', coverImage: `${R2}r.jpg`, officialUrl: 'u', status: 'past' }];
  const revived = mergeMuseum([], revivedPast, [
    { museumId: 'm', id: 'r1', title: '재개 전시', startDate: '2026-01-01', endDate: '2026-12-31' },
  ], { today: TODAY, museumId: 'm' });
  check(revived.temporary.some((e) => e.title === '재개 전시'), '기간 연장된 보관 전시 복귀');
  eq(revived.past.length, 0, '복귀한 전시는 보관 목록에서 제거');
  check(revived.changes.some((c) => c.type === 'revived'), '복귀 기록');

  // R2 가 아닌 이미지는 기록하지 않는다
  const bad = mergeMuseum([], [], [{ museumId: 'm', id: 'i', title: 'T', startDate: '2026-09-01', endDate: '2026-10-01', coverImage: 'https://museum.kr/direct.jpg' }], { today: TODAY });
  eq(bad.temporary[0].coverImage, '', '미술관 CDN URL 은 coverImage 로 쓰지 않음');

  check(!!findExisting(existingTemp, { title: '가나아트컬렉션 기술의 저변 경계에 선 장면들' }), '문장부호 무시 매칭');
  eq(normalizeTitle('《유영국》: 산은 내 안에'), normalizeTitle('유영국 산은 내 안에'), '괄호 정규화');
  check(findMissingFields({ title: 'a', startDate: '2026-01-01' }).includes('coverImage(포스터)'), '누락 필드 감지');
  eq(findMissingFields({ title: 'a', startDate: '2026-01-01', endDate: '2026-02-01', coverImage: 'c', description: 'd', officialUrl: 'u' }).length, 0, '완전한 레코드 통과');
}

// ── 레지스트리 정합성 ────────────────────────────────────────────
async function testRegistry() {
  const { exhibitions } = await import(pathToFileURL(EXHIBITIONS_JS).href);
  const ids = new Set(exhibitions.map((m) => m.id));
  for (const museumId of MANAGED_MUSEUMS) {
    check(ids.has(museumId), `레지스트리의 ${museumId} 가 exhibitions.js 에 존재`);
    check(!!MUSEUM_LABELS[museumId], `${museumId} 표시 이름 등록됨`);
  }
  for (const source of SOURCES) {
    check(typeof source.fetch === 'function', `${source.key} 소스에 fetch 구현`);
    check(source.museums.length > 0, `${source.key} 소스에 대상 미술관 지정`);
  }
  // 포스터 키는 같은 입력에 대해 항상 같아야 한다 (재실행 시 중복 업로드 방지)
  eq(coverKey('mmca-seoul-2026-x', 'https://a/b.jpg'), coverKey('mmca-seoul-2026-x', 'https://a/b.jpg'), '포스터 키 안정성');
  check(coverKey('x', 'https://a/1.jpg') !== coverKey('x', 'https://a/2.jpg'), '원본이 바뀌면 포스터 키도 변경');
}

// ── 실행 ────────────────────────────────────────────────────────
console.log('전시 동기화 파이프라인 점검\n');
testParse();
testNoise();
await testPatch();
testMerge();
await testRegistry();

if (failures.length) {
  console.log(`❌ ${passed}건 통과, ${failures.length}건 실패\n`);
  for (const f of failures) console.log(`   ✗ ${f}`);
  process.exit(1);
}
console.log(`✅ ${passed}건 모두 통과`);
