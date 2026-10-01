import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { exhibitions as MUSEUM_RECORDS } from "../../data/exhibitions.js";
import { getMuseumLogo } from "../../components/MuseumLogo";
import { getOptimizedImageUrl } from "../../utils/imageProxy";
import { artistFileKey } from "../../utils/artistKey.js";
import { getCanonicalName } from "../../utils/canonicalArtist";
import { loadArtistWorks } from "../../utils/artistWorks";

/**
 * The picture a saved exhibition, museum or artist shows in My Page.
 *
 * A show has its own poster. A museum's standing collection has none, so it
 * borrows the first work in that collection — baked into
 * public/data/collection-covers.json by scripts/build-collection-covers.mjs, so
 * no card has to load a whole collection file. A museum shows its own logo, and
 * an artist their portrait (public/data/artist-portraits.json) before any of
 * their works. Every chain ends on something drawn, never on an empty frame.
 */

type MuseumRecord = {
  id: string;
  slug?: string;
  name?: string;
  name_ko?: string;
  location?: string;
  representativeImage?: string;
  permanentExhibitions?: Array<{ id?: string; name?: string; collectionFile?: string }>;
  temporaryExhibitions?: Array<{ id?: string }>;
  pastExhibitions?: Array<{ id?: string }>;
};

export interface StandingCollection {
  id: string;
  name: string;
  museumId: string;
  museumName: string;
  museumNameKo: string;
  collectionFile: string;
}

/** letters and digits only, so an id or a name matches however it was written */
const key = (value?: string | null) =>
  String(value || "").toLowerCase().normalize("NFKC").replace(/[^\p{L}\p{N}]+/gu, "");

const MUSEUM_BY_ID = new Map<string, MuseumRecord>();
const MUSEUM_BY_NAME = new Map<string, MuseumRecord>();
const STANDING_BY_KEY = new Map<string, StandingCollection>();
const STANDING_BY_MUSEUM = new Map<string, StandingCollection[]>();
const SHOW_IDS = new Set<string>();

for (const museum of MUSEUM_RECORDS as MuseumRecord[]) {
  MUSEUM_BY_ID.set(key(museum.id), museum);
  if (museum.slug) MUSEUM_BY_ID.set(key(museum.slug), museum);
  for (const name of [museum.name, museum.name_ko]) {
    if (name) MUSEUM_BY_NAME.set(key(name), museum);
  }
  const standing: StandingCollection[] = [];
  for (const pe of museum.permanentExhibitions || []) {
    if (!pe?.id) continue;
    const entry: StandingCollection = {
      id: String(pe.id),
      name: pe.name || "",
      museumId: museum.id,
      museumName: museum.name || "",
      museumNameKo: museum.name_ko || "",
      collectionFile: String(pe.collectionFile || ""),
    };
    standing.push(entry);
    /* by its id, and by its collection file: an older save may carry either */
    STANDING_BY_KEY.set(key(pe.id), entry);
    const file = String(pe.collectionFile || "").split("/").pop()?.replace(/\.json$/i, "");
    if (file) STANDING_BY_KEY.set(key(file), entry);
  }
  if (standing.length) STANDING_BY_MUSEUM.set(key(museum.id), standing);
  for (const show of [...(museum.temporaryExhibitions || []), ...(museum.pastExhibitions || [])]) {
    if (show?.id) SHOW_IDS.add(key(show.id));
  }
}

export const museumRecord = (id?: string | null): MuseumRecord | null =>
  (id ? MUSEUM_BY_ID.get(key(id)) || null : null);

/** The museum a saved item names, for older saves that kept no id. */
export const museumByName = (name?: string | null): MuseumRecord | null =>
  (name ? MUSEUM_BY_NAME.get(key(name)) || null : null);

/** The museum's name in the reader's language. */
export const museumName = (museum: MuseumRecord | null, ko: boolean, fallback = "") =>
  (ko ? museum?.name_ko || museum?.name : museum?.name) || fallback;

/** A name that reads like a museum's own holdings rather than a show. */
const readsAsCollection = (item: any) =>
  /collection|highlights|permanent|컬렉션|소장품|상설/i.test(String(item?.name || item?.title || ""));

