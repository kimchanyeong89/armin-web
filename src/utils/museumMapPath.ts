import { exhibitions } from "../data/exhibitions";

/** Keep any script: museum locations are written in their own language
    ("서울, 대한민국"), and an a-z whitelist erased them to nothing. */
function slug(value: string): string {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-|-$/g, "") || "world";
}

/**
 * The map route that opens a museum: /interactive/{country}/{city}/{museumId}
 * resolves to "city selected, museum selected, no exhibition opened".
 * Null when the museum is not in the data.
 */
export function museumMapPath(museumId: string): string | null {
  const museum = (exhibitions as any[]).find((m) => String(m.id) === String(museumId));
  if (!museum) return null;
  // `location` is sometimes a city ("서울, 대한민국") and sometimes a full
  // street address; keep the leading token when it is clearly the latter.
  const head = String(museum.location || "").split(",")[0].trim();
  const parts = head.split(/\s+/);
  const city = parts.length > 2 ? parts[0] : head;
  return `/interactive/${slug(museum.country)}/${slug(city)}/${encodeURIComponent(museumId)}`;
}
