import { GOOGLE_MAPS_API_KEY } from "../config/google";

// Build a public Places Photos API URL without server-side proxy.
// Note: Places Photo URLs should not be rehosted; we link directly.
export function buildPlacePhotoUrl(photoReference: string, maxWidth = 1600) {
  const params = new URLSearchParams({
    photoreference: photoReference,
    maxwidth: String(maxWidth),
    key: GOOGLE_MAPS_API_KEY,
  });
  return `https://maps.googleapis.com/maps/api/place/photo?${params.toString()}`;
}
