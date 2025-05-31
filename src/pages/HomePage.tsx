import React, { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import WorldMap from "../components/WorldMap";
import { artists } from "../data/artists";
import { works } from "../data/works";
import { exhibitions } from "../data/exhibitions";
import type { Exhibition } from "../types/Exhibition";
import ExhibitionDetails from "../components/ExhibitionDetails";

export default function HomePage() {
  const [query, setQuery] = useState("");
  const [selectedExhibition, setSelectedExhibition] = useState<Exhibition | null>(null);
  const [currentIndex, setCurrentIndex] = useState(1);
  const sliderRef = useRef<HTMLDivElement>(null);
  const [startX, setStartX] = useState<number | null>(null);

  const [sliderWidth, setSliderWidth] = useState<number>(window.innerWidth);

  useEffect(() => {
    const handleResize = () => {
      setSliderWidth(window.innerWidth);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleSelectExhibition = (exhibition: Exhibition) => {
    setSelectedExhibition(exhibition);
  };

  const filteredArtists = artists.filter((artist) =>
    artist.name.toLowerCase().includes(query.toLowerCase())
  );
  const filteredWorks = works.filter((work) =>
    work.title.toLowerCase().includes(query.toLowerCase())
  );
  const filteredExhibitions = exhibitions.filter((exhibition) =>
    exhibition.name.toLowerCase().includes(query.toLowerCase())
  );

  const exhibitionImages = [
    "/images/exhibition1.png",
    "/images/exhibition2.png",
    "/images/exhibition3.png",
    "/images/exhibition4.png",
  ];

  // Create a new array with dummy first and last images for infinite loop
  const loopedImages = [
    exhibitionImages[exhibitionImages.length - 1],
    ...exhibitionImages,
    exhibitionImages[0],
  ];

  useEffect(() => {
    const interval = setInterval(() => {
      // 마지막 실제 이미지(4번)에서 더미(1번)로 이동해야 하므로, 마지막까지 애니메이션
      setCurrentIndex((prevIndex) => prevIndex + 1);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    setStartX(e.clientX);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (startX === null) return;
    const diff = e.clientX - startX;
    if (Math.abs(diff) > 50) {
      if (diff > 0) {
        setCurrentIndex((prevIndex) => prevIndex - 1);
      } else {
        setCurrentIndex((prevIndex) => prevIndex + 1);
      }
      setStartX(null);
    }
  };

  const handleMouseUp = () => {
    setStartX(null);
  };

  const sliderHeight = 250;

  return (
    <div style={{ position: "relative", width: "100vw", overflowX: "hidden" }}>
      {/* 로고와 검색창 */}
      <div style={{ padding: "20px", display: "flex", alignItems: "center" }}>
        <Link to="/" style={{ display: "flex", alignItems: "center", textDecoration: "none", color: "inherit" }}>
          <img
            src="/images/armin-logo.png"
            alt="Armin Logo"
            style={{ width: "60px", marginRight: "18px" }}
          />
          <h1 style={{ fontSize: "28px", margin: 0, marginRight: "24px" }}>Armin</h1>
        </Link>
        <input
          type="text"
          placeholder="작가, 작품, 전시관 검색"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{
            width: "250px",
            padding: "8px",
            fontSize: "16px",
            borderRadius: "4px",
            border: "1px solid #ccc",
          }}
        />
      </div>

      {/* 전시회 배너 슬라이더 */}
      <div
        style={{
          position: "relative",
          marginTop: "20px",
          width: "100%",
          height: `${sliderHeight}px`,
          overflow: "hidden",
          backgroundColor: "#f5f5f5",
          boxSizing: "border-box",
        }}
      >
        {/* 이미지 리스트 */}
        <div
          ref={sliderRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          style={{
            display: "flex",
            width: `${loopedImages.length * sliderWidth}px`,
            height: `${sliderHeight}px`,
            transform: `translateX(-${currentIndex * sliderWidth}px)`,
            transition: "transform 0.5s ease-in-out",
            boxSizing: "border-box",
            cursor: startX !== null ? "grabbing" : "grab",
            userSelect: "none",
          }}
          onTransitionEnd={() => {
            // 마지막 더미(1번)까지 애니메이션 후, transition 없이 1로 이동
            if (currentIndex === loopedImages.length - 1) {
              if (sliderRef.current) {
                sliderRef.current.style.transition = "none";
              }
              setCurrentIndex(1);
              requestAnimationFrame(() => {
                if (sliderRef.current) {
                  sliderRef.current.style.transition = "transform 0.5s ease-in-out";
                }
              });
            } else if (currentIndex === 0) {
              if (sliderRef.current) {
                sliderRef.current.style.transition = "none";
              }
              setCurrentIndex(loopedImages.length - 2);
              requestAnimationFrame(() => {
                if (sliderRef.current) {
                  sliderRef.current.style.transition = "transform 0.5s ease-in-out";
                }
              });
            }
          }}
        >
          {loopedImages.map((src, index) => (
            <img
              key={index}
              src={src}
              alt={`Exhibition ${index}`}
              style={{
                width: `${sliderWidth}px`,
                height: `${sliderHeight}px`,
                objectFit: "cover",
                flexShrink: 0,
                display: "block",
                boxSizing: "border-box",
                userSelect: "none",
                pointerEvents: "none",
              }}
              draggable={false}
            />
          ))}
        </div>
      </div>

      {/* 월드맵 */}
      <div style={{ marginTop: "20px" }}>
        <WorldMap onSelectExhibition={handleSelectExhibition} />
      </div>

      {/* 선택된 전시관 상세 슬라이드 */}
      {selectedExhibition && (
        <div
          style={{
            position: "fixed",
            top: 0,
            right: 0,
            width: "400px",
            height: "100%",
            backgroundColor: "#fff",
            boxShadow: "-2px 0 8px rgba(0,0,0,0.2)",
            overflowY: "auto",
            zIndex: 1000,
          }}
        >
          <ExhibitionDetails
            exhibition={selectedExhibition}
            onClose={() => setSelectedExhibition(null)}
          />
        </div>
      )}

      {/* 검색 결과 */}
      {query && (
        <div style={{ padding: "20px" }}>
          {filteredArtists.length > 0 && (
            <div>
              <h2>작가</h2>
              <ul>
                {filteredArtists.map((artist) => (
                  <li key={artist.id}>
                    <Link to={`/artist/${artist.id}`}>
                      {artist.name} ({artist.nationality})
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {filteredWorks.length > 0 && (
            <div>
              <h2>작품</h2>
              <ul>
                {filteredWorks.map((work) => (
                  <li key={work.id}>
                    <Link to={`/work/${work.id}`}>
                      {work.title} (by {work.artistId})
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {filteredExhibitions.length > 0 && (
            <div>
              <h2>전시관</h2>
              <ul>
                {filteredExhibitions.map((exhibition) => (
                  <li key={exhibition.id}>
                    <button
                      style={{
                        background: "none",
                        border: "none",
                        color: "blue",
                        textDecoration: "underline",
                        cursor: "pointer",
                      }}
                      onClick={() => setSelectedExhibition(exhibition)}
                    >
                      {exhibition.name} ({exhibition.location})
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {filteredArtists.length === 0 &&
            filteredWorks.length === 0 &&
            filteredExhibitions.length === 0 && (
              <div>검색 결과가 없습니다.</div>
            )}
        </div>
      )}
    </div>
  );
}