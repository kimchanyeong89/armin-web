import React, { useMemo } from "react";
import type { ProfileImageCrop } from "../types/Profile";

type ProfileAvatarProps = {
  src?: string | null;
  crop?: ProfileImageCrop | null;
  size: number;
  alt?: string;
  fallback?: React.ReactNode;
  background?: string;
};

function toNumber(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export default function ProfileAvatar({
  src,
  crop,
  size,
  alt = "Profile",
  fallback,
  background = "#BFFF0A",
}: ProfileAvatarProps) {
  const safeSize = Math.max(12, size);

  const hasCrop = useMemo(() => {
    if (!crop) return false;
    return Number.isFinite(Number(crop.scale)) && Number(crop.scale) > 0;
  }, [crop]);

  const previewSize = hasCrop ? Math.max(1, toNumber(crop?.previewSize, 292)) : 292;
  const maskSize = hasCrop ? Math.max(1, toNumber(crop?.maskSize, 150)) : 150;
  const previewScaleFactor = previewSize / 240;
  const translateX = hasCrop ? toNumber(crop?.x, 0) * previewScaleFactor : 0;
  const translateY = hasCrop ? toNumber(crop?.y, 0) * previewScaleFactor : 0;
  const cropScale = hasCrop ? Math.max(0.2, toNumber(crop?.scale, 1)) : 1;
  const avatarScale = safeSize / maskSize;
  const fitMode = hasCrop && crop?.fitMode === "contain" ? "contain" : "cover";

  return (
    <div
      style={{
        width: safeSize,
        height: safeSize,
        borderRadius: "50%",
        overflow: "hidden",
        position: "relative",
        background,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {src ? (
        hasCrop ? (
          <div
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              width: previewSize,
              height: previewSize,
              transform: `translate(-50%, -50%) scale(${avatarScale})`,
              transformOrigin: "center",
            }}
          >
            <div
              style={{
                position: "absolute",
                top: "50%",
                left: "50%",
                width: maskSize,
                height: maskSize,
                transform: "translate(-50%, -50%)",
                borderRadius: "50%",
                overflow: "hidden",
                background,
              }}
            >
              <img
                key={`${src}-${previewSize}-${maskSize}`}
                src={src}
                alt={alt}
                style={{
                  position: "absolute",
                  top: "50%",
                  left: "50%",
                  width: previewSize,
                  height: "auto",
                  maxWidth: "none",
                  maxHeight: "none",
                  transform: `translate(-50%, -50%) translate(${translateX}px, ${translateY}px) scale(${cropScale})`,
                  pointerEvents: "none",
                  userSelect: "none",
                }}
              />
            </div>
          </div>
        ) : (
          <img
            src={src}
            alt={alt}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              display: "block",
            }}
          />
        )
      ) : (
        fallback || null
      )}
    </div>
  );
}
