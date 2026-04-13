import React, { useMemo, useState, useEffect } from "react";
import { exhibitions } from "../data/exhibitions";
import { getOptimizedImageUrl } from "../utils/imageProxy";
import { fetchRecoveredImageUrl, getFallbackExhibitionIdForJson } from "../utils/museumUtils";

interface ArtworkImageProps {
  item: any;
  width?: number;
  style?: React.CSSProperties;
}

export const ArtworkImage: React.FC<ArtworkImageProps> = ({ item, width = 600, style }) => {
  const [loaded, setLoaded] = useState(false);
  const [errorCount, setErrorCount] = useState(0);
  const [recoveredSrc, setRecoveredSrc] = useState<string | null>(null);
  const [hasFailedAll, setHasFailedAll] = useState(false);

  const exhId = getFallbackExhibitionIdForJson(item, exhibitions);
  const itemId = item.artworkId || item.id;

  const fallbackImages = useMemo(() => {
    const list: string[] = [];
    const mainImg = item.image || item.i || "";
    if (mainImg) list.push(mainImg);
    if (item.fallbackImages && Array.isArray(item.fallbackImages)) {
      list.push(...item.fallbackImages);
    }
    if (exhId && itemId) {
      list.push(`https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/${exhId}/images/${itemId}.jpg`);
      list.push(`https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/artworks/${itemId}.jpg`);
    }
    return Array.from(new Set(list)).filter(Boolean);
  }, [item, exhId, itemId]);

  const handleAdvancedRecovery = async () => {
    const realImage = await fetchRecoveredImageUrl(item, exhibitions);
    if (realImage) {
      setRecoveredSrc(realImage);
    } else {
      setHasFailedAll(true);
      setLoaded(true);
    }
  };

  const currentRawSrc = recoveredSrc || fallbackImages[errorCount] || "";
  const currentSrc = currentRawSrc ? getOptimizedImageUrl(currentRawSrc, width) : "";
  const blurSrc = currentRawSrc ? getOptimizedImageUrl(currentRawSrc, 20) : "";

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden", ...style }}>
      {blurSrc && (
        <div
          style={{
            position: "absolute",
            inset: "-10%",
            backgroundImage: `url(${blurSrc})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
            filter: "blur(10px)",
            opacity: loaded ? 0 : 1,
            transition: "opacity 0.6s ease-out",
          }}
        />
      )}

      {!hasFailedAll && currentSrc ? (
        <img
          src={currentSrc}
          alt={item.title || item.name || "Artwork"}
          loading="lazy"
          onLoad={() => setLoaded(true)}
          onError={() => {
            if (recoveredSrc) {
               setHasFailedAll(true);
               setLoaded(true);
            } else if (errorCount < fallbackImages.length - 1) {
               setErrorCount((c) => c + 1);
            } else {
               handleAdvancedRecovery();
            }
          }}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            display: "block",
            opacity: loaded ? 1 : 0,
            transition: "opacity 0.4s ease-in",
            position: "relative",
          }}
        />
      ) : (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "rgba(255,255,255,0.36)",
            fontSize: 12,
            position: "relative",
          }}
        >
          No Image
        </div>
      )}

      {!loaded && currentSrc && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "rgba(0,0,0,0.1)",
          }}
        >
          <div
            style={{
              width: 24,
              height: 24,
              border: "2px solid rgba(255,255,255,0.3)",
              borderTop: "2px solid rgba(255,255,255,0.9)",
              borderRadius: "50%",
              animation: "spin 1s linear infinite",
            }}
          />
        </div>
      )}
      <style>
        {`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}
      </style>
    </div>
  );
};
