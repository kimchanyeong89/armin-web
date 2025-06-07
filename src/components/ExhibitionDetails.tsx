import { useState } from "react";
import type { Exhibition, ExhibitionItem } from "../types/Exhibition";
import PermanentExhibitions from "./PermanentExhibitions";
import PastExhibitions from "./PastExhibitions";
import TemporaryExhibitions from "./TemporaryExhibitions";

interface ExhibitionDetailsProps {
  exhibition: Exhibition;
  onClose: () => void;
  isOpen: boolean;
  onSelectExhibition: (exhibitionItem: ExhibitionItem) => void;
}

export default function ExhibitionDetails({
  exhibition,
  onClose,
  isOpen,
  onSelectExhibition
}: ExhibitionDetailsProps) {
  const [isCurrentExhibitionsCollapsed, setIsCurrentExhibitionsCollapsed] = useState(false);
  const [isPastExhibitionsCollapsed, setIsPastExhibitionsCollapsed] = useState(false);

  return (
    <div
      style={{
        position: "fixed",
        top: "20px", // Add top margin to create space
        right: 0,
        width: "400px",
        height: "calc(100% - 20px)", // Adjust height to account for top margin
        backgroundColor: "#fff",
        overflowY: "auto",
        paddingLeft: "30px",
        boxShadow: "none",
        transform: isOpen ? "translateX(20px)" : "translateX(100%)",
        transition: "transform 0.3s ease",
        zIndex: 2000
      }}
    >
      <button
        onClick={onClose}
        style={{
          background: "none",
          border: "none",
          fontSize: "1.5rem",
          cursor: "pointer",
          marginBottom: "10px",
          padding: 0,
          color: "#000", // Set arrow color to black
        }}
        aria-label="Back"
      >
        ←
      </button>
      <h2>{exhibition.name}</h2>
      {/* 전시관 이미지 프레임 추가 */}
      <div
        style={{
          width: "95%",
          height: "200px",
          backgroundColor: "#ccc",
          marginBottom: "20px"
        }}
      ></div>
      <p>{exhibition.description}</p>

      {/* 현재 전시 */}
      <h3>
        <button
          onClick={() => setIsCurrentExhibitionsCollapsed(!isCurrentExhibitionsCollapsed)}
          style={{
            marginRight: "10px",
            fontSize: "0.9rem",
            padding: "2px 6px"
          }}
        >
          {isCurrentExhibitionsCollapsed ? "▶" : "▼"}
        </button>
        현재 전시
      </h3>

      {!isCurrentExhibitionsCollapsed && (
        <>
          {/* 상설 전시 */}
          <h4>상설 전시</h4>
          {exhibition.permanentExhibitions && exhibition.permanentExhibitions.length > 0 ? (
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "10px",
              }}
            >
              {exhibition.permanentExhibitions.map((item) => (
                <div
                  key={item.id}
                  onClick={() => onSelectExhibition(item)}
                  style={{
                    width: "100px",
                    height: "160px", // Slightly reduced height
                    border: "1px solid #ccc",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer"
                  }}
                >
                  {/* 전시 포스터 (임시 프레임) */}
                  <div
                    style={{
                      width: "80px",
                      height: "100px",
                      backgroundColor: "#eee",
                      marginBottom: "3px" // Reduced margin
                    }}
                  ></div>
                  {/* 전시 이름 */}
                  <div
                    style={{
                      textAlign: "center",
                      fontSize: "0.75rem", // Slightly smaller font
                      fontWeight: "bold",  // Make it bold
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      width: "80px",
                      position: "relative"
                    }}
                  >
                    <div
                      style={{
                        display: "inline-block",
                        animation: "marquee 5s linear infinite",
                        animationPlayState: "paused",
                        whiteSpace: "nowrap"
                      }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLElement).style.animationPlayState = "running";
                      }}
                      onMouseLeave={(e) => {
                        const target = e.currentTarget as HTMLElement;
                        target.style.animationPlayState = "paused";
                        target.style.animation = "none";  // Reset animation
                        target.offsetHeight;  // Force reflow
                        target.style.animation = "marquee 5s linear infinite";
                        target.style.animationPlayState = "paused";
                        target.style.transform = "translateX(0)"; // Reset to start position
                      }}
                    >
                      {item.name}
                    </div>
                  </div>
                  {/* 전시 기간 */}
                  <div style={{ textAlign: "center", fontSize: "0.6rem", color: "#666" }}>
                    <div>{item.startDate}</div>
                    <div>{item.endDate}</div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p>상설 전시가 없습니다.</p>
          )}

          {/* 특별 전시 */}
          <h4>특별 전시</h4>
          {exhibition.temporaryExhibitions && exhibition.temporaryExhibitions.length > 0 ? (
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "10px",
              }}
            >
              {exhibition.temporaryExhibitions.map((item) => (
                <div
                  key={item.id}
                  onClick={() => onSelectExhibition(item)}
                  style={{
                    width: "100px",
                    height: "180px",
                    border: "1px solid #ccc",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer"
                  }}
                >
                  {/* 전시 포스터 (임시 프레임) */}
                  <div
                    style={{
                      width: "80px",
                      height: "100px",
                      backgroundColor: "#eee",
                      marginBottom: "5px"
                    }}
                  ></div>
                  {/* 전시 이름 */}
                  <div
                    style={{
                      textAlign: "center",
                      fontSize: "0.75rem", // Slightly smaller font
                      fontWeight: "bold",  // Make it bold
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      width: "80px",
                      position: "relative"
                    }}
                  >
                    <div
                      style={{
                        display: "inline-block",
                        animation: "marquee 5s linear infinite",
                        animationPlayState: "paused",
                        whiteSpace: "nowrap"
                      }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLElement).style.animationPlayState = "running";
                      }}
                      onMouseLeave={(e) => {
                        const target = e.currentTarget as HTMLElement;
                        target.style.animationPlayState = "paused";
                        target.style.animation = "none";  // Reset animation
                        target.offsetHeight;  // Force reflow
                        target.style.animation = "marquee 5s linear infinite";
                        target.style.animationPlayState = "paused";
                        target.style.transform = "translateX(0)"; // Reset to start position
                      }}
                    >
                      {item.name}
                    </div>
                  </div>
                  {/* 전시 기간 */}
                  <div style={{ textAlign: "center", fontSize: "0.6rem", color: "#666" }}>
                    <div>{item.startDate}</div>
                    <div>{item.endDate}</div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p>특별 전시가 없습니다.</p>
          )}
        </>
      )}

      {/* 이전 전시 */}
      <h3>
        <button
          onClick={() => setIsPastExhibitionsCollapsed(!isPastExhibitionsCollapsed)}
          style={{
            marginRight: "10px",
            fontSize: "0.9rem",
            padding: "2px 6px"
          }}
        >
          {isPastExhibitionsCollapsed ? "▶" : "▼"}
        </button>
        이전 전시
      </h3>

      {!isPastExhibitionsCollapsed && (
        exhibition.pastExhibitions && exhibition.pastExhibitions.length > 0 ? (
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "10px",
            }}
          >
            {exhibition.pastExhibitions.map((item) => (
              <div
                key={item.id}
                onClick={() => onSelectExhibition(item)}
                style={{
                  width: "100px",
                  height: "180px",
                  border: "1px solid #ccc",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer"
                }}
              >
                {/* 전시 포스터 (임시 프레임) */}
                <div
                  style={{
                    width: "80px",
                    height: "100px",
                    backgroundColor: "#eee",
                    marginBottom: "5px"
                  }}
                ></div>
                {/* 전시 이름 */}
                <div
                  style={{
                    textAlign: "center",
                    fontSize: "0.75rem", // Slightly smaller font
                    fontWeight: "bold",  // Make it bold
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    width: "80px",
                    position: "relative"
                  }}
                >
                  <div
                    style={{
                      display: "inline-block",
                      animation: "marquee 5s linear infinite",
                      animationPlayState: "paused",
                      whiteSpace: "nowrap"
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLElement).style.animationPlayState = "running";
                    }}
                    onMouseLeave={(e) => {
                      const target = e.currentTarget as HTMLElement;
                      target.style.animationPlayState = "paused";
                      target.style.animation = "none";  // Reset animation
                      target.offsetHeight;  // Force reflow
                      target.style.animation = "marquee 5s linear infinite";
                      target.style.animationPlayState = "paused";
                      target.style.transform = "translateX(0)"; // Reset to start position
                    }}
                  >
                    {item.name}
                  </div>
                </div>
                {/* 전시 기간 */}
                <div style={{ textAlign: "center", fontSize: "0.6rem", color: "#666" }}>
                  <div>{item.startDate}</div>
                  <div>{item.endDate}</div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p>이전 전시가 없습니다.</p>
        )
      )}
    </div>
  );
}