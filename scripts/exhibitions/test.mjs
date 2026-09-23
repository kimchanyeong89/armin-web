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
  isUiImageUrl,
  metaContent,
  normalizeDate,
  parseDateRange,
  splitBlocks,
  stripTags,
} from './lib/parse.mjs';
import { extractCards, foreignVenueOf, introText, isNoiseTitle } from './lib/extract.mjs';
import { parseMuseumBlocks, findArrayRange, replaceExhibitionArray } from './lib/patch.mjs';
import { findExisting, findMissingFields, mergeMuseum, normalizeTitle, titleSimilarity } from './lib/merge.mjs';
import { coverKey, imageSize, isR2Url, posterProblem } from './lib/images.mjs';
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
  check(isNoiseTitle('리움·호암미술관 사칭 주의 안내'), '사칭 주의 안내 제외');
  check(isNoiseTitle('옛돌정원 휴장 안내'), '휴장 안내 제외');
  check(isNoiseTitle('리움-호암 셔틀버스 운행 안내'), '셔틀버스 안내 제외');
  check(isNoiseTitle('DDP 안내'), '기관 안내 제외');
  check(isNoiseTitle('예정 전시'), '구역 제목 제외');
  check(isNoiseTitle('M2 2층 〈드림 하우스〉 단축 관람 안내 : 9. 5.(토)'), '단축 관람 안내 제외');
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

// ── 상세 페이지 소개문 ───────────────────────────────────────────
function testIntro() {
  // 서울시립미술관: 제목·일정·운영 안내 문단 뒤에 소개문이 온다. 원문 줄바꿈은 공백이다
  eq(
    introText(
      '<p>《몸을 위한 간주곡 ― 소목장세미》</p><p>2026.04.02.(목) - 2027.05.30.(일)</p>' +
        '<p>프로그램이 진행되는 동안에는 관람이 제한됩니다. 양해 부탁드립니다.</p>' +
        '<p>미술관에서 우리의 몸은\n어떻게 작동할까?</p><p>관람객의 몸은 집중과 긴장 속에서 움직인다.</p>'
    ),
    '미술관에서 우리의 몸은 어떻게 작동할까? 관람객의 몸은 집중과 긴장 속에서 움직인다.',
    '소개문 앞의 제목·일정·운영 안내 건너뛰기'
  );
  // 국립중앙박물관: 글자 조각마다 span 이 붙고 전시명 괄호 '<' 가 이스케이프되지 않았다
  eq(
    introText(
      '<p><span>국립중앙박물관은 </span><span><</span><span>사계절 푸른 대나무</span><span>></span>' +
        '<span>를 개최합니다</span><span>.</span></p><p>* 본 전시는 무료로 관람하실 수 있습니다.</p>' +
        '<p>주요 전시품</p><p>조선 청화백자의 이른 시기 양상을 확인할 수 있는 조각이다.</p>'
    ),
    '국립중앙박물관은 <사계절 푸른 대나무>를 개최합니다.',
    '안내 문단에서 멈추고 태그가 아닌 괄호는 보존'
  );
  // DDP: 문장 사이의 홍보 문구는 잇고, 예매 버튼·문의처에서 멈춘다
  eq(
    introText(
      '6월, 오직 상어만 입장 가능한 비밀 통로가 열린다!<br>전세계 구독자가 사랑한 캐릭터의 세계최초 AI체험형 전시' +
        '<br>상어로 변신해 스페셜 게스트가 될 준비 되셨나요?<ul><li>예매하기</li></ul><br>문의처 : 070-8850-7834'
    ),
    '6월, 오직 상어만 입장 가능한 비밀 통로가 열린다! 전세계 구독자가 사랑한 캐릭터의 세계최초 AI체험형 전시 상어로 변신해 스페셜 게스트가 될 준비 되셨나요?',
    '홍보 문구는 잇고 예매 버튼에서 멈춤'
  );
  eq(introText('<p>추사 김정희와 그의 동반자</p><img src="/intro.jpg">'), '', '이미지뿐인 본문은 빈 값');
  eq(introText(`<p>${'가'.repeat(500)}.</p>`).length, 400, '400자 제한');
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

  // 공식 전체 제목과 줄여 쓴 제목이 따로 등록돼 같은 전시가 둘로 보이던 문제
  const hoam = [{ id: 'h1', title: '아트 스펙트럼 2026', startDate: '2026-09-01', endDate: '2026-12-31' }];
  const full = { title: '2026 아트스펙트럼 《방이있고모든라디오가각기다른주파수를향하고있다》', startDate: '2026-09-01' };
  eq(findExisting(hoam, full)?.id, 'h1', '축약 제목 ↔ 공식 제목 동일 전시로 매칭');
  check(!findExisting(hoam, { title: '전혀 다른 전시', startDate: '2026-09-01' }), '시작일만 같은 다른 전시는 매칭 안 됨');
  check(titleSimilarity('아트스펙트럼2026', '2026아트스펙트럼방이있고') > 0.5, '유사도 계산');
  check(titleSimilarity('', 'abc') === 0, '빈 문자열 유사도 0');
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

  // 워커가 다른 r2.dev 공개 호스트를 돌려줘도 받아들여야 한다.
  // 여기서 거부하면 업로드 성공에도 coverImage 가 비고, 앱에서 전시가 통째로 사라진다.
  check(isR2Url('https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/exhibitions/covers/a.jpg'), '표준 R2 호스트 허용');
  check(isR2Url('https://pub-6ce5ae60b244951ac36ffd277fd6ef76.r2.dev/exhibitions/covers/a.jpg'), '다른 r2.dev 호스트도 허용');
  check(!isR2Url('https://www.sac.or.kr/img/x.jpg'), '미술관 CDN 거부');
  check(!isR2Url('https://evil.com/r2.dev/x.jpg'), '호스트 위장 거부');
  check(!isR2Url(''), '빈 값 거부');
  check(coverKey('x', 'https://a/1.jpg') !== coverKey('x', 'https://a/2.jpg'), '원본이 바뀌면 포스터 키도 변경');
}

