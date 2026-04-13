import type { AppLanguage } from "../contexts/LanguageContext";

const HANGUL_REGEX = /[\u3131-\uD79D]/;

type MuseumLike = Record<string, any>;

const COUNTRY_KO_MAP: Record<string, string> = {
  "united states": "미국",
  usa: "미국",
  us: "미국",
  france: "프랑스",
  italy: "이탈리아",
  spain: "스페인",
  germany: "독일",
  japan: "일본",
  korea: "대한민국",
  "south korea": "대한민국",
  china: "중국",
  taiwan: "대만",
  "hong kong": "홍콩",
  canada: "캐나다",
  mexico: "멕시코",
  brazil: "브라질",
  argentina: "아르헨티나",
  australia: "호주",
  austria: "오스트리아",
  belgium: "벨기에",
  netherlands: "네덜란드",
  sweden: "스웨덴",
  norway: "노르웨이",
  denmark: "덴마크",
  finland: "핀란드",
  switzerland: "스위스",
  portugal: "포르투갈",
  greece: "그리스",
  egypt: "이집트",
  india: "인도",
  "united kingdom": "영국",
  uk: "영국",
};

const DESCRIPTION_EN_OVERRIDES: Record<string, string> = {
  "musee-du-louvre": "The Louvre is one of the world's largest and most iconic art museums, known for masterpieces including the Mona Lisa.",
  "musee-dorsay": "Musee d'Orsay is a landmark museum for 19th-century art and Impressionism, featuring major works by Monet, Van Gogh, and Renoir.",
  "centre-pompidou": "Centre Pompidou is one of Europe's leading modern and contemporary art museums.",
  "musee-de-lorangerie": "Musee de l'Orangerie is renowned for Claude Monet's Water Lilies and key works of modern French art.",
  "musee-picasso-paris": "Musee Picasso Paris houses one of the world's most important collections of Pablo Picasso's works.",
};

function hasHangul(value?: string): boolean {
  return HANGUL_REGEX.test(String(value || ""));
}

function pickFirst(...values: Array<unknown>): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function getCountryKo(country?: string): string {
  if (!country) return "";
  const normalized = country.toLowerCase().trim();
  return COUNTRY_KO_MAP[normalized] || country;
}

function buildEnglishDescription(museum: MuseumLike): string {
  const name = pickFirst(museum.name_en, museum.nameEn, museum.name, "This museum");
  const location = pickFirst(museum.location_en, museum.locationEn, museum.location);
  if (location) {
    return `${name} is a major art museum in ${location}.`;
  }
  return `${name} is a major art museum with a notable collection.`;
}

function buildKoreanDescription(museum: MuseumLike): string {
  const name = pickFirst(museum.name_ko, museum.nameKo, museum.name, "이 미술관");
  const location = pickFirst(museum.location_ko, museum.locationKo, museum.location);
  const country = getCountryKo(pickFirst(museum.country));

  if (location) {
    return `${name}은(는) ${location}에 위치한 주요 미술관입니다.`;
  }
  if (country) {
    return `${name}은(는) ${country}의 주요 미술관입니다.`;
  }
  return `${name}은(는) 주요 미술관입니다.`;
}

export function getMuseumDisplayName(museum: MuseumLike, language: AppLanguage): string {
  if (language === "en") {
    return pickFirst(museum.name_en, museum.nameEn, museum.name);
  }

  return pickFirst(museum.name_ko, museum.nameKo, museum.name);
}

export function getMuseumDisplayLocation(museum: MuseumLike, language: AppLanguage): string {
  if (language === "en") {
    return pickFirst(museum.location_en, museum.locationEn, museum.location);
  }

  return pickFirst(museum.location_ko, museum.locationKo, museum.location);
}

export function getMuseumDisplayDescription(museum: MuseumLike, language: AppLanguage): string {
  const raw = pickFirst(museum.description);

  if (language === "en") {
    const override = pickFirst(DESCRIPTION_EN_OVERRIDES[pickFirst(museum.id)]);
    if (override) return override;

    const explicit = pickFirst(museum.description_en, museum.descriptionEn);
    if (explicit) return explicit;
    if (!hasHangul(raw)) return raw;
    return buildEnglishDescription(museum);
  }

  const explicitKo = pickFirst(museum.description_ko, museum.descriptionKo);
  if (explicitKo) return explicitKo;
  if (hasHangul(raw)) return raw;
  return buildKoreanDescription(museum);
}

export function localizeMuseum<T extends MuseumLike>(museum: T, language: AppLanguage): T {
  return {
    ...museum,
    name: getMuseumDisplayName(museum, language),
    location: getMuseumDisplayLocation(museum, language),
    description: getMuseumDisplayDescription(museum, language),
  };
}
