import { motion } from "framer-motion";
import { useLanguage, type AppLanguage } from "../contexts/LanguageContext";

// Sliding gold highlight glides between the two segments. Matched to the
// BottomPageNavigator spring so the whole app's chrome shares one motion feel.
const SPRING = { type: "spring" as const, stiffness: 380, damping: 32, mass: 0.7 };

const OPTIONS: { code: AppLanguage; label: string }[] = [
  { code: "ko", label: "KR" },
  { code: "en", label: "EN" },
];

/**
 * Segmented KR | EN language switch. Always shows both choices with the active
 * one filled gold, so the current language and the toggle target are visible at
 * a glance — unlike a single flip-button buried in the profile menu.
 *
 * Glass tokens mirror BottomPageNavigator so it reads as native app chrome.
 */
export default function LanguageToggle({
  light = false,
  layoutId = "language-toggle-pill",
}: {
  light?: boolean;
  // Unique per shared-layout group. The floating (App.tsx) and search-bar
  // (GlobalSearchBar) copies must differ, or framer-motion tries to glide one
  // gold pill between the two locations during route transitions.
  layoutId?: string;
}) {
  const { language, setLanguage } = useLanguage();

  const inactiveColor = light ? "rgba(0,0,0,0.46)" : "rgba(255,255,255,0.52)";
  const containerBg = light ? "rgba(10,10,10,0.06)" : "rgba(255,255,255,0.09)";
  const containerBorder = light ? "1px solid rgba(0,0,0,0.08)" : "1px solid rgba(255,255,255,0.10)";
  const containerShadow = light
    ? "0 2px 24px rgba(0,0,0,0.07), inset 0 1px 0 rgba(255,255,255,0.55)"
    : "0 2px 28px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.05)";

  return (
    <div
      role="group"
      aria-label="Language / 언어"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 2,
        padding: 3,
        borderRadius: 999,
        background: containerBg,
        border: containerBorder,
        boxShadow: containerShadow,
        backdropFilter: "blur(28px)",
        WebkitBackdropFilter: "blur(28px)",
        fontFamily: "'Space Grotesk', sans-serif",
        userSelect: "none",
      }}
    >
      {OPTIONS.map(({ code, label }) => {
        const isActive = language === code;
        return (
          <button
            key={code}
            type="button"
            onClick={() => setLanguage(code)}
            aria-pressed={isActive}
            title={code === "ko" ? "한국어" : "English"}
            style={{
              position: "relative",
              border: "none",
              background: "transparent",
              borderRadius: 999,
              padding: "5px 12px",
              minWidth: 34,
              lineHeight: 1,
              cursor: "pointer",
              outline: "none",
              color: isActive ? "#000" : inactiveColor,
              fontSize: 11,
              fontWeight: isActive ? 700 : 500,
              letterSpacing: "0.07em",
              fontFamily: "'Space Grotesk', sans-serif",
              WebkitTapHighlightColor: "transparent",
              transition: "color 0.25s ease",
            }}
          >
            {isActive && (
              <motion.span
                layoutId={layoutId}
                transition={SPRING}
                style={{
                  position: "absolute",
                  inset: 0,
                  borderRadius: 999,
                  background: "#D4A547",
                  zIndex: 0,
                }}
              />
            )}
            <span style={{ position: "relative", zIndex: 1 }}>{label}</span>
          </button>
        );
      })}
    </div>
  );
}
