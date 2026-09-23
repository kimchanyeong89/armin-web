/**
 * 국립중앙박물관 (NMK)
 * 현재·예정 전시 목록(M0202010000.do?menuId=current|upcomming)을 직접 파싱한다.
 *
 * 카드마다 hover 용 돋보기 버튼 이미지가 썸네일보다 먼저 나와서, 범용 추출기(첫 <img>)를
 * 쓰면 버튼이 포스터가 된다. 썸네일의 파일 id 로 원본 이미지(previewOriginal)를 가리킨다.
 * 상세 페이지 og:image 는 박물관 로고라서 쓰지 않는다.
 */

import { introText } from '../lib/extract.mjs';
import { getHtml } from '../lib/http.mjs';
import { cleanText, parseDateRange } from '../lib/parse.mjs';

const BASE = 'https://www.museum.go.kr';
const LIST = `${BASE}/MUSEUM/contents/M0202010000.do`;
// 'upcomming' 은 사이트가 실제로 쓰는 파라미터 값이다
const MENUS = ['current', 'upcomming'];

/** 장소가 다른 기관이면(지역 공립박물관 순회전 등) 이 박물관 전시가 아니다. */
function isElsewhere(place) {
  return /박물관|미술관/.test(place) && !/국립중앙박물관/.test(place);
}

/** 목록 HTML 에서 카드를 뽑는다. 카드 하나는 <div class="img-box"> 로 시작한다. */
export function parseList(html, menu = 'current') {
  const cards = [];
  for (const block of html.split('<div class="img-box">').slice(1)) {
    const id = /exhiSpThemId=(\d+)/.exec(block)?.[1];
    const title = cleanText(/<a[^>]*exhiSpThemId[^>]*>\s*<strong>([\s\S]*?)<\/strong>/.exec(block)?.[1] || '');
    const period = /<strong>기간<\/strong>\s*<p>([\s\S]*?)<\/p>/.exec(block)?.[1] || '';
    const place = cleanText(/<strong>장소<\/strong>\s*<p>([\s\S]*?)<\/p>/.exec(block)?.[1] || '');
    const fileId = /\/afile\/previewThumbnail\/([A-Za-z0-9_]+)/.exec(block)?.[1];
    if (!id || !title || isElsewhere(place)) continue;

    const { startDate, endDate } = parseDateRange(period);
    cards.push({
      museumId: 'national-museum-korea',
      title,
      startDate,
      endDate,
      venue: place.replace(/^국립중앙박물관\s*/, ''),
      posterUrl: fileId ? `${BASE}/afile/previewOriginal/${fileId}?siteCode=MUSEUM` : '',
      posterReferer: `${BASE}/`,
      officialUrl: `${LIST}?schM=view&menuId=${menu}&exhiSpThemId=${id}&listType=list`,
      sourceId: id,
    });
  }
  return cards;
}

/**
 * 상세 페이지에서 소개문을 뽑는다 (sync.mjs 상세 보강 단계가 부른다).
 * 본문(view-info-cont)은 소개문 앞뒤로 전시 개요·관람 안내·주요 전시품 설명이 붙어 있다.
 * 본문에 소개 문장이 없으면 개요 표의 '전시요약' 한 줄을 쓴다.
 */
export function describeDetail(html) {
  const body = /<div class="view-info-cont">([\s\S]*?)<div class="btn-list">/.exec(html)?.[1] || '';
  const summary = cleanText(/<strong>전시요약<\/strong>\s*<p>([\s\S]*?)<\/p>/.exec(html)?.[1] || '', 400);
  return introText(body) || (summary.length >= 10 ? summary : '');
}

export default {
  key: 'nmk',
  label: '국립중앙박물관',
  homepage: BASE,
  museums: ['national-museum-korea'],
  describe: describeDetail,

  async fetch({ log }) {
    const out = [];
    for (const menu of MENUS) {
      try {
        const html = await getHtml(`${LIST}?menuId=${menu}`, { referer: `${BASE}/` });
        const cards = parseList(html, menu);
        const total = Number(/총\s*<span[^>]*>(\d+)/.exec(html)?.[1] || 0);
        log(`    ✓ ${menu} → ${cards.length}건` + (total > cards.length ? ` (목록 ${total}건 중 다른 기관 장소 제외)` : ''));
        out.push(...cards);
      } catch (err) {
        log(`    · ${menu} → ${err.message}`);
      }
    }
    return out.filter((c) => c.startDate);
  },
};
