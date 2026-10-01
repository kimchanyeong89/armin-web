/**
 * Where the visitor is, asked once. The app asks on its first visit (App),
 * keeps the answer, and every screen reads the kept position - nothing asks
 * again. Declining is fine: the exhibitions are in and around Seoul, so the
 * lists simply go without distances.
 */
const KEY = "colly:location";
const ASKED = "colly:location-asked";

export interface Position { lat: number; lng: number }

export function savedLocation(): Position | null {
  try {
    const kept = JSON.parse(localStorage.getItem(KEY) || "null");
    return kept && Number.isFinite(kept.lat) && Number.isFinite(kept.lng) ? { lat: kept.lat, lng: kept.lng } : null;
  } catch {
    return null;
  }
}

/** Asks for the position on the first visit only; later visits refresh a granted one quietly. */
export function askLocationOnce(): void {
  if (typeof navigator === "undefined" || !navigator.geolocation) return;
  let asked = false;
  try { asked = localStorage.getItem(ASKED) === "1"; } catch { /* storage blocked: ask, but only this once per load */ }
  /* after a "no", never ask again; after a "yes", refresh it (the browser does not prompt again) */
  if (asked && !savedLocation()) return;
  try { localStorage.setItem(ASKED, "1"); } catch { /* nothing to keep */ }
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      try {
        localStorage.setItem(KEY, JSON.stringify({ lat: pos.coords.latitude, lng: pos.coords.longitude, at: Date.now() }));
        window.dispatchEvent(new Event("colly:location"));
      } catch { /* nothing to keep */ }
    },
    () => { /* declined or unavailable: the lists go without distances */ },
    { enableHighAccuracy: false, timeout: 10000, maximumAge: 30 * 60 * 1000 },
  );
}
