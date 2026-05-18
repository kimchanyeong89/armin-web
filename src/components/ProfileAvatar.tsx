import React, { useEffect, useMemo, useState } from "react";
import type { ProfileImageCrop } from "../types/Profile";
import { getOptimizedImageUrl } from "../utils/imageProxy";

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

// Google profile-photo CDN URLs are unreliable directly inside Android
// WebView. Routing through wsrv.nl (already used for artwork thumbnails)
// makes them load consistently. Non-Google URLs (R2, custom uploads,
// museum CDNs) pass through unchanged.
function isGoogleAvatarHost(url: string): boolean {
  return /(^|\/\/)(lh\d+|lh\d+\.l)\.googleusercontent\.com/.test(url) ||
    url.includes(".ggpht.com");
}

function buildAvatarSrc(url: string, size: number): string {
  if (!url) return "";
  if (url.startsWith("data:") || url.startsWith("blob:")) return url;
  if (!isGoogleAvatarHost(url)) return url;
  const target = url.replace(/=s\d+-c(-[^=]*)?$/i, `=s${Math.max(96, size * 3)}-c`);
  return getOptimizedImageUrl(target, Math.max(96, size * 3), 85, "webp");
}

export default function ProfileAvatar({
  src,
  crop,
  size,
  alt = "Profile",
  fallback,
  background = "#D4A547",
}: ProfileAvatarProps) {
  const safeSize = Math.max(12, size);

  const [didError, setDidError] = useState(false);
  // Track the image's natural aspect ratio (height/width). Used to
  // compute an EXPLICIT height for the cropped <img>. We can't rely on
  // `height: auto` here because Android WebView and iOS WebKit resolve
  // it on slightly different timelines relative to when the transform
  // is applied — that race produces a visible position drift on Android
  // when the same saved crop renders correctly on iOS. Defaulting to a
  // 1.5 (portrait) ratio gives a sensible first-paint height for paintings
  // before onLoad fires.
  const [naturalAspect, setNaturalAspect] = useState<number>(1.5);
  useEffect(() => {
    setDidError(false);
  }, [src]);

  const hasCrop = useMemo(() => {
    if (!crop) return false;
    const scale = Number(crop.scale);
    if (!Number.isFinite(scale) || scale <= 0) return false;
    const x = Number(crop.x) || 0;
    const y = Number(crop.y) || 0;
    return scale !== 1 || x !== 0 || y !== 0;
  }, [crop]);

  const previewSize = hasCrop ? Math.max(1, toNumber(crop?.previewSize, 292)) : 292;
  const maskSize = hasCrop ? Math.max(1, toNumber(crop?.maskSize, 150)) : 150;
  const previewScaleFactor = previewSize / 240;
  const translateX = hasCrop ? toNumber(crop?.x, 0) * previewScaleFactor : 0;
  const translateY = hasCrop ? toNumber(crop?.y, 0) * previewScaleFactor : 0;
  const cropScale = hasCrop ? Math.max(0.2, toNumber(crop?.scale, 1)) : 1;
  const avatarScale = safeSize / maskSize;

  const renderTarget = hasCrop ? previewSize : safeSize;
  const proxiedSrc = src ? buildAvatarSrc(src, renderTarget) : "";
  const showImage = !!proxiedSrc && !didError;

  // Explicit pixel height for the cropped image, computed from its
  // natural aspect ratio. This replaces `height: auto`, which resolved
  // differently on Android WebView (the y-translate was being applied
  // before the auto height was known, leaving the photo offset).
  const explicitImgHeight = previewSize * (naturalAspect || 1.5);

  const handleImgLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    if (img.naturalWidth > 0 && img.naturalHeight > 0) {
      const aspect = img.naturalHeight / img.naturalWidth;
      if (Number.isFinite(aspect) && aspect > 0 && Math.abs(aspect - naturalAspect) > 0.001) {
        setNaturalAspect(aspect);
      }
    }
  };

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
      {showImage ? (
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
                key={proxiedSrc}
                src={proxiedSrc}
                alt={alt}
                loading="eager"
                referrerPolicy="no-referrer"
                onError={() => setDidError(true)}
                onLoad={handleImgLoad}
                style={{
                  position: "absolute",
                  top: "50%",
                  left: "50%",
                  width: previewSize,
                  height: explicitImgHeight,
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
            key={proxiedSrc}
            src={proxiedSrc}
            alt={alt}
            loading="eager"
            referrerPolicy="no-referrer"
            onError={() => setDidError(true)}
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
