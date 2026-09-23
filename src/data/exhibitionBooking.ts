/**
 * Where to book a current exhibition, for the booking buttons in the
 * exhibition modal. Kept apart from exhibitions.js, which the exhibition
 * sync rewrites, so a sync never drops a booking link.
 *
 * Only places checked by hand are here. An exhibition with no entry shows no
 * booking button - free and walk-in shows need none, and a guessed link that
 * lands on the wrong page is worse than no link.
 *
 * An exhibition sold in several places lists each of them; the modal then
 * compares them. A price is the adult ticket as that page listed it on the
 * day in `checked`, and it is shown only for PRICE_FRESH_DAYS after that:
 * ticket sites change prices and end early-bird sales within days, so an old
 * figure would pass for a bargain that is gone. The link itself stays.
 *
 * Three kinds of entry:
 *   - a venue's own booking site, for every exhibition there (Leeum, MMCA)
 *   - "official": the exhibition's own page is where it is booked
 *     (Seoul Arts Center show pages, Groundseesaw shop pages, APMA)
 *   - one exhibition's listing on a ticket site (YES24, NOL 티켓)
 */

type Copy = { ko: string; en: string };

export interface BookingChannel {
  url: string;
  /** who takes the booking, shown on the button: "예매하기 · 예술의전당" */
  site: Copy;
  /** "예약" where the visit is free but needs a time slot */
  reserve?: boolean;
  /** adult ticket in won as the page listed it on `checked`; absent when stale or unknown */
  price?: number;
  /** a discount the page advertised on `checked` */
  deal?: Copy;
  /** YYYY-MM-DD the price was read */
  checked?: string;
}

const PRICE_FRESH_DAYS = 14;

type Priced = { price?: number; deal?: Copy; checked?: string };
type Rule =
  | ({ url: string; site: Copy; reserve?: boolean } & Priced)
  | ({ official: true; site: Copy; reserve?: boolean; when?: RegExp } & Priced);

const SAC = { ko: "예술의전당", en: "Seoul Arts Center" };

