import type { CSSProperties } from "react";
import { useLanguage } from "../contexts/LanguageContext";
import { hasNativeAr, openNativeAr } from "../utils/nativeAr";

/**
 * "AR" beside the like and save-to-playlist marks: opens the app's AR screen
 * with this artwork. Renders nothing where the app has no AR screen (browsers,
 * older builds), so it can sit in any row of artwork actions. Its box comes
 * from the row it is in (`style`, or the row's own button CSS).
 */
export default function ArButton({ image, style, fontSize = 9 }: { image?: string | null; style?: CSSProperties; fontSize?: number }) {
  const { language } = useLanguage();
  if (!image || !hasNativeAr()) return null;
  const label = language === "ko" ? "내 공간에 걸어 보기" : "View in your space";
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        openNativeAr(image, language);
      }}
      style={{ fontFamily: "'Space Mono', monospace", fontSize, fontWeight: 700, letterSpacing: "0.04em", lineHeight: 1, ...style }}
    >
      AR
    </button>
  );
}
