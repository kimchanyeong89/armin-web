/**
 * Korean type studies for the community board.
 *
 * Hidden behind `?font=` the same way the globe glass variants are hidden
 * behind `?glass=`: production keeps its current stack and downloads none
 * of these files unless the parameter is present.
 */
export interface CommunityFontOption {
  key: string;
  label: string;
  /** What the face does to the page, in one line. */
  note: string;
  /** Stylesheets to load for this option. */
  hrefs: string[];
  /** Raw @font-face rules, for faces published as bare woff2. */
  faceCss?: string;
  stack: string;
  /** Set when titles should differ from body text. */
  titleStack?: string;
}

const KO_FALLBACK = '"Apple SD Gothic Neo", "Noto Sans KR", sans-serif';
const PAPERLOGY_CDN = "https://cdn.jsdelivr.net/gh/projectnoonnu/2408-3@1.0";

export const COMMUNITY_FONT_OPTIONS: CommunityFontOption[] = [
  {
    key: "current",
    label: "현재",
    note: "Space Grotesk + 애플 고딕. 비교 기준으로만 남겨둔 현재 상태입니다.",
    hrefs: [],
    stack: `"Space Grotesk", ${KO_FALLBACK}`,
  },
  {
    key: "wanted",
    label: "원티드 산스",
    note: "가장 최근의 국내 본문체. 자간과 글자폭이 정교해 목록이 조용하고 단정해집니다.",
    hrefs: ["https://cdn.jsdelivr.net/gh/wanteddev/wanted-sans@v1.0.3/packages/wanted-sans/fonts/webfonts/variable/complete/WantedSansVariable.min.css"],
    stack: `"Wanted Sans Variable", "Wanted Sans", ${KO_FALLBACK}`,
  },
  {
    key: "paperlogy",
    label: "페이퍼로지",
    note: "지면에서 온 편집용 산세리프. 제목이 또렷하고 인쇄물 같은 인상을 줍니다.",
    hrefs: [],
    faceCss: `
@font-face { font-family: "Paperlogy"; src: url("${PAPERLOGY_CDN}/Paperlogy-4Regular.woff2") format("woff2"); font-weight: 400; font-display: swap; }
@font-face { font-family: "Paperlogy"; src: url("${PAPERLOGY_CDN}/Paperlogy-6SemiBold.woff2") format("woff2"); font-weight: 600; font-display: swap; }
@font-face { font-family: "Paperlogy"; src: url("${PAPERLOGY_CDN}/Paperlogy-7Bold.woff2") format("woff2"); font-weight: 700; font-display: swap; }`,
    stack: `Paperlogy, ${KO_FALLBACK}`,
  },
  {
    key: "hana2",
    label: "하나2",
    note: "굵기 6종을 갖춘 기업용 본문체. 페이퍼로지의 단정함에 가독성을 더 얹은 쪽입니다.",
    hrefs: [],
    faceCss: `
@font-face { font-family: "Hana2"; src: url("https://cdn.jsdelivr.net/gh/projectnoonnu/2411-1@1.0/Hana2-L.woff2") format("woff2"); font-weight: 300; font-display: swap; }
@font-face { font-family: "Hana2"; src: url("https://cdn.jsdelivr.net/gh/projectnoonnu/2411-1@1.0/Hana2-R.woff2") format("woff2"); font-weight: 400; font-display: swap; }
@font-face { font-family: "Hana2"; src: url("https://cdn.jsdelivr.net/gh/projectnoonnu/2411-1@1.0/Hana2-M.woff2") format("woff2"); font-weight: 500 600; font-display: swap; }
@font-face { font-family: "Hana2"; src: url("https://cdn.jsdelivr.net/gh/projectnoonnu/2411-1@1.0/Hana2-B.woff2") format("woff2"); font-weight: 700 900; font-display: swap; }`,
    stack: `Hana2, ${KO_FALLBACK}`,
  },
  {
    key: "flightsans",
    label: "플라이트 산스",
    note: "안내 표지에서 온 산세리프. 자소가 열려 있어 작은 크기에서 특히 잘 읽힙니다.",
    hrefs: [],
    faceCss: `
@font-face { font-family: "FlightSans"; src: url("https://cdn.jsdelivr.net/gh/projectnoonnu/2410-1@1.0/FlightSans-Regular.woff2") format("woff2"); font-weight: 300 500; font-display: swap; }
@font-face { font-family: "FlightSans"; src: url("https://cdn.jsdelivr.net/gh/projectnoonnu/2410-1@1.0/FlightSans-Bold.woff2") format("woff2"); font-weight: 600 900; font-display: swap; }`,
    stack: `FlightSans, ${KO_FALLBACK}`,
  },
  {
    key: "movesans",
    label: "무브 산스",
    note: "페이퍼로지처럼 지면에서 온 산세리프. 획 끝이 더 날카롭고 제목이 강합니다.",
    hrefs: [],
    faceCss: `
@font-face { font-family: "MoveSans"; src: url("https://cdn.jsdelivr.net/gh/projectnoonnu/2405-2@1.0/MoveSans-Light.woff2") format("woff2"); font-weight: 300; font-display: swap; }
@font-face { font-family: "MoveSans"; src: url("https://cdn.jsdelivr.net/gh/projectnoonnu/2405-2@1.0/MoveSans-Medium.woff2") format("woff2"); font-weight: 400 500; font-display: swap; }
@font-face { font-family: "MoveSans"; src: url("https://cdn.jsdelivr.net/gh/projectnoonnu/2405-2@1.0/MoveSans-Bold.woff2") format("woff2"); font-weight: 600 900; font-display: swap; }`,
    stack: `MoveSans, ${KO_FALLBACK}`,
  },
  {
    key: "hancomsans",
    label: "한컴 산스",
    note: "문서용으로 설계된 산세리프. 페이퍼로지보다 차분하고 긴 글에 안정적입니다.",
    hrefs: [],
    faceCss: `
@font-face { font-family: "HancomSans"; src: url("https://cdn.jsdelivr.net/gh/projectnoonnu/2406-1@1.0/HancomSans-Light.woff2") format("woff2"); font-weight: 300 400; font-display: swap; }
@font-face { font-family: "HancomSans"; src: url("https://cdn.jsdelivr.net/gh/projectnoonnu/2406-1@1.0/HancomSans-SemiBold.woff2") format("woff2"); font-weight: 500 900; font-display: swap; }`,
    stack: `HancomSans, ${KO_FALLBACK}`,
  },
  {
    key: "plex",
    label: "IBM 플렉스",
    note: "함렛과 같은 휴머니스트 계열 산세리프. 온기가 있으면서 정보량이 많아도 또렷합니다.",
    hrefs: ["https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+KR:wght@300;400;500;600;700&display=swap"],
    stack: `"IBM Plex Sans KR", ${KO_FALLBACK}`,
  },
  {
    key: "nanummyeongjo",
    label: "나눔명조",
    note: "함렛보다 고전적인 명조. 획 대비가 크고 제목에서 무게가 잡힙니다.",
    hrefs: ["https://fonts.googleapis.com/css2?family=Nanum+Myeongjo:wght@400;700;800&display=swap"],
    stack: `"Nanum Myeongjo", "Apple SD Gothic Neo", serif`,
  },
  {
    key: "hahmlet",
    label: "함렛",
    note: "현대적인 세리프. 획 대비가 살아 있어 작은 글씨에서도 격이 생깁니다.",
    hrefs: ["https://fonts.googleapis.com/css2?family=Hahmlet:wght@300;400;500;600;700&display=swap"],
    stack: `Hahmlet, ${KO_FALLBACK}`,
  },
  {
    key: "gowunbatang",
    label: "고운바탕",
    note: "단정한 고전 바탕체. 감상문이 길어질수록 읽는 맛이 붙습니다.",
    hrefs: ["https://fonts.googleapis.com/css2?family=Gowun+Batang:wght@400;700&display=swap"],
    stack: `"Gowun Batang", "Apple SD Gothic Neo", serif`,
  },
  {
    key: "songmyung",
    label: "송명",
    note: "가늘고 우아한 명조. 전시 도록에 가장 가깝지만 본문 전체에 쓰면 힘이 약합니다.",
    hrefs: ["https://fonts.googleapis.com/css2?family=Song+Myung&display=swap"],
    stack: `"Song Myung", "Apple SD Gothic Neo", serif`,
  },
  {
    key: "pretendard",
    label: "프리텐다드",
    note: "국내 제품의 사실상 표준. 글자폭이 가장 고르고 어떤 크기에서도 무너지지 않습니다.",
    hrefs: ["https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"],
    stack: `"Pretendard Variable", Pretendard, ${KO_FALLBACK}`,
  },
  {
    key: "gothica1",
    label: "고딕 A1",
    note: "기하학적이고 차가운 고딕. 원티드보다 선이 곧아 목록이 더 정밀해 보입니다.",
    hrefs: ["https://fonts.googleapis.com/css2?family=Gothic+A1:wght@300;400;500;600;700&display=swap"],
    stack: `"Gothic A1", ${KO_FALLBACK}`,
  },
  {
    key: "sunflower",
    label: "선플라워",
    note: "가볍고 여백이 넓은 고딕. 화면이 트이지만 11px 메타줄에서는 힘이 빠집니다.",
    hrefs: ["https://fonts.googleapis.com/css2?family=Sunflower:wght@300;500;700&display=swap"],
    stack: `Sunflower, ${KO_FALLBACK}`,
  },
  {
    key: "stylish",
    label: "스타일리시",
    note: "얇고 단정한 제목용 고딕. 절제된 인상이지만 본문 전체에 쓰기엔 가늡니다.",
    hrefs: ["https://fonts.googleapis.com/css2?family=Stylish&display=swap"],
    stack: `Stylish, ${KO_FALLBACK}`,
  },
  {
    key: "diphylleia",
    label: "디필레이아",
    note: "획이 독특한 예술적 명조. 개성이 강해 미술 서비스에서 인상을 남깁니다.",
    hrefs: ["https://fonts.googleapis.com/css2?family=Diphylleia&display=swap"],
    stack: `Diphylleia, "Apple SD Gothic Neo", serif`,
  },
  {
    key: "diphylleia-title",
    label: "디필레이아 제목",
    note: "제목만 디필레이아, 본문은 프리텐다드. 개성은 제목에 두고 본문은 읽기 쉽게.",
    hrefs: [
      "https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css",
      "https://fonts.googleapis.com/css2?family=Diphylleia&display=swap",
    ],
    stack: `"Pretendard Variable", Pretendard, ${KO_FALLBACK}`,
    titleStack: `Diphylleia, "Apple SD Gothic Neo", serif`,
  },
  {
    key: "editorial",
    label: "본명조 제목",
    note: "제목은 본명조, 본문은 원티드 산스. 제목의 격과 본문의 가독을 함께 가져갑니다.",
    hrefs: [
      "https://cdn.jsdelivr.net/gh/wanteddev/wanted-sans@v1.0.3/packages/wanted-sans/fonts/webfonts/variable/complete/WantedSansVariable.min.css",
      "https://fonts.googleapis.com/css2?family=Noto+Serif+KR:wght@300;400;600;700&display=swap",
    ],
    stack: `"Wanted Sans Variable", "Wanted Sans", ${KO_FALLBACK}`,
    titleStack: `"Noto Serif KR", "Apple SD Gothic Neo", serif`,
  },
];

export function getCommunityFontOption(key?: string | null): CommunityFontOption | null {
  if (!key) return null;
  return COMMUNITY_FONT_OPTIONS.find((option) => option.key === key) || null;
}
