import { useEffect, useState } from "react";
import type { AppLanguage } from "../contexts/LanguageContext";
import { getMediumKo } from "./mediumGlossary";
import { getDateKo } from "./dateLocalization";

/**
 * 작품 표시 필드(제목·재질·연도) 한국어화.
 *  - 제목: ① title_ko/name_ko 인라인 권위 번역 → ② artwork-titles.json 맵
 *          (작가+제목 키, Wikidata 권위 데이터) → ③ 원문(영어) 폴백.
 *  - 재질: mediumGlossary 규칙 기반.
 *  - 연도: dateLocalization 규칙 기반.
 * 영어 모드에서는 모두 원문.
 */

type ArtworkLike = Record<string, any>;
export type ArtworkI18nMap = Record<string, string>; // `${normArtist}\t${normTitle}` → title_ko

function pickFirst(...values: Array<unknown>): string {
  for (const v of values) {
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

// MUST stay byte-identical to scripts/build-artwork-i18n.mjs — the map key is
// built there and looked up here; any divergence silently misses every match.
function normTitle(s: string): string {
  return String(s || "")
    .normalize("NFC")
    .toLowerCase()
    .replace(/[“”"'’`]/g, "")
    .replace(/\s+/g, " ")
    .replace(/\.$/, "")
    .trim();
}
function normName(s: string): string {
  return String(s || "").normalize("NFC").toLowerCase().replace(/\s+/g, " ").trim();
}

// Field order mirrors the build script (title → name → n, artist → a) so the
// search-index shape ({n,a}) and collection shape ({title,artist}) yield the
// same key for the same work.
function titleMapKey(artwork: ArtworkLike): string | null {
  const title = pickFirst(artwork.title, artwork.name, artwork.n);
  const artist = pickFirst(artwork.artist, artwork.a);
  if (!title || !artist) return null;
  return `${normName(artist)}\t${normTitle(title)}`;
}

export function getArtworkTitle(
  artwork: ArtworkLike,
  language: AppLanguage,
  titleMap?: ArtworkI18nMap | null,
): string {
  if (language === "ko") {
    const ko = pickFirst(artwork.title_ko, artwork.name_ko, artwork.titleKo, artwork.nameKo);
    if (ko) return ko;
    if (titleMap) {
      const key = titleMapKey(artwork);
      if (key && titleMap[key]) return titleMap[key];
    }
  }
  return pickFirst(artwork.name, artwork.title, artwork.n, artwork.title_en, artwork.name_en);
}

export function getArtworkMedium(artwork: ArtworkLike, language: AppLanguage): string {
  const raw = pickFirst(artwork.medium, artwork.material, artwork.materials, artwork.technique);
  return getMediumKo(raw, language);
}

export function getArtworkDate(artwork: ArtworkLike, language: AppLanguage): string {
  const raw = String(artwork.year || artwork.dateStr || artwork.date || "").replace(
    /^\((-?\d+)\)$/,
    "$1",
  );
  return getDateKo(raw, language);
}

// ---- artwork-titles.json loader (module-cached, fetched once) ----------------
// 권위 번역만 담긴 작가+제목→한국어 제목 맵. 작가 i18n과 동일 패턴.
let cache: ArtworkI18nMap | null = null;
let inflight: Promise<ArtworkI18nMap> | null = null;

function loadTitleMap(): Promise<ArtworkI18nMap> {
  if (cache) return Promise.resolve(cache);
  if (inflight) return inflight;
  inflight = fetch("/data/i18n/artwork-titles.json", { cache: "force-cache" })
    .then((res) => (res.ok ? res.json() : {}))
    .then((m: ArtworkI18nMap) => {
      cache = m && typeof m === "object" ? m : {};
      return cache;
    })
    .catch(() => {
      cache = {};
      return cache;
    });
  return inflight;
}

/**
 * 작품 제목 i18n 맵 훅. 로딩 전 null, 도착 시 리렌더. 영어 모드여도 부담이 적어
 * 항상 로드한다(작은 JSON). 미사용 시 getArtworkTitle은 원문 폴백.
 */
export function useArtworkI18n(): ArtworkI18nMap | null {
  const [map, setMap] = useState<ArtworkI18nMap | null>(cache);
  useEffect(() => {
    if (cache) {
      setMap(cache);
      return;
    }
    let active = true;
    loadTitleMap().then((m) => {
      if (active) setMap(m);
    });
    return () => {
      active = false;
    };
  }, []);
  return map;
}
