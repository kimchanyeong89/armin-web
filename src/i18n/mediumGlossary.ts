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
  if (!value) return value;
  // ⚠️ 일본어는 영어 모드에서도 옮긴다. 원문 폴백하면 "油彩・画布" 가 그대로 나가는데,
  //    한국어 사용자에게도 영어 사용자에게도 읽히지 않는다.
  const ja = translateJapaneseMedium(value, language);
  if (ja) return ja;
  if (language === "en") return value;
  return MEDIUM_KO[normalizeMedium(value)] || value;
}

/* ──────────────────────────────────────────────────────────────────────────
 * 일본어 재료 표기
 *
 * 일본 미술관(후쿠오카 아시아미술관·사이타마현립근대미술관·마루가메시 이노쿠마)의
 * medium 은 「技法・支持体」 조합형이다 — "油彩・画布", "水彩、インク・紙".
 * 통짜 문자열 사전으로는 410종이 넘어 관리가 안 되므로 **토큰 단위**로 옮긴다.
 *
 * ⚠️ 위쪽 MEDIUM_KO 와 달리 영어도 같이 들고 있다. 영어 모드에서 원문 폴백하면
 *    일본어가 그대로 노출되기 때문이다(한국 사용자에게도 영어 사용자에게도 무의미).
 * ──────────────────────────────────────────────────────────────────────── */

