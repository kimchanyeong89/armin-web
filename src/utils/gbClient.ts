// Centralized GeoBoundaries client with Vite proxy URL rewrites
export type GBLevel = 'ADM2' | 'ADM1';

const pickDownloadUrl = (info: any): string | null => {
  const pick = Array.isArray(info) ? (info[0] || null) : info;
  const dl: string | null = pick?.gjDownloadURL || pick?.gjDownloadURLz || null;
  if (!dl) return null;
  if (dl.includes('www.geoboundaries.org')) return dl.replace('https://www.geoboundaries.org', '/geoboundaries');
  if (dl.includes('https://github.com/wmgeolab/geoBoundaries/raw')) return dl.replace('https://github.com/wmgeolab/geoBoundaries/raw', '/ghraw/wmgeolab/geoBoundaries');
  if (dl.includes('https://raw.githubusercontent.com/')) return dl.replace('https://raw.githubusercontent.com', '/ghraw');
  return dl;
};

export async function fetchGB(iso3: string, level: GBLevel): Promise<any[] | null> {
  try {
    const metaUrl = `/geoboundaries/api/current/gbOpen/${encodeURIComponent(iso3)}/${level}`;
    const res = await fetch(metaUrl, { mode: 'cors' }).catch(() => null);
    if (!res || !res.ok) return null;
    const info = await res.json().catch(() => null);
    const dl = pickDownloadUrl(info);
    if (!dl) return null;
    const gj = await fetch(dl, { mode: 'cors' }).catch(() => null);
    if (!gj || !gj.ok) return null;
    const data = await gj.json().catch(() => null);
    const feats = (data && data.features) ? data.features : [];
    return Array.isArray(feats) ? feats : null;
  } catch {
    return null;
  }
}

export async function localFallbackADM1(iso3: string): Promise<any[] | null> {
  try {
    let raw: any = null;
    try {
      const r1 = await fetch('/geodata/admin1-states-10m.json');
      if (r1 && r1.ok) raw = await r1.json();
    } catch {}
    if (!raw) {
      try {
        const r2 = await fetch('/atlas/ne_50m_admin_1_states_provinces.geojson');
        if (r2 && r2.ok) raw = await r2.json();
      } catch {}
    }
    if (!raw) return null;
    const pickISO = (p: any) => p?.adm0_a3 || p?.ADM0_A3 || p?.iso_a3 || p?.ISO_A3 || null;
    const arr = raw?.features || [];
    return (Array.isArray(arr) ? arr.filter((f: any) => (pickISO(f?.properties) || '').toUpperCase() === iso3.toUpperCase()) : []) || [];
  } catch { return null; }
}