/**
 * The standing collection a saved exhibition is, or null for a show. The id is
 * tried first; a save made before the collection was renamed keeps an id we no
 * longer use, so a name that reads as holdings falls back to the museum it
 * names — which is how "Städel Collection" finds staedel-museum-collection.
 */
export function standingCollectionOf(item: any): StandingCollection | null {
  for (const candidate of [item?.exhibitionId, item?.sanitizedId, item?.id, item?.sourceCollection]) {
    const found = STANDING_BY_KEY.get(key(candidate));
    if (found) return found;
  }
  if (!readsAsCollection(item)) return null;
  const museum = museumRecord(item?.museumId) || museumByName(item?.museumName) || museumByName(item?.venue);
  const standing = museum ? STANDING_BY_MUSEUM.get(key(museum.id)) || [] : [];
  if (!standing.length) return null;
  const saved = key(item?.name || item?.title);
  return standing.find((pe) => key(pe.name) === saved) || standing[0];
}

/** A show runs for a while: it carries dates, a venue, or is one the museums list. */
export function isRunningShow(item: any): boolean {
  if (item?.period || item?.venue || item?.startDate || item?.endDate || item?.daysLeft !== undefined) return true;
  for (const candidate of [item?.exhibitionId, item?.sanitizedId, item?.id]) {
    if (SHOW_IDS.has(key(candidate))) return true;
  }
  return false;
}

/** collectionFile is written as a bare file name or as a whole R2 URL. */
const fileNameOf = (value?: string) => String(value || "").split("?")[0].split("/").pop() || "";

const COMMONS = "https://commons.wikimedia.org/wiki/Special:FilePath/";

const fetchMap = (() => {
  const cache = new Map<string, Promise<Record<string, string>>>();
  return (url: string) => {
    if (!cache.has(url)) {
      cache.set(
        url,
        fetch(url)
          .then((r) => (r.ok ? r.json() : {}))
          .catch(() => ({})),
      );
    }
    return cache.get(url) as Promise<Record<string, string>>;
  };
})();

function useJsonMap(url: string, enabled: boolean): Record<string, string> {
  const [map, setMap] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    void fetchMap(url).then((data) => { if (alive) setMap(data || {}); });
    return () => { alive = false; };
  }, [url, enabled]);
  return map;
}

/** First work of each standing collection, keyed by collection file name. */
export const useCollectionCovers = (enabled: boolean) => useJsonMap("/data/collection-covers.json", enabled);
/** One picture of the artist — not of their work — keyed as the artist files are. */
export const useArtistPortraits = (enabled: boolean) => useJsonMap("/data/artist-portraits.json", enabled);

export const collectionCover = (covers: Record<string, string>, collectionFile?: string) =>
  covers[fileNameOf(collectionFile)] || "";

export function artistPortrait(portraits: Record<string, string>, name?: string, width = 480): string {
  const key = name ? artistFileKey(getCanonicalName(name) || name) : "";
  const value = key ? portraits[key] : "";
  if (!value) return "";
  return /^https?:\/\//.test(value) ? value : `${COMMONS}${value}?width=${width}`;
}

/** The artist's own first work, fetched from their static data only when every other picture failed. */
function useArtistFirstWork(name: string | undefined, enabled: boolean): string {
  const [url, setUrl] = useState("");
  useEffect(() => {
    if (!name || !enabled) return;
    let alive = true;
    void loadArtistWorks(name).then((works) => {
      if (alive) setUrl(String(works.find((work) => work?.i)?.i || ""));
    });
    return () => { alive = false; };
  }, [name, enabled]);
  return url;
}

/**
 * How many works an artist has now — counted from the same data their page opens
 * with, not the number saved with the like, which went stale as collections grew.
 * Null until it is known, so the card can keep the saved number meanwhile.
 */
export function useArtistWorkCount(name: string | undefined, enabled = true): number | null {
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    if (!name || !enabled) return;
    let alive = true;
    void loadArtistWorks(name).then((works) => {
      if (alive && works.length > 0) setCount(works.length);
    });
    return () => { alive = false; };
  }, [name, enabled]);
  return count;
}