// ── 포스터 품질·기관 판별 ────────────────────────────────────────
function testPosterGate() {
  // 실제 수집에서 포스터 자리에 들어갔던 이미지들
  check(isUiImageUrl('https://www.museum.go.kr/ux/content/images/common/btn/btn_more_report.png'), '국중박 돋보기 버튼 거부');
  check(isUiImageUrl('https://www.sac.or.kr/design/theme/sac/images/logo-200x200.gif'), '예술의전당 로고 거부');
  check(isUiImageUrl('https://www.museum.go.kr/design/common/images/nmk_sns_logo.png'), 'SNS 공유 로고 거부');
  check(isUiImageUrl('/design/common/images/asset/noImage300x300.png'), '이미지 없음 대체본 거부');
  check(!isUiImageUrl('https://www.museum.go.kr/afile/previewOriginal/fileMng_MUSEUM26080729336L05xV?siteCode=MUSEUM'), '국중박 원본 포스터 허용');
  check(!isUiImageUrl('https://www.sac.or.kr/site/main/file/image/uu/69d3c711c0fa4f8780ea2a3b1912ad58'), '예술의전당 원본 포스터 허용');
  check(!isUiImageUrl('https://cdn.example.kr/catalogo/biologo-poster.jpg'), '단어 속 logo 는 허용');

  // 버튼 이미지가 썸네일보다 먼저 나와도 썸네일을 골라야 한다 (국중박 카드 마크업)
  const nmkCard = `<a href="?exhiSpThemId=1"><div class="over-text"><img src="/ux/content/images/common/btn/btn_more_report.png" alt="t"></div>
    <img src="/afile/previewThumbnail/fileMng_X1?siteCode=MUSEUM" alt="t"></a>`;
  eq(firstImage(nmkCard, 'https://www.museum.go.kr/'), 'https://www.museum.go.kr/afile/previewThumbnail/fileMng_X1?siteCode=MUSEUM', '버튼 다음 썸네일 선택');

  // 헤더만으로 이미지 크기를 읽는다
  const png = Buffer.alloc(40);
  png.writeUInt32BE(0x89504e47, 0);
  png.writeUInt32BE(49, 16);
  png.writeUInt32BE(49, 20);
  eq(imageSize(png), { format: 'png', width: 49, height: 49 }, 'PNG 크기');
  const gif = Buffer.alloc(40);
  gif.write('GIF89a', 0, 'ascii');
  gif.writeUInt16LE(203, 6);
  gif.writeUInt16LE(64, 8);
  eq(imageSize(gif), { format: 'gif', width: 203, height: 64 }, 'GIF 크기');
  const jpg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x05, 0x16, 0x03, 0xfc, ...Array(20).fill(0)]);
  eq(imageSize(jpg), { format: 'jpeg', width: 1020, height: 1302 }, 'JPEG 크기 (APP 세그먼트 건너뛰기)');
  eq(imageSize(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>')), null, 'SVG 는 판독하지 않음');

  check(posterProblem({ width: 49, height: 49, bytes: 2000 }) !== '', '49×49 버튼 거부');
  check(posterProblem({ width: 203, height: 64, bytes: 3000 }) !== '', '203×64 로고 거부');
  check(posterProblem({ width: 200, height: 200, bytes: 9000 }) !== '', '200×200 SNS 로고 거부');
  check(posterProblem({ width: 1200, height: 300, bytes: 90000 }) !== '', '가로 띠 배너 거부');
  eq(posterProblem({ width: 235, height: 300, bytes: 71000 }), '', '작은 실제 포스터 허용');
  eq(posterProblem({ width: 1920, height: 1080, bytes: 2600000 }), '', '가로형 전시 이미지 허용');
  eq(posterProblem({ width: 1080, height: 1920, bytes: 350000 }), '', '세로형 포스터 허용');
  eq(posterProblem(null), '이미지가 아님', '판독 불가 거부');
  check(posterProblem({ width: 1080, height: 1920, bytes: 11 * 1024 }) !== '', '큰 단색 자리표시 이미지 거부');
  eq(posterProblem({ width: 4501, height: 5295, bytes: 911 * 1024 }), '', '여백 많은 실제 포스터 허용');

  // 포스터를 확보하지 못한 새 전시는 넣지 않는다
  const noPoster = mergeMuseum([], [], [{ museumId: 'm', id: 'np', title: '포스터 없음', startDate: '2026-09-01', endDate: '2026-10-01', coverImage: '' }], { today: TODAY, requirePoster: true });
  eq(noPoster.temporary.length, 0, '포스터 없는 신규 전시 보류');
  check(noPoster.changes.some((c) => c.type === 'no-poster'), '포스터 없음 기록');

  // 기관 판별 — '그리움'은 리움미술관이 아니다
  eq(foreignVenueOf({ museumId: 'hangaram-art-museum', title: '[유연홍 개인전] 추억, 그리고 그리움' }), '', "'그리움'을 리움으로 오판하지 않음");
  eq(foreignVenueOf({ museumId: 'njpac', title: '서울라이트 DDP 2026 가을' }), 'ddp-gallery', '타 기관 행사 감지');
  eq(foreignVenueOf({ museumId: 'mmca-seoul', title: '백남준: 미래의 기억' }), '', '백남준 주제 전시는 백남준아트센터 행사가 아님');
  eq(foreignVenueOf({ museumId: 'mmca-gwacheon', title: 'MMCA 해외 명작' }), '', 'MMCA 서울/과천 공유');

  // 손으로 넣은 날짜가 틀리고 사이트 제목에 시리즈명이 붙어도 같은 전시로 찾아야 한다 (중복 카드 방지)
  const yoo = [{ id: 'y', title: '유영국: 산은 내 안에 있다', startDate: '2026-05-14', endDate: '2026-10-18' }];
  const yooSite = { title: '2026년 한국 근대 거장전 《유영국: 산은 내 안에 있다》', startDate: '2026-05-19', endDate: '2026-10-25' };
  eq(findExisting(yoo, yooSite)?.id, 'y', '시리즈명·날짜 차이 흡수 매칭');
  check(!findExisting(yoo, { ...yooSite, startDate: '2027-05-19', endDate: '2027-10-25' }), '기간이 안 겹치면 다른 회차');
  check(
    !findExisting([{ id: 's', title: '소장품', startDate: '2026-01-01', endDate: '2026-12-31' }], { title: '2026 소장품 하이라이트', startDate: '2026-03-01', endDate: '2026-06-30' }),
    '짧은 제목은 기간이 겹쳐도 매칭 안 함'
  );

  // 부제를 영문·한글로 달리 써도 기간이 똑같으면 같은 전시다
  const koo = [{ id: 'k', title: '구정아 개인전: OUSSS', startDate: '2026-09-05', endDate: '2026-12-27' }];
  eq(findExisting(koo, { title: '구정아: 우스모스', startDate: '2026-09-05', endDate: '2026-12-27' })?.id, 'k', '기간이 같으면 표기가 다른 제목도 매칭');
  check(!findExisting(koo, { title: '올해의 작가상 2026', startDate: '2026-09-05', endDate: '2026-12-27' }), '기간만 같은 다른 전시는 매칭 안 함');
}

// ── 실행 ────────────────────────────────────────────────────────
console.log('전시 동기화 파이프라인 점검\n');
testParse();
testNoise();
testIntro();
await testPatch();
testMerge();
testPosterGate();
await testRegistry();

if (failures.length) {
  console.log(`❌ ${passed}건 통과, ${failures.length}건 실패\n`);
  for (const f of failures) console.log(`   ✗ ${f}`);
  process.exit(1);
}
console.log(`✅ ${passed}건 모두 통과`);
