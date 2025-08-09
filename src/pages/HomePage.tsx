import { useState } from "react";
import ExhibitionBanner from "../components/ExhibitionBanner";
import CustomGoogleMap from "../components/CustomGoogleMap";
import ExhibitionDetails from "../components/ExhibitionDetails";
import ExhibitionModal from "../components/ExhibitionModal";
import type { Exhibition, ExhibitionItem } from "../types/Exhibition";

type HomePageProps = {
  exhibitions: Exhibition[];
};

export default function HomePage({ exhibitions }: HomePageProps) {
  const [selectedExhibition, setSelectedExhibition] = useState<Exhibition | null>(null);
  const [selectedModalExhibition, setSelectedModalExhibition] = useState<ExhibitionItem | null>(null);
  return (
    <div style={{ position: "relative", width: "100vw", height: "100vh", overflow: "hidden" }}>
      {/* 지도 전체 화면 */}
      <div style={{ position: "absolute", top: 0, left: 0, width: "100vw", height: "100vh", zIndex: 1 }}>
        <CustomGoogleMap
          exhibitions={exhibitions}
          onSelectExhibition={setSelectedExhibition}
        />
      </div>
      {/* 오른쪽 팝업 배너 */}
      <div style={{ position: "fixed", top: "60px", right: 0, zIndex: 3000 }}>
        <ExhibitionBanner
          onBannerClick={(exhibitionId) => {
            const item = exhibitions.find(e => e.id === exhibitionId) || null;
            setSelectedExhibition(item);
          }}
        />
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
}