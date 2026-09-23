/**
 * source-utils.mjs — 미술관 어댑터가 공통으로 쓰는 도구.
 */

import { getHtml } from './http.mjs';
import { cardsFromJsonLd, extractCards } from './extract.mjs';

/**
 * 후보 URL 을 순서대로 시도해 첫 성공 결과를 돌려준다.
 * 미술관 사이트는 개편이 잦아 단일 URL 에 의존하면 쉽게 깨진다.
 *
 * @param {string[]} urls
 * @param {(html:string, url:string)=>Array} parse 카드 배열을 반환하는 파서
 * @param {object} opts { referer, log, minCards }
 */
export async function tryUrls(urls, parse, opts = {}) {
  const { referer, log = () => {}, minCards = 1 } = opts;
  const errors = [];

  for (const url of urls) {
    try {
      const html = await getHtml(url, { referer: referer || new URL(url).origin + '/' });
      const cards = (await parse(html, url)) || [];
      if (cards.length >= minCards) {
        log(`    ✓ ${url} → ${cards.length}건`);
        return { cards, sourceUrl: url, html };
      }
      log(`    · ${url} → 0건 (다음 후보 시도)`);
      errors.push(`${url}: 0건`);
    } catch (err) {
      log(`    · ${url} → ${err.message}`);
      errors.push(`${url}: ${err.message}`);
    }
  }
  return { cards: [], sourceUrl: '', html: '', errors };
}

/**
 * 사이트별 파서가 실패했을 때 쓰는 범용 파서.
 * JSON-LD → 카드 추출 순으로 시도한다.
 */
export function genericParse(html, url, opts = {}) {
  const ld = cardsFromJsonLd(html, url);
  if (ld.length) return ld;
  return extractCards(html, url, opts);
}

/** 카드 배열의 museumId 를 일괄 지정한다. */
export function assign(cards, museumId, extra = {}) {
  return cards.map((c) => ({ ...c, ...extra, museumId }));
}

/** 종료일이 없는(또는 과거인) 카드를 걸러낸다. */
export function dropEnded(cards, today) {
  return cards.filter((c) => !c.endDate || c.endDate >= today);
}
