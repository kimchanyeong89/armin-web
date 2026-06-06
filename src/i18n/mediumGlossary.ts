import type { AppLanguage } from "../contexts/LanguageContext";

/**
 * 작품 재질·기법(medium) 한국어 용어집.
 *
 * 코퍼스의 medium 값은 다국어(영·독·불·덴마크·노르웨이·이탈리아·스페인어)다.
 * 상위 ~40개 개념이 전체 ~51만 건 중 큰 비중을 덮으므로, 규칙 기반 사전으로
 * API 없이 결정적으로 한국어화한다. 미커버 값은 원문으로 폴백.
 *
 * 키는 normalizeMedium()로 정규화한 형태(소문자·공백 정리·마침표 제거)다.
 */

function normalizeMedium(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[.。]+$/g, "")
    .trim();
}

// 다국어 → 한국어. 빈도 상위 개념 위주(EN/DE/FR/DA/NO/IT/ES).
const MEDIUM_KO: Record<string, string> = {
  // ── oil on canvas (최다 개념) ──
  "oil on canvas": "캔버스에 유채",
  "öl auf leinwand": "캔버스에 유채",
  "ol auf leinwand": "캔버스에 유채",
  "huile sur toile": "캔버스에 유채",
  "olie på lærred": "캔버스에 유채",
  "olje på lerret": "캔버스에 유채",
  "olio su tela": "캔버스에 유채",
  "óleo sobre lienzo": "캔버스에 유채",
  "oleo sobre lienzo": "캔버스에 유채",
  "캔버스에 유화 물감": "캔버스에 유채",

  // ── oil on panel / wood ──
  "oil on panel": "패널에 유채",
  "öl auf holz": "목판에 유채",
  "huile sur bois": "목판에 유채",
  "peinture sur bois": "목판에 회화",
  "peinture bois": "목판에 회화",
  "oil on wood": "목판에 유채",
  "oil on board": "보드에 유채",
  "öl auf eichenholz": "참나무 패널에 유채",
  "oak panel": "참나무 패널",

  // ── 프랑스어 복합 표기(루브르 등) ──
  "peinture à l'huile, toile": "캔버스에 유채",
  "toile, peinture à l'huile": "캔버스에 유채",
  "toile, peinture à l'huile ok": "캔버스에 유채",
  "peinture sous verre": "유리에 그린 그림",
  "peinture murale": "벽화",

  // ── 단독 재료 ──
  oil: "유채",
  öl: "유채",
  huile: "유채",
  olio: "유채",
  óleo: "유채",
  paper: "종이",
  papier: "종이",
  papel: "종이",
  carta: "종이",
  지: "종이",
  canvas: "캔버스",
  leinwand: "캔버스",
  toile: "캔버스",
  tela: "캔버스",
  panel: "패널",
  wood: "나무",
  bois: "나무",
  holz: "나무",

  // ── 사진 ──
  "gelatin silver print": "젤라틴 실버 프린트",
  "gelatin silver print on paper": "종이에 젤라틴 실버 프린트",
  silbergelatine: "젤라틴 실버 프린트",
  silbergelatinepapier: "젤라틴 실버 프린트",
  "chromogenic print": "크로모제닉 프린트",
  "inkjet print": "잉크젯 프린트",
  "albuminpapier, auf untersatzkarton": "알부민 인화 (대지 부착)",
  albuminpapier: "알부민 인화",
  "albumen print": "알부민 인화",
  glasnegativ: "유리 건판 네거티브",
  "glass negative": "유리 건판 네거티브",
  photograph: "사진",
  photography: "사진",
  fotografie: "사진",

  // ── 판화 ──
  print: "판화",
  prints: "판화",
  druck: "판화",
  estampe: "판화",
  lithograph: "석판화",
  lithography: "석판화",
  lithographie: "석판화",
  farblithographie: "다색 석판화",
  "color lithograph": "다색 석판화",
  etching: "에칭",
  radierung: "에칭",
  "eau-forte": "에칭",
  engraving: "인그레이빙",
  woodcut: "목판화",
  holzschnitt: "목판화",
  "screenprint": "실크스크린",
  serigraph: "실크스크린",

  // ── 소묘·드로잉 ──
  drawing: "소묘",
  drawings: "소묘",
  dessin: "소묘",
  zeichnung: "소묘",
  "ink on paper": "종이에 잉크",
  "encre sur papier": "종이에 잉크",
  "pen and ink": "펜과 잉크",
  "pen and ink on paper": "종이에 펜과 잉크",
  "pen on paper": "종이에 펜",
  "pencil on paper": "종이에 연필",
  "mine graphite sur papier": "종이에 흑연",
  bleistift: "연필",
  pencil: "연필",
  graphite: "흑연",
  charcoal: "목탄",
  chalk: "분필",
  pastel: "파스텔",

  // ── 수채·과슈·템페라·아크릴 ──
  watercolor: "수채",
  watercolour: "수채",
  aquarell: "수채",
  aquarelle: "수채",
  "watercolor on paper": "종이에 수채",
  "watercolour on paper": "종이에 수채",
  gouache: "과슈",
  "gouache on paper": "종이에 과슈",
  tempera: "템페라",
  "tempera on panel": "패널에 템페라",
  acrylic: "아크릴",
  "acrylic on canvas": "캔버스에 아크릴",

  // ── 조각·기타 ──
  bronze: "청동",
  marble: "대리석",
  plaster: "석고",
  plâtre: "석고",
  gips: "석고",
  terracotta: "테라코타",
  faience: "파이앙스",
  ceramic: "도자",
  porcelain: "자기",

  // ── 분류성 라벨 ──
  painting: "회화",
  paintings: "회화",
  peinture: "회화",
  peintures: "회화",
  gemälde: "회화",
  malerei: "회화",
  maleri: "회화",
  "oil painting": "유화",
  "ink painting": "수묵화",
  sculpture: "조각",
  skulptur: "조각",
  poster: "포스터",
  posters: "포스터",
  affiche: "포스터",
  plakat: "포스터",
  design: "디자인",
  artwork: "미술 작품",
  zeichenkunst: "소묘",
  "graphic artwork": "그래픽 작품",
  "cartoons & caricatures": "만화·캐리커처",
  "drawing and watercolor": "소묘·수채",
  "documentary photographs": "다큐멘터리 사진",
  "mixed media": "혼합 매체",
  mixed: "혼합 매체",
};

/**
 * 재질/기법 문자열을 한국어로. 미커버 또는 영어 모드면 원문 반환.
 */
export function getMediumKo(raw: string | undefined, language: AppLanguage): string {
  const value = String(raw || "").trim();
  if (!value || language === "en") return value;
  return MEDIUM_KO[normalizeMedium(value)] || value;
}
