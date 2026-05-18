import React, { Suspense, useMemo, useState } from 'react';
import type { Exhibition, ExhibitionItem } from '../types/Exhibition';

const ExhibitionModal = React.lazy(() => import('./ExhibitionModal'));

interface Props {
  museum: Exhibition;
  onClose: () => void;
}

type ExhibitionWithType = ExhibitionItem & { type: 'PERMANENT' | 'TEMPORARY' };

/** Pick the best available thumbnail for an exhibition card:
 *  1. ex.image (explicitly set on the exhibition object)
 *  2. First image from ex.artworks[]
 *  3. museum.representativeImage as last resort
 */
function resolveExhibitionThumbnail(ex: ExhibitionWithType, museumRepImg?: string): string {
  if (ex.image) return ex.image;
  const artworks = (ex as any).artworks;
  if (Array.isArray(artworks)) {
    for (const art of artworks) {
      const img = art?.image || art?.imageUrl || art?.i || art?.thumbnail?.url || art?.thumbnail?.src || art?.thumbnail;
      if (img && typeof img === 'string' && img.trim()) return img.trim();
    }
  }
  return museumRepImg || '';
}

export default function DrawingMapModal({ museum, onClose }: Props) {
  const [activeItem, setActiveItem] = useState<ExhibitionWithType | null>(null);
  const [isSwitcherOpen, setIsSwitcherOpen] = useState(false);
  const [search, setSearch] = useState('');

  const allExhibitions = useMemo<ExhibitionWithType[]>(() => [
    ...(museum.permanentExhibitions || []).map((e) => ({ ...e, type: 'PERMANENT' as const })),
    ...(museum.temporaryExhibitions || []).map((e) => ({ ...e, type: 'TEMPORARY' as const }))
  ], [museum.permanentExhibitions, museum.temporaryExhibitions]);

  const filteredExhibitions = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return allExhibitions;
    return allExhibitions.filter((ex) => {
      const title = (ex.title || ex.name || '').toLowerCase();
      const desc = (ex.description || '').toLowerCase();
      return title.includes(q) || desc.includes(q);
    });
  }, [allExhibitions, search]);

  const openExhibition = (item: ExhibitionWithType) => {
    setActiveItem(item);
    setIsSwitcherOpen(false);
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 13000,
      background: 'rgba(243, 241, 236, 0.7)',
      backdropFilter: 'blur(5px)',
      padding: 10
    }}>
      <style>{`
        .dm-shell {
          --paper: #f8f6f2;
          --ink: #1f2328;
          --muted: #68655d;
          --line: #d8d3ca;
          --line-strong: #a8a295;
          width: 100%;
          height: 100%;
          border: 2px solid var(--line-strong);
          border-radius: 16px;
          overflow: hidden;
          position: relative;
          display: flex;
          flex-direction: column;
          background: radial-gradient(circle at 18% 16%, rgba(255,255,255,0.72), rgba(248,246,242,0.98) 42%), var(--paper);
          color: var(--ink);
          font-family: "IBM Plex Sans", "Segoe UI", sans-serif;
          box-shadow: 0 14px 44px rgba(0, 0, 0, 0.13);
        }

        .dm-shell::before {
          content: "";
          position: absolute;
          inset: 0;
          pointer-events: none;
          opacity: 0.22;
          background-image: radial-gradient(rgba(31,35,40,0.05) 0.8px, transparent 0.8px);
          background-size: 3px 3px;
        }

        .dm-header {
          position: relative;
          z-index: 3;
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 12px;
          padding: 14px 18px;
          border-bottom: 2px dashed var(--line);
          background: rgba(248,246,242,0.94);
        }

        .dm-header-actions {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }

        .dm-btn {
          height: 34px;
          border: 1.5px solid var(--line-strong);
          border-radius: 999px;
          padding: 0 14px;
          background: rgba(255,255,255,0.84);
          color: var(--ink);
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0.05em;
          text-transform: uppercase;
          display: inline-flex;
          align-items: center;
          cursor: pointer;
          transition: transform 0.15s ease, background 0.15s ease;
        }

        .dm-btn:hover {
          transform: translateY(-1px);
          background: #fff;
        }

        .dm-title {
          margin: 8px 0 0;
          font-family: "Iowan Old Style", "Georgia", serif;
          font-size: clamp(30px, 4vw, 52px);
          line-height: 1.03;
          letter-spacing: -0.02em;
        }

        .dm-meta {
          margin: 5px 0 0;
          color: var(--muted);
          font-size: 12px;
          font-weight: 600;
          letter-spacing: 0.05em;
          text-transform: uppercase;
        }

        .dm-main {
          position: relative;
          flex: 1;
          min-height: 0;
          overflow: hidden;
        }

        .dm-grid {
          height: 100%;
          overflow: auto;
          padding: 16px 18px 20px;
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
          gap: 12px;
        }

        .dm-card {
          border: 1.5px solid var(--line);
          border-radius: 12px;
          background: rgba(255,255,255,0.84);
          overflow: hidden;
          cursor: pointer;
          display: flex;
          flex-direction: column;
          min-height: 250px;
          transition: transform 0.16s ease, box-shadow 0.16s ease, border-color 0.16s ease;
        }

        .dm-card:hover {
          transform: translateY(-2px);
          border-color: var(--line-strong);
          box-shadow: 0 8px 20px rgba(0,0,0,0.09);
        }

        .dm-card-image {
          width: 100%;
          aspect-ratio: 4 / 3;
          object-fit: cover;
          background: #ece8e0;
        }

        .dm-card-body {
          padding: 11px;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .dm-tag {
          display: inline-flex;
          align-items: center;
          border: 1px solid var(--line-strong);
          border-radius: 999px;
          height: 21px;
          width: fit-content;
          padding: 0 8px;
          font-size: 11px;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          color: var(--muted);
          background: rgba(248,246,242,0.85);
          font-weight: 700;
        }

        .dm-card-title {
          margin: 0;
          font-family: "Iowan Old Style", "Georgia", serif;
          font-size: 20px;
          line-height: 1.2;
        }

        .dm-card-sub {
          margin: 0;
          color: var(--muted);
          font-size: 12px;
          font-weight: 600;
        }

        .dm-empty {
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          text-align: center;
          color: var(--muted);
          font-size: 14px;
          padding: 24px;
        }

        .dm-detail {
          height: 100%;
          min-height: 0;
          position: relative;
          overflow: hidden;
        }

        .dm-inline-wrap {
          height: 100%;
          overflow: auto;
          padding: 8px;
        }

        .dm-switch-fab {
          position: absolute;
          top: 10px;
          left: 10px;
          z-index: 8;
        }

        .dm-switcher {
          position: absolute;
          top: 52px;
          left: 10px;
          width: min(320px, calc(100% - 20px));
          max-height: calc(100% - 62px);
          border: 1.5px solid var(--line-strong);
          border-radius: 11px;
          background: rgba(249, 247, 243, 0.98);
          box-shadow: 0 10px 24px rgba(0,0,0,0.14);
          z-index: 9;
          display: flex;
          flex-direction: column;
        }

        .dm-switcher-head {
          padding: 9px;
          border-bottom: 1px solid var(--line);
        }

        .dm-input {
          width: 100%;
          height: 34px;
          border: 1.5px solid var(--line);
          border-radius: 8px;
          padding: 0 10px;
          background: #fff;
          outline: none;
          font-size: 13px;
        }

        .dm-input:focus {
          border-color: var(--line-strong);
        }

        .dm-switcher-list {
          overflow: auto;
          padding: 8px;
          display: flex;
          flex-direction: column;
          gap: 7px;
        }

        .dm-switch-item {
          border: 1px solid var(--line);
          border-radius: 8px;
          background: #fff;
          padding: 7px;
          display: flex;
          align-items: center;
          gap: 9px;
          cursor: pointer;
        }

        .dm-switch-item[data-active="true"] {
          border-color: var(--line-strong);
          background: #f3efe8;
        }

        .dm-switch-thumb {
          width: 52px;
          height: 38px;
          border-radius: 6px;
          object-fit: cover;
          background: #ece8e0;
          flex-shrink: 0;
        }

        .dm-switch-title {
          margin: 0;
          font-size: 12px;
          line-height: 1.2;
          font-weight: 700;
        }

        .dm-switch-sub {
          margin: 2px 0 0;
          color: var(--muted);
          font-size: 10px;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }

        .sketch-modal-theme {
          background: transparent !important;
        }

        .sketch-modal-theme img {
          border-radius: 6px;
        }

        @media (max-width: 900px) {
          .dm-header {
            padding: 12px;
          }

          .dm-grid {
            padding: 12px;
            grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
            gap: 10px;
          }

          .dm-card-title {
            font-size: 17px;
          }
        }

        @media (max-width: 640px) {
          .dm-inline-wrap {
            padding: 5px;
          }

          .dm-switch-fab {
            top: auto;
            bottom: 10px;
          }

          .dm-switcher {
            top: auto;
            bottom: 50px;
          }
        }

        ::-webkit-scrollbar {
          width: 7px;
          height: 7px;
        }

        ::-webkit-scrollbar-thumb {
          background: #c4beb3;
          border-radius: 99px;
        }

        ::-webkit-scrollbar-track {
          background: transparent;
        }
      `}</style>

      <div className="dm-shell">
        <header className="dm-header">
          <div>
            <div className="dm-header-actions">
              <button onClick={onClose} className="dm-btn">Back To Map</button>
              {activeItem && (
                <button onClick={() => setActiveItem(null)} className="dm-btn">All Exhibitions</button>
              )}
            </div>

            <h1 className="dm-title">{museum.name}</h1>
            <p className="dm-meta">
              {allExhibitions.length} exhibitions · {museum.location || 'global collection'}
            </p>
          </div>

          {!activeItem && museum.description && (
            <p style={{
              margin: 0,
              maxWidth: 460,
              color: '#636259',
              fontSize: 13,
              lineHeight: 1.55
            }}>
              {museum.description.length > 220 ? `${museum.description.slice(0, 220)}...` : museum.description}
            </p>
          )}
        </header>

        <main className="dm-main">
          {!activeItem && (
            <section className="dm-grid">
              {filteredExhibitions.map((ex, idx) => {
                const thumb = resolveExhibitionThumbnail(ex, museum.representativeImage);
                return (
                  <article key={ex.id + idx} className="dm-card" onClick={() => openExhibition(ex)}>
                    {thumb ? (
                      <img
                        src={thumb}
                        alt={ex.title || ex.name}
                        className="dm-card-image"
                        onError={(e) => {
                          // Try to chain to next fallback on error
                          const repImg = museum.representativeImage;
                          if (e.currentTarget.src !== repImg && repImg) {
                            e.currentTarget.src = repImg;
                          } else {
                            e.currentTarget.style.display = 'none';
                          }
                        }}
                      />
                    ) : (
                      <div className="dm-card-image" style={{ display: 'grid', placeItems: 'center', color: '#8a867d', fontWeight: 700, fontSize: 12 }}>
                        No Image
                      </div>
                    )}

                    <div className="dm-card-body">
                      <span className="dm-tag">{ex.type}</span>
                      <h3 className="dm-card-title">{ex.title || ex.name}</h3>
                      <p className="dm-card-sub">{(ex as any).artworks?.length ? `${(ex as any).artworks.length} artworks` : 'Open exhibition details'}</p>
                    </div>
                  </article>
                );
              })}

              {filteredExhibitions.length === 0 && <div className="dm-empty">No exhibitions found.</div>}
            </section>
          )}

          {activeItem && (
            <section className="dm-detail">
              <div className="dm-switch-fab">
                <button className="dm-btn" onClick={() => setIsSwitcherOpen((v) => !v)}>
                  Switch Exhibition ({allExhibitions.length})
                </button>
              </div>

              {isSwitcherOpen && (
                <aside className="dm-switcher">
                  <div className="dm-switcher-head">
                    <input
                      className="dm-input"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Find exhibition"
                    />
                  </div>

                  <div className="dm-switcher-list">
                    {filteredExhibitions.map((ex, idx) => {
                      const isActive = ex.id === activeItem.id;
                      return (
                        <div
                          key={ex.id + idx}
                          className="dm-switch-item"
                          data-active={isActive ? 'true' : 'false'}
                          onClick={() => openExhibition(ex)}
                        >
                          {ex.image ? (
                            <img src={ex.image} alt="" className="dm-switch-thumb" />
                          ) : (
                            <div className="dm-switch-thumb" style={{ display: 'grid', placeItems: 'center', color: '#8a867d', fontSize: 10, fontWeight: 700 }}>
                              NO IMAGE
                            </div>
                          )}

                          <div>
                            <p className="dm-switch-title">{ex.title || ex.name}</p>
                            <p className="dm-switch-sub">{ex.type}</p>
                          </div>
                        </div>
                      );
                    })}

                    {filteredExhibitions.length === 0 && (
                      <div style={{ padding: 12, fontSize: 12, color: '#6b6a62' }}>No matching exhibitions.</div>
                    )}
                  </div>
                </aside>
              )}

              <div className="dm-inline-wrap">
                <Suspense fallback={<div className="dm-empty">Loading exhibition...</div>}>
                  <ExhibitionModal
                    exhibition={activeItem}
                    museumName={museum.name}
                    onClose={() => setActiveItem(null)}
                    inline={true}
                    variant="sketch"
                  />
                </Suspense>
              </div>
            </section>
          )}
        </main>
      </div>
    </div>
  );
}
