/**
 * extract.mjs — 목록 페이지에서 전시 카드를 뽑아내는 범용 추출기.
 *
 * 한국 미술관 사이트 대부분은 "썸네일 + 제목 + 기간" 이 한 덩어리로 반복되는
 * 목록 구조다. 사이트별 선택자가 바뀌어도 최소한의 정보는 건지도록
 * 범용 추출 → 사이트별 정제 순으로 쓴다.
 */

import {
  attr,
  cleanText,
  extractJsonLd,
  firstImage,
  firstLink,
  metaContent,
  normalizeDate,
  parseDateRange,
  splitBlocks,
  stripTags,
} from './parse.mjs';

/** 목록 블록을 나눌 때 흔히 쓰이는 여는 태그 패턴들 */
const DEFAULT_BLOCK_PATTERNS = [
  '<li[^>]*class="[^"]*(?:item|list|exhibition|exhbt|card|thumb|gallery)[^"]*"',
  '<div[^>]*class="[^"]*(?:item|card|thumb_img|exhibition|exhbt|list_box|cont_box)[^"]*"',
  '<li[^>]*>',
  '<article[^>]*>',
];

/** 제목으로 쓰기엔 부적절한 잡음 텍스트 */
const NOISE = /^(?:더보기|more|자세히|바로가기|이전|다음|목록|prev|next|view|상세보기)$/i;

/**
 * 전시가 아닌 항목을 걸러낸다.
 * 미술관 목록 페이지에는 공지·인증서·대관 안내가 전시 카드와 같은 마크업으로 섞여 있고,
 * 인라인 스크립트가 만든 템플릿 문자열(' + r.title + ')이 잡히기도 한다.
 */