// [한국어, 영어]
const MEDIUM_JA_TOKENS: Record<string, [string, string]> = {
  // ── 지지체 ──
  紙: ["종이", "paper"],
  画布: ["캔버스", "canvas"],
  布: ["천", "cloth"],
  綿布: ["무명", "cotton cloth"],
  厚布: ["두꺼운 천", "heavy cloth"],
  絹: ["비단", "silk"],
  木: ["나무", "wood"],
  板: ["패널", "panel"],
  合板: ["합판", "plywood"],
  木パネル: ["나무 패널", "wood panel"],
  木製フレーム: ["나무 액자", "wooden frame"],
  木製棚: ["나무 선반", "wooden shelf"],
  木箱: ["나무 상자", "wooden box"],
  木の台: ["나무 받침", "wooden base"],
  雲母: ["운모", "mica"],
  金属: ["금속", "metal"],
  金属板: ["금속판", "metal plate"],
  光沢紙: ["광택지", "glossy paper"],
  色紙: ["색종이", "colored paper"],
  韓紙: ["한지", "hanji"],
  ネパール紙: ["네팔 종이", "Nepalese paper"],
  ライスペーパー: ["라이스페이퍼", "rice paper"],
  手漉きの紙: ["손으로 뜬 종이", "handmade paper"],
  手漉き紙: ["손으로 뜬 종이", "handmade paper"],
  手漉きのワスリ紙: ["손으로 뜬 와슬리 종이", "handmade wasli paper"],
  ハーネミューレ竹紙: ["하네뮐레 대나무 종이", "Hahnemühle bamboo paper"],
  竹: ["대나무", "bamboo"],
  ハードボード: ["하드보드", "hardboard"],
  メゾナイトボード: ["메이소나이트 보드", "masonite board"],
  イラストボード: ["일러스트 보드", "illustration board"],
  キャンバスボード: ["캔버스 보드", "canvas board"],
  段ボール: ["골판지", "cardboard"],
  壁紙: ["벽지", "wallpaper"],

  // ── 회화 재료 ──
  油彩: ["유채", "oil"],
  水彩: ["수채", "watercolor"],
  アクリル: ["아크릴", "acrylic"],
  アクリル絵具: ["아크릴 물감", "acrylic paint"],
  テンペラ: ["템페라", "tempera"],
  グワッシュ: ["구아슈", "gouache"],
  顔料: ["안료", "pigment"],
  鉱物顔料: ["광물 안료", "mineral pigment"],
  彩色: ["채색", "coloring"],
  着色: ["채색", "coloring"],
  絹本着色: ["비단에 채색", "color on silk"],
  紙本着色: ["종이에 채색", "color on paper"],
  墨: ["먹", "sumi ink"],
  インク: ["잉크", "ink"],
  インキ: ["잉크", "ink"],
  黒インク: ["검정 잉크", "black ink"],
  ポスターカラー: ["포스터컬러", "poster color"],
  エナメル: ["에나멜", "enamel"],
  油性塗料: ["유성 도료", "oil-based paint"],
  ペンキ: ["페인트", "paint"],
  金箔: ["금박", "gold leaf"],
  銀箔: ["은박", "silver leaf"],
  金泥: ["금니", "gold paint"],
  にかわ: ["아교", "animal glue"],
  のり: ["풀", "paste"],
  米汁: ["쌀풀", "rice paste"],
  牛糞: ["소똥", "cow dung"],
  紅茶: ["홍차", "black tea"],
  茶のしみ: ["차 얼룩", "tea stain"],
  醤油: ["간장", "soy sauce"],
  火薬: ["화약", "gunpowder"],
  ラメ: ["라메", "lamé"],
  スパンコール: ["스팽글", "sequins"],
  ビーズ: ["비즈", "beads"],
  モデリングペースト: ["모델링 페이스트", "modeling paste"],

  // ── 소묘 도구 ──
  鉛筆: ["연필", "pencil"],
  色鉛筆: ["색연필", "colored pencil"],
  木炭: ["목탄", "charcoal"],
  石墨: ["흑연", "graphite"],
  コンテ: ["콩테", "conté"],
  チョーク: ["초크", "chalk"],
  クレヨン: ["크레용", "crayon"],
  パステル: ["파스텔", "pastel"],
  ペン: ["펜", "pen"],
  ボールペン: ["볼펜", "ballpoint pen"],
  素描: ["소묘", "drawing"],
  ドローイング: ["드로잉", "drawing"],

  // ── 판화 ──
  木版: ["목판", "woodblock"],
  リトグラフ: ["석판", "lithograph"],
  色彩リトグラフ: ["다색 석판", "color lithograph"],
  リトグラフ4色刷: ["석판 4색", "four-color lithograph"],
  オフセット: ["오프셋", "offset"],
  オフセット印刷: ["오프셋 인쇄", "offset printing"],
  オレオグラフ: ["올레오그래프", "oleograph"],
  シルクスクリーン: ["실크스크린", "silkscreen"],
  リノカット: ["리노컷", "linocut"],
  エッチング: ["에칭", "etching"],
  彩色エッチング: ["채색 에칭", "hand-colored etching"],
  アクアチント: ["애쿼틴트", "aquatint"],
  ドライポイント: ["드라이포인트", "drypoint"],
  インタリオ: ["인타글리오", "intaglio"],
  ステンシル: ["스텐실", "stencil"],
  コログラフ: ["콜라그래프", "collagraph"],
  エンボス: ["엠보싱", "embossing"],
  エンボス加工: ["엠보싱", "embossing"],
  バティック: ["바틱", "batik"],
  植毛印刷: ["플록 인쇄", "flock printing"],
  電胎凸版刷: ["전태 볼록판", "electrotype relief print"],
  電胎凸版2色刷: ["전태 볼록판 2색", "two-color electrotype relief print"],
  電胎凸版4色刷: ["전태 볼록판 4색", "four-color electrotype relief print"],
  電胎凸版5色刷: ["전태 볼록판 5색", "five-color electrotype relief print"],
  版下: ["원도", "print design"],
  印刷物: ["인쇄물", "printed matter"],
  印刷した紙: ["인쇄된 종이", "printed paper"],
  印刷された紙: ["인쇄된 종이", "printed paper"],
  額装した複製画: ["액자에 넣은 복제화", "framed reproduction"],

  // ── 사진 ──
  写真: ["사진", "photograph"],
  カラー写真: ["컬러 사진", "color photograph"],
  ゼラチン: ["젤라틴", "gelatin"],
  シルバー: ["실버", "silver"],
  プリント: ["프린트", "print"],
  Ｃタイププリント: ["C 타입 프린트", "C-type print"],
  Ｒタイププリント: ["R 타입 프린트", "R-type print"],
  デジタルＣタイププリント: ["디지털 C 타입 프린트", "digital C-type print"],
  デジタルCタイププリント: ["디지털 C 타입 프린트", "digital C-type print"],
  チバクロームプリント: ["시바크롬 프린트", "Cibachrome print"],
  インクジェットプリント: ["잉크젯 프린트", "inkjet print"],
  インクジェットプリンター: ["잉크젯 프린터", "inkjet printer"],
  デジタルプリント: ["디지털 프린트", "digital print"],
  顔料インクによるデジタル印刷: ["안료 잉크 디지털 인쇄", "pigment ink digital print"],
  レーザープリント写真: ["레이저 프린트 사진", "laser print photograph"],
  スキャノグラフ: ["스캐노그램", "scanograph"],
  フォトコピー: ["복사", "photocopy"],
  ゼロックスコピー: ["제록스 복사", "Xerox copy"],
  ネガ: ["네거티브", "negative"],
  透明フィルム: ["투명 필름", "transparent film"],
  フィルム: ["필름", "film"],
  "8ミリフィルム": ["8mm 필름", "8mm film"],
  ソラリゼーション: ["솔라리제이션", "solarization"],
  モンタージュ: ["몽타주", "montage"],

  // ── 영상·설치 ──
  ビデオ: ["비디오", "video"],
  インスタレーション: ["설치", "installation"],
  サウンド: ["사운드", "sound"],
  サイレント: ["무음", "silent"],
  モニター: ["모니터", "monitor"],
  テレビ: ["텔레비전", "television"],
  プロジェクター: ["프로젝터", "projector"],
  映写機: ["영사기", "projector"],
  スピーカー: ["스피커", "speaker"],
  アンプ: ["앰프", "amplifier"],
  ケーブル: ["케이블", "cable"],
  ビデオプレーヤー: ["비디오 플레이어", "video player"],
  DVDプレイヤー: ["DVD 플레이어", "DVD player"],
  コンピューター: ["컴퓨터", "computer"],
  モーター: ["모터", "motor"],
  ライトボックス: ["라이트박스", "lightbox"],
  電飾: ["전기 조명", "electric lighting"],
  照明: ["조명", "lighting"],
  鏡: ["거울", "mirror"],

  // ── 그 밖의 물성 ──
  混合技法: ["혼합기법", "mixed media"],
  コラージュ: ["콜라주", "collage"],
  オブジェ: ["오브제", "objet"],
  拾集物: ["주워 모은 물건", "found objects"],
  レース: ["레이스", "lace"],
  レースペーパー: ["레이스 페이퍼", "lace paper"],
  糸: ["실", "thread"],
  金糸: ["금실", "gold thread"],
  麻糸: ["삼실", "hemp thread"],
  金銀糸の布: ["금은사 직물", "gold and silver thread fabric"],
  金属質の編糸: ["금속사 편사", "metallic knitting yarn"],
  糸玉: ["실뭉치", "ball of thread"],
  綿: ["솜", "cotton"],
  フェルト: ["펠트", "felt"],
  ひも: ["끈", "cord"],
  紐: ["끈", "cord"],
  鎖: ["사슬", "chain"],
  ボタン: ["단추", "button"],
  マスキングテープ: ["마스킹 테이프", "masking tape"],
  スタンプ: ["스탬프", "stamp"],
  テキスト: ["텍스트", "text"],
  雑誌の切り抜き: ["잡지 스크랩", "magazine clipping"],
  ビニール: ["비닐", "vinyl"],
  ビニールパイプ: ["비닐 파이프", "vinyl pipe"],
  ビニールチューブ: ["비닐 튜브", "vinyl tube"],
  ビニールパッケージ: ["비닐 포장", "vinyl packaging"],
  チューブ: ["튜브", "tube"],
  プラスティック: ["플라스틱", "plastic"],
  プラスティックのビーズ: ["플라스틱 비즈", "plastic beads"],
  プラスティック椅子: ["플라스틱 의자", "plastic chair"],
  アクリル樹脂: ["아크릴 수지", "acrylic resin"],
  アクリル板: ["아크릴판", "acrylic sheet"],
  アクリルケース: ["아크릴 케이스", "acrylic case"],
  樹脂: ["수지", "resin"],
  樹脂板: ["수지판", "resin board"],
  ファイバーグラス: ["유리섬유", "fiberglass"],
  ポリエステル樹脂ファイバーグラス: ["폴리에스터 수지 유리섬유", "polyester resin fiberglass"],
  ポリウレタン板: ["폴리우레탄판", "polyurethane board"],
  ポリウレタンのコーティング: ["폴리우레탄 코팅", "polyurethane coating"],
  スチール: ["스틸", "steel"],
  ステンレス: ["스테인리스", "stainless steel"],
  アルミニウム: ["알루미늄", "aluminum"],
  アルミニウムの骨組み: ["알루미늄 골조", "aluminum frame"],
  トタン板: ["함석판", "corrugated iron sheet"],
  ドラム缶: ["드럼통", "oil drum"],
  ボルト: ["볼트", "bolt"],
  蝶番: ["경첩", "hinge"],
  ナンバープレート: ["번호판", "license plate"],
  タイヤ: ["타이어", "tire"],
  フェンダー: ["펜더", "fender"],
  排気管: ["배기관", "exhaust pipe"],
  換気扇: ["환풍기", "ventilation fan"],
  換気筒: ["환기통", "ventilation duct"],
  台車: ["대차", "cart"],
  トラックバンパー: ["트럭 범퍼", "truck bumper"],
  冷蔵庫: ["냉장고", "refrigerator"],
  机: ["책상", "desk"],
  ベッド: ["침대", "bed"],
  鳥かご: ["새장", "birdcage"],
  かばん: ["가방", "bag"],
  スーツケース: ["여행 가방", "suitcase"],
  古着: ["헌 옷", "used clothing"],
  衣服: ["의복", "clothing"],
  ゴム長靴: ["고무장화", "rubber boots"],
  ゴム製手型: ["고무 손 모형", "rubber hand cast"],
  食器: ["식기", "tableware"],
  ボウル: ["그릇", "bowl"],
  グラス: ["유리잔", "glass"],
  酒ビン: ["술병", "liquor bottle"],
  瓶: ["병", "bottle"],
  薬: ["약", "medicine"],
  注射器: ["주사기", "syringe"],
  テント: ["텐트", "tent"],
  南京袋: ["마대", "gunny sack"],
  竹籠: ["대바구니", "bamboo basket"],
  竹マット: ["대나무 자리", "bamboo mat"],
  マット: ["매트", "mat"],
  布旗: ["천 깃발", "cloth banner"],
  籐のヘアピース: ["등나무 헤어피스", "rattan hairpiece"],
  象牙: ["상아", "ivory"],
  動物の皮: ["동물 가죽", "animal hide"],
  水牛の角: ["물소 뿔", "buffalo horn"],
  植物繊維: ["식물 섬유", "plant fiber"],
  木の実: ["나무 열매", "seeds"],
  おがくず: ["톱밥", "sawdust"],
  土: ["흙", "earth"],
  砂: ["모래", "sand"],
  小石: ["자갈", "pebbles"],
  煉瓦: ["벽돌", "brick"],
  セメント: ["시멘트", "cement"],
  アスファルト: ["아스팔트", "asphalt"],
  化石: ["화석", "fossil"],
  米: ["쌀", "rice"],
  毛玉: ["털뭉치", "wool ball"],
  古い硬貨: ["옛 동전", "old coins"],
  金属のお守り: ["금속 부적", "metal amulet"],
  装飾品: ["장식품", "ornament"],
  タイル: ["타일", "tile"],
  木製仏像: ["나무 불상", "wooden Buddha figure"],
  鐘: ["종", "bell"],
  油: ["기름", "oil"],
  紙型: ["종이 형틀", "paper mold"],

  // ── 4차: 잔여 물성 ──
  葉: ["잎", "leaves"],
  ポスター: ["포스터", "poster"],
  腰巻布: ["허리천", "waist cloth"],
  紙粘土: ["종이 점토", "paper clay"],
  転写インク: ["전사 잉크", "transfer ink"],
  タータン地の布: ["타탄 직물", "tartan fabric"],
  プラスチック板: ["플라스틱판", "plastic sheet"],
  粘着シート: ["점착 시트", "adhesive sheet"],
  塩: ["소금", "salt"],
  釘: ["못", "nail"],
  金銀泥: ["금은니", "gold and silver paint"],
  コーヒー: ["커피", "coffee"],
  印画紙: ["인화지", "photographic paper"],
  半光沢の銀塩印画紙: ["반광택 은염 인화지", "semi-gloss gelatin silver paper"],
  ゼラチンシルバープリント: ["젤라틴 실버 프린트", "gelatin silver print"],
  土石: ["흙과 돌", "earth and stone"],
  灰: ["재", "ash"],
  炭: ["숯", "charcoal"],
  調色剤: ["조색제", "toner"],
  寒冷紗: ["한랭사", "scrim cloth"],
  雁皮紙: ["안피지", "gampi paper"],
  ガンピ刷り: ["안피지 인쇄", "printed on gampi paper"],
  カーボン紙: ["카본지", "carbon paper"],
  グラビア雑誌: ["그라비어 잡지", "gravure magazine"],
  強化プラスチック: ["강화 플라스틱", "reinforced plastic"],
  ウレタン塗装: ["우레탄 도장", "urethane coating"],
  水: ["물", "water"],
  麻袋: ["삼베 자루", "burlap sack"],
  亜麻布: ["아마포", "linen"],
  ゴムシート: ["고무 시트", "rubber sheet"],
  麻布: ["삼베", "hemp cloth"],
  インタラクティブ: ["인터랙티브", "interactive"],
  デジタル静止画プロジェクション: ["디지털 정지화상 프로젝션", "digital still image projection"],
  トレーシングペーパーなど: ["트레이싱지 등", "tracing paper etc."],
  "モンタージュ？": ["몽타주(추정)", "montage (presumed)"],
  異摺: ["이쇄본", "variant impression"],

  // ── 4차: 지바 우키요에 판형·서적 ──
  細判錦絵: ["호소반 니시키에", "hosoban nishiki-e"],
  大細判錦絵: ["오호소반 니시키에", "ō-hosoban nishiki-e"],
  間判錦絵: ["아이반 니시키에", "aiban nishiki-e"],
  大判錦絵竪: ["오반 니시키에 세로", "vertical ōban nishiki-e"],
  色紙判摺物: ["시키시반 스리모노", "shikishiban surimono"],
  木版多色摺画譜: ["목판 다색 화보", "multicolor woodblock picture album"],
  多色摺画譜: ["다색 화보", "multicolor picture album"],
  墨摺画譜: ["묵쇄 화보", "sumizuri picture album"],
  墨摺絵入漢詩本: ["묵쇄 삽화 한시집", "illustrated sumizuri book of Chinese poems"],
  彩色摺狂歌本: ["채색쇄 교카집", "color-printed kyōka book"],
  彩色摺絵入狂歌本: ["채색쇄 삽화 교카집", "illustrated color-printed kyōka book"],
  木版多色摺狂歌集: ["목판 다색 교카집", "multicolor woodblock kyōka anthology"],
  木版画集: ["목판화집", "woodblock print album"],
  折帖: ["절첩", "accordion album"],
  袋綴: ["포배장", "pouch-bound book"],

  // ── 3차: 사이타마·지바 잔여 어휘 ──
  インクジェット: ["잉크젯", "inkjet"],
  レーザープリント: ["레이저 프린트", "laser print"],
  ラムダプリント: ["람다 프린트", "Lambda print"],
  タイプCプリント: ["C 타입 프린트", "C-type print"],
  タイプＣプリント: ["C 타입 프린트", "C-type print"],
  モノタイプ: ["모노타이프", "monotype"],
  フォトエッチング: ["포토에칭", "photo-etching"],
  木口木版: ["목구목판", "wood engraving"],
  木版多色刷: ["목판 다색 인쇄", "multicolor woodblock print"],
  多色摺木版画: ["다색 목판화", "multicolor woodblock print"],
  版画の混合技法: ["판화 혼합기법", "mixed printmaking techniques"],
  アルミニウム版腐蝕: ["알루미늄판 부식", "aluminum plate etching"],
  銅版: ["동판", "copperplate"],
  魚々子: ["어자문", "nanako punched ground"],
  スクリーントーン: ["스크린톤", "screentone"],
  半光沢の銀塩印画紙: ["반광택 은염 인화지", "semi-gloss gelatin silver paper"],
  カラー: ["컬러", "color"],
  銀: ["은", "silver"],
  銅: ["구리", "copper"],
  金属片: ["금속 조각", "metal fragment"],
  パネル: ["패널", "panel"],
  油性インク: ["유성 잉크", "oil-based ink"],
  ジェッソ: ["제소", "gesso"],
  ウレタン: ["우레탄", "urethane"],
  アルキッド樹脂: ["알키드 수지", "alkyd resin"],
  麻紙: ["마지", "hemp paper"],
  貼られた紙: ["덧붙인 종이", "pasted paper"],
  テンペラ系絵の具: ["템페라계 물감", "tempera-based paint"],
  ラッカー塗装: ["래커 도장", "lacquer coating"],
  塗装: ["도장", "coating"],
  皮: ["가죽", "leather"],
  音: ["소리", "sound"],
  ストップ: ["스톱", "stop"],
  キャンヴァス: ["캔버스", "canvas"],
  モネキャンバス紙: ["모네 캔버스지", "Monet canvas paper"],
  スケッチブック切り取り: ["스케치북에서 떼어냄", "cut from sketchbook"],
  彩色摺絵本: ["채색쇄 그림책", "color-printed picture book"],
  版画誌: ["판화지", "print periodical"],
  横中判錦絵: ["요코 주반 니시키에", "horizontal chūban nishiki-e"],
  横判錦絵: ["요코반 니시키에", "yokoban nishiki-e"],
  色紙判錦絵: ["시키시반 니시키에", "shikishiban nishiki-e"],
  柱絵判紅摺絵: ["하시라에반 베니즈리에", "hashira-e benizuri-e"],
  大判摺物: ["오반 스리모노", "ōban surimono"],
  紙本着色扇面: ["종이에 채색, 부채", "color on paper, fan"],
  紙本墨画淡彩額装: ["종이에 수묵담채, 액자", "ink and light color on paper, framed"],
  額装: ["액자", "framed"],
  双幅: ["쌍폭", "pair of hanging scrolls"],
  屏風: ["병풍", "folding screen"],
  木箱に写真: ["나무 상자에 사진", "photographs in wooden box"],
  アクリルに貼り付け: ["아크릴에 부착", "mounted on acrylic"],
  ネガとポジのソラリゼーション: ["네거티브·포지티브 솔라리제이션", "negative and positive solarization"],

  // ── 표기 이형 (같은 개념, 다른 가타카나) ──
  カンヴァス: ["캔버스", "canvas"],
  カンヴァスボード: ["캔버스 보드", "canvas board"],
  グアッシュ: ["구아슈", "gouache"],
  セリグラフ: ["세리그래프", "serigraph"],
  和紙: ["화지", "washi paper"],
  厚紙: ["두꺼운 종이", "thick paper"],
  台紙: ["대지", "mount board"],
  ボード: ["보드", "board"],
  トレーシングペーパー: ["트레이싱지", "tracing paper"],
  ベランアルシュ紙: ["벨랭 아르슈지", "vélin d'Arches paper"],
  チガヤ紙: ["띠풀 종이", "cogon grass paper"],
  ＭＤＦパネル: ["MDF 패널", "MDF panel"],
  MDFパネル: ["MDF 패널", "MDF panel"],
  スチレンボード: ["스티렌 보드", "styrene board"],
  発泡スチロール: ["스티로폼", "polystyrene foam"],
  イゾレル: ["이졸렐 보드", "Isorel board"],
  ブリキ: ["양철", "tin plate"],

  // ── 기법 이형 ──
  フロッタージュ: ["프로타주", "frottage"],
  メゾチント: ["메조틴트", "mezzotint"],
  ソフトグランド: ["소프트그라운드", "soft-ground etching"],
  ルーレット: ["룰렛", "roulette"],
  蹴彫: ["축조", "chased engraving"],
  凸版: ["볼록판", "relief print"],
  亜鉛凸版: ["아연 볼록판", "zinc relief print"],
  リトグラフ5色刷: ["석판 5색", "five-color lithograph"],
  手彩色: ["손 채색", "hand-colored"],
  アッサンブラージュ: ["아상블라주", "assemblage"],
  マルチブロック: ["멀티블록", "multi-block"],

  // ── 안료 이형 ──
  色墨: ["색먹", "colored ink"],
  岩絵具: ["암채", "mineral pigment"],
  エナメル絵具: ["에나멜 물감", "enamel paint"],
  ドライパステル: ["드라이 파스텔", "dry pastel"],
  クレパス: ["크레파스", "oil pastel"],
  ラッカー: ["래커", "lacquer"],
  ジュラルミンの粉: ["두랄루민 분말", "duralumin powder"],
  金のアマルガム: ["금 아말감", "gold amalgam"],
  金: ["금", "gold"],
  蝋: ["밀랍", "wax"],

  // ── 지바 우키요에·동양화 용어 ──
  大判錦絵: ["오반 니시키에", "ōban nishiki-e"],
  横大判錦絵: ["요코 오반 니시키에", "horizontal ōban nishiki-e"],
  大々横判錦絵: ["다이다이 요코반 니시키에", "ōō-yokoban nishiki-e"],
  長大判錦絵: ["나가 오반 니시키에", "long ōban nishiki-e"],
  錦絵: ["니시키에", "nishiki-e"],
  木版多色摺: ["목판 다색 인쇄", "multicolor woodblock print"],
  木版墨摺: ["목판 묵쇄", "sumizuri woodblock print"],
  墨摺絵本: ["묵쇄 그림책", "sumizuri picture book"],
  紙本着色: ["종이에 채색", "color on paper"],
  紙本墨画: ["종이에 수묵", "ink on paper"],
  紙本墨画淡彩: ["종이에 수묵담채", "ink and light color on paper"],
  絹本着色一幅: ["비단에 채색, 1폭", "color on silk, one hanging scroll"],
  墨書: ["묵서", "ink inscription"],
  書籍: ["서적", "book"],
  画譜: ["화보", "picture album"],
  下絵: ["밑그림", "preparatory drawing"],
  版下絵: ["판하회", "print design drawing"],
  大判版下絵: ["오반 판하회", "ōban print design drawing"],
  ドンゴロス: ["마대천", "hessian cloth"],

  // ── 후쿠오카 꼬리 ──
  葦の茎: ["갈대 줄기", "reed stem"],
  ショラ: ["쇼라", "shola pith"],
  切り紙: ["전지", "cut paper"],
  木屑: ["나무 부스러기", "wood shavings"],
  もみがら: ["왕겨", "rice husk"],
  石: ["돌", "stone"],
  本: ["책", "book"],
  電球: ["전구", "light bulb"],
  自転車: ["자전거", "bicycle"],
  造花: ["조화", "artificial flowers"],
  他: ["외", "and others"],
  など: ["등", "etc."],
};

