/**
 * 그라운드시소 (용산·센트럴·이스트·한남 등 서울 전시관, 부산관은 제외)
 *
 * Cafe24 티켓 쇼핑몰이라 전시 하나가 상품 하나다. 전시 카테고리 목록
 * (/product/list.html?cate_no=47)에 상품명(이미지 alt)·전시관·기간이 모두 있다.
 * 포스터는 상세 페이지 og:image(큰 이미지)를 쓰고, 목록의 중간 크기 이미지를 예비 후보로 둔다.
 * 범용 추출기로 홈페이지를 읽으면 헤더의 '장바구니' 링크가 전시로 잡힌다.
 */

import { getHtml } from '../lib/http.mjs';
import { absoluteUrl, attr, cleanText, metaContent, parseDateRange, stripTags } from '../lib/parse.mjs';

const BASE = 'https://www.groundseesaw.co.kr';
const LIST = `${BASE}/product/list.html?cate_no=47`;
const OUTSIDE_SEOUL = /부산|대구|대전|광주|울산|제주/;

/** "[얼리버드]", "[최대 44% 할인]" 같은 판매 문구를 제목 앞에서 뗀다. */
export function cleanProductTitle(name = '') {
  return cleanText(name).replace(/^(?:\[[^\]]*\]\s*)+/, '').trim();
}

/** 전시 카테고리 목록에서 카드를 뽑는다. 상품 하나가 <li id="anchorBoxId_N"> 이다. */
export function parseList(html) {
  const cards = [];
  for (const block of html.split(/<li[^>]*id="anchorBoxId_/).slice(1)) {
    const no = /^(\d+)/.exec(block)?.[1];
    const img = /<img[^>]*id="eListPrdImage[^>]*>/.exec(block)?.[0] || '';
    const title = cleanProductTitle(attr(img, 'alt'));
    const text = stripTags(block);
    const branch = /전시관\s*:\s*(\S+)/.exec(text)?.[1] || '';
    const period = /기간\s*:\s*([^:]+?)\s*(?:배경색|$)/.exec(text)?.[1] || '';
    const { startDate, endDate } = parseDateRange(period);
    if (!no || !title || !startDate || OUTSIDE_SEOUL.test(branch)) continue;

    const listImage = absoluteUrl(attr(img, 'src'), BASE);
    cards.push({
      museumId: 'groundseesaw',
      title,
      startDate,
      endDate,
      venue: branch ? `그라운드시소 ${branch}` : '',
      posterUrl: '',
      posterCandidates: listImage ? [listImage] : [],
      posterReferer: `${BASE}/`,
      officialUrl: `${BASE}/product/detail.html?product_no=${no}&cate_no=47`,
      sourceId: no,
    });
  }
  return cards;
}

export default {
  key: 'groundseesaw',
  label: '그라운드시소',
  homepage: BASE,
  museums: ['groundseesaw'],

  async fetch({ log }) {
    const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
    const cards = parseList(await getHtml(LIST, { referer: `${BASE}/` })).filter(
      (c) => !c.endDate || c.endDate >= today
    );
    log(`    ✓ 전시 카테고리 → ${cards.length}건`);

    // 상세 페이지의 큰 이미지를 포스터로 쓴다
    for (const card of cards) {
      try {
        card.posterUrl = metaContent(await getHtml(card.officialUrl, { referer: LIST, retries: 1 }), 'og:image');
      } catch (err) {
        log(`    · 상세 페이지 실패 ${card.sourceId}: ${err.message}`);
      }
    }
    return cards;
  },
};