/** "57 작품" on an artist card: the live count, the saved one until that arrives. */
export function ArtistWorkCount({ name, saved, ko }: { name?: string; saved: number; ko: boolean }) {
  const live = useArtistWorkCount(name);
  const works = live ?? saved;
  if (!works) return <>{ko ? "작가" : "Artist"}</>;
  return <>{`${works.toLocaleString()} ${ko ? "작품" : works === 1 ? "work" : "works"}`}</>;
}

/**
 * The card's picture: the first source that loads. When they all fail — or there
 * were none — an artist falls back to their own first work, and anything else to
 * the mark the caller passes.
 */
export function SavedArt({ sources, artistName, alt, width, fallback, objectPosition }: {
  sources: Array<string | undefined | null>;
  /** set for an artist card, so their own first work is the last picture tried */
  artistName?: string;
  alt: string;
  width: number;
  fallback: ReactNode;
  objectPosition?: string;
}) {
  const list = useMemo(
    () => Array.from(new Set(sources.map((s) => String(s || "").trim()).filter(Boolean))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sources.join("|")],
  );
  const [failed, setFailed] = useState<string[]>([]);
  useEffect(() => setFailed([]), [list.join("|")]);
  const usable = list.filter((src) => !failed.includes(src));
  const spare = useArtistFirstWork(artistName, usable.length === 0);
  const src = usable[0] || (spare && !failed.includes(spare) ? spare : "");

  if (!src) return <>{fallback}</>;
  return (
    <img
      src={getOptimizedImageUrl(src, width)}
      alt={alt}
      loading="lazy"
      decoding="async"
      onError={() => setFailed((prev) => (prev.includes(src) ? prev : [...prev, src]))}
      style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: objectPosition || "center", display: "block" }}
    />
  );
}

/** A museum's own mark: its logo as a one-colour mask, or its name set as the wordmark. */
export function MuseumArt({ museumId, name, color, accent }: {
  museumId?: string | null;
  name: string;
  color: string;
  accent: string;
}) {
  const logo = museumId ? getMuseumLogo(String(museumId)) : null;
  if (logo) {
    const mask = `url("${logo.src}")`;
    return (
      <div
        role="img"
        aria-label={name}
        style={{
          /* a fixed box the logo is fitted into, centred: no aspect-ratio sizing, which Safari stretched */
          width: "68%",
          height: "58%",
          backgroundColor: color,
          WebkitMaskImage: mask,
          maskImage: mask,
          WebkitMaskSize: "contain",
          maskSize: "contain",
          WebkitMaskRepeat: "no-repeat",
          maskRepeat: "no-repeat",
          WebkitMaskPosition: "center",
          maskPosition: "center",
        } as CSSProperties}
      />
    );
  }
  /* the wordmark is set in a Latin serif, so it carries the museum's own name */
  const wordmark = (museumId ? museumRecord(museumId)?.name : "") || name;
  return (
    <div role="img" aria-label={name} style={{ padding: "0 12%", textAlign: "center", color }}>
      <div
        style={{
          fontFamily: "'Marcellus', 'Times New Roman', serif",
          fontSize: 13,
          lineHeight: 1.25,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          wordBreak: "keep-all",
        } as CSSProperties}
      >
        {wordmark}
      </div>
      <div aria-hidden="true" style={{ width: 22, height: 1, margin: "8px auto 0", background: accent }} />
    </div>
  );
}

/** An artist with no picture at all: their initial, set as the wordmark is. */
export function ArtistInitial({ name, color, accent }: { name: string; color: string; accent: string }) {
  return (
    <div role="img" aria-label={name} style={{ textAlign: "center", color }}>
      <div style={{ fontFamily: "'Marcellus', 'Times New Roman', serif", fontSize: 34, lineHeight: 1 } as CSSProperties}>
        {(name || "?").trim().charAt(0).toUpperCase()}
      </div>
      <div aria-hidden="true" style={{ width: 22, height: 1, margin: "10px auto 0", background: accent }} />
    </div>
  );
}
