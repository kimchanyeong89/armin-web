import { placeIdBySlug } from "../config/places";

type PhotoChoice = { url: string; attributionText?: string; attributionUrl?: string } | null;

// Attempts to get a Places photo URL for a venue (building/exterior pref preferred when available via keywords)
export async function getPlacePhotoForSlug(slug?: string): Promise<PhotoChoice> {
  if (!slug) return null;
  const placeId = placeIdBySlug[slug];
  if (!placeId) return null;
  // Ensure google.maps is loaded (Maps JS API) with Places library
  const g = (window as any).google;
  if (!g?.maps?.places) {
    try { await g.maps.importLibrary('places'); } catch { return null; }
  }
  const service = new g.maps.places.PlacesService(document.createElement('div'));
  return new Promise<PhotoChoice>((resolve) => {
    service.getDetails({ placeId, fields: ['photos', 'url', 'name'] }, (place: any, status: any) => {
      if (status !== g.maps.places.PlacesServiceStatus.OK || !place?.photos?.length) {
        resolve(null);
        return;
      }
      // Prefer wider landscape photos (building/exterior often landscape)
      const sorted = [...place.photos].sort((a, b) => (b.width - a.width));
      const picked = sorted.find((p) => (p.height <= p.width)) || sorted[0];
      try {
        const url = picked.getUrl({ maxWidth: 1600 });
        // Google delivers attribution within the image; we can optionally add name as context
        resolve({ url });
      } catch {
        resolve(null);
      }
    });
  });
}
