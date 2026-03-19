const fs = require('fs');

const content = `import React, { useMemo, useState, Suspense } from "react";
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
    return <div style={{ padding: 20 }}>Museum not found.</div>;
  }

  return (
    <div style={{
      width: "100vw",
      height: "100vh",
      padding: "12px",
      background: "#e8e5d9",
      boxSizing: "border-box"
    }}>
      <style>{\`
        .ep-shell {
          --paper: #f8f6f2;
          --ink: #1f2328;
          --muted: #68655d;
          --line: #d8d3ca;
          --line-strong: #a8a295;
          width: 100%;
          height: 100%;
          border: 1.5px solid #c2bbae;
          border-radius: 16px;
          overflow: hidden;
          position: relative;
          display: flex;
          flex-direction: column;
          background: #faf8f5;
          color: var(--ink);
          font-family: "IBM Plex Sans", "Segoe UI", sans-serif;
          box-shadow: 0 4px 24px rgba(0, 0, 0, 0.04);
        }

        .ep-header {
          padding: 24px 32px 16px;
          border-bottom: 1.5px dashed #d1ccc0;
        }

        .ep-top-bar {
          display: flex;
          gap: 12px;
          margin-bottom: 20px;
        }

        .ep-btn {
          height: 36px;
          border: 1px solid #c2bbae;
          border-radius: 999px;
          padding: 0 16px;
          background: transparent;
          color: var(--ink);
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .ep-btn:hover {
          background: #f0ece1;
        }

        .ep-title-row {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 40px;
        }

        .ep-title {
          margin: 0;
          font-family: "Iowan Old Style", "Georgia", serif;
          font-size: 42px;
          line-height: 1.1;
          letter-spacing: -0.01em;
          color: #1f2328;
        }

        .ep-meta {
          margin: 8px 0 0;
          color: #68655d;
          font-size: 13px;
          font-weight: 700;
          letter-spacing: 0.05em;
          text-transform: uppercase;
        }

        .ep-desc {
          margin: 0;
          font-size: 14px;
          color: #4a4843;
          line-height: 1.6;
          max-width: 400px;
          text-align: right;
        }

        .ep-main {
          flex: 1;
          min-height: 0;
          display: flex;
          position: relative;
        }

        .ep-sidebar {
          width: 380px;
          height: 100%;
          border-right: 1.5px dashed #d1ccc0;
          padding: 24px;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .ep-card {
          border: 1px solid #e0dbce;
          border-radius: 12px;
          background: #faf8f5;
          overflow: hidden;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        
        .ep-card:hover {
          border-color: #a8a295;
          box-shadow: 0 4px 12px rgba(0,0,0,0.05);
        }

        .ep-card-img {
          width: 100%;
          aspect-ratio: 4/3;
          background: #ebe6df;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #8a867d;
          font-size: 12px;
          font-weight: 600;
          object-fit: cover;
        }

        .ep-card-body {
          padding: 16px;
        }

        .ep-tag {
          display: inline-block;
          border: 1px solid #d1ccc0;
          border-radius: 999px;
          padding: 2px 10px;
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.04em;
          color: #68655d;
          margin-bottom: 8px;
        }

        .ep-card-title {
          margin: 0 0 6px;
          font-family: "Iowan Old Style", "Georgia", serif;
          font-size: 20px;
          color: #1f2328;
        }

        .ep-card-sub {
          margin: 0;
          font-size: 13px;
          color: #68655d;
          font-weight: 500;
        }

        .ep-content {
          flex: 1;
          height: 100%;
          position: relative;
          background: #faf8f5;
        }
        
        .sketch-modal-theme { background: transparent !important; }
        .sketch-modal-theme img { border-radius: 6px; }
        .sketch-modal-theme .aw-modal-header { border-bottom: 1.5px dashed #c2bbae; }
        .sketch-modal-theme button { border-radius: 999px; }

        /* Minimalist scrollbar */
        ::-webkit-scrollbar {
          width: 6px;
          height: 6px;
        }
        ::-webkit-scrollbar-thumb {
          background: #d1ccc0;
          border-radius: 99px;
        }
        ::-webkit-scrollbar-track {
          background: transparent;
        }
      \`}</style>

      <div className="ep-shell">
        <header className="ep-header">
          <div className="ep-top-bar">
            <button className="ep-btn" onClick={() => navigate("/?drawingMap=true")}>Back To Map</button>
            {activeItem && (
              <button className="ep-btn" onClick={() => setActiveItem(null)}>All Exhibitions</button>
            )}
          </div>
          
          <div className="ep-title-row">
            <div>
              <h1 className="ep-title">{museum.name}</h1>
              <p className="ep-meta">{allExhibitions.length} EXHIBITIONS · GLOBAL COLLECTION</p>
            </div>
            {museum.description && !activeItem && (
              <p className="ep-desc">{museum.description}</p>
            )}
          </div>
        </header>

        <main className="ep-main">
          {!activeItem ? (
            <>
              <aside className="ep-sidebar">
                {allExhibitions.map((ex, i) => (
                  <div key={ex.id + i} className="ep-card" onClick={() => setActiveItem(ex)}>
                    {ex.image ? (
                      <img src={ex.image} alt="" className="ep-card-img" />
                    ) : (
                      <div className="ep-card-img">No Image</div>
                    )}
                    <div className="ep-card-body">
                      <span className="ep-tag">{ex.type}</span>
                      <h3 className="ep-card-title">{ex.title || ex.name}</h3>
                      <p className="ep-card-sub">Open exhibition details</p>
                    </div>
                  </div>
                ))}
              </aside>
              <section className="ep-content">
                {/* Empty right area in collection view just like screenshot 1 */}
              </section>
            </>
          ) : (
            <div style={{ flex: 1, padding: 0, position: "relative", display: "flex", flexDirection: "column" }}>
              <div style={{ position: "absolute", top: 12, left: 18, zIndex: 100 }}>
                <button 
                  className="ep-btn" 
                  onClick={() => setActiveItem(null)}
                  style={{ background: "#fff", boxShadow: "0 4px 12px rgba(0,0,0,0.1)", border: "1.5px solid #1f2328" }}
                >
                  Switch Exhibition ({allExhibitions.length})
                </button>
              </div>
              <Suspense fallback={<div style={{ padding: 40 }}>Loading exhibition...</div>}>
                <ExhibitionModal
                  exhibition={activeItem}
                  museumName={museum.name}
                  onClose={() => setActiveItem(null)}
                  inline={true}
                  variant="sketch"
                />
              </Suspense>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
`;

fs.writeFileSync('src/pages/ExhibitionPage.tsx', content);
