import { useEffect, useMemo } from "react";
import GlobalSearchBar from "../components/GlobalSearchBar";
import { exhibitions } from "../data/exhibitions";
import { useLanguage } from "../contexts/LanguageContext";
import { localizeMuseum } from "../i18n/museumLocalization";

export default function SearchPage() {
  const { language } = useLanguage();
  const museums = useMemo(
    () =>
      exhibitions.map((ex) => {
        const localized = localizeMuseum(ex as any, language);
        return {
        id: ex.id,
        name: localized.name,
        country: (ex as any).country || "",
        region: (ex as any).region,
        latitude: (ex as any).latitude || 0,
        longitude: (ex as any).longitude || 0,
        representativeImage: (ex as any).representativeImage,
        permanentExhibitions: (ex as any).permanentExhibitions || [],
        };
      }),
    [language],
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

  return (
    <div
      style={{
        width: "100%",
        height: "100dvh",
        overflowY: "auto",
        background:
          "radial-gradient(1200px 380px at 50% -240px, rgba(191,255,10,0.08), transparent 70%), #050505",
        color: "#f2f2f2",
        fontFamily: "'Space Grotesk', 'Pretendard', 'Apple SD Gothic Neo', sans-serif",
        padding: "14px 12px 110px",
        boxSizing: "border-box",
      }}
    >
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <div
          style={{
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
