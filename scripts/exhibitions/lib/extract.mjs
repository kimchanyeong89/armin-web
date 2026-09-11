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

  return {
    description: cleanText(ld?.description || ogDesc || metaDesc || '', 400),
    posterUrl: ld?.posterUrl || ogImage || '',
    titleEn: '',
    startDate: ld?.startDate || '',
    endDate: ld?.endDate || '',
  };
}
