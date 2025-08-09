// src/components/ExhibitionBanner.tsx
import React, { useEffect, useState, useRef } from "react";
import "../styles/ExhibitionBanner.css";
import { exhibitions } from "../data/exhibitions";

type ExhibitionBannerProps = {
  onBannerClick?: (exhibitionId: string) => void;
};

const ExhibitionBanner: React.FC<ExhibitionBannerProps> = ({ onBannerClick }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [position, setPosition] = useState({ x: window.innerWidth - 360, y: 60 });
  const dragOffset = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentIndex((prevIndex) => (prevIndex + 1) % exhibitions.length);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    function handleMouseMove(e: MouseEvent) {
      if (isDragging) {
        setPosition({
          x: e.clientX - dragOffset.current.x,
          y: e.clientY - dragOffset.current.y,
        });
      }
    }
    function handleMouseUp() {
      setIsDragging(false);
    }
    if (isDragging) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
    }
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging]);

  return (
    <div
      style={{
        position: "fixed",
        left: position.x,
        top: position.y,
        width: "340px",
        height: "420px",
        background: "#fff",
        boxShadow: "-2px 0 12px rgba(0,0,0,0.15)",
        zIndex: 3000,
        borderRadius: "12px 0 0 12px",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        cursor: isDragging ? "grabbing" : "grab",
        userSelect: "none",
        opacity: 0.9, // 불투명도 적용
      }}
      onMouseDown={e => {
        setIsDragging(true);
        dragOffset.current = {
          x: e.clientX - position.x,
          y: e.clientY - position.y,
        };
      }}
    >
      <div
        style={{
          width: "100%",
          height: "320px",
          display: "flex",
          overflow: "hidden",
          position: "relative",
        }}
      >
        <div
          style={{
            display: "flex",
        width: `${exhibitions.length * 100}%`,
        transform: `translateX(-${currentIndex * 100}%)`,
        transition: "transform 0.5s cubic-bezier(.4,0,.2,1)",
      }}
    >
      {exhibitions.map((exhibition: any) => (
        <div
          key={exhibition.id}
          style={{
            width: "340px",
            height: "320px",
            flexShrink: 0,
            position: "relative",
            overflow: "hidden",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#eee",
            cursor: "pointer",
          }}
          onClick={() => onBannerClick && onBannerClick(exhibition.id)}
        >
          <img
            src={exhibition.representativeImage || "/images/exhibition1.png"}
            alt={exhibition.name}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              borderRadius: "12px 0 0 0",
            }}
          />
          <div
            style={{
              position: "absolute",
              bottom: 0,
              left: 0,
              width: "100%",
              background: "rgba(0,0,0,0.5)",
              color: "#fff",
              fontSize: "1.1rem",
              fontWeight: "bold",
              padding: "12px 16px",
              boxSizing: "border-box",
              borderRadius: "0 0 0 12px",
              textShadow: "0 2px 8px rgba(0,0,0,0.3)",
            }}
          >
            {exhibition.name}
          </div>
        </div>
      ))}
    </div>
      </div>
    </div>
  );
};

export default ExhibitionBanner;