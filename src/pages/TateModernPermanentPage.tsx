import React, { useEffect, useState, useMemo } from 'react';
import { getDataFetchOptions } from '../utils/network';

// Lightweight type for the scraped Tate artwork JSON structure
interface TateArtworkItem {
  id: string; // full URL
  url: string;
  title: string;
  artist: string;
  dateText: string;
  medium: string;
  dimensions: string;
  credit: string;
  accession: string;
  image: string; // local path after mirroring
  thumb: string; // local path after mirroring
  tags?: string[];
}
interface TateArtworksData {
  scrapedAt: string;
  source: string;
  total: number;
  items: TateArtworkItem[];
}

// Simple card component
const ArtworkCard: React.FC<{ item: TateArtworkItem }> = ({ item }) => {
  return (
    <div className="tate-art-card" style={{
      display: 'flex',
      flexDirection: 'column',
      border: '1px solid #e5e7eb',
      borderRadius: 8,
      padding: 12,
      gap: 8,
      background: '#fff',
      boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
    }}>
      <div style={{ position: 'relative', width: '100%', paddingBottom: '66%', overflow: 'hidden', borderRadius: 4, background: '#f5f5f5' }}>
        {item.image && (
          <img
            src={item.thumb || item.image}
            loading="lazy"
            decoding="async"
            alt={item.title}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = 'hidden'; }}
          />
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600, lineHeight: 1.3 }}>{item.title}</h3>
        <p style={{ margin: 0, fontSize: 12, color: '#374151' }}>{item.artist}</p>
        {item.dateText && <p style={{ margin: 0, fontSize: 11, color: '#6b7280' }}>{item.dateText}</p>}
        {item.medium && <p style={{ margin: 0, fontSize: 11, color: '#6b7280' }}>{item.medium}</p>}
        {item.dimensions && <p style={{ margin: 0, fontSize: 11, color: '#6b7280' }}>{item.dimensions}</p>}
        <div style={{ marginTop: 'auto', display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {item.tags?.slice(0, 4).map(tag => (
            <span key={tag} style={{ fontSize: 10, background: '#eef2ff', color: '#3730a3', padding: '2px 6px', borderRadius: 12 }}>{tag}</span>
          ))}
        </div>
      </div>
      <a
        href={item.url}
        target="_blank"
        rel="noopener noreferrer"
        style={{ fontSize: 10, textDecoration: 'none', color: '#2563eb', marginTop: 4 }}
      >Detail ↗</a>
    </div>
  );
};

const TateModernPermanentPage: React.FC = () => {
  const [data, setData] = useState<TateArtworksData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [artistFilter, setArtistFilter] = useState('');
  const [tagFilter, setTagFilter] = useState('');

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        const res = await fetch('/data/tate-artworks.json', getDataFetchOptions());
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json: TateArtworksData = await res.json();
        if (alive) setData(json);
      } catch (e: any) {
        if (alive) setError(e.message || 'Failed to load');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const artists = useMemo(() => {
    if (!data) return [];
    const s = new Set<string>();
    data.items.forEach(it => { if (it.artist) s.add(it.artist); });
    return Array.from(s).sort((a, b) => a.localeCompare(b));
  }, [data]);

  const tags = useMemo(() => {
    if (!data) return [];
    const s = new Set<string>();
    data.items.forEach(it => (it.tags || []).forEach(t => s.add(t)));
    return Array.from(s).sort((a, b) => a.localeCompare(b));
  }, [data]);

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    return data.items.filter(it => {
      if (artistFilter && it.artist !== artistFilter) return false;
      if (tagFilter && !(it.tags || []).includes(tagFilter)) return false;
      if (!q) return true;
      return (
        it.title.toLowerCase().includes(q) ||
        it.artist.toLowerCase().includes(q) ||
        (it.medium || '').toLowerCase().includes(q) ||
        (it.dateText || '').toLowerCase().includes(q)
      );
    });
  }, [data, query, artistFilter, tagFilter]);

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1400, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 24 }}>
      <header style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <h1 style={{ margin: 0, fontSize: 28, fontWeight: 700 }}>Tate Modern Permanent Collection</h1>
        <p style={{ margin: 0, fontSize: 14, color: '#4b5563' }}>
          Scraped snapshot of Tate Modern artworks (local archive). Search & filter below. Source: tate.org.uk
          {data && <span style={{ marginLeft: 8, fontSize: 12, color: '#6b7280' }}>({data.total} items, scraped {new Date(data.scrapedAt).toLocaleDateString()})</span>}
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
          <input
            placeholder="Search title / artist / medium / date"
            value={query}
            onChange={e => setQuery(e.target.value)}
            style={{ flex: '1 1 280px', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13 }}
          />
          <select
            value={artistFilter}
            onChange={e => setArtistFilter(e.target.value)}
            style={{ padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13 }}
          >
            <option value="">All Artists</option>
            {artists.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
          <select
            value={tagFilter}
            onChange={e => setTagFilter(e.target.value)}
            style={{ padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13 }}
          >
            <option value="">All Tags</option>
            {tags.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          {(artistFilter || tagFilter || query) && (
            <button
              onClick={() => { setArtistFilter(''); setTagFilter(''); setQuery(''); }}
              style={{ padding: '8px 14px', background: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}
            >Reset</button>
          )}
        </div>
      </header>

      {loading && <div style={{ fontSize: 14 }}>Loading artworks…</div>}
      {error && <div style={{ color: '#b91c1c', fontSize: 14 }}>Error: {error}</div>}

      {!loading && !error && (
        <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}>
          {filtered.map(item => <ArtworkCard key={item.id} item={item} />)}
        </div>
      )}

      {!loading && !error && filtered.length === 0 && (
        <div style={{ fontSize: 14, color: '#6b7280' }}>No artworks match your filters.</div>
      )}
    </div>
  );
};

export default TateModernPermanentPage;
