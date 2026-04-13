import { motion } from "framer-motion";
import { Globe2, Search, Sparkles, User, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { useLanguage } from "../contexts/LanguageContext";

export type MainTab = {
  id: "map" | "community" | "ai" | "profile" | "search";
  label: string;
  shortLabel: string;
  path: string;
  Icon: typeof Globe2;
};

export const MAIN_TABS: MainTab[] = [
  { id: "map", label: "Globe", shortLabel: "Globe", path: "/", Icon: Globe2 },
  { id: "community", label: "Community", shortLabel: "Comm", path: "/community", Icon: Users },
  { id: "ai", label: "AI", shortLabel: "AI", path: "/ai", Icon: Sparkles },
  { id: "profile", label: "Profile", shortLabel: "Profile", path: "/mypage", Icon: User },
  { id: "search", label: "Search", shortLabel: "Search", path: "/search", Icon: Search },
];

type BottomPageNavigatorProps = {
  activeIndex: number;
  onChange: (index: number) => void;
  lightMode?: boolean;
};

export function resolveMainTabIndex(pathname: string): number | null {
  if (
    pathname === "/" ||
    pathname.startsWith("/interactive") ||
    pathname.startsWith("/collection") ||
    pathname.startsWith("/artist-gallery")
  ) {
    return 0;
  }

  if (pathname.startsWith("/community")) return 1;
  if (pathname.startsWith("/ai") || pathname.startsWith("/exhibitions")) return 2;
  if (pathname.startsWith("/mypage")) return 3;
  if (pathname.startsWith("/search")) return 4;

  return null;
}

export default function BottomPageNavigator({ activeIndex, onChange, lightMode = false }: BottomPageNavigatorProps) {
  const { language } = useLanguage();
  const [viewportWidth, setViewportWidth] = useState(() => (typeof window !== "undefined" ? window.innerWidth : 1280));

  useEffect(() => {
    const onResize = () => {
      setViewportWidth(window.innerWidth);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const isMobile = viewportWidth < 768;
  const isNarrow = viewportWidth < 390;
  const navWidth = Math.min(Math.max(viewportWidth - 20, 280), 640);

  const inactiveColor = lightMode ? "rgba(0,0,0,0.46)" : "rgba(255,255,255,0.46)";
  const containerBg = lightMode ? "rgba(10,10,10,0.06)" : "rgba(255,255,255,0.09)";
  const containerBorder = lightMode ? "1px solid rgba(0,0,0,0.08)" : "1px solid rgba(255,255,255,0.10)";
  const containerShadow = lightMode
    ? "0 2px 24px rgba(0,0,0,0.07), inset 0 1px 0 rgba(255,255,255,0.55)"
    : "0 2px 28px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.05)";

  return (
    <nav
      style={{
        position: "fixed",
        left: isMobile ? 0 : "50%",
        bottom: isMobile ? 0 : "calc(10px + env(safe-area-inset-bottom, 0px))",
        transform: isMobile ? "none" : "translateX(-50%)",
        zIndex: 250000,
        pointerEvents: "auto",
        fontFamily: "'Space Grotesk', sans-serif",
        width: isMobile ? "100vw" : `${navWidth}px`,
        maxWidth: isMobile ? "100vw" : "calc(100vw - 10px)",
      }}
      aria-label="Main page navigator"
    >
      <motion.div
        layout
        transition={{ layout: { type: "spring", stiffness: 340, damping: 30, mass: 0.85 } }}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: isMobile ? 2 : isNarrow ? 0 : 2,
          padding: isMobile
            ? `8px 8px calc(10px + env(safe-area-inset-bottom, 0px))`
            : isNarrow
              ? 4
              : 6,
          borderRadius: isMobile ? "20px 20px 0 0" : 999,
          background: isMobile
            ? (lightMode ? "rgba(246,246,246,0.97)" : "rgba(15,15,15,0.94)")
            : containerBg,
          border: isMobile
            ? (lightMode ? "1px solid rgba(0,0,0,0.08)" : "1px solid rgba(255,255,255,0.10)")
            : containerBorder,
          boxShadow: isMobile
            ? (lightMode
              ? "0 -8px 24px rgba(0,0,0,0.10), inset 0 1px 0 rgba(255,255,255,0.65)"
              : "0 -12px 30px rgba(0,0,0,0.50), inset 0 1px 0 rgba(255,255,255,0.05)")
            : containerShadow,
          backdropFilter: "blur(28px)",
          WebkitBackdropFilter: "blur(28px)",
        }}
      >
        {MAIN_TABS.map((item, index) => {
          const isActive = index === activeIndex;
          const fullLabel = language === "ko"
            ? (item.id === "map" ? "지도" : item.id === "community" ? "커뮤니티" : item.id === "ai" ? "AI" : item.id === "profile" ? "마이페이지" : "검색")
            : item.label;
          const shortLabel = language === "ko"
            ? (item.id === "map" ? "지도" : item.id === "community" ? "커뮤" : item.id === "ai" ? "AI" : item.id === "profile" ? "마이" : "검색")
            : item.shortLabel;
          return (
            <motion.button
              layout
              transition={{ layout: { type: "spring", stiffness: 340, damping: 30, mass: 0.86 } }}
              key={item.id}
              onClick={() => onChange(index)}
              style={{
                position: "relative",
                display: "flex",
                flexDirection: isMobile ? "column" : "row",
                alignItems: "center",
                gap: isMobile ? 3 : 6,
                border: "none",
                background: "transparent",
                borderRadius: isMobile ? 14 : 999,
                padding: isMobile ? (isNarrow ? "7px 4px" : "8px 6px") : isNarrow ? "8px 8px" : "9px 18px",
                color: isActive ? "#000" : inactiveColor,
                fontSize: isMobile ? 10 : isNarrow ? 10 : 12,
                fontWeight: isActive ? 600 : 400,
                letterSpacing: "0.015em",
                cursor: "pointer",
                outline: "none",
                userSelect: "none",
                transition: "color 0.15s",
                whiteSpace: "nowrap",
                minWidth: 0,
                flex: "1 1 0",
                justifyContent: "center",
                minHeight: isMobile ? 52 : undefined,
              }}
              aria-current={isActive ? "page" : undefined}
              aria-label={fullLabel}
            >
              {isActive && (
                <motion.span
                  layoutId="bottom-main-tab-active"
                  transition={{ type: "spring", stiffness: 420, damping: 34, mass: 0.88 }}
                  style={{
                    position: "absolute",
                    inset: isMobile ? "2px" : 0,
                    borderRadius: isMobile ? 12 : 999,
                    background: "#BFFF0A",
                  }}
                />
              )}
              <item.Icon
                size={isMobile ? (isNarrow ? 14 : 15) : isNarrow ? 12 : 13}
                strokeWidth={isActive ? 2.5 : 1.75}
                style={{ position: "relative", zIndex: 1, flexShrink: 0 }}
              />
              <motion.span
                layout
                transition={{ layout: { type: "spring", stiffness: 340, damping: 30, mass: 0.86 } }}
                style={{
                  position: "relative",
                  zIndex: 1,
                  fontSize: isMobile ? (isNarrow ? 9 : 10) : isNarrow ? 9 : 12,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  lineHeight: 1.1,
                }}
              >
                {isMobile ? shortLabel : fullLabel}
              </motion.span>
            </motion.button>
          );
        })}
      </motion.div>
    </nav>
  );
}
