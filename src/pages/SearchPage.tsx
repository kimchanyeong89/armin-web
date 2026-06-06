import { useEffect, useMemo, useState } from "react";
import GlobalSearchBar from "../components/GlobalSearchBar";
import { exhibitions } from "../data/exhibitions";

export default function SearchPage() {
  const [isMobileLayout, setIsMobileLayout] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.innerWidth < 768;
  });
  // `name` stays the canonical value so it matches artwork.museumName in the
  // search index; name_ko/name_en ride along for getMuseumDisplayName to localize.
  const museums = useMemo(
    () =>
      exhibitions.map((ex) => ({
        id: ex.id,
        name: (ex as any).name,
        name_ko: (ex as any).name_ko,
        name_en: (ex as any).name_en,
        country: (ex as any).country || "",
        region: (ex as any).region,
        latitude: (ex as any).latitude || 0,
        longitude: (ex as any).longitude || 0,
        representativeImage: (ex as any).representativeImage,
        permanentExhibitions: (ex as any).permanentExhibitions || [],
      })),
    [],
  );

  useEffect(() => {
    const restoredQuery = (() => {
      try {
        return sessionStorage.getItem("globalSearchQuery") || "";
      } catch {
        return "";
      }
    })();
    const t = window.setTimeout(() => {
      window.dispatchEvent(new CustomEvent("global-search-trigger", { detail: { query: restoredQuery } }));
    }, 120);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const syncLayout = () => setIsMobileLayout(window.innerWidth < 768);
    syncLayout();
    window.addEventListener("resize", syncLayout);
    return () => window.removeEventListener("resize", syncLayout);
  }, []);

  return (
    <div
      style={{
        width: "100%",
        height: "100dvh",
        overflowY: "auto",
        background:
          "radial-gradient(1200px 380px at 50% -240px, rgba(212,165,71,0.08), transparent 70%), #050505",
        color: "#f2f2f2",
        fontFamily: "'Space Grotesk', 'Pretendard', 'Apple SD Gothic Neo', sans-serif",
        padding: isMobileLayout
          ? "calc(10px + env(safe-area-inset-top, 0px)) 6px 110px"
          : "calc(14px + env(safe-area-inset-top, 0px)) 12px 110px",
        boxSizing: "border-box",
      }}
    >
      <div style={{ maxWidth: isMobileLayout ? "100%" : 1200, margin: "0 auto" }}>
        <div
          style={isMobileLayout ? {
            padding: 0,
            overflow: "visible",
            background: "transparent",
            border: "none",
            borderRadius: 0,
            boxShadow: "none",
          } : {
            borderRadius: 18,
            border: "1px solid rgba(255,255,255,0.10)",
            background: "linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02) 30%, rgba(0,0,0,0.24))",
            boxShadow: "0 24px 52px rgba(0,0,0,0.42)",
            padding: "10px 10px 4px",
            overflow: "hidden",
          }}
        >
          <GlobalSearchBar inlineMode forceWidth="100%" museums={museums as any} />
        </div>
      </div>
    </div>
  );
}
