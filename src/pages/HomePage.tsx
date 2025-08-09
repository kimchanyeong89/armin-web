import { useRef, useState } from "react";
import ExhibitionBanner from "../components/ExhibitionBanner";
import CustomGoogleMap from "../components/CustomGoogleMap";
import ExhibitionDetails from "../components/ExhibitionDetails";
import ExhibitionModal from "../components/ExhibitionModal";
import CesiumGlobe from "../components/CesiumGlobe";
import type { Exhibition, ExhibitionItem } from "../types/Exhibition";

type HomePageProps = {
  exhibitions: Exhibition[];
};

export default function HomePage({ exhibitions }: HomePageProps) {
  const [selectedExhibition, setSelectedExhibition] = useState<Exhibition | null>(null);
  const [selectedModalExhibition, setSelectedModalExhibition] = useState<ExhibitionItem | null>(null);
  const [useGlobe, setUseGlobe] = useState(false);
  const [showBanner, setShowBanner] = useState(true);
  const [focusTarget, setFocusTarget] = useState<Exhibition | null>(null);
  const lastFlowIdRef = useRef<string | null>(null);
  // One-shot Flow is handled directly in the Flow button onClick

  return (
    <div style={{ position: "relative", width: "100vw", height: "100vh", overflow: "hidden" }}>
      {/* 지도 전체 화면 */}
      <div style={{ position: "absolute", top: 0, left: 0, width: "100vw", height: "100vh", zIndex: 1 }}>
        {useGlobe ? (
          <CesiumGlobe
            exhibitions={exhibitions}
            onSelectExhibition={setSelectedExhibition}
            focusTarget={focusTarget}
          />
        ) : (
          <CustomGoogleMap
            exhibitions={exhibitions}
            onSelectExhibition={setSelectedExhibition}
            focusTarget={focusTarget}
          />
        )}
      </div>
      {/* Bottom center controls: Globe toggle + Flow */}
      <div style={{ position: "fixed", bottom: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 4000, display: 'flex', gap: 8 }}>
        <button
          onClick={() => setUseGlobe(v => !v)}
          style={{
            padding: "8px 12px",
            borderRadius: 8,
            border: "1px solid #d97706",
            background: useGlobe ? "#d97706" : "#fff",
            color: useGlobe ? "#fff" : "#d97706",
            cursor: "pointer",
            boxShadow: "0 2px 6px rgba(0,0,0,0.15)",
            minWidth: 96,
          }}
        >
          {useGlobe ? "지도로 보기" : "글로브 보기"}
        </button>
        <button
          onClick={() => {
            if (!exhibitions.length) return;
            let candidate: Exhibition | null = null;
            for (let i = 0; i < 5; i++) {
              const idx = Math.floor(Math.random() * exhibitions.length);
              const ex = exhibitions[idx];
              if (ex.id !== lastFlowIdRef.current) { candidate = ex; break; }
            }
            candidate = candidate || exhibitions[Math.floor(Math.random() * exhibitions.length)];
            lastFlowIdRef.current = candidate.id;
            setFocusTarget(candidate);
          }}
          style={{
            padding: "8px 12px",
            borderRadius: 8,
            border: '1px solid #374151',
            background: '#fff',
            color: '#374151',
            cursor: "pointer",
            boxShadow: "0 2px 6px rgba(0,0,0,0.15)",
            minWidth: 96,
          }}
        >
          Flow
        </button>
      </div>
      {/* 오른쪽 팝업 배너 */}
  <div style={{ position: "fixed", top: "60px", right: 0, zIndex: 3000 }}>
        {showBanner && (
          <ExhibitionBanner
            onClose={() => setShowBanner(false)}
            onBannerClick={(exhibitionKey) => {
              // Try id, then name/title match
              let item = exhibitions.find(e => e.id === exhibitionKey) || null;
              if (!item) {
                item = exhibitions.find(e => e.name === exhibitionKey) || null;
              }
              if (!item) {
                item = exhibitions.find(e => (e.permanentExhibitions || []).some(pe => pe.title === exhibitionKey || pe.name === exhibitionKey)) || null;
              }
              setSelectedExhibition(item);
            }}
          />
        )}
      </div>
      {/* 선택된 전시관 상세 슬라이드 */}
      <div style={{ position: "fixed", top: 0, right: 0, width: "400px", height: "100%", backgroundColor: "#fff", boxShadow: "-2px 0 8px rgba(0,0,0,0.2)", overflowY: "auto", zIndex: 1000, transform: selectedExhibition ? "translateX(0)" : "translateX(100%)", transition: "transform 0.3s ease" }}>
        {selectedExhibition && (
          <ExhibitionDetails
            exhibition={selectedExhibition}
            onClose={() => setSelectedExhibition(null)}
            isOpen={!!selectedExhibition}
            onSelectExhibition={item => setSelectedModalExhibition(item)}
          />
        )}
      </div>
      {/* 전시 모달 */}
      {selectedModalExhibition && (
        <ExhibitionModal
          exhibition={selectedModalExhibition}
          onClose={() => setSelectedModalExhibition(null)}
        />
      )}
    </div>
  );
  // Removed leftover Flow effect: single-click behavior only
}