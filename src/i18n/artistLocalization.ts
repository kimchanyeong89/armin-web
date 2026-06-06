import { useEffect, useState } from "react";
import type { AppLanguage } from "../contexts/LanguageContext";
import { getCanonicalName, prettifyArtistName } from "../utils/canonicalArtist";

/**
 * 작가명 한국어화. 권위 데이터(Wikidata ko 레이블)만 사용한다.
 *
 * 데이터: public/data/i18n/artists.json — scripts/build-artist-i18n.mjs 생성.
 *   { [작가명]: { name_ko, wikiId, source } }  (~614건, 권위 번역만)
 *
 * 71KB라 초기 번들에 넣지 않고 런타임에 1회 fetch + 모듈 캐시.
 * 미커버 작가나 로딩 전(map=null) 또는 영어 모드면 원문 폴백.
 */

type ArtistEntry = { name_ko?: string; wikiId?: string; source?: string };
export type ArtistI18nMap = Record<string, string>; // normalized name → name_ko

let cache: ArtistI18nMap | null = null;
let inflight: Promise<ArtistI18nMap> | null = null;

function normalize(name: string): string {
  return name.toLowerCase().replace(/\s+/g, " ").trim();
}

function loadArtistMap(): Promise<ArtistI18nMap> {
  if (cache) return Promise.resolve(cache);
  if (inflight) return inflight;
  // `no-cache` (revalidate), NOT `force-cache`: a stale/bad cached copy of this
  // map (e.g. an HTML SPA-fallback cached during a deploy gap, or an older empty
  // build) would otherwise be served forever, leaving the map empty so Korean
  // artist queries ("고흐") never resolve to English ("Vincent van Gogh") and
  // return almost nothing. Revalidation is cheap (304) and loads once per session.
  inflight = fetch("/data/i18n/artists.json", { cache: "no-cache" })
    .then((res) => (res.ok ? res.json() : {}))
    .then((raw: Record<string, ArtistEntry>) => {
      const map: ArtistI18nMap = {};
      for (const [name, entry] of Object.entries(raw)) {
        if (entry && entry.name_ko) map[normalize(name)] = entry.name_ko;
      }
      cache = map;
      return map;
    })
    .catch(() => {
      cache = {};
      return cache;
    });
  return inflight;
}

/**
 * 작가명을 표시용으로 변환. KO 모드에서 권위 번역이 있으면 한국어, 아니면 원문.
 * map은 useArtistI18n()이 제공한다(없으면 원문 폴백).
 */
export function getArtistDisplayName(
  name: string | undefined | null,
  language: AppLanguage,
  map?: ArtistI18nMap | null,
): string {
  const value = String(name || "").trim();
  if (!value) return value;
  // EN mode (or KO before the map loads): still normalize the DISPLAY form so
  // surname-first / shouted variants ("Monet, Claude", "MATISSE Henri") render
  // as the unified "Given Surname". prettify keeps qualifiers ("after …") intact.
  if (language === "en" || !map) return prettifyArtistName(value);
  // A name already written in Hangul is in the target language — never run it
  // through the foreign→KO map. The Wikidata pipeline mis-matched some Korean
  // painters to same-spelled celebrities ("김태"→"태연" the K-pop singer,
  // "허민자"→"호문가"), so any map hit on a Korean name is suspect; the corpus's
  // own Korean spelling is authoritative.
  if (/[가-힣]/.test(value)) return value;
  // 1) Direct hit on the stored form (covers canonical "Claude Monet").
  const direct = map[normalize(value)];
  if (direct) return direct;
  // The corpus stores some artists in non-canonical forms the map key never
  // matches: "Last First" ("Chagall Marc"), "Last, First" ("Monet, Claude"),
  // or with a bio suffix ("Marc Chagall (French, 1887-1985)"). Left unhandled,
  // those records render in English while their canonical siblings render in
  // Korean — the mixed KO/EN list the user reported. The same miss also hides
  // the artist chip (the index stores Chagall as "Chagall Marc").
  // 2) Canonicalize (strips bio parens + reorders ~90 known masters), retry.
  const canon = getCanonicalName(value);
  if (canon) {
    const viaCanon = map[normalize(canon)];
    if (viaCanon) return viaCanon;
  }
  // 3) Last resort for the long tail getCanonicalName can't reorder: swap a
  // single "Last, First" comma form to "First Last". Skip when parens are
  // present so a bio comma ("(French, 1887)") isn't mistaken for a name comma.
  if (value.includes(",") && !value.includes("(")) {
    const parts = value.split(",");
    if (parts.length === 2) {
      const swapped = map[normalize(`${parts[1]} ${parts[0]}`)];
      if (swapped) return swapped;
    }
  }
  // No authoritative Korean label — fall back to the normalized English display
  // form (un-inverted) instead of the raw "Last, First" the corpus stored.
  return prettifyArtistName(value);
}

/**
 * 한국어 작가명 쿼리를 영어 정규명으로 역해석한다. 한국어 검색("모네")이
 * 영어 코퍼스(D1/SigLIP)에서 작품을 못 찾는 문제를 해결하려고, 서버에 보내기
 * 전 쿼리를 "claude monet"으로 바꿔주는 용도. 같은 artists.json 한 곳만 본다.
 *
 * 매칭: 공백 제거 후 포함 검사. 한국어 성(姓)은 보통 이름 끝에 오므로
 * endsWith를 가장 강한 신호로, 그다음 startsWith, 짧은 이름 순으로 고른다.
 * 확신이 없으면(한글 아님·2자 미만·맵 없음·매치 없음) null → 호출부가 원문 사용.
 */
export function resolveKoreanToEnglishArtist(
  query: string,
  map?: ArtistI18nMap | null,
): string | null {
  const q = normalize(query).replace(/\s+/g, "");
  if (q.length < 2 || !map || !/[가-힣]/.test(q)) return null;
  let best: { en: string; ko: string; rank: number } | null = null;
  for (const [en, koRaw] of Object.entries(map)) {
    const ko = koRaw.replace(/\s+/g, "");
    if (!ko.includes(q)) continue;
    const rank = ko === q ? 4 : ko.endsWith(q) ? 3 : ko.startsWith(q) ? 2 : 1;
    if (!best || rank > best.rank || (rank === best.rank && ko.length < best.ko.length)) {
      best = { en, ko, rank };
    }
  }
  return best ? best.en : null;
}

/**
 * 작가 i18n 맵을 로드하는 훅. 로딩 전에는 null을 반환하고, 도착 시 리렌더.
 */
export function useArtistI18n(): ArtistI18nMap | null {
  const [map, setMap] = useState<ArtistI18nMap | null>(cache);
  useEffect(() => {
    if (cache) {
      setMap(cache);
      return;
    }
    let active = true;
    loadArtistMap().then((m) => {
      if (active) setMap(m);
    });
    return () => {
      active = false;
    };
  }, []);
  return map;
}
