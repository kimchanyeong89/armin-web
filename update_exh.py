import sys
from pathlib import Path

js_code = """import React, { useMemo, useState, Suspense } from "react";
import { useParams, useNavigate } from "react-router-dom";
import type { Exhibition, ExhibitionItem } from "../types/Exhibition";

const ExhibitionModal = React.lazy(() => import("../components/ExhibitionModal"));

type ExhibitionPageProps = {
  exhibitions: Exhibition[];
};

type ExhibitionWithType = ExhibitionItem & { type: "PERMANENT" | "TEMPORARY" };

export default function ExhibitionPage({ exhibitions }: ExhibitionPageProps) {
  const { id } = useParams();
  const navigate = useNavigate();
  const museum = exhibitions.find((e) => e.id === id);

  const [activeItem, setActiveItem] = useState<ExhibitionWithType | null>(null);

  const allExhibitions = useMemo<ExhibitionWithType[]>(() => {
    if (!museum) return [];
    return [
      ...(museum.permanentExhibitions || []).map((e) => ({ ...e, type: "PERMANENT" as const })),
      ...(museum.temporaryExhibitions || []).map((e) => ({ ...e, type: "TEMPORARY" as const }))
    ];
  }, [museum]);

  if (!museum) {
    return <div style={{ padding: 40, fontFamily: 'monospace' }}>Museum not found.</div>;
  }

  return (
    <div style={{
      width: "100%",
      minHeight: "100vh",
      background: "#F4F1EB", // Warm paper color
      boxSizing: "border-box",
      color: "#1C1B1A", // Dark ink
      fontFamily: '"IBM Plex Sans", "Helvetica Neue", sans-serif',
      overflowX: "hidden"
    }}>
      <style>{`
        /* Hand-drawn aesthetic base with subtle noise texture for paper feel */
        .drawing-paper {
          background-image: url('data:image/svg+xml;utf8,<svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg"><filter id="noise"><feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="4" stitchTiles="stitch"/></filter><rect width="100%" height="100%" filter="url(%23noise)" opacity="0.04"/></svg>');
        }

        /* Sketchy UI Elements */
        .sketch-btn {
          background: transparent;
          border: solid #1C1B1A;
          /* Variable border widths for hand-drawn look */
          border-width: 1.5px 2.5px 2px 1.5px; 
          /* 8-point squiggly border radius */
          border-radius: 255px 15px 225px 15px/15px 225px 15px 255px;
          color: #1C1B1A;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.05em;
          padding: 8px 16px;
          cursor: pointer;
          transition: all 0.2s ease;
          text-transform: uppercase;
        }
        .sketch-btn:hover {
          background: #1C1B1A;
          color: #F4F1EB;
          transform: translateY(-2px) rotate(-1deg);
          box-shadow: 3px 3px 0px 0px rgba(28,27,26,0.9);
        }

        /* Sketchy separators */
        .sketch-border-bottom {
          border-bottom: solid #1C1B1A;
          border-width: 0 0 2px 0;
          border-radius: 255px 15px 225px 15px/15px 225px 15px 255px;
        }

        /* Compact, scannable List Row */
        .list-row {
          display: flex;
          align-items: center;
          padding: 16px;
          margin-bottom: 16px;
          background: #FDFAF5;
          border: solid #1C1B1A;
          border-width: 2px 1.5px 2.5px 1.5px;
          border-radius: 15px 255px 15px 225px/225px 15px 255px 15px;
          cursor: pointer;
          transition: all 0.2s;
        }
        .list-row:nth-child(even) {
          border-radius: 255px 15px 225px 15px/15px 225px 15px 255px;
          border-width: 1.5px 2px 1.5px 2px;
        }
        .list-row:hover {
          transform: translateX(4px) translateY(-2px) rotate(0.5deg);
          box-shadow: 4px 5px 0px #1C1B1A;
          background: #fff;
        }

        /* Sketchy image thumbnails */
        .row-thumb {
          width: 80px;
          height: 80px;
          object-fit: cover;
          border: 1.5px solid #1C1B1A;
          border-radius: 255px 25px 225px 15px/15px 225px 25px 255px;
          background: #E5E1D8;
        }

        /* Handwritten Tag Badges */
        .tag-badge {
          display: inline-block;
          border: 1.5px solid #1C1B1A;
          border-radius: 255px 15px 225px 15px/15px 225px 15px 255px;
          padding: 4px 10px;
          font-size: 10px;
          font-weight: 700;
          background: transparent;
          color: #1C1B1A;
        }

        /* Override Exhibition Modal styles to be entirely transparent */
        .sketch-modal-theme > div {
          background: transparent !important;
          box-shadow: none !important;
          border-radius: 0 !important;
        }
        .sketch-modal-theme .aw-modal-header {
          display: none !important;
        }
        
        /* Custom rough scrollbar */
        ::-webkit-scrollbar {
          width: 8px;
        }
        ::-webkit-scrollbar-thumb {
          background: #1C1B1A;
          border-radius: 255px 15px 225px 15px;
        }
      `}</style>
      
      <div className="drawing-paper" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        {!activeItem ? (
          // ==========================================
          // SCANNABLE LIST VIEW
          // ==========================================
          <div style={{ maxWidth: 1000, margin: '0 auto', padding: '40px 24px', width: '100%' }}>
            <header className="sketch-border-bottom" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', paddingBottom: '24px', marginBottom: '40px' }}>
              <div>
                <button className="sketch-btn" onClick={() => navigate('/?drawingMap=true')} style={{ marginBottom: 24 }}>
                  ← Back to Map
                </button>
                <h1 style={{ fontFamily: '"Iowan Old Style", "Georgia", serif', fontSize: 'clamp(36px, 5vw, 56px)', margin: '0', letterSpacing: '-0.02em', lineHeight: 1.1 }}>
                  {museum.name}
                </h1>
              </div>
              <div style={{ textAlign: 'right', fontSize: 13, maxWidth: 360, lineHeight: 1.6, opacity: 0.8 }}>
                {museum.description}
              </div>
            </header>

            <div>
              <div className="sketch-border-bottom" style={{ display: 'flex', padding: '0 16px 12px', fontSize: 11, fontWeight: 700, opacity: 0.6, letterSpacing: '0.05em', marginBottom: 16 }}>
                <div style={{ flex: '0 0 96px' }}>COVER</div>
                <div style={{ flex: '1 1 auto' }}>EXHIBITION INFO</div>
                <div style={{ flex: '0 0 120px' }}>TYPE</div>
                <div style={{ flex: '0 0 40px', textAlign: 'right' }}></div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {allExhibitions.map((ex) => (
                  <div key={ex.id} className="list-row" onClick={() => setActiveItem(ex)}>
                    <div style={{ flex: '0 0 96px' }}>
                      {ex.image ? (
                        <img src={ex.image} alt={ex.title || ex.name} className="row-thumb" />
                      ) : (
                        <div className="row-thumb" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, opacity: 0.5 }}>None</div>
                      )}
                    </div>
                    <div style={{ flex: '1 1 auto', paddingRight: 24 }}>
                      <h3 style={{ margin: '0 0 6px 0', fontSize: 20, fontFamily: '"Iowan Old Style", "Georgia", serif' }}>
                        {ex.title || ex.name}
                      </h3>
                      <div style={{ fontSize: 13, opacity: 0.6 }}>Explore collection items / spaces →</div>
                    </div>
                    <div style={{ flex: '0 0 120px', display: 'flex', alignItems: 'center' }}>
                      <span className="tag-badge">{ex.type}</span>
                    </div>
                    <div style={{ flex: '0 0 40px', textAlign: 'right', fontSize: 24, paddingRight: 8, opacity: 0.5 }}>
                      ↗
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          // ==========================================
          // DETAIL VIEW (Maximized Artwork Area, No Sidebar)
          // ==========================================
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            {/* Top Navigation Bar perfectly integrated above the Modal */}
            <header className="sketch-border-bottom" style={{ padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 100 }}>
              <div style={{ display: 'flex', gap: 12 }}>
                <button className="sketch-btn" onClick={() => navigate('/?drawingMap=true')}>← MAP</button>
                <button className="sketch-btn" onClick={() => setActiveItem(null)}>☰ EXHIBITION LIST</button>
              </div>
              <div style={{ fontFamily: '"Iowan Old Style", "Georgia", serif', fontSize: '18px', fontWeight: 'bold' }}>
                {museum.name} <span style={{ opacity: 0.3, margin: '0 12px' }}>|</span> {activeItem.title || activeItem.name}
              </div>
            </header>

            {/* Central Canvas for Artworks */}
            <main style={{ flex: 1, position: 'relative' }}>
              <Suspense fallback={<div style={{ padding: 40, fontFamily: 'monospace' }}>Loading artwork data...</div>}>
                <ExhibitionModal
                  exhibition={activeItem}
                  museumName={museum.name}
                  onClose={() => setActiveItem(null)}
                  inline={true}
                  variant="sketch"
                />
              </Suspense>
            </main>
          </div>
        )}
      </div>
    </div>
  );
}
"""

Path("src/pages/ExhibitionPage.tsx").write_text(js_code)
print("Updated ExhibitionPage.tsx")
