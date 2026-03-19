

// Map of keywords to standardized categories
const CATEGORY_MAP: Record<string, string> = {
    "drawing": "Drawing",
    "drawings": "Drawing",
    "draw": "Drawing",
    "dibujo": "Drawing",
    "dibujos": "Drawing",
    "disegno": "Drawing",
    "engravings (prints)": "Graphic artwork",
    "engravings": "Graphic artwork",
    "engraving": "Graphic artwork",
    "prints": "Print",
    "print": "Print",
    "graphic artwork": "Graphic artwork",
    "graphic artworks": "Graphic artwork",
    "lithographs": "Graphic artwork",
    "lithograph": "Graphic artwork",
    "oil painting": "Painting",
    "paintings": "Painting",
    "painting": "Painting",
    "pintura": "Painting",
    "pinturas": "Painting",
    "pottery (visual works)": "Ceramics",
    "pottery": "Ceramics",
    "ceramic": "Ceramics",
    "ceramics": "Ceramics",
    "céramique": "Ceramics",
    "céramiques": "Ceramics",
    "ceramique": "Ceramics",
    "ceramiques": "Ceramics",
    "faïence": "Ceramics",
    "faïences": "Ceramics",
    "faience": "Ceramics",
    "fayence": "Ceramics",
    "grès": "Ceramics",
    "gres": "Ceramics",
    "porcelaine": "Ceramics",
    "porcelaines": "Ceramics",
    "sculpture (visual work)": "Sculpture",
    "sculptures": "Sculpture",
    "sculpture": "Sculpture",
    "escultura": "Sculpture",
    "esculturas": "Sculpture",
    "sketchbooks": "Sketchbooks",
    "sketchbook": "Sketchbooks",
    "photography": "Photography",
    "photograph": "Photography",
    "photos": "Photography",
    "posters": "Posters",
    "poster": "Posters",
    // Numismatics
    "numismatics": "Numismatics",
    "numismatic": "Numismatics",
    // Russian language categories
    "\u043a\u0430\u0440\u0442\u0438\u043d\u0430": "Painting",
    "\u0433\u0440\u0430\u0444\u0438\u043a\u0430 \u0441\u0442\u0430\u043d\u043a\u043e\u0432\u0430\u044f": "Graphic artwork",
    "\u044d\u0441\u043a\u0438\u0437": "Drawing",
    "\u043d\u0430\u0431\u0440\u043e\u0441\u043e\u043a": "Drawing",
    "\u0434\u0435\u043a\u043e\u0440\u0430\u0442\u0438\u0432\u043d\u043e-\u043f\u0440\u0438\u043a\u043b\u0430\u0434\u043d\u043e\u0435 \u0438\u0441\u043a\u0443\u0441\u0441\u0442\u0432\u043e": "Applied Art",
    "\u0443\u0440\u0430\u0440\u0442\u0443": "Urartian",
};

const CATEGORY_ENTRIES = Object.entries(CATEGORY_MAP);

export type TechniqueFacetParent = '2D' | '3D';
export type TechniqueFacet = { id: string; label: string; parent: TechniqueFacetParent; re: RegExp };