export function isNoiseTitle(title = '') {
  const t = String(title).trim();
  if (t.length < 2) return true;

  // 자바스크립트 조각이 새어 들어온 경우
  if (/[+]\s*\w+\.\w+|\$\{|\bfunction\b|\bvar\s|\breturn\b|<\/?\w+>/.test(t)) return true;

  // "…안내", "…공지", "…주의" 로 끝나면 전시가 아니라 게시물이다
  // (예: "리움·호암미술관 사칭 주의 안내", "옛돌정원 휴장 안내", "DDP 안내")
  // 뒤에 날짜·괄호가 더 붙어도("… 단축 관람 안내 : 9. 5.(토)") 게시물로 본다
  if (/(?:안내|공지|주의|알림|안내문|공고)\s*(?:[:：(\[-].*)?$/.test(t)) return true;

  // 목록의 구역 제목이 카드로 잡힌 경우 (예: "예정 전시", "현재 전시")
  if (/^(?:예정|현재|지난|종료|진행|상설|기획)\s*전시$/.test(t)) return true;

  // 전시가 아닌 게시물
  if (
    /인증서|휴관|휴장|사칭|셔틀|공지사항|채용|모집|입찰|대관|주차|관람료|오시는\s*길|개인정보|저작권|사이트맵|운영\s*시간|자원봉사|후원|뉴스레터|이벤트\s*당첨|설문/.test(
      t
    )
  ) {
    return true;
  }
  return false;
}

/**
 * 제목이 '다른' 기관을 명시하면 그 기관의 행사다.
 * 경기문화재단(njp.ggcf.kr)처럼 한 사이트가 여러 기관 소식을 함께 싣는 경우
 * "서울라이트 DDP" 같은 항목이 백남준아트센터 전시로 잡힌다.
 * 기관명은 정식 명칭으로만 찾는다. '리움'만 찾으면 "그리움"이,
 * '백남준'만 찾으면 다른 미술관의 백남준 전시가 걸린다.
 */
const VENUE_MARKERS = [
  { pattern: /서울라이트|\bDDP\b|동대문디자인플라자/, museumId: 'ddp-gallery' },
  { pattern: /국립현대미술관|\bMMCA\b/, museumId: 'mmca-seoul' },
  { pattern: /국립중앙박물관/, museumId: 'national-museum-korea' },
  { pattern: /서울시립미술관|\bSeMA\b/, museumId: 'seoul-museum-of-art' },
  { pattern: /리움미술관/, museumId: 'leeum-museum' },
  { pattern: /호암미술관/, museumId: 'hoam-museum' },
  { pattern: /백남준아트센터/, museumId: 'njpac' },
  { pattern: /예술의전당|한가람미술관/, museumId: 'hangaram-art-museum' },
];

/** 카드 제목이 다른 기관을 가리키면 그 기관 id 를, 아니면 '' 를 돌려준다. */
export function foreignVenueOf(card) {
  const hit = VENUE_MARKERS.find((v) => v.pattern.test(card.title || ''));
  if (!hit || hit.museumId === card.museumId) return '';
  // MMCA 는 서울/과천을 함께 쓰므로 접두사로 비교한다
  if (String(card.museumId).startsWith(hit.museumId.split('-')[0])) return '';
  return hit.museumId;
}

/** script/style/noscript 를 제거한다. 블록 분할 전에 반드시 거쳐야 한다. */
function stripInertTags(html = '') {
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ');
}

/** 블록 안에서 제목으로 가장 그럴듯한 문자열을 고른다. */
function pickTitle(block) {
  // 1) 제목 성격의 태그/클래스 우선
  const patterns = [
    /<(?:strong|h[1-6])[^>]*>([\s\S]{2,200}?)<\/(?:strong|h[1-6])>/i,
    /class="[^"]*(?:tit|title|subject|name)[^"]*"[^>]*>([\s\S]{2,200}?)</i,
    /<a[^>]*title="([^"]{2,200})"/i,
  ];
  for (const re of patterns) {
    const m = re.exec(block);
    const t = cleanText(m?.[1] || '');
    if (t && !NOISE.test(t) && !/^\d{4}[.\-/]/.test(t)) return t;
  }
  // 2) 이미지 alt
  const img = /<img[^>]*>/i.exec(block);
  if (img) {
    const alt = cleanText(attr(img[0], 'alt'));
    if (alt && !NOISE.test(alt)) return alt;
  }
  // 3) 링크 텍스트
  const a = /<a[^>]*>([\s\S]{2,200}?)<\/a>/i.exec(block);
  const at = cleanText(a?.[1] || '');
  if (at && !NOISE.test(at) && !/^\d{4}[.\-/]/.test(at)) return at;
  return '';
}

/** 블록 텍스트에서 기간을 찾는다. */
function pickDates(block) {
  const text = stripTags(block);
  // 기간처럼 보이는 구간(물결/대시로 이어진 두 날짜)을 우선 탐색
  const rangeRe =
    /(\d{2,4}\s*[년.\-/]\s*\d{1,2}\s*[월.\-/]\s*\d{1,2}\s*일?)\s*(?:~|-|–|—|부터|to)\s*(\d{2,4}\s*[년.\-/]\s*\d{1,2}\s*[월.\-/]\s*\d{1,2}\s*일?|\d{1,2}\s*[.\-/]\s*\d{1,2})/;
  const m = rangeRe.exec(text);
  if (m) return parseDateRange(m[0]);
  return parseDateRange(text);
}

/**
 * 목록 HTML 에서 전시 카드를 추출한다.
 * @param {string} html
 * @param {string} baseUrl 상대경로 해석용
 * @param {object} [opts]
 * @param {string[]} [opts.blockPatterns] 블록 분할 패턴 (먼저 맞는 것 하나를 쓴다)
 * @param {number} [opts.minCards] 이 개수 이상 나와야 유효한 분할로 본다
 * @returns {Array<{title,startDate,endDate,openEnded,posterUrl,officialUrl}>}
 */
export function extractCards(rawHtml, baseUrl, opts = {}) {
  const { blockPatterns = DEFAULT_BLOCK_PATTERNS, minCards = 1 } = opts;
  // 인라인 스크립트가 만든 HTML 템플릿 문자열이 카드로 잡히는 것을 막는다
  const html = stripInertTags(rawHtml);

  for (const pattern of blockPatterns) {
    let blocks;
    try {
      blocks = splitBlocks(html, pattern);
    } catch {
      continue;
    }
    if (blocks.length < minCards) continue;

    const cards = [];
    for (const block of blocks) {
      const title = pickTitle(block);
      if (!title || isNoiseTitle(title)) continue;
      const { startDate, endDate, openEnded } = pickDates(block);
      if (!startDate) continue; // 기간 없는 블록은 전시 카드가 아니다
      const posterUrl = firstImage(block, baseUrl);
      const officialUrl = firstLink(block, baseUrl);
      // raw 는 사이트별 후처리(예: 전시관 판별)에 쓴다. 최종 데이터에는 넣지 않는다.
      cards.push({ title, startDate, endDate, openEnded, posterUrl, officialUrl, raw: block });
    }

    // 중복 제거 (같은 제목+시작일)
    const seen = new Set();
    const unique = cards.filter((c) => {
      const key = `${c.title}|${c.startDate}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    if (unique.length >= minCards) return unique;
  }
  return [];
}

/**
 * JSON-LD 의 Event/ExhibitionEvent 에서 전시를 뽑는다.
 * 구조화 데이터를 제공하는 소수 사이트용 폴백.
 */
export function cardsFromJsonLd(html, baseUrl) {
  const out = [];
  for (const node of extractJsonLd(html)) {
    const types = [].concat(node['@type'] || []);
    if (!types.some((t) => /Event|Exhibition/i.test(String(t)))) continue;
    const title = cleanText(node.name || '');
    if (!title || isNoiseTitle(title)) continue;
    const image = Array.isArray(node.image) ? node.image[0] : node.image;
    out.push({
      title,
      description: cleanText(node.description || '', 400),
      startDate: normalizeDate(node.startDate),
      endDate: normalizeDate(node.endDate),
      openEnded: false,
      posterUrl: typeof image === 'string' ? image : image?.url || '',
      officialUrl: node.url || baseUrl,
    });
  }
  return out.filter((c) => c.startDate);
}

/**
 * 상세 페이지에서 소개문과 대표 이미지를 보강한다.
 * 목록에 없는 정보(설명·고화질 포스터)를 채우기 위한 선택적 단계.
 */
export function detailsFromHtml(html, baseUrl) {
  const ld = cardsFromJsonLd(html, baseUrl)[0];
  const ogImage = metaContent(html, 'og:image');
  const ogDesc = metaContent(html, 'og:description');
  const metaDesc = metaContent(html, 'description');
  const description = cleanText(ld?.description || ogDesc || metaDesc || '', 400);

  return {
    // 기관명뿐이거나("국립중앙박물관") 일정으로 시작하면("2026-07-07(화) ~ …") 소개문이 아니다
    description: description.length < 20 || /^\d{4}\s*[.\-/년]/.test(description) ? '' : description,
    posterUrl: ld?.posterUrl || ogImage || '',
    titleEn: '',
    startDate: ld?.startDate || '',
    endDate: ld?.endDate || '',
  };
}

/** 소개문이 아닌 문단: 글머리표·일정으로 시작하거나, "항목: 값" 꼴이거나, 관람·예매 안내 낱말이 들었다 */
const NOT_INTRO = [
  /^[*※▶▷■□◆◇●○◎•ㅇ✔✓#-]/,
  /^\d{1,4}\s*[.\-/년]\s*\d{1,2}/,
  /^[가-힣\s]{1,8}[:：]/,
  /예매|예약|관람료|입장료|티켓|할인|환불|휴관|양해|문의처|재입장|반입/,
];

/** 문장부호로 끝나는 문단. 마침표 없이 '~다'로 끝나는 줄은 전시 제목인 경우가 많아 문장으로 보지 않는다. */
const SENTENCE_END = /[.!?…,]["'”’」』)\]]*$/;

/**
 * 상세 페이지 본문 HTML 조각에서 전시 소개문만 골라 잇는다.
 *
 * 본문에는 소개문 앞뒤로 제목·일정·운영 안내·예매 안내·크레딧·작품 설명이 섞여 있다.
 * 문장으로 끝나는 첫 문단부터 모으다가, 짧은 소제목("주요 전시품", "참여작가")이나
 * 안내 문단("* 본 전시는…", "문의처 : …")이 나오면 멈춘다. 소개문이 이미지뿐이면 '' 이다.
 */
export function introText(html = '', maxLen = 400) {
  const lines = String(html)
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/\s+/g, ' ') // 원문 줄바꿈은 공백이다 (문단은 태그로 나눈다)
    .replace(/<(?![a-zA-Z/!])/g, '&lt;') // 태그가 아닌 '<' (국립중앙박물관 "<사계절 푸른 대나무…>")
    .replace(/<\/?(?:p|div|br|li|ul|ol|dl|dt|dd|h[1-6]|tr|td|th|table|blockquote)\b[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '') // 글자 조각마다 붙은 span 등은 공백 없이 지운다
    .split('\n')
    .map((line) => cleanText(line))
    .filter(Boolean);

  const kept = [];
  for (const line of lines) {
    const notice = NOT_INTRO.some((re) => re.test(line));
    const sentence = !notice && line.length >= 10 && SENTENCE_END.test(line);
    // 소개문이 시작된 뒤에는 마침표 없는 긴 문구(홍보 문구 등)도 이어 붙인다
    if (sentence || (kept.length && !notice && line.length >= 20)) {
      kept.push(line);
      if (kept.join(' ').length >= maxLen) break;
    } else if (kept.length) {
      break;
    }
  }
  // cleanText 를 다시 거치면 되살린 "<전시명>" 이 태그로 지워진다. 자르기만 같은 방식으로 한다.
  return kept.join(' ').slice(0, maxLen).trim();
}
