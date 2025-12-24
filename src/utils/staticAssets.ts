/**
 * Resolve static asset URLs
 * 
 * Large files (>25MB) are served from R2 instead of Pages
 * This utility provides the correct URL for each asset
 */
import r2Assets from '../config/r2-assets.json';

const R2_ASSET_MAP: Record<string, string> = r2Assets;

/**
 * Resolve a static asset URL
 * Returns R2 URL for large files, or original path for small files
 */
export function resolveStaticUrl(path: string): string {
  // Normalize path to start with /
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  
  // Check if this asset should be loaded from R2
  if (R2_ASSET_MAP[normalizedPath]) {
    return R2_ASSET_MAP[normalizedPath];
  }
  
  // Return original path (will be served from Pages)
  return normalizedPath;
}

/**
 * Check if a path is served from R2
 */
export function isR2Asset(path: string): boolean {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return !!R2_ASSET_MAP[normalizedPath];
}
