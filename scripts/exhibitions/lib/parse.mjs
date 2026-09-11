/**
 * parse.mjs — HTML/날짜 파싱 헬퍼 (의존성 없음)
 *
 * 한국 미술관 사이트는 대부분 구형 CMS라 구조화 데이터(JSON-LD)가 없다.
 * 따라서 "사이트별 선택자 → JSON-LD → OpenGraph" 순의 다단 폴백을 제공한다.
 */

const NAMED_ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’',
  middot: '·', hellip: '…', ndash: '–', mdash: '—',
};

/** HTML 엔티티를 디코딩한다. */
export function decodeEntities(str = '') {
  return String(str)
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&([a-z]+);/gi, (m, name) => NAMED_ENTITIES[name.toLowerCase()] ?? m);
}

/** 태그를 제거하고 공백을 정리한 순수 텍스트를 반환한다. */
export function stripTags(html = '') {
  return decodeEntities(
    String(html)
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<\/(p|div|li|h[1-6])>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
  )
    .replace(/\s+/g, ' ')
    .trim();
}

/** 제목 등 짧은 텍스트를 정규화한다 (따옴표/공백/제어문자 정리). */
export function cleanText(str = '', maxLen = 0) {
  let out = stripTags(str)
    .replace(/[​-‏﻿]/g, '') // zero-width
    .replace(/\s*[\r\n]+\s*/g, ' ')
    .trim();
  if (maxLen && out.length > maxLen) out = out.slice(0, maxLen).trim();
  return out;
}

// ── 날짜 ────────────────────────────────────────────────────────

/** 2자리 연도를 4자리로 (26 → 2026). */
function expandYear(y) {
  const n = Number(y);
  if (y.length === 4) return n;
  return n >= 70 ? 1900 + n : 2000 + n;
}