// 「油彩(型押)」처럼 괄호가 붙거나 「画布（合板貼り）」처럼 부연이 달린 꼬리.
const MEDIUM_JA_PHRASES: Record<string, [string, string]> = {
  型押: ["형압", "embossed"],
  板貼り: ["패널 배접", "mounted on panel"],
  合板貼り: ["합판 배접", "mounted on plywood"],
  ボードに紙: ["보드에 종이", "paper on board"],
  巻子装: ["두루마리 장정", "handscroll mounting"],
  剪り紙: ["전지", "cut paper"],
  トラパントおよび手縫い: ["트라푼토와 손바느질", "trapunto and hand stitching"],
  リックラック飾り: ["릭랙 장식", "rickrack trim"],
  ジンク版: ["아연판", "zinc plate"],
  タミル・ナードゥ州: ["타밀나두주", "Tamil Nadu"],
  ほか: ["외", "and others"],
};

const HAS_JAPANESE = /[぀-ゟ゠-ヿ一-鿿]/;

/** 「30分」「11分30秒」「6点」「3枚組」처럼 수량·시간이 붙은 조각 */
function translateJaQuantity(s: string, ko: boolean): string | null {
  let m = s.match(/^(\d+)分(?:(\d+)秒)?$/);
  if (m) return ko ? `${m[1]}분${m[2] ? ` ${m[2]}초` : ""}` : `${m[1]} min${m[2] ? ` ${m[2]} sec` : ""}`;
  m = s.match(/^(\d+)秒$/);
  if (m) return ko ? `${m[1]}초` : `${m[1]} sec`;
  m = s.match(/^(\d+)幅$/);
  if (m) return ko ? `${m[1]}폭` : `${m[1]} hanging scroll${m[1] === "1" ? "" : "s"}`;
  m = s.match(/^(\d+)冊$/);
  if (m) return ko ? `${m[1]}책` : `${m[1]} volume${m[1] === "1" ? "" : "s"}`;
  m = s.match(/^(\d+)帖$/);
  if (m) return ko ? `${m[1]}첩` : `${m[1]} album${m[1] === "1" ? "" : "s"}`;
  m = s.match(/^(\d+)巻$/);
  if (m) return ko ? `${m[1]}권` : `${m[1]} scroll${m[1] === "1" ? "" : "s"}`;
  m = s.match(/^(\d+)面$/);
  if (m) return ko ? `${m[1]}면` : `${m[1]} panel${m[1] === "1" ? "" : "s"}`;
  m = s.match(/^(\d+)枚揃$/);
  if (m) return ko ? `${m[1]}매 한 벌` : `set of ${m[1]}`;
  m = s.match(/^(\d+)点組$/);
  if (m) return ko ? `${m[1]}점 조` : `set of ${m[1]}`;
  m = s.match(/^(\d+)曲(\d+)隻屏風$/);
  if (m) return ko ? `${m[1]}곡 ${m[2]}척 병풍` : `${m[1]}-panel folding screen (${m[2]})`;
  m = s.match(/^(?:上下)?(\d+)枚続$/);
  if (m) return ko ? `${m[1]}매 연작` : `${m[1]}-sheet set`;
  m = s.match(/^(\d+)(?:点|枚組|枚|図版|個|台|チャンネル)$/);
  if (m) return ko ? `${m[1]}점` : `${m[1]} pieces`;
  m = s.match(/^(\d+)インチ(.*)$/);
  if (m) return ko ? `${m[1]}인치 모니터` : `${m[1]}-inch monitor`;
  return null;
}