const VENUES: Record<string, Rule> = {
  // the exhibition page carries the booking itself (예매 on the page)
  "hangaram-art-museum": { official: true, site: SAC },
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

/* An exhibition's own entries come before its venue's; the same address is listed once.
   Read by hand on 2026-09-23 from each site's own search and sales page. A price
   is what an adult pays there that day; `deal` says where it came from. Museum
   shows (MMCA, SeMA, Leeum, NJP, …) are not on any ticket site - they sell
   only on their own. */
const NOL = { ko: "NOL 티켓", en: "NOL Ticket" };
const YES24 = { ko: "YES24 티켓", en: "YES24 Ticket" };
const TICKETLINK = { ko: "티켓링크", en: "Ticketlink" };
const GROUNDSEESAW = { ko: "그라운드시소", en: "Groundseesaw" };
const ON = "2026-09-23";
const off = (list: number, pct: number): Copy => ({
  ko: `정가 ${list.toLocaleString("ko-KR")}원에서 ${pct}% 할인`,
  en: `${pct}% off ₩${list.toLocaleString("en-US")}`,
});

const EXHIBITIONS: Record<string, Rule[]> = {
  // 고야
  "hangaram-art-museum-2026-78392": [
    { official: true, site: SAC, price: 20000, checked: ON },
    { url: "https://nol.yanolja.com/ticket/products/26006434", site: NOL, price: 20000, checked: ON },
    {
      url: "https://ticket.yes24.com/Perf/58354", site: YES24, price: 20000, checked: ON,
      deal: { ko: "할인 적용 시 11,200원부터", en: "from ₩11,200 with discounts" },
    },
    { url: "https://www.ticketlink.co.kr/product/62945", site: TICKETLINK, price: 20000, checked: ON },
  ],
  // 와일드스미스 그림책 원화展
  "hangaram-art-museum-2026-78112": [
    { official: true, site: SAC, price: 20000, checked: ON },
    { url: "https://nol.yanolja.com/ticket/products/26009680", site: NOL, price: 14000, deal: off(20000, 30), checked: ON },
    { url: "https://www.ticketlink.co.kr/product/63415", site: TICKETLINK, price: 15000, checked: ON },
  ],
  // 자비 솔라
  "hangaram-art-museum-2026-78093": [
    { official: true, site: SAC, price: 15000, checked: ON },
    { url: "https://nol.yanolja.com/ticket/products/26009895", site: NOL, price: 15000, checked: ON },
  ],
  // 이완 - 나는 쓴다
  "hangaram-art-museum-2026-76454": [
    { official: true, site: SAC, price: 5000, checked: ON },
    { url: "https://nol.yanolja.com/ticket/products/26010385", site: NOL, price: 5000, checked: ON },
  ],
  // 스페인 미술 500년
  "hangaram-2026-spain": [
    { official: true, site: SAC, price: 23000, checked: ON },
    { url: "https://nol.yanolja.com/ticket/products/26012277", site: NOL, price: 23000, checked: ON },
  ],
  // 장-프랑수아 라리유 — only the early-bird sale is open yet
  "hangaram-art-museum-2026-78313": [
    { url: "https://nol.yanolja.com/ticket/products/26012769", site: NOL, price: 10500, deal: { ko: "얼리버드 · 정가 15,000원에서 30% 할인", en: "early bird, 30% off ₩15,000" }, checked: ON },
  ],
  // 아기상어 비밀 초대장 (DDP) — also on 카카오톡 예약하기, which has no page to link
  "ddp-gallery-2026-0c0ec93a": [
    { url: "https://nol.yanolja.com/ticket/products/26008798", site: NOL, price: 16100, deal: off(23000, 30), checked: ON },
    { url: "https://www.ticketlink.co.kr/product/62947", site: TICKETLINK, price: 23000, checked: ON },
  ],
  // 브래드 월스 — the gallery's own opening offer undercuts NOL
  "groundseesaw-2026-1352": [
    { official: true, site: GROUNDSEESAW, price: 13900, deal: { ko: "개막특가 30% 할인", en: "30% opening offer" }, checked: ON, when: /\/product\/detail\.html/ },
    { url: "https://nol.yanolja.com/ticket/products/26010389", site: NOL, price: 20000, checked: ON },
  ],
  // 표기식 — the gallery's sales page for it is gone; NOL still sells it
  "groundseesaw-2026-1351": [
    { url: "https://nol.yanolja.com/ticket/products/26012317", site: NOL, price: 20000, checked: ON },
  ],
  // 이기훈 원화전 — NOL shows no figure outside its app
  "groundseesaw-2026-1345": [
    { official: true, site: GROUNDSEESAW, price: 14400, checked: ON, when: /\/product\/detail\.html/ },
    { url: "https://nol.yanolja.com/ticket/products/26010356", site: NOL, deal: { ko: "최대 44% 할인 행사 중", en: "up to 44% off" }, checked: ON },
  ],
  // 조은 원화전
  "groundseesaw-2026-1344": [
    { official: true, site: GROUNDSEESAW, price: 14400, checked: ON, when: /\/product\/detail\.html/ },
    { url: "https://nol.yanolja.com/ticket/products/26010388", site: NOL, price: 14400, deal: off(18000, 20), checked: ON },
  ],
  // 성률 기획전 — the gallery links only its home page, so NOL is the one sales page
  "groundseesaw-2026-sungryul": [
    { url: "https://nol.yanolja.com/ticket/products/26006321", site: NOL, price: 20000, checked: ON },
  ],
  // free, with a timed pre-booking form on the exhibition page
  "seoul-museum-of-art-2026-1553791": [{ official: true, site: { ko: "서울시립미술관", en: "SeMA" }, reserve: true }],
};

/* Exhibitions whose venue link would lead nowhere: the page the sync recorded is gone. */
const WITHOUT_VENUE = new Set(["groundseesaw-2026-1351"]);

function fresh(checked: string | undefined, now: number): boolean {
  if (!checked) return false;
  const at = Date.parse(`${checked}T00:00:00+09:00`);
  return Number.isFinite(at) && now - at <= PRICE_FRESH_DAYS * 86_400_000;
}

function resolve(rule: Rule, officialUrl: string, now: number): BookingChannel | null {
  let url: string;
  if ("official" in rule) {
    url = officialUrl.trim();
    if (!/^https?:\/\//.test(url) || (rule.when && !rule.when.test(url))) return null;
  } else {
    url = rule.url;
  }
  const channel: BookingChannel = { url, site: rule.site, reserve: rule.reserve };
  if (fresh(rule.checked, now)) {
    if (rule.price) channel.price = rule.price;
    if (rule.deal) channel.deal = rule.deal;
    channel.checked = rule.checked;
  }
  return channel;
}

/**
 * Every known place to book this exhibition, the lowest listed price first;
 * places without a current price follow in the order they are listed.
 */
export function bookingFor(museumId: string, exhibitionId: string, officialUrl: string, now = Date.now()): BookingChannel[] {
  const venue = VENUES[museumId] && !WITHOUT_VENUE.has(exhibitionId) ? [VENUES[museumId]] : [];
  const rules = [...(EXHIBITIONS[exhibitionId] ?? []), ...venue];
  const seen = new Set<string>();
  const channels: BookingChannel[] = [];
  for (const rule of rules) {
    const channel = resolve(rule, officialUrl, now);
    if (!channel || seen.has(channel.url)) continue;
    seen.add(channel.url);
    channels.push(channel);
  }
  const priced = channels.filter((c) => c.price !== undefined).sort((a, b) => a.price! - b.price!);
  return [...priced, ...channels.filter((c) => c.price === undefined)];
}

/** The one channel strictly cheaper than every other priced one, when there is such a one. */
export function cheapestOf(channels: BookingChannel[]): BookingChannel | null {
  const priced = channels.filter((c) => c.price !== undefined);
  if (priced.length < 2 || priced[0].price === priced[1].price) return null;
  return priced[0];
}
