import { useEffect, useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import { useLanguage } from "../contexts/LanguageContext";
import type { MobileChromeTweakId } from "./mobileChromeTweaks";
import { NavIcon } from "./NavIcons";
import "./BottomPageNavigator.css";

export type MainTab = {
  id: "map" | "community" | "ai" | "profile" | "search";
  label: string;
  shortLabel: string;
  path: string;
};

export const MAIN_TABS: MainTab[] = [
  { id: "map", label: "Globe", shortLabel: "Globe", path: "/" },
  { id: "community", label: "Community", shortLabel: "Comm", path: "/community" },
  { id: "ai", label: "AI", shortLabel: "AI", path: "/ai" },
  { id: "profile", label: "Profile", shortLabel: "Profile", path: "/mypage" },
  { id: "search", label: "Search", shortLabel: "Search", path: "/search" },
];

type BottomPageNavigatorProps = {
  activeIndex: number;
  onChange: (index: number) => void;
  lightMode?: boolean;
  mobileChromeTweak?: MobileChromeTweakId;
  /** a handle that stands on the bar's top edge (the wall's, on a phone) */
  grip?: ReactNode;
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
  // /exhibitions used to live under the AI tab. Nearby exhibitions are a map
  // feature now, so the map tab is the one that should stay lit.
  if (pathname.startsWith("/exhibitions")) return 0;
  if (pathname.startsWith("/ai")) return 2;
  if (pathname.startsWith("/mypage")) return 3;
  if (pathname.startsWith("/search")) return 4;

  return null;
}

const LAYOUT_SPRING = { type: "spring" as const, stiffness: 360, damping: 34, mass: 0.7 };

export default function BottomPageNavigator({
  activeIndex,
  onChange,
  lightMode = false,
  grip,
}: BottomPageNavigatorProps) {
  const { language } = useLanguage();
  const [viewportWidth, setViewportWidth] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth : 1280,
  );

  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const isMobile = viewportWidth < 768;
  const isNarrow = viewportWidth < 390;
  const bottomChromeTweak = "double-bezel";

  return (
    <nav
      className="bpn"
      style={{
        position: "fixed",
        left: isMobile ? 0 : "50%",
        bottom: isMobile ? 0 : "calc(10px + env(safe-area-inset-bottom, 0px))",
        transform: isMobile ? "none" : "translateX(-50%)",
        zIndex: 250000,
        pointerEvents: "auto",
        fontFamily: "'Space Grotesk', sans-serif",
        width: isMobile ? "100vw" : "auto",
        maxWidth: "100vw",
      }}
      aria-label="Main page navigator"
      data-mobile-chrome-tweak={bottomChromeTweak}
      data-light-mode={lightMode ? "true" : "false"}
      data-narrow={isNarrow ? "true" : "false"}
      data-mobile={isMobile ? "true" : "false"}
    >
      {grip}
      <div className="bpn-pill-shell bpn-mobile-shell">
        {MAIN_TABS.map((item, index) => {
          const isActive = index === activeIndex;
          const fullLabel = language === "ko"
            ? (item.id === "map" ? "지도" : item.id === "community" ? "커뮤니티" : item.id === "ai" ? "AI" : item.id === "profile" ? "마이페이지" : "검색")
            : item.label;
          // Korean tabs always spell the name out - "커뮤"/"마이" read as abbreviations.
          const shortLabel = language === "ko" ? fullLabel : item.shortLabel;

          return (
            <button
              key={item.id}
              className="bpn-mobile-tab"
              data-active={isActive ? "true" : "false"}
              data-tab={item.id}
              onClick={() => onChange(index)}
              aria-current={isActive ? "page" : undefined}
              aria-label={fullLabel}
            >
              {isActive && (
                <motion.span
                  layoutId="navActivePillMobile"
                  transition={LAYOUT_SPRING}
                  className="bpn-mobile-active"
                />
              )}
              <NavIcon id={item.id} className="bpn-mobile-icon" size={isNarrow ? 20 : 22} active={isActive} />
              <span className="bpn-mobile-label">{shortLabel}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