/** 「A・B、C」 형태의 목록을 통째로 옮긴다. 괄호 안쪽에도 같은 규칙을 쓴다. */
function translateJaList(rawList: string, ko: boolean): string {
  // ⚠️ 전각 숫자(３)는 \d 에 안 걸린다. 「３点組」이 통째로 사전 밖으로 새어
  //    나갔다. 반각으로 먼저 접고 시작한다.
  const list = rawList
    .replace(/[０-９]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0xfee0))
    .replace(/､/g, "、");
  const sealed: string[] = [];
  const masked = list.replace(/[（(][^（()）]*[)）]/g, (m) => {
    sealed.push(m);
    return `\u0000${sealed.length - 1}\u0000`;
  });
  const unseal = (v: string) => v.replace(/\u0000(\d+)\u0000/g, (_, i) => sealed[Number(i)]);
  return masked
    .split(/[・、，,／/;；･]|\s{1,}/)
    .map((part) => translateJaToken(unseal(part).trim(), ko))
    .filter(Boolean)
    .join(ko ? " · " : ", ");
}

function translateJaToken(tok: string, ko: boolean): string {
  const t = tok.trim();
  if (!t) return "";
  const idx = ko ? 0 : 1;
  const hit = MEDIUM_JA_TOKENS[t] || MEDIUM_JA_PHRASES[t];
  if (hit) return hit[idx];
  const qty = translateJaQuantity(t, ko);
  if (qty) return qty;
  // 「スキャノグラフ（デジタルプリント・モネキャンバス紙）」처럼 괄호 **안에도** 목록이 온다.
  // 안쪽을 통짜 토큰으로 보면 사전에 안 걸리므로 같은 분해를 재귀로 돌린다.
  const paren = t.match(/^(.*?)[（(](.+?)[)）]$/);
  if (paren) {
    const head = paren[1] ? translateJaToken(paren[1], ko) : "";
    const inner = translateJaList(paren[2], ko);
    if (head !== paren[1] || inner !== paren[2]) return head ? `${head}(${inner})` : `(${inner})`;
  }
  // 「木箱に写真」「板に貼ったカンヴァス」「麻布で裏打ち」 — 조사로 이어붙인 복합어.
  // 앞뒤를 각각 옮기고 한국어 어순(A에 B)으로 잇는다.
  const joined = t.match(/^(.+?)(?:に|で)(?:貼った|貼付|貼り付け|打たれた|裏打ち|よる)?(.*)$/);
  if (joined && joined[1] && joined[2]) {
    const a = translateJaToken(joined[1], ko);
    const b = translateJaToken(joined[2], ko);
    if (a !== joined[1] && b !== joined[2]) return ko ? `${a}에 ${b}` : `${b} on ${a}`;
  }
  // 「リトグラフ6色刷」「電胎凸版1色刷」 — 색 수는 사전에 다 적을 게 아니라 규칙으로.
  const colors = t.match(/^(.+?)(\d+)色(?:刷|)$/);
  if (colors) {
    const base = translateJaToken(colors[1], ko);
    if (base !== colors[1]) return ko ? `${base} ${colors[2]}색` : `${colors[2]}-color ${base}`;
  }
  const onlyColors = t.match(/^(\d+)色$/);
  if (onlyColors) return ko ? `${onlyColors[1]}색` : `${onlyColors[1]} colors`;
  if (t === "一幅") return ko ? "1폭" : "one hanging scroll";
  // 「2チャンネルビデオ」
  const ch = t.match(/^(\d+)チャンネル(.*)$/);
  if (ch) {
    const rest = translateJaToken(ch[2] || "ビデオ", ko);
    return ko ? `${ch[1]}채널 ${rest}` : `${ch[1]}-channel ${rest}`;
  }
  if (t.startsWith("シングルチャンネル")) {
    const rest = translateJaToken(t.slice(9), ko);
    return ko ? `싱글채널 ${rest}` : `single-channel ${rest}`;
  }
  // 「金箔と油彩」 — と 로 병렬된 꼴
  if (t.includes("と")) {
    const seg = t.split("と").map((x) => translateJaToken(x, ko));
    if (seg.every((x, i) => x !== t.split("と")[i])) return seg.join(ko ? " · " : ", ");
  }
  // 「1963プリント」처럼 연도가 앞에 붙은 꼴
  const yr = t.match(/^(\d{4})(.+)$/);
  if (yr) {
    const rest = translateJaToken(yr[2], ko);
    if (rest !== yr[2]) return `${yr[1]} ${rest}`;
  }
  // 「大判錦絵2枚続」「書籍1冊」처럼 개념 + 수량이 붙은 꼴
  const cq = t.match(/^(.+?)((?:上下)?\d+(?:幅|冊|帖|巻|枚続|枚揃|枚|点組|面|台|点))$/);
  if (cq) {
    const base = translateJaToken(cq[1], ko);
    const qty = translateJaToken(cq[2], ko);
    if (base !== cq[1] || qty !== cq[2]) return ko ? `${base}, ${qty}` : `${base}, ${qty}`;
  }
  // 「アクリル絵具ほか」처럼 접미 '～ほか'
  if (t.endsWith("ほか")) {
    const base = translateJaToken(t.slice(0, -2), ko);
    if (base !== t.slice(0, -2)) return ko ? `${base} 외` : `${base} and others`;
  }
  return t; // 미커버는 원문 유지
}

/**
 * 일본어 medium 을 토큰 단위로 옮긴다. 「技法・支持体」 순서를 그대로 둔다.
 * 일본어가 없으면 null 을 돌려 상위 사전이 처리하게 한다.
 */
export function translateJapaneseMedium(raw: string, language: AppLanguage): string | null {
  const value = String(raw || "").trim();
  if (!value || !HAS_JAPANESE.test(value)) return null;
  return translateJaList(value, language !== "en");
}
