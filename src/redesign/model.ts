export const PREVIEW_CONCEPTS = ["hybrid", "dark", "light"] as const;
export const PREVIEW_VIEWS = [
  "home",
  "search",
  "ai",
  "community",
  "exhibitions",
  "profile",
  "work",
  "artist",
  "exhibition",
] as const;

export type PreviewConcept = (typeof PREVIEW_CONCEPTS)[number];
export type PreviewView = (typeof PREVIEW_VIEWS)[number];

export type PreviewRoute = {
  concept: PreviewConcept;
  view: PreviewView;
  id?: string;
};

export const EVOLVED_PANELS = ["globe", "community", "ai", "profile", "search", "work"] as const;
export type EvolvedPanel = (typeof EVOLVED_PANELS)[number];
export type EvolvedRoute = { panel: EvolvedPanel; id?: string };

function includesValue<T extends string>(values: readonly T[], value: string): value is T {
  return values.includes(value as T);
}

function decodePathSegment(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function isPreviewPath(pathname: string): boolean {
  return pathname === "/redesign" || pathname.startsWith("/redesign/");
}

export function parsePreviewPath(pathname: string): PreviewRoute | null {
  const [prefix, concept, view, encodedId] = pathname.split("/").filter(Boolean);
  if (prefix !== "redesign" || !concept || !view) return null;
  if (!includesValue(PREVIEW_CONCEPTS, concept) || !includesValue(PREVIEW_VIEWS, view)) return null;

  return {
    concept,
    view,
    ...(encodedId ? { id: decodePathSegment(encodedId) } : {}),
  };
}

export function buildPreviewPath(
  concept: PreviewConcept,
  view: PreviewView,
  id?: string,
): string {
  const base = `/redesign/${concept}/${view}`;
  return id ? `${base}/${encodeURIComponent(id)}` : base;
}

export function buildExhibitionModalPath(
  concept: PreviewConcept,
  view: PreviewView,
  exhibitionId: string,
): string {
  return `${buildPreviewPath(concept, view)}?exhibition=${encodeURIComponent(exhibitionId)}`;
}

export function parseEvolvedPath(pathname: string): EvolvedRoute | null {
  const [redesign, evolved, panel = "globe", encodedId] = pathname.split("/").filter(Boolean);
  if (redesign !== "redesign" || evolved !== "evolved" || !includesValue(EVOLVED_PANELS, panel)) {
    return null;
  }
  return { panel, ...(encodedId ? { id: decodePathSegment(encodedId) } : {}) };
}

export function buildEvolvedPath(panel: EvolvedPanel, id?: string): string {
  const base = `/redesign/evolved/${panel}`;
  return id ? `${base}/${encodeURIComponent(id)}` : base;
}