// 기법(Technique) 기반 하위 분류 - 모든 미술관에 적용
export const TECHNIQUE_FACETS: TechniqueFacet[] = [
    // 2D 기법 (Technique-based, not support-based) - EN/DE/IT/ES/FR
    { id: 'Oil', label: 'OIL', parent: '2D', re: /oil|óleo|olio|öl\b/i },
    { id: 'Acrylic', label: 'ACRYLIC', parent: '2D', re: /acrylic|acrílico|acrilico|acryl/i },
    { id: 'Print', label: 'PRINT', parent: '2D', re: /print|estampa|stampa|lithograph|litograf|etching|aguafuerte|acquaforte|engraving|grabado|incisione|woodcut|xilograf|xilografia|screen\s?print|serigraf|serigrafia|silkscreen|monotype|radierung|holzschnitt|druck/i },
    { id: 'Photo', label: 'PHOTO', parent: '2D', re: /photograph|foto|gelatin|silver|chromogenic|c-?print|daguerreotype/i },
    { id: 'Drawing', label: 'DRAW', parent: '2D', re: /ink|tinta|inchiostro|pencil|l[áa]piz|matita|charcoal|carboncillo|carbone|pastel|crayon|drawing|dibujo|disegno|tusche|feder|kohle|bleistift|kreide|zeichnung/i },
    { id: 'Collage', label: 'COLLAGE', parent: '2D', re: /collage|mixed media|técnica mixta|tecnica mista|papiers collés/i },
    { id: 'Tempera', label: 'TEMPERA', parent: '2D', re: /tempera|gouache|watercolor|acuarela|acquarello|aquarell|kleisterfarbe/i },
    { id: 'Fresco', label: 'FRESCO', parent: '2D', re: /fresco|affresco/i },

    // 3D 재료/기법 (Material/Technique-based for sculpture) - EN/DE/IT/ES/FR
    { id: 'Marble', label: 'MARBLE', parent: '3D', re: /marble|marmo|marmi|m[áa]rmol|marmor/i },
    { id: 'Stone', label: 'STONE', parent: '3D', re: /stone|pietra|piedra|calcare|calcarea|granito|granite|alabast|serpentin|kalkstein|sandstein|feuerstein|granodiorit|grauwacke|rosengranit|kalzit|travertin|quarzit|steatit/i },
    { id: 'Bronze', label: 'BRONZE', parent: '3D', re: /bronze|bronzo|bronce/i },
    { id: 'Ceramic', label: 'CERAMIC', parent: '3D', re: /ceramic|c[eé]ramiques?|cer[áa]mica|keramik|fa[ïi]ences?|fayence|faience|pottery|terracotta|porcelain|porcelaines?|porzellan|stoneware|earthenware|majolica|maiolica|gr[eè]s\b|\bclay\b|\bargilla\b|\bbarro\b/i },
    { id: 'Wood3D', label: 'WOOD', parent: '3D', re: /\blegno\b|\bwood\b|\bmadera\b|\bholz\b|intaglio|intagliato|carving|tallado/i },
    { id: 'Metal', label: 'METAL', parent: '3D', re: /\bmetal\b|kupfer|gold\b|silber|elfenbein|horn\b|bein\b/i },
    { id: 'Textile', label: 'TEXTILE', parent: '3D', re: /textile|wirkerei|seide|wolle|leinen|fabric|tapestry/i },
    { id: 'Sculpture', label: 'SCULPT', parent: '3D', re: /sculpture|scultura|escultura|cast|getto|fundición|molding|modeling|modelado|modellato|skulptur|plastik/i },
    { id: 'Assemblage', label: 'ASSEMB', parent: '3D', re: /assemblage|ensamblaje|construction|construcción|costruzione/i },
    { id: 'Installation', label: 'INSTALL', parent: '3D', re: /installation|instalación|instalaci|installazione/i },
];

export const matchesTechniqueFacet = (text: string, facetId: string): boolean => {
    const facet = TECHNIQUE_FACETS.find((f) => f.id === facetId);
    if (!facet) return false;
    return facet.re.test(text || '');
};

// Material-based 2D/3D classification for Korean museums
export const MATERIAL_TO_TYPE: Record<string, '2D' | '3D'> = {
    // 2D materials
    '지': '2D',           // Paper
    '사직': '2D',         // Silk/Fabric
    '종이': '2D',         // Paper variant
    '섬유': '2D',         // Fiber/Textile
    // 3D materials
    '도자기': '3D',       // Ceramics
    '토제': '3D',         // Earthenware
    '금속': '3D',         // Metal
    '석': '3D',           // Stone
    '나무': '3D',         // Wood
    '유리/보석': '3D',    // Glass/Gems
    '골각패갑': '3D',     // Bone/Shell/Carapace
    '피모': '3D',         // Leather/Fur
    '초제': '3D',         // Plant-based
    '광물': '3D',         // Minerals
    '흙': '3D',           // Earth/Clay
    '경질': '3D',         // Hard-fired pottery
    '연질': '3D',         // Soft-fired pottery
    '와질': '3D',         // Tile-like pottery
    '청자': '3D',         // Celadon
    '백자': '3D',         // White porcelain
    '분청': '3D',         // Buncheong ware
    '철': '3D',           // Iron
    '청동': '3D',         // Bronze
    '동합금': '3D',       // Copper alloy
    '금동': '3D',         // Gilt-bronze
    '금': '3D',           // Gold
    '은': '3D',           // Silver
    '화강암': '3D',       // Granite
    '돌': '3D',           // Stone variant
    '옥': '3D',           // Jade
    '기타': '3D',         // Other
    '칠기': '3D',         // Lacquerware
    '뼈/뿔/조개': '3D',   // Bone/horn/shell
    '조각': '3D',         // Sculpture
    '설치': '3D',         // Installation
    '공예': '3D',         // Craft
    '건축': '3D',         // Architecture
    '뉴미디어': '3D',       // New Media
};

