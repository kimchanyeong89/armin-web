// Build a robust URL for assets in Vite public/ that works with BASE_URL and file://
export function publicUrl(p: string) {
  const cleaned = (p || '').replace(/^\//, '');
  try {
    // 1) file:// direct open — resolve relative to document directory
    if (typeof window !== 'undefined' && window.location?.protocol === 'file:') {
      const dir = new URL('.', window.location.href);
      return new URL(cleaned, dir).toString();
    }

    // 2) If a <base href> exists, prefer it
    const baseEl = typeof document !== 'undefined' ? document.querySelector('base') : null;
    if (baseEl?.href) {
      return new URL(cleaned, baseEl.href).toString();
    }

    // 3) Try to infer app root from built script path (e.g., /<subpath>/assets/index-*.js)
    if (typeof document !== 'undefined') {
      const scripts = Array.from(document.scripts || []);
      const entry = scripts
        .map(s => (s as HTMLScriptElement).src)
        .filter(Boolean)
        .find(src => /\/assets\/index-.*\.js(?:\?.*)?$/.test(src));
      if (entry) {
        // Parent of /assets/ is the app root
        const appRoot = new URL('..', new URL('.', entry)).toString();
        return new URL(cleaned, appRoot).toString();
      }
    }

    // 4) Use Vite BASE_URL when set to a non-root value
    const rawBase = (import.meta as any)?.env?.BASE_URL || '/';
    if (rawBase && rawBase !== '/') {
      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      const base = rawBase.startsWith('http') ? rawBase : new URL(rawBase, origin).toString();
      return new URL(cleaned, base).toString();
    }

    // 5) Fallback: resolve against current document location (works for same-folder assets)
    const baseUrl = typeof document !== 'undefined' ? document.baseURI || window.location.href : '';
    return new URL(cleaned, baseUrl).toString();
  } catch {
    // Last resort: return relative path
    return cleaned;
  }
}
