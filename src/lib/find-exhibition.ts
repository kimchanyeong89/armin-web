// Shared collection-slug → museum/exhibition lookup. Extracted from
// HomePage.tsx so non-Home surfaces (e.g. WeeklyCurationTab) can resolve
// the same record HomePage's route-driven ExhibitionModal would resolve.
//
// Keep this dependency-light: imports only from src/data/exhibitions.ts and
// src/types/Exhibition. The exhibitions array is loaded once at module init
// and a token→entry Map is built lazily on first call.

import { exhibitions } from "../data/exhibitions";
import type { Exhibition, ExhibitionItem } from "../types/Exhibition";

export interface ExhibitionLookupResult {
  museum: Exhibition;
  exhibition: ExhibitionItem;
}

// Normalize a free-form id/name into a comparable token. Mirror the rule
// HomePage's collectionIndex uses so the same slugs resolve in both places.
const normalizeToken = (value?: string) => (value || "")
  .toLowerCase()
  .normalize("NFD")
  .replace(/[^a-z0-9]+/g, "");

const collectExhibitionTokens = (entry?: ExhibitionItem | null): Set<string> => {
  const tokens = new Set<string>();
  if (!entry) return tokens;
  const addToken = (value?: string | null) => {
    const token = normalizeToken(value || "");
    if (token) tokens.add(token);
  };
  addToken(entry.id as string);
  addToken((entry as any)?.slug);
  addToken((entry as any)?.collectionId);
  addToken(entry.name as string);
  addToken(entry.title as string);
  const file = (entry as any)?.collectionFile;
  if (typeof file === "string") addToken(file.replace(/\.json$/i, ""));
  const aliases = (entry as any)?.aliases;
  if (Array.isArray(aliases)) aliases.forEach((alias) => addToken(alias));
  return tokens;
};

// Lazy index — first lookup pays O(N) construction, subsequent lookups are
// O(1). Built once per module-load; exhibitions.ts is itself a static import
// so the data doesn't change at runtime.
let indexCache: Map<string, ExhibitionLookupResult> | null = null;

const buildIndex = (): Map<string, ExhibitionLookupResult> => {
  const map = new Map<string, ExhibitionLookupResult>();
  const register = (museum: Exhibition, entry?: ExhibitionItem) => {
    if (!entry) return;
    const tokens = collectExhibitionTokens(entry);
    tokens.forEach((token) => {
      if (!map.has(token)) {
        map.set(token, { museum, exhibition: entry });
      }
    });
  };
  exhibitions.forEach((ex) => {
    (ex.permanentExhibitions || []).forEach((entry) => register(ex, entry));
    (ex.temporaryExhibitions || []).forEach((entry) => register(ex, entry));
    ((ex as any).pastExhibitions || []).forEach((entry: ExhibitionItem) =>
      register(ex, entry),
    );
  });
  return map;
};

export function findExhibitionByCollectionSlug(
  slug?: string | null,
): ExhibitionLookupResult | null {
  if (!slug) return null;
  const token = normalizeToken(slug);
  if (!token) return null;
  if (!indexCache) indexCache = buildIndex();
  return indexCache.get(token) ?? null;
}