// Chinese art category/medium → type mapping
// Covers GDMOA, Shenzhen Museum, and other Chinese museum datasets using Chinese-language labels
export const CHINESE_MUSEUM_CATEGORY_MAP: Record<string, '2D' | '3D'> = {
    '油画': '2D',    // yóuhuà — Oil painting
    '中国画': '2D',  // Zhōngguóhuà — Chinese painting
    '国画': '2D',    // guóhuà — Traditional Chinese painting
    'Chinese painting': '2D',
    '版画': '2D',    // bǎnhuà — Printmaking
    '水彩画': '2D',  // shuǐcǎihuà — Watercolour
    '书法': '2D',    // shūfǎ — Calligraphy
    'Calligraphy': '2D',
    '素描': '2D',    // sùmiáo — Drawing/Sketch
    '漫画': '2D',    // màn huà — Comics/Manga
    '连环画': '2D',  // liánhuánhuà — Sequential art (picture story book)
    '粉彩画': '2D',  // fěncǎihuà — Pastel
    '年画': '2D',    // nián huà — New Year painting
    '唐卡': '2D',    // tángkǎ — Thangka scroll painting
    '壁画': '2D',    // bìhuà — Mural
    '雕塑': '3D',    // diāosù — Sculpture
    'Sculpture': '3D',
    '陶艺': '3D',    // táoyì — Ceramics/Pottery art
    'Porcelain': '3D',
    'Ceramics': '3D',
    '青铜': '3D',    // qīngtóng — Bronze
    'Bronze Ware': '3D',
    'Bronze Mirror': '3D',
    'Bronze': '3D',
    '装置': '3D',    // zhuāngzhì — Installation
    '工艺': '3D',    // gōngyì — Craft/Applied arts
    '漆器': '3D',    // qīqì — Lacquerware
    '玉石': '3D',    // yùshí — Jade
    'Unearthed Relics': '3D',
    'Unearthed relics': '3D',
    'Folk Relics': '3D',
    'Folk relics': '3D',
    'Seal': '3D',    // Chinese seals are carved 3D objects
    'Ancient Art': '3D', // Now always 3D
    'New Media': '3D',
    'Concept Art': '3D',
    'Conceptual Art': '3D',
    '뉴미디어': '3D', // Korean
    '컨셉아트': '3D', // Korean
    '컨셉츄얼아트': '3D', // Korean
    '综合材料': '2D', // Mixed media — default 2D
};

const normalizeForMatch = (v: unknown): string => String(v ?? '').toLowerCase().trim();

const hasAnyMeaningfulTypeText = (a: any): boolean => {
    const t = normalizeForMatch(a?.type);
    const category = normalizeForMatch(a?.category);
    const artworkType = normalizeForMatch(a?.artworkType);
    const objectType = normalizeForMatch(a?.objectType);
    const classification = normalizeForMatch(a?.classification);
    const medium = normalizeForMatch(a?.medium);
    const technique = normalizeForMatch(a?.technique);
    const materials = normalizeForMatch(a?.materials);

    const hasExplicitKnownType = t === '2d' || t === '3d';

    return Boolean(
        hasExplicitKnownType ||
        category || artworkType || objectType || classification ||
        medium || technique || materials
    );
};

export const normalizeCategory = (cat: string | undefined | null): string => {
    if (!cat) return '';
    const lower = cat.toLowerCase().trim();

    if (CATEGORY_MAP[lower]) {
        return CATEGORY_MAP[lower];
    }

    for (const [key, value] of CATEGORY_ENTRIES) {
        if (lower.includes(key) || lower === key) {
            return value;
        }
    }

    return cat.split(/\s+/).map(word =>
        word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    ).join(' ');
};

export const isUncollectedArtwork = (a: any): boolean => {
    if (!a) return true;
    const t = normalizeForMatch(a.type);
    if (t === '2d' || t === '3d') return false;
    return !hasAnyMeaningfulTypeText(a);
};

