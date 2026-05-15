import { Globe2, Search, Sparkles, User, Users, Menu, CalendarCheck } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useLanguage } from "../contexts/LanguageContext";
import { useIsAdmin } from "../lib/admin";

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

// Apple-ish "out" curve used only for the hamburger popover. The pill's
// collapse/expand uses framer-motion springs (see motion.button transitions
// below) — CSS transitions on max-width + padding + gap caused subpixel
// jitter because each property reflowed on its own curve; springs coordinate
// all properties on one physics clock.
const SPRING_OUT = "cubic-bezier(0.32, 0.72, 0, 1)";
const TRANS_MENU = `opacity 0.25s ease-out, transform 0.35s ${SPRING_OUT}`;

// Spring presets for the pill animation. Tuned for a quick pickup with a
// gentle settle (no overshoot bounce on width — that would re-introduce the
// "shaking" the user complained about).
const SPRING_WIDTH = { type: "spring" as const, stiffness: 280, damping: 30, mass: 0.6 };
const SPRING_SCALE = { type: "spring" as const, stiffness: 360, damping: 28 };
const FADE_FAST = { duration: 0.18, ease: [0.32, 0.72, 0, 1] as [number, number, number, number] };

export default function BottomPageNavigator({ activeIndex, onChange, lightMode = false }: BottomPageNavigatorProps) {
  const { language } = useLanguage();
  const navigate = useNavigate();
  const { isAdmin } = useIsAdmin();
  const [viewportWidth, setViewportWidth] = useState(() => (typeof window !== "undefined" ? window.innerWidth : 1280));
  const [isHovered, setIsHovered] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Click-outside to close the menu
  useEffect(() => {
    if (!isMenuOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [isMenuOpen]);

  const isMobile = viewportWidth < 768;
  const isNarrow = viewportWidth < 390;

  // On desktop the pill collapses to show only the active tab (+ hamburger)
  // at rest, then expands on hover. On mobile we never collapse — touch
  // devices don't have hover, and the existing full-width bottom bar is
  // already the expected mobile pattern.
  const isExpanded = isMobile || isHovered || isMenuOpen;

  const inactiveColor = lightMode ? "rgba(0,0,0,0.46)" : "rgba(255,255,255,0.46)";
  const containerBg = lightMode ? "rgba(10,10,10,0.06)" : "rgba(255,255,255,0.09)";
  const containerBorder = lightMode ? "1px solid rgba(0,0,0,0.08)" : "1px solid rgba(255,255,255,0.10)";
  const containerShadow = lightMode
    ? "0 2px 24px rgba(0,0,0,0.07), inset 0 1px 0 rgba(255,255,255,0.55)"
    : "0 2px 28px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.05)";

  return (
    <nav
      onMouseEnter={() => !isMobile && setIsHovered(true)}
      onMouseLeave={() => !isMobile && setIsHovered(false)}
      style={{
        position: "fixed",
        left: isMobile ? 0 : "50%",
        bottom: isMobile ? 0 : "calc(10px + env(safe-area-inset-bottom, 0px))",
        transform: isMobile ? "none" : "translateX(-50%)",
        zIndex: 250000,
        pointerEvents: "auto",
        fontFamily: "'Space Grotesk', sans-serif",
        // The width auto-fits its children. With max-width transitions on
        // each child, the container's intrinsic width animates organically
        // from "active tab only" to "all tabs + hamburger" on hover.
        width: isMobile ? "100vw" : "auto",
        maxWidth: "100vw",
      }}
      aria-label="Main page navigator"
    >
      {/* Hamburger popover menu (renders above the pill). */}
      {isMenuOpen && !isMobile && (
        <div
          ref={menuRef}
          style={{
            position: "absolute",
            bottom: "calc(100% + 10px)",
            right: 8,
            minWidth: 200,
            padding: 6,
            borderRadius: 14,
            background: lightMode ? "rgba(246,246,246,0.98)" : "rgba(15,15,15,0.97)",
            border: containerBorder,
            boxShadow: lightMode
              ? "0 12px 40px rgba(0,0,0,0.18)"
              : "0 12px 40px rgba(0,0,0,0.65)",
            backdropFilter: "blur(28px)",
            WebkitBackdropFilter: "blur(28px)",
            display: "flex",
            flexDirection: "column",
            gap: 2,
            transition: TRANS_MENU,
            // Mounted = visible. If we wanted a leave-animation we'd need
            // an AnimatePresence; the menu closes on click-outside anyway.
            opacity: 1,
            transform: "translateY(0)",
          }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {isAdmin && (
            <MenuItem
              icon={<CalendarCheck size={15} />}
              label={language === "ko" ? "주간 큐레이션 관리" : "Weekly Admin"}
              onClick={() => {
                setIsMenuOpen(false);
                navigate("/admin/weekly");
              }}
              lightMode={lightMode}
            />
          )}
          {isAdmin && (
            <MenuItem
              icon={<User size={15} />}
              label={language === "ko" ? "관리자 페이지" : "Admin"}
              onClick={() => {
                setIsMenuOpen(false);
                navigate("/admin");
              }}
              lightMode={lightMode}
            />
          )}
          {!isAdmin && (
            <div style={{ padding: "10px 12px", fontSize: 11, color: inactiveColor }}>
              {language === "ko" ? "추가 메뉴 항목이 곧 생깁니다." : "More menu items coming soon."}
            </div>
          )}
        </div>
      )}

      {isMobile ? (
        // ── Mobile: full-width bottom bar, no hover, no animation. ──────────
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 0,
            padding: "6px 6px 24px 6px",
            borderRadius: "24px 24px 0 0",
            background: lightMode ? "rgba(246,246,246,0.97)" : "rgba(15,15,15,0.94)",
            border: lightMode ? "1px solid rgba(0,0,0,0.08)" : "1px solid rgba(255,255,255,0.10)",
            boxShadow: lightMode
              ? "0 -8px 24px rgba(0,0,0,0.10), inset 0 1px 0 rgba(255,255,255,0.65)"
              : "0 -12px 30px rgba(0,0,0,0.50), inset 0 1px 0 rgba(255,255,255,0.05)",
            backdropFilter: "blur(28px)",
            WebkitBackdropFilter: "blur(28px)",
            overflow: "hidden",
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
              <button
                key={item.id}
                onClick={() => onChange(index)}
                style={{
                  position: "relative",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 2,
                  border: "none",
                  background: "transparent",
                  borderRadius: 12,
                  padding: "6px 2px",
                  color: isActive ? "#000" : inactiveColor,
                  fontSize: isNarrow ? 10 : 10,
                  fontWeight: isActive ? 600 : 400,
                  letterSpacing: "0.015em",
                  cursor: "pointer",
                  outline: "none",
                  userSelect: "none",
                  whiteSpace: "nowrap",
                  minWidth: 0,
                  flex: "1 1 0",
                  justifyContent: "center",
                  minHeight: 44,
                  overflow: "hidden",
                  transition: "color 0.15s",
                }}
                aria-current={isActive ? "page" : undefined}
                aria-label={fullLabel}
              >
                {isActive && (
                  <span
                    style={{
                      position: "absolute",
                      inset: "2px",
                      borderRadius: 12,
                      background: "#D4A547",
                    }}
                  />
                )}
                <item.Icon
                  size={isNarrow ? 14 : 15}
                  strokeWidth={isActive ? 2.5 : 1.75}
                  style={{ position: "relative", zIndex: 1, flexShrink: 0 }}
                />
                <span
                  style={{
                    position: "relative",
                    zIndex: 1,
                    fontSize: isNarrow ? 9 : 10,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    lineHeight: 1.1,
                  }}
                >
                  {shortLabel}
                </span>
              </button>
            );
          })}
        </div>
      ) : (
        // ── Desktop: collapsing pill driven by framer-motion springs. ───────
        // No explicit container width — children animate width+padding via
        // springs, and the flex container auto-fits. Springs coordinate all
        // properties on one physics clock, which is what kills the jitter
        // the user was seeing with parallel CSS transitions.
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-start",
            gap: isNarrow ? 0 : 2,
            padding: isNarrow ? 4 : 6,
            borderRadius: 999,
            background: containerBg,
            border: containerBorder,
            boxShadow: containerShadow,
            backdropFilter: "blur(28px)",
            WebkitBackdropFilter: "blur(28px)",
            overflow: "hidden",
            // height is constant: vertical padding doesn't change with state,
            // so we don't need a fixed-height value. No transition needed
            // here either — the children drive the width animation.
          }}
        >
          {MAIN_TABS.map((item, index) => {
            const isActive = index === activeIndex;
            // Collapse rule: when not expanded, only the active tab is visible.
            const isVisible = isExpanded || isActive;
            // Active tab grows when collapsed — pure transform, no reflow.
            const activeGrowScale = !isExpanded && isActive ? 1.18 : 1;

            const fullLabel = language === "ko"
              ? (item.id === "map" ? "지도" : item.id === "community" ? "커뮤니티" : item.id === "ai" ? "AI" : item.id === "profile" ? "마이페이지" : "검색")
              : item.label;

            const horizPadding = isVisible ? (isNarrow ? 8 : 18) : 0;

            return (
              <motion.button
                key={item.id}
                onClick={() => onChange(index)}
                tabIndex={isVisible ? 0 : -1}
                aria-hidden={!isVisible}
                initial={false}
                animate={{
                  width: isVisible ? "auto" : 0,
                  opacity: isVisible ? 1 : 0,
                  paddingLeft: horizPadding,
                  paddingRight: horizPadding,
                  scale: activeGrowScale,
                }}
                transition={{
                  width: SPRING_WIDTH,
                  paddingLeft: SPRING_WIDTH,
                  paddingRight: SPRING_WIDTH,
                  opacity: FADE_FAST,
                  scale: SPRING_SCALE,
                }}
                style={{
                  position: "relative",
                  display: "flex",
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                  border: "none",
                  background: "transparent",
                  borderRadius: 999,
                  paddingTop: 9,
                  paddingBottom: 9,
                  color: isActive ? "#000" : inactiveColor,
                  fontSize: isNarrow ? 10 : 12,
                  fontWeight: isActive ? 600 : 400,
                  letterSpacing: "0.015em",
                  cursor: "pointer",
                  outline: "none",
                  userSelect: "none",
                  whiteSpace: "nowrap",
                  minWidth: 0,
                  flex: "0 0 auto",
                  justifyContent: "center",
                  overflow: "hidden",
                  pointerEvents: isVisible ? "auto" : "none",
                  // Grow from the center so the pill stays balanced.
                  transformOrigin: "center center",
                }}
                aria-current={isActive ? "page" : undefined}
                aria-label={fullLabel}
              >
                {isActive && (
                  <span
                    style={{
                      position: "absolute",
                      inset: 0,
                      borderRadius: 999,
                      background: "#D4A547",
                    }}
                  />
                )}
                <item.Icon
                  size={isNarrow ? 12 : 13}
                  strokeWidth={isActive ? 2.5 : 1.75}
                  style={{ position: "relative", zIndex: 1, flexShrink: 0 }}
                />
                <span
                  style={{
                    position: "relative",
                    zIndex: 1,
                    fontSize: isNarrow ? 9 : 12,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    lineHeight: 1.1,
                  }}
                >
                  {fullLabel}
                </span>
              </motion.button>
            );
          })}

          {/* Hamburger — desktop only. Same width+opacity collapse pattern. */}
          <motion.button
            onClick={(e) => {
              e.stopPropagation();
              setIsMenuOpen((v) => !v);
            }}
            aria-label={language === "ko" ? "더보기 메뉴" : "More menu"}
            aria-expanded={isMenuOpen}
            tabIndex={isExpanded ? 0 : -1}
            initial={false}
            animate={{
              width: isExpanded ? "auto" : 0,
              opacity: isExpanded ? 1 : 0,
              paddingLeft: isExpanded ? 12 : 0,
              paddingRight: isExpanded ? 12 : 0,
            }}
            transition={{
              width: SPRING_WIDTH,
              paddingLeft: SPRING_WIDTH,
              paddingRight: SPRING_WIDTH,
              opacity: FADE_FAST,
            }}
            style={{
              position: "relative",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              border: "none",
              background: isMenuOpen
                ? (lightMode ? "rgba(0,0,0,0.08)" : "rgba(255,255,255,0.12)")
                : "transparent",
              borderRadius: 999,
              paddingTop: 9,
              paddingBottom: 9,
              color: isMenuOpen
                ? (lightMode ? "#000" : "#fff")
                : inactiveColor,
              cursor: "pointer",
              outline: "none",
              flex: "0 0 auto",
              overflow: "hidden",
              pointerEvents: isExpanded ? "auto" : "none",
            }}
          >
            <Menu
              size={isNarrow ? 14 : 16}
              strokeWidth={isMenuOpen ? 2.5 : 1.75}
              style={{ flexShrink: 0 }}
            />
          </motion.button>
        </div>
      )}
    </nav>
  );
}

// ── Menu item ──────────────────────────────────────────────────────────────
function MenuItem({
  icon,
  label,
  onClick,
  lightMode,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  lightMode: boolean;
}) {
  const [hover, setHover] = useState(false);
  const fg = lightMode ? "#111" : "#f4f1ea";
  const hoverBg = lightMode ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.08)";
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 12px",
        background: hover ? hoverBg : "transparent",
        border: "none",
        borderRadius: 8,
        color: fg,
        fontSize: 13,
        fontWeight: 500,
        cursor: "pointer",
        outline: "none",
        textAlign: "left",
        transition: "background 0.15s ease-out",
      }}
    >
      <span style={{ display: "inline-flex", flexShrink: 0 }}>{icon}</span>
      <span>{label}</span>
    </button>
  );
}
