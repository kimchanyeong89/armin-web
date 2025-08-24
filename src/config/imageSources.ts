// Optional remote image sources and attribution metadata.
// Toggle preferRemoteImages to true to load images from remote (e.g., Wikimedia Commons) instead of local.
// Local-only mode: prefer local representativeImage assets in /public/images
export const preferRemoteImages = false;

type ImageMeta = {
  url: string;
  attributionText: string;
  attributionUrl: string;
};

// Mapped by exhibition slug. When slug is missing, we can map by name via nameMap below.
export const remoteImageBySlug: Record<string, ImageMeta> = {};

// Optional: name-based mapping fallback (e.g., when a legacy data item has no slug).
export const nameToSlugFallback: Record<string, string> = {
  "TATE Modern": "tate-modern"
};
