/**
 * Artist page — the overlay study.
 *
 * Listing: the caption rides on the work, so there is no gap under it.
 * Only the width is matched; the height follows each work's own
 * proportion, so nothing is cropped.
 *
 * Distribution: the live page's own arrangement, redrawn. A world map of
 * counts, then the three slides its carousel holds —
 *   0  국가별 소장 분포   donut + countries with a right-aligned percent
 *   1  미술관별 소장 분포  donut + the top museums, museum · country
 *   2  인기 미술관        two columns of museums with a count and a bar
 * with the same pagination dots under them.
 *
 * The figures are counted from the collection files rather than invented:
 * 161 works by Monet across 37 museums.
 */
export interface ArtistWork {
  title: string; year: string;
  museum: string; museumKo: string; museumId: string; country: string;
  image: string;
  /** the work's page on the museum's own site, where the record has one */
  sourceUrl?: string;
}

export const WORKS: ArtistWork[] = [
  { title: "Morning Haze", year: "1888", museum: "National Gallery of Art", museumKo: "내셔널 갤러리 오브 아트", museumId: "nga", country: "USA", image: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/artworks/nga-collection/nga-45872-ce0414ea-imageUrl.webp", sourceUrl: "https://www.nga.gov/artworks/45872" },
  { title: "Coast of Normandy", year: "19th century", museum: "Philadelphia Museum of Art", museumKo: "필라델피아 미술관", museumId: "philadelphia", country: "USA", image: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/artworks/philadelphia-collection/1972-227-2-1dfaa5ab-image.webp", sourceUrl: "https://www.philamuseum.org/collection/object/1972-227-2" },
  { title: "Haystacks at Giverny", year: "1884", museum: "Pola Museum of Art", museumKo: "폴라미술관", museumId: "pola-museum", country: "Japan", image: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/artworks/pola-museum-collection/pola-museum-006-0207-7b2c5d69-imageUrl.webp", sourceUrl: "https://www.polamuseum.or.jp/collection/006-0207/" },
  { title: "Water Lilies", year: "1908", museum: "Dallas Museum of Art", museumKo: "댈러스 미술관", museumId: "dma-dallas", country: "USA", image: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/artworks/dma-dallas-collection/3310757-ed9bc02e-imageUrl.webp", sourceUrl: "https://dma.org/art/collection/object/3310757" },
  { title: "Kunstnerens søn", year: "1866", museum: "Ny Carlsberg Glyptotek", museumKo: "글립토테크 미술관", museumId: "glyptoteket", country: "Denmark", image: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/artworks/glyptoteket-collection/45ca6d6c-efa7-449e-b035-ace45b-d061eb27-image.webp", sourceUrl: "https://samlinger.slks.dk/samlinger/45ca6d6c-efa7-449e-b035-ace45b400203" },
  { title: "Vase de pavots", year: "1883", museum: "Museum Boijmans Van Beuningen", museumKo: "보이만스 판뵈닝언 미술관", museumId: "boijmans", country: "Netherlands", image: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/artworks/boijmans-collection/67462-f9d60454-imageUrl.webp", sourceUrl: "https://www.boijmans.nl/en/collection/artworks/113566/vase-de-pavots" },
  { title: "The Red Kerchief", year: "c. 1868–73", museum: "Cleveland Museum of Art", museumKo: "클리블랜드 미술관", museumId: "cma", country: "USA", image: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/artworks/cma-collection/135382-c8169fbb-imageUrl.webp" },
  { title: "Plum Trees in Blossom\n                                    \n                                                                        \n                            \n                                Claude Monet", year: "1879", museum: "Museum of Fine Arts, Budapest", museumKo: "부다페스트 미술관", museumId: "mfab", country: "Hungary", image: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/artworks/mfab-collection/598-e7817cb8-image.webp", sourceUrl: "https://www.mfab.hu/artworks/598/" },
  { title: "Autopsy", year: "1890", museum: "Museo Nacional del Prado", museumKo: "프라도 미술관", museumId: "prado", country: "Spain", image: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/artworks/prado-collection/Q20468903-3ab0c9c0-imageUrl.webp?v=6", sourceUrl: "https://www.wikidata.org/wiki/Q20468903" },
  { title: "Monsieur Coqueret (Father) (Portrait de Monsieur Coqueret [Père])", year: "1880", museum: "The Barnes Foundation", museumKo: "반스 재단", museumId: "barnes-foundation", country: "USA", image: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/artworks/barnes-foundation-collection/4823-8c4e1254-imageUrl.webp", sourceUrl: "https://collection.barnesfoundation.org/objects/4823/" },
  { title: "Rocks at Port-Coton, the Lion Rock, Belle Ile", year: "1886", museum: "The Fitzwilliam Museum", museumKo: "피츠윌리엄 박물관", museumId: "fitzwilliam", country: "United Kingdom", image: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/artworks/fitzwilliam-collection/object-1237-d1938e2e-imageUrl.webp?v=6", sourceUrl: "https://data.fitzmuseum.cam.ac.uk/id/object/1237" },
  { title: "Wheatstacks, Snow Effect, Morning (Meules, Effet de Neige, Le Matin)", year: "1891", museum: "Getty Museum", museumKo: "J. 폴 게티 미술관", museumId: "getty", country: "USA", image: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/artworks/getty-collection/object_9a9cebf1-6d57-4153-aeac-d7e6093a-imageUrl.webp", sourceUrl: "https://www.getty.edu/art/collection/object/103RK8" },
  { title: "Rio Formoso", year: "1993", museum: "Museu de Arte de São Paulo", museumKo: "상파울루 미술관", museumId: "masp", country: "Brazil", image: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/artworks/masp-collection/rio-formoso-1-22fcfb60-image.webp", sourceUrl: "https://masp.org.br/en/collections/works/rio-formoso-1" },
  { title: "Tulip Fields near The Hague", year: "1840", museum: "Van Gogh Museum", museumKo: "반 고흐 미술관", museumId: "vangogh-museum", country: "Netherlands", image: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/artworks/vangogh-museum-collection/s0530N2012-01e4f426-imageUrl.webp", sourceUrl: "https://www.vangoghmuseum.nl/en/collection/s0530N2012" },
  { title: "Antibes", year: "1888", museum: "The Courtauld Gallery", museumKo: "코톨드 갤러리", museumId: "courtauld-gallery", country: "United Kingdom", image: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/artworks/courtauld-gallery-collection/object-p-1948-sc-276-e6941bdf-image.webp", sourceUrl: "https://gallerycollections.courtauld.ac.uk/object-p-1948-sc-276" },
  { title: "Plum Trees in Blossom", year: "1879", museum: "Hungarian National Gallery", museumKo: "헝가리 국립미술관", museumId: "hungarian-ng", country: "Hungary", image: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/artworks/hungarian-ng-collection/598-ba3b7f59-imageUrl.webp", sourceUrl: "https://en.mng.hu/artworks/598/" },
];

export const ARTIST = {
  name: "Claude Monet",
  nameKo: "클로드 모네",
  slug: "claude-monet",
  born: "1840",
  died: "1926",
  country: "France",
  countryKo: "프랑스",
  held: 161,
  museums: 37,
  category: "Painting",
  categoryKo: "회화",
  wiki: "https://en.wikipedia.org/wiki/Claude_Monet",
  /* what the live page shows under 인피니트 위키 — the encyclopaedia entry,
     which is the real content that column carries */
  wikiEn:
    "Oscar-Claude Monet was a French painter and founder of Impressionism who is seen as a key precursor to modernism, especially in his attempts to paint nature as he perceived it. During his long career, he was the most consistent and prolific practitioner of Impressionism's philosophy of expressing one's perceptions of nature, especially as applied to plein air landscape painting. The term \"Impressionism\" is derived from the title of his painting Impression, Sunrise, which was exhibited in 1874 at the First Impressionist Exhibition, initiated by Monet and a number of like-minded artists as an alternative to the Salon.",
  wikiKo:
    "오스카클로드 모네는 인상주의를 연 프랑스 화가로, 자연을 지각한 그대로 그리려 한 시도에서 모더니즘의 중요한 선구자로 꼽힙니다. 긴 화업 내내 야외 풍경화에 인상주의의 방법을 가장 일관되게 밀고 나간 화가였습니다. 사조의 이름은 1874년 첫 인상주의 전시에 낸 「인상, 해돋이」에서 나왔습니다. 이 전시는 모네와 뜻을 같이한 화가들이 살롱의 대안으로 연 것이었습니다.",
};

/**
 * `badge` marks the six that carry a number on the map. Europe holds much
 * of the list within a few degrees; numbering every country either stacks
 * the badges or drags them out over the Sahara on long leaders.
 */
export interface SpreadRow {
  country: string; countryKo: string; count: number;
  at: [number, number]; badge?: boolean; off?: [number, number];
}
export const SPREAD: SpreadRow[] = [
  { country: "USA", countryKo: "미국", count: 77, at: [-98, 39], badge: true },
  { country: "Japan", countryKo: "일본", count: 20, at: [138, 36], badge: true },
  { country: "Netherlands", countryKo: "네덜란드", count: 11, at: [5, 52], badge: true, off: [-16, 6] },
  { country: "Hungary", countryKo: "헝가리", count: 8, at: [19, 47], badge: true, off: [22, 18] },
  { country: "United Kingdom", countryKo: "영국", count: 8, at: [-2, 54], badge: true, off: [-15, -9] },
  { country: "Denmark", countryKo: "덴마크", count: 7, at: [10, 56], badge: true, off: [16, -14] },
  { country: "Spain", countryKo: "스페인", count: 5, at: [-4, 40] },
  { country: "Brazil", countryKo: "브라질", count: 4, at: [-51, -14] },
  { country: "Switzerland", countryKo: "스위스", count: 4, at: [8, 47] },
  { country: "Germany", countryKo: "독일", count: 4, at: [10, 51] },
  { country: "Canada", countryKo: "캐나다", count: 3, at: [-106, 56] },
  { country: "Sweden", countryKo: "스웨덴", count: 3, at: [15, 62] },
  { country: "Australia", countryKo: "호주", count: 3, at: [134, -25] },
  { country: "France", countryKo: "프랑스", count: 1, at: [2, 47] },
  { country: "Czech Republic", countryKo: "체코", count: 1, at: [15, 50] },
  { country: "Chile", countryKo: "칠레", count: 1, at: [-71, -35] },
  { country: "Colombia", countryKo: "콜롬비아", count: 1, at: [-74, 4] },
];

export interface MuseumRow {
  id: string; name: string; nameKo: string;
  country: string; countryKo: string; count: number;
  /** [lng, lat] from exhibitions.js, so the map can plot museums directly */
  at: [number, number];
}
/** every museum holding a Monet, so the map readout can name them */
export const MUSEUMS: MuseumRow[] = [
  { id: "nga", name: "National Gallery of Art", nameKo: "내셔널 갤러리 오브 아트", country: "USA", countryKo: "미국", count: 29, at: [-77.02, 38.89] },
  { id: "philadelphia", name: "Philadelphia Museum of Art", nameKo: "필라델피아 미술관", country: "USA", countryKo: "미국", count: 23, at: [-75.18, 39.97] },
  { id: "pola-museum", name: "Pola Museum of Art", nameKo: "폴라미술관", country: "Japan", countryKo: "일본", count: 19, at: [139.01, 35.24] },
  { id: "dma-dallas", name: "Dallas Museum of Art", nameKo: "댈러스 미술관", country: "USA", countryKo: "미국", count: 7, at: [-96.80, 32.79] },
  { id: "glyptoteket", name: "Ny Carlsberg Glyptotek", nameKo: "글립토테크 미술관", country: "Denmark", countryKo: "덴마크", count: 7, at: [12.57, 55.67] },
  { id: "boijmans", name: "Museum Boijmans Van Beuningen", nameKo: "보이만스 판뵈닝언 미술관", country: "Netherlands", countryKo: "네덜란드", count: 5, at: [4.47, 51.91] },
  { id: "cma", name: "Cleveland Museum of Art", nameKo: "클리블랜드 미술관", country: "USA", countryKo: "미국", count: 5, at: [-81.61, 41.51] },
  { id: "mfab", name: "Museum of Fine Arts, Budapest", nameKo: "부다페스트 미술관", country: "Hungary", countryKo: "헝가리", count: 5, at: [19.08, 47.52] },
  { id: "prado", name: "Museo Nacional del Prado", nameKo: "프라도 미술관", country: "Spain", countryKo: "스페인", count: 5, at: [-3.69, 40.41] },
  { id: "barnes-foundation", name: "The Barnes Foundation", nameKo: "반스 재단", country: "USA", countryKo: "미국", count: 4, at: [-75.17, 39.97] },
  { id: "fitzwilliam", name: "The Fitzwilliam Museum", nameKo: "피츠윌리엄 박물관", country: "United Kingdom", countryKo: "영국", count: 4, at: [0.12, 52.20] },
  { id: "getty", name: "Getty Museum", nameKo: "J. 폴 게티 미술관", country: "USA", countryKo: "미국", count: 4, at: [-118.47, 34.08] },
  { id: "masp", name: "Museu de Arte de São Paulo", nameKo: "상파울루 미술관", country: "Brazil", countryKo: "브라질", count: 4, at: [-46.66, -23.56] },
  { id: "vangogh-museum", name: "Van Gogh Museum", nameKo: "반 고흐 미술관", country: "Netherlands", countryKo: "네덜란드", count: 4, at: [4.88, 52.36] },
  { id: "courtauld-gallery", name: "The Courtauld Gallery", nameKo: "코톨드 갤러리", country: "United Kingdom", countryKo: "영국", count: 3, at: [-0.12, 51.51] },
  { id: "hungarian-ng", name: "Hungarian National Gallery", nameKo: "헝가리 국립미술관", country: "Hungary", countryKo: "헝가리", count: 3, at: [19.04, 47.50] },
  { id: "masi-lugano", name: "Museo d'arte della Svizzera italiana (MASI Lugano)", nameKo: "마시 루가노 (이탈리아 스위스 미술관)", country: "Switzerland", countryKo: "스위스", count: 3, at: [8.96, 46.00] },
  { id: "staedel-museum", name: "Städel Museum", nameKo: "슈테델 미술관", country: "Germany", countryKo: "독일", count: 3, at: [8.67, 50.11] },
  { id: "cca-montreal", name: "Canadian Centre for Architecture", nameKo: "캐나다 건축센터", country: "Canada", countryKo: "캐나다", count: 2, at: [-73.58, 45.49] },
  { id: "cooper-hewitt", name: "Cooper Hewitt, Smithsonian Design Museum", nameKo: "쿠퍼 휴잇 스미스소니언 디자인 미술관", country: "USA", countryKo: "미국", count: 2, at: [-73.96, 40.78] },
  { id: "foam-amsterdam", name: "Foam Photography Museum", nameKo: "포암 사진미술관", country: "Netherlands", countryKo: "네덜란드", count: 2, at: [4.89, 52.36] },
  { id: "moderna-museet", name: "Moderna Museet", nameKo: "모데르나 미술관", country: "Sweden", countryKo: "스웨덴", count: 2, at: [18.08, 59.33] },
  { id: "ngv", name: "National Gallery of Victoria", nameKo: "빅토리아 국립미술관", country: "Australia", countryKo: "호주", count: 2, at: [144.97, -37.82] },
  { id: "agnsw", name: "Art Gallery of New South Wales", nameKo: "뉴사우스웨일스 주 아트 갤러리", country: "Australia", countryKo: "호주", count: 1, at: [151.22, -33.87] },
  { id: "ashmolean", name: "Ashmolean Museum", nameKo: "애슈몰린 박물관", country: "United Kingdom", countryKo: "영국", count: 1, at: [-1.26, 51.76] },
  { id: "dia", name: "Detroit Institute of Arts", nameKo: "디트로이트 미술관", country: "USA", countryKo: "미국", count: 1, at: [-83.06, 42.36] },
  { id: "gestaltung-zurich", name: "Museum für Gestaltung Zürich", nameKo: "취리히 디자인 미술관", country: "Switzerland", countryKo: "스위스", count: 1, at: [8.54, 47.38] },
  { id: "guggenheim-ny", name: "Solomon R. Guggenheim Museum", nameKo: "솔로몬 R. 구겐하임 미술관", country: "USA", countryKo: "미국", count: 1, at: [-73.96, 40.78] },
  { id: "mamcs-strasbourg", name: "Musée d'Art Moderne et Contemporain de Strasbourg", nameKo: "스트라스부르 근현대미술관", country: "France", countryKo: "프랑스", count: 1, at: [7.75, 48.58] },
  { id: "mbam", name: "Montreal Museum of Fine Arts", nameKo: "몬트리올 미술관", country: "Canada", countryKo: "캐나다", count: 1, at: [-73.58, 45.50] },
  { id: "mkg-hamburg", name: "Museum für Kunst und Gewerbe Hamburg (MKG)", nameKo: "함부르크 미술공예박물관 (MKG)", country: "Germany", countryKo: "독일", count: 1, at: [10.01, 53.55] },
  { id: "mnba-santiago", name: "Museo Nacional de Bellas Artes, Santiago", nameKo: "칠레 국립미술관", country: "Chile", countryKo: "칠레", count: 1, at: [-70.64, -33.44] },
  { id: "momas-saitama", name: "The Museum of Modern Art, Saitama", nameKo: "사이타마현립근대미술관", country: "Japan", countryKo: "일본", count: 1, at: [139.65, 35.91] },
  { id: "moravian-gallery", name: "Moravian Gallery in Brno", nameKo: "모라비아 미술관", country: "Czech Republic", countryKo: "체코", count: 1, at: [16.61, 49.19] },
  { id: "morgan-library", name: "The Morgan Library & Museum", nameKo: "모건 라이브러리 앤 뮤지엄", country: "USA", countryKo: "미국", count: 1, at: [-73.98, 40.75] },
  { id: "museo-botero", name: "Museo Botero", nameKo: "보테로 미술관", country: "Colombia", countryKo: "콜롬비아", count: 1, at: [-74.07, 4.60] },
  { id: "nationalmuseum-se", name: "Nationalmuseum", nameKo: "스웨덴 국립미술관 (나티오날무세움)", country: "Sweden", countryKo: "스웨덴", count: 1, at: [18.08, 59.33] },
];

/**
 * The live page's palette, kept in the order it ships.
 *
 * A sorted ramp was tried and put back: on this ground the largest slice
 * ends up either nearly black or nearly white, and neighbouring slices stop
 * separating. The alternating order is what makes adjacent wedges legible.
 */
export const DONUT_COLORS = [
  "#d4a547", "#f0c878", "#a07028", "#f5dca6",
  "#6b4514", "#e8b85f", "#fae8c4", "#3f2906",
];