// Main classification function
export const classifyArtwork = (artwork: any): { type: '2D' | '3D' | null, category: string } => {
    // 1. Determine Category
    // User Rule: If category is missing, use medium/technique/material as category
    let category = artwork.category || artwork.classification || artwork.artworkType || artwork.objectType || '';
    const medium = artwork.medium || artwork.technique || artwork.material || artwork.materials || '';

    if (!category || category === 'Artwork' || category === 'Untitled') {
        if (medium) {
            category = medium;
        }
    }

    const normalizedCategory = normalizeCategory(category);

    // 2. Determine Type (2D vs 3D)
    // We prioritize "Smart" detection for known 3D categories because some datasets lazily label sculptures as 2D.

    // Check for Korean material map match
    if (MATERIAL_TO_TYPE[category] || MATERIAL_TO_TYPE[medium]) {
        return {
            type: MATERIAL_TO_TYPE[category] || MATERIAL_TO_TYPE[medium],
            category: normalizedCategory
        };
    }

    // Regex Heuristics
    const categoryText = normalizeForMatch(category);
    const mediumText = normalizeForMatch(medium);
    const combinedText = `${categoryText} ${mediumText}`;

    // Explicit User Categorization Overrides (Highest Priority)
    // The user strictly requested these exact categories to ALWAYS be classified as 3D or 2D
    // regardless of the medium text which might be misleading or contain words like 'video'.
    if (/^(installation|installations|architecture|performance|mixed media|new media|conceptual art|concept art|ancient art|antiquity|antiquities)$/i.test(categoryText)) {
        return { type: '3D', category: normalizedCategory };
    }
    if (/^(graphic artwork|graphic art|design|script)$/i.test(categoryText)) {
        return { type: '2D', category: normalizedCategory };
    }

    // Explicit Video
    if (/video|film|animation|projection|moving image/i.test(combinedText)) {
        // Treating video as 2D for now as per current logic, or maybe null? 
        // Current logic says "video" sometimes, but interface returns 2D|3D.
        // ExhibitionModal logic mapped video to 'video' for Reina Sofia but then force cast to '2D' or '3D'.
        // Let's stick to 2D for screens usually.
        return { type: '2D', category: normalizedCategory };
    }

    // 1. Sculpture/3D Objects (Highest Priority)
    // Strong 3D signals that should OVERRIDE existing '2D' labels in datasets.
    // Updated to include plurals (s?) and broader object categories (Applied Arts, Artifacts).
    // Korean terms do not use \b because \b does not match Korean character boundaries.
    const has3DEnglish = /\b(sculptures?|sculptural|statues?|statuettes?|busts?|reliefs?|relieves?|casts?|medallions?|objects?|vessels?|coins?|medals?|numismatics?|weapons?|armors?|armours?|masks?|dolls?|furniture|jewelr(y|ies)|jewellery|installations?|architect(?:ure|ural)|skulptur(en)?|plastik(en)?|b\.?ste|objekt(e)?|kunsthandwerk|skulptural|esculturas?|estatuas?|bustos?|objetos?|sculturas?|riliev[oi]|objets?|contemporary art|assemblages?|constructions?|mobiles?|ceramics?|c[eé]ramiques?|keramik(en)?|potter(y|ies)|terracottas?|porcelains?|porcelaines?|clays?|stones?|marbles?|bronzes?|woods?|carvings?|metals?|textiles?|tapestr(y|ies)|applied arts?|artifacts?|archaeological|gems?|glasser?|ivor(y|ies)|fans?|clock|watch|vase|cabinet|table|chair|commode|sèvres|majolica|maiolica|fa[\xef\xbf\xbd\xef\xbf\xbdi]ences?|gr[eè]s|enamel|snuff box|gold box|casket|chandelier|figurine|costumes?|product\s*designs?|craft(?:s|\s*objects?)?|maquettes?|design\s*objects?|wearables?|lightings?|signages?|new media|conceptual art|concept art|ancient art|antiquit(y|ies))\b/i.test(combinedText);
    const has3DKorean = /(조각|설치|공예|건축|뉴미디어|도자기|백자|청자|분청|금속|석기|옥기)/.test(combinedText);
    const has3DObjectCue = has3DEnglish || has3DKorean;

    if (has3DObjectCue) {
        // Exception: "Miniature" or "Painting on ivory" or "Print with wood frame" should be 2D even if "ivory" or "wood" is matched
        if (/\b(miniatures?|painting|drawing|watercolou?r|tempera|fresco|icons?|panel|prints?|printmaking|photography|photographs?|posters?|collages?|lithographs?|etchings?|engravings?)\b/i.test(combinedText)) {
            return { type: '2D', category: normalizedCategory };
        }
        return { type: '3D', category: normalizedCategory };
    }

    // 2. 2D Categories/Techniques
    const has2DCue = /\b(painting|drawing|print|calligraphy|photography|graphic|collage|poster|sketch|watercolor|watercolour|lithograph|etching|engraving|woodcut|screen ?print|silkscreen|dipinto|disegno|incisione|stampa|fotografia|acquarello|litografia|xilografia|pittura|peinture|dessin|estampe|gravure|photographie|aquarelle|pintura|dibujo|grabado|acuarela|oil|acrylic|tempera|gouache|ink|pencil|charcoal|pastel|crayon|canvas|paper|cardboard|panel|parchment|icons?)\b/i.test(combinedText);

    if (has2DCue) {
        return { type: '2D', category: normalizedCategory };
    }

    // If no strong signal found, trust the existing type if present
    if (artwork.type === '2D' || artwork.type === '3D') {
        return { type: artwork.type, category: normalizedCategory };
    }

    // Default fallback
    // If we have meaningful text but couldn't classify, default to 2D or 3D?
    // User said "If category info is missing ... make it classified as medium". I addressed that with the category assignment.
    // The user didn't explicitly say "Default to Medium filter". They said "Classify AS medium".
    // Which I interpreted as "Use Medium string as Category string".

    // If still unknown
    return { type: '2D', category: normalizedCategory || 'Unknown' };
};
