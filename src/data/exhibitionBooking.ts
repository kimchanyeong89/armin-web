/**
 * Where to book a current exhibition, for the "예매하기" button in the
 * exhibition modal. Kept apart from exhibitions.js, which the exhibition
 * sync rewrites, so a sync never drops a booking link.
 *
 * Only places checked by hand are here (2026-09-23). An exhibition with no
 * entry shows no booking button - free and walk-in shows need none, and a
 * guessed link that lands on the wrong page is worse than no link.
 *
 * Three kinds of entry:
 *   - a venue's own booking site, for every exhibition there (Leeum, MMCA)
 *   - "official": the exhibition's own page is where it is booked
 *     (Seoul Arts Center show pages, Groundseesaw shop pages, APMA)
 *   - one exhibition sold on a ticket platform (NOL 티켓 for a DDP show)
 */

type Copy = { ko: string; en: string };

export interface BookingSite {
  url: string;
  /** who takes the booking, shown on the button: "예매하기 · 예술의전당" */
  site: Copy;
  /** "예약" where the visit is free but needs a time slot */
  reserve?: boolean;
}

type Rule =
  | { url: string; site: Copy; reserve?: boolean }
  | { official: true; site: Copy; reserve?: boolean; when?: RegExp };

const VENUES: Record<string, Rule> = {
  // the exhibition page carries the booking itself (예매 on the page, 20,000원 for 고야)
  "hangaram-art-museum": { official: true, site: { ko: "예술의전당", en: "Seoul Arts Center" } },
  // the shop page is the ticket: price, 예매 and 장바구니 on it
  groundseesaw: { official: true, site: { ko: "그라운드시소", en: "Groundseesaw" }, when: /\/product\/detail\.html/ },
  // "반드시 아모레퍼시픽미술관 홈페이지를 통해서만 예약" - the exhibition page is titled 전시관람 예약
  apma: { official: true, site: { ko: "아모레퍼시픽미술관", en: "APMA" }, reserve: true },
  "leeum-museum": { url: "https://ticket.leeum.org/changeLocale.do?lang=ko", site: { ko: "리움미술관", en: "Leeum" }, reserve: true },
  "hoam-museum": { url: "https://ticket.hoammuseum.org:8443/changeLocale.do?lang=ko", site: { ko: "호암미술관", en: "Hoam" }, reserve: true },
  // the 예약하기 button on every MMCA exhibition page leads here (통합예약)
  "mmca-seoul": { url: "https://www.mmca.go.kr/visitingInfo/eduReserve.do", site: { ko: "국립현대미술관", en: "MMCA" }, reserve: true },
  "mmca-gwacheon": { url: "https://www.mmca.go.kr/visitingInfo/eduReserve.do", site: { ko: "국립현대미술관", en: "MMCA" }, reserve: true },
  // each exhibition page has "Book tickets"
  "tate-st-ives": { official: true, site: { ko: "Tate", en: "Tate" } },
};

const EXHIBITIONS: Record<string, Rule> = {
  // free, with a timed pre-booking form on the exhibition page
  "seoul-museum-of-art-2026-1553791": { official: true, site: { ko: "서울시립미술관", en: "SeMA" }, reserve: true },
  // sold on NOL 티켓 and 카카오톡 예약하기; the search lands on its listing
  "ddp-gallery-2026-0c0ec93a": {
    url: `https://tickets.interpark.com/search?keyword=${encodeURIComponent("아기상어 비밀 초대장")}`,
    site: { ko: "NOL 티켓", en: "NOL Ticket" },
  },
};

export function bookingFor(museumId: string, exhibitionId: string, officialUrl: string): BookingSite | null {
  const rule = EXHIBITIONS[exhibitionId] ?? VENUES[museumId];
  if (!rule) return null;
  if ("official" in rule) {
    const url = officialUrl.trim();
    if (!/^https?:\/\//.test(url) || (rule.when && !rule.when.test(url))) return null;
    return { url, site: rule.site, reserve: rule.reserve };
  }
  return { url: rule.url, site: rule.site, reserve: rule.reserve };
}