function iso(y, m, d) {
  const yy = Number(y);
  const mm = Number(m);
  const dd = Number(d);
  if (!yy || mm < 1 || mm > 12 || dd < 1 || dd > 31) return '';
  return `${String(yy).padStart(4, '0')}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
}

/**
 * 단일 날짜 문자열을 YYYY-MM-DD 로 정규화한다.
 * 지원: 2026-04-16 / 2026.04.16 / 2026. 4. 16 / 2026/04/16 / 20260416
 *       26.04.16 / 2026년 4월 16일
 */
export function normalizeDate(input) {
  if (!input) return '';
  const s = String(input).trim();

  let m = /(\d{4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일/.exec(s);
  if (m) return iso(m[1], m[2], m[3]);

  m = /(\d{4})\s*[.\-/]\s*(\d{1,2})\s*[.\-/]\s*(\d{1,2})/.exec(s);
  if (m) return iso(m[1], m[2], m[3]);

  m = /^(\d{4})(\d{2})(\d{2})$/.exec(s.replace(/\D/g, ''));
  if (m) return iso(m[1], m[2], m[3]);

  // 2자리 연도 (그라운드시소 등): 26.04.16
  m = /(?:^|[^\d])(\d{2})\s*[.\-/]\s*(\d{1,2})\s*[.\-/]\s*(\d{1,2})(?!\d)/.exec(s);
  if (m) return iso(expandYear(m[1]), m[2], m[3]);

  return '';
}

/**
 * "2026.04.16 ~ 2026.11.22" 같은 기간 문자열에서 시작/종료일을 뽑는다.
 * 상설/오픈런 표기는 endDate 를 빈 값으로 둔다 (호출측에서 처리).
 */
export function parseDateRange(input) {
  if (!input) return { startDate: '', endDate: '', openEnded: false };
  const s = stripTags(String(input)).replace(/\([^)]{0,6}\)/g, ' '); // (목) 같은 요일 제거

  const openEnded = /상설|계속|오픈\s*런|open\s*run|until\s+further/i.test(s);

  // 한글 표기: 2026년 4월 16일 ~ 2026년 11월 22일
  const ko = [...s.matchAll(/(\d{4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일/g)];
  if (ko.length >= 1) {
    return {
      startDate: iso(ko[0][1], ko[0][2], ko[0][3]),
      endDate: ko.length >= 2 ? iso(ko[1][1], ko[1][2], ko[1][3]) : '',
      openEnded,
    };
  }

  // 연도가 한 번만 나오는 축약형: 2026.04.16 ~ 11.22
  const full = /(\d{2,4})\s*[.\-/]\s*(\d{1,2})\s*[.\-/]\s*(\d{1,2})/g;
  const hits = [...s.matchAll(full)];

  if (hits.length >= 2) {
    const a = hits[0];
    const b = hits[1];
    return {
      startDate: iso(expandYear(a[1]), a[2], a[3]),
      endDate: iso(expandYear(b[1]), b[2], b[3]),
      openEnded,
    };
  }

  if (hits.length === 1) {
    const a = hits[0];
    const startDate = iso(expandYear(a[1]), a[2], a[3]);
    // "2026.04.16 ~ 11.22" 형태: 뒤쪽의 월.일만 추가로 찾는다
    const tail = s.slice(a.index + a[0].length);
    const short = /[~\-–—]\s*(\d{1,2})\s*[.\-/]\s*(\d{1,2})/.exec(tail);
    if (short && startDate) {
      const y = Number(startDate.slice(0, 4));
      // 종료 월이 시작 월보다 작으면 해를 넘긴 것
      const endY = Number(short[1]) < Number(startDate.slice(5, 7)) ? y + 1 : y;
      return { startDate, endDate: iso(endY, short[1], short[2]), openEnded };
    }
    return { startDate, endDate: '', openEnded };
  }

  return { startDate: '', endDate: '', openEnded };
}

/** 오늘(KST) 날짜를 YYYY-MM-DD 로 반환한다. */
export function todayKST() {
  const now = new Date(Date.now() + 9 * 3600 * 1000);
  return now.toISOString().slice(0, 10);
}

/** startDate/endDate 로부터 앱이 쓰는 status 를 계산한다. */
export function computeStatus(startDate, endDate, today = todayKST()) {
  if (endDate && endDate < today) return 'past';
  if (startDate && startDate > today) return 'upcoming';
  return 'ongoing';
}

// ── 구조화 데이터 폴백 ───────────────────────────────────────────

/** <script type="application/ld+json"> 블록을 모두 파싱해 배열로 반환한다. */
export function extractJsonLd(html) {
  const out = [];
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    try {
      const parsed = JSON.parse(m[1].trim());
      if (Array.isArray(parsed)) out.push(...parsed);
      else if (parsed['@graph']) out.push(...[].concat(parsed['@graph']));
      else out.push(parsed);
    } catch {
      /* 깨진 JSON-LD 는 무시 */
    }
  }
  return out;
}

/** OpenGraph/meta 값을 가져온다. */
export function metaContent(html, property) {
  const esc = property.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(
    `<meta[^>]+(?:property|name)=["']${esc}["'][^>]*content=["']([^"']*)["']|` +
      `<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${esc}["']`,
    'i'
  );
  const m = re.exec(html);
  return m ? decodeEntities(m[1] ?? m[2] ?? '').trim() : '';
}

/** 상대 URL 을 절대 URL 로 만든다. */
export function absoluteUrl(src, base) {
  if (!src) return '';
  try {
    return new URL(decodeEntities(src.trim()), base).href;
  } catch {
    return '';
  }
}

/**
 * 태그 속성을 뽑는다. 예: attr('<img src="a.jpg" alt="제목">', 'alt') → '제목'
 */
export function attr(tagHtml, name) {
  const re = new RegExp(`${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i');
  const m = re.exec(tagHtml || '');
  return m ? decodeEntities(m[1] ?? m[2] ?? m[3] ?? '').trim() : '';
}

/**
 * HTML 을 반복 블록으로 자른다.
 * 여는 태그 패턴이 등장할 때마다 다음 등장 직전까지를 한 블록으로 본다.
 */
export function splitBlocks(html, openPattern) {
  const re = new RegExp(openPattern, 'gi');
  const starts = [];
  let m;
  while ((m = re.exec(html)) !== null) starts.push(m.index);
  return starts.map((start, i) =>
    html.slice(start, i + 1 < starts.length ? starts[i + 1] : html.length)
  );
}

/** 블록에서 첫 번째 <img> 의 src(또는 data-src)를 절대 URL 로 반환한다. */
export function firstImage(block, base) {
  const imgs = block.match(/<img[^>]*>/gi) || [];
  for (const tag of imgs) {
    const src =
      attr(tag, 'data-original') || attr(tag, 'data-src') || attr(tag, 'src');
    if (!src || /^data:/i.test(src)) continue;
    if (/blank|spacer|dummy|no[-_]?image|noimg|loading/i.test(src)) continue;
    const abs = absoluteUrl(src, base);
    if (abs) return abs;
  }
  // CSS background-image 도 확인
  const bg = /background-image\s*:\s*url\((["']?)([^)"']+)\1\)/i.exec(block);
  if (bg) return absoluteUrl(bg[2], base);
  return '';
}

/** 블록에서 첫 번째 링크(href)를 절대 URL 로 반환한다. */
export function firstLink(block, base) {
  const m = /<a[^>]+href\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(block || '');
  if (!m) return '';
  const href = (m[1] ?? m[2] ?? '').trim();
  if (!href || href.startsWith('#') || /^javascript:/i.test(href)) return '';
  return absoluteUrl(href, base);
}
