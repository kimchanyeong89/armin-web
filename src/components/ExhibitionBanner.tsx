// src/components/ExhibitionBanner.tsx
import React, { useEffect, useState, useRef } from "react";
import "../styles/ExhibitionBanner.css";
import { db } from "../firebase";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import type { Artwork } from "../types/Artwork";

type ExhibitionBannerProps = {
  onBannerClick?: (exhibitionId: string) => void;
  onClose?: () => void;
};

const ExhibitionBanner: React.FC<ExhibitionBannerProps> = ({ onBannerClick, onClose }) => {
  const SLIDE_W = 340;
  const SLIDE_H = 320;
  const [currentIndex, setCurrentIndex] = useState(0);
  const [images, setImages] = useState<Artwork[]>([]); // latest fetched candidates
  const [displaySlides, setDisplaySlides] = useState<Artwork[]>([]); // only rendered slides
  const [readyMap, setReadyMap] = useState<Record<string, boolean>>({});
  const [isDragging, setIsDragging] = useState(false);
  const [position, setPosition] = useState({ x: window.innerWidth - 360, y: 60 });
  const dragOffset = useRef({ x: 0, y: 0 });

  // Load cached slides then subscribe to Firestore
  useEffect(() => {
    // 1) Use cache to prevent blank at first paint
    try {
      const cached = localStorage.getItem("banner_prev_images");
      if (cached) {
        const arr = JSON.parse(cached) as Artwork[];
        if (Array.isArray(arr) && arr.length > 0) {
          setImages(arr);
          setDisplaySlides(arr);
        }
      }
    } catch {}

    // 2) Subscribe to artworks with images
    const q = query(collection(db, "artworks"), where("image", "!=", ""));
    const unsub = onSnapshot(q, (snap) => {
      const list: Artwork[] = [];
      snap.forEach((d) => {
        const data = d.data() as Artwork;
        // Ensure id exists for React keys
        list.push({ ...data, id: data.id || d.id });
      });

      const shuffled = [...list].sort(() => Math.random() - 0.5).slice(0, 4);
      // Save candidates, rendering will switch only when preloaded
      if (shuffled.length > 0) {
        setImages(shuffled);
      }
    });
    return () => unsub();
  }, []);

  // Preload images and remember last non-empty list
  useEffect(() => {
    if (images.length === 0) return;
    images.forEach((a) => {
      const url = a.image;
      if (!url || readyMap[url]) return;
      const im = new Image();
      im.onload = () => setReadyMap((prev) => ({ ...prev, [url]: true }));
      im.onerror = () => setReadyMap((prev) => ({ ...prev, [url]: true }));
      im.src = url;
    });
  }, [images]);

  // When new images are preloaded, switch displaySlides atomically
  useEffect(() => {
    if (images.length === 0) return;
    const available = images.filter((a) => readyMap[a.image]);
    if (available.length > 0) {
      setDisplaySlides(available);
      try { localStorage.setItem("banner_prev_images", JSON.stringify(available)); } catch {}
      setCurrentIndex((prev) => (prev >= available.length ? 0 : prev));
    }
  }, [images, readyMap]);

  // Auto-advance using actually displayable slides (random 6-8s for preload headroom)
  useEffect(() => {
    if (displaySlides.length === 0) return;
    const delay = 6000 + Math.floor(Math.random() * 2000);
    const timer = setTimeout(() => {
      setCurrentIndex((prev) => (prev + 1) % displaySlides.length);
    }, delay);
    return () => clearTimeout(timer);
  }, [displaySlides, currentIndex]);

  // Clamp index when slides change
  useEffect(() => {
    if (displaySlides.length > 0 && currentIndex >= displaySlides.length) setCurrentIndex(0);
  }, [displaySlides, currentIndex]);

  // Drag handling
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
  width: `${SLIDE_W}px`,
  height: `${SLIDE_H + 100}px`,
        background: "#fff",
        boxShadow: "-2px 0 12px rgba(0,0,0,0.15)",
        zIndex: 3000,
  borderRadius: "12px",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        cursor: isDragging ? "grabbing" : "grab",
        userSelect: "none",
        opacity: 0.9,
        // allow inner absolute elements (e.g., close button)
        // position is already fixed; absolute children will anchor to this box
      }}
      onMouseDown={(e) => {
        setIsDragging(true);
        dragOffset.current = {
          x: e.clientX - position.x,
          y: e.clientY - position.y,
        };
      }}
    >
      {/* Close button (top-right) */}
      <button
        aria-label="Close banner"
        onMouseDown={(e) => {
          // prevent triggering drag start
          e.stopPropagation();
          e.preventDefault();
        }}
        onClick={(e) => {
          e.stopPropagation();
          if (onClose) onClose();
        }}
        style={{
          position: "absolute",
          top: 8,
          right: 8,
          width: 28,
          height: 28,
          borderRadius: 14,
          border: "1px solid rgba(0,0,0,0.15)",
          background: "rgba(255,255,255,0.9)",
          color: "#333",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          boxShadow: "0 1px 4px rgba(0,0,0,0.12)",
          zIndex: 10,
        }}
      >
        ✕
      </button>
      <div
        style={{
          width: "100%",
          height: `${SLIDE_H}px`,
          display: "flex",
          overflow: "hidden",
          position: "relative",
        }}
      >
        {(() => {
          const slides = displaySlides;
          const safeIndex = slides.length > 0 ? Math.min(currentIndex, slides.length - 1) : 0;
          if (slides.length === 0) {
            return (
              <div
                style={{
                  width: "100%",
                  height: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "linear-gradient(135deg, #f0f0f0, #e5e5e5)",
                }}
              >
                {/* Default poster fallback so it's never blank */}
                <div style={{
                  width: "90%",
                  height: "90%",
                  borderRadius: 8,
                  background: "linear-gradient(180deg, #ddd, #cfcfcf)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#555",
                  fontWeight: 600,
                  letterSpacing: 1,
                }}>ARMIN</div>
              </div>
            );
          }
          return (
            <div
              style={{
                display: "flex",
                width: `${slides.length * SLIDE_W}px`,
                transform: `translateX(-${safeIndex * SLIDE_W}px)`,
                transition: "transform 0.5s cubic-bezier(.4,0,.2,1)",
              }}
            >
              {slides.map((artwork) => (
                <div
                  key={artwork.id}
                  style={{
                    width: `${SLIDE_W}px`,
                    height: `${SLIDE_H}px`,
                    flexShrink: 0,
                    position: "relative",
                    overflow: "hidden",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "#000", // letterbox/pillarbox background
                    cursor: "pointer",
                  }}
                  onClick={() => onBannerClick && onBannerClick(artwork.exhibitionName || artwork.exhibitionTitle)}
                >
                  <img
                    src={artwork.image}
                    alt={artwork.name}
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "contain", // prevent cropping; add letterbox
                      background: "transparent",
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
                      padding: "12px 16px",
                      boxSizing: "border-box",
            borderRadius: "0 0 12px 12px",
                      textShadow: "0 2px 8px rgba(0,0,0,0.3)",
                    }}
                  >
                    <div style={{
                      fontSize: "1.05rem",
                      fontWeight: 700,
                      lineHeight: 1.2,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}>
                      {artwork.name}{artwork.year ? ` (${artwork.year})` : ""}
                    </div>
                    <div style={{
                      marginTop: 4,
                      fontSize: "0.9rem",
                      opacity: 0.95,
                      lineHeight: 1.2,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}>
                      {artwork.artist}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          );
        })()}
      </div>
    </div>
  );
};

export default ExhibitionBanner;