import { useState } from "react";
import type { Exhibition } from "../types/Exhibition";
import CurrentExhibitions from "./CurrentExhibitions";
import PastExhibitions from "./PastExhibitions";

interface ExhibitionDetailsProps {
  exhibition: Exhibition;
  onClose: () => void;
}

export default function ExhibitionDetails({
  exhibition,
  onClose
}: ExhibitionDetailsProps) {
  const [activeTab, setActiveTab] = useState<"current" | "past">("current");

  console.log("exhibition 데이터:", exhibition);  // 👈 이 줄 추가!

  return (
    <div style={{ position: "fixed", top: 0, right: 0, width: "400px", height: "100%", backgroundColor: "#fff", overflowY: "auto" }}>
      <button onClick={onClose}>닫기</button>
      <h2>{exhibition.name}</h2>
      <p>{exhibition.description}</p>
      <div>
        <button onClick={() => setActiveTab("current")}>현재 전시</button>
        <button onClick={() => setActiveTab("past")}>이전 전시</button>
      </div>
      {activeTab === "current" && (
        exhibition.permanentExhibitions && exhibition.permanentExhibitions.length > 0
          ? <CurrentExhibitions items={exhibition.permanentExhibitions} />
          : <p>현재 전시가 없습니다.</p>
      )}
      {activeTab === "past" && (
        exhibition.pastExhibitions && exhibition.pastExhibitions.length > 0
          ? <PastExhibitions items={exhibition.pastExhibitions} />
          : <p>이전 전시가 없습니다.</p>
      )}
    </div>
  );
}