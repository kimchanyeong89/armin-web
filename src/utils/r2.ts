/**
 * R2 Storage Utilities
 * 
 * Cloudflare R2 public URL helper functions
 */

// R2 public bucket URL
export const R2_PUBLIC_URL = 'https://pub-6ce5ae60b244951ac36ffd277fd6ef76.r2.dev';

// Get full R2 URL for an image path
export function getR2Url(path: string): string {
  if (!path) return '';
  
  // Already a full URL
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }
  
  // Remove leading slash if present
  const cleanPath = path.startsWith('/') ? path.slice(1) : path;
  
  return `${R2_PUBLIC_URL}/${cleanPath}`;
}

// Convert Firebase Storage URL to R2 URL
export function firebaseToR2Url(firebaseUrl: string): string {
  if (!firebaseUrl) return '';
  
  // Check if it's a Firebase Storage URL
  if (firebaseUrl.includes('firebasestorage.googleapis.com') || 
      firebaseUrl.includes('storage.googleapis.com')) {
    
    // Extract the path from Firebase URL
    // Format: https://storage.googleapis.com/bucket-name/path/to/file
    // or: https://firebasestorage.googleapis.com/v0/b/bucket/o/path?...
    
    try {
      const url = new URL(firebaseUrl);
      let path = '';
      
      if (url.hostname === 'storage.googleapis.com') {
        // https://storage.googleapis.com/armin-web/images/...
        const parts = url.pathname.split('/').filter(Boolean);
        if (parts.length > 1) {
          path = parts.slice(1).join('/'); // Remove bucket name
        }
      } else if (url.hostname === 'firebasestorage.googleapis.com') {
        // https://firebasestorage.googleapis.com/v0/b/bucket/o/path%2Fto%2Ffile?...
        const match = url.pathname.match(/\/o\/(.+?)(\?|$)/);
        if (match) {
          path = decodeURIComponent(match[1]);
        }
      }
      
      if (path) {
        return `${R2_PUBLIC_URL}/armin-web/${path}`;
      }
    } catch (e) {
      console.warn('Failed to parse Firebase URL:', firebaseUrl);
    }
  }
  
  // Return original if not a Firebase URL
  return firebaseUrl;
}

// Check if URL is from R2
export function isR2Url(url: string): boolean {
  return url?.includes('r2.dev') || url?.includes('r2.cloudflarestorage.com');
}
