// MuseumOverlay — full-screen overlay that previews a museum's permanent
// collection without leaving the current route. Triggered from museum-name
// buttons inside WeeklyCurationTab work cards.
//
// Stays in the same route on purpose: preserves scroll position on the
// curation page, no history pollution, lighter render than route-level
// navigation. Esc / backdrop click → onClose.

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { pickImageUrl, type MaybeArtwork } from '../lib/artwork-image';

export interface MuseumOverlayProps {
  open: boolean;
  collectionId: string | null;   // e.g. "staedel-museum-collection"
  onClose: () => void;
}

interface Artwork extends MaybeArtwork {
  id?: string | number;
  title?: string;
  artist?: string;
  date?: string;
  sourceUrl?: string;
}

// Slug → display name. "staedel-museum-collection" → "Staedel Museum".
// 2-3 letter tokens get uppercased (AIC, NMWA, SMK, VAM); longer tokens
// are title-cased. Trailing "-collection" / "-paintings" / "-prints"
// suffixes are stripped because they're scrape-source noise, not part
// of the museum name.
export function prettifyMuseumName(slug: string): string {
  return slug
    .replace(/-collection$/, '')
    .replace(/-paintings$/, '')
    .replace(/-prints$/, '')
    .split('-')
    .map((w) => (w.length <= 3 ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1)))
    .join(' ');
}

const MAX_WORKS = 60;

export default function MuseumOverlay({ open, collectionId, onClose }: MuseumOverlayProps) {
  const [works, setWorks] = useState<Artwork[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  // Fetch collection JSON when overlay opens for a new id. Filter to records
  // that have a usable image URL — same heuristic as the Node-side indexer.
  useEffect(() => {
    if (!open || !collectionId) return;
    let cancelled = false;
    setLoading(true);
    setError(false);
    setWorks(null);

    fetch(`/data/${collectionId}.json`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (cancelled) return;
        const rows: Artwork[] = Array.isArray(data) ? data : [];
        const withImages = rows.filter((r) => !!pickImageUrl(r));
        setWorks(withImages.slice(0, MAX_WORKS));
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setError(true);
        setLoading(false);
      });

    return () => { cancelled = true; };
  }, [open, collectionId]);

  // Esc closes. Bound only while open so Esc still works for other overlays
  // when this is hidden.
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open || !collectionId) return null;

  const museumName = prettifyMuseumName(collectionId);

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 9500,
        background: 'rgba(0,0,0,0.85)',
        backdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '4vh 4vw',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 1100, maxHeight: '92vh',
          background: '#0c0c0a',
          border: '1px solid rgba(255,255,255,0.08)',
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '18px 24px', borderBottom: '1px solid rgba(255,255,255,0.07)',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, minWidth: 0 }}>
            <h2 style={{
              margin: 0,
              fontFamily: "'Inter', 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif",
              fontWeight: 700,
              fontSize: 20,
              color: 'rgba(244,241,234,0.96)',
              letterSpacing: '-0.01em',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>
              {museumName}
            </h2>
            {works && (
              <span style={{
                fontFamily: "'Space Mono', monospace",
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.12em',
                fontSize: 10,
                color: 'rgba(244,241,234,0.55)',
                flexShrink: 0,
              }}>
                {works.length} works
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="Close museum overlay"
            style={{
              background: 'transparent',
              border: '1px solid rgba(255,255,255,0.12)',
              width: 34, height: 34,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'rgba(244,241,234,0.7)',
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            <X size={15} color="currentColor" />
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
          {loading && (
            <div style={{
              textAlign: 'center', padding: '60px 0',
              color: 'rgba(244,241,234,0.4)',
              fontFamily: "'Space Mono', monospace",
              fontSize: 11,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
            }}>
              Loading collection…
            </div>
          )}
          {error && (
            <div style={{
              textAlign: 'center', padding: '60px 0',
              color: 'rgba(244,241,234,0.4)',
              fontFamily: "'Space Mono', monospace",
              fontSize: 11,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
            }}>
              Collection not available.
            </div>
          )}
          {works && works.length === 0 && !loading && !error && (
            <div style={{
              textAlign: 'center', padding: '60px 0',
              color: 'rgba(244,241,234,0.4)',
              fontFamily: "'Space Mono', monospace",
              fontSize: 11,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
            }}>
              No works with images in this collection.
            </div>
          )}
          {works && works.length > 0 && (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(min(180px, 100%), 1fr))',
              gap: 14,
            }}>
              {works.map((w, i) => {
                const img = pickImageUrl(w)!;
                const key = `${w.id ?? i}-${i}`;
                return (
                  <ArtworkThumb key={key} work={w} imageUrl={img} />
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ArtworkThumb({ work, imageUrl }: { work: Artwork; imageUrl: string }) {
  const [hov, setHov] = useState(false);
  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        position: 'relative',
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.06)',
        overflow: 'hidden',
      }}
    >
      <div style={{ position: 'relative', width: '100%', aspectRatio: '1 / 1', background: '#0a0a09' }}>
        <img
          src={imageUrl}
          alt={work.title ? `${work.artist ?? ''} — ${work.title}` : 'Artwork'}
          loading="lazy"
          style={{
            position: 'absolute', inset: 0,
            width: '100%', height: '100%',
            objectFit: 'cover', display: 'block',
            transition: 'transform 0.28s',
            transform: hov ? 'scale(1.04)' : 'scale(1)',
          }}
          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
        />
      </div>
      <div style={{ padding: '8px 10px 10px' }}>
        <div style={{
          fontFamily: "'Inter', 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif",
          fontWeight: 500,
          fontSize: 12,
          color: 'rgba(244,241,234,0.88)',
          lineHeight: 1.3,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {work.title ?? '(untitled)'}
        </div>
        <div style={{
          fontFamily: "'Space Mono', monospace",
          fontSize: 9,
          color: 'rgba(244,241,234,0.5)',
          letterSpacing: '0.06em',
          marginTop: 3,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {work.artist ?? ''}{work.date ? ` · ${work.date}` : ''}
        </div>
      </div>
    </div>
  );
}
