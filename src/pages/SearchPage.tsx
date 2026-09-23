import { useEffect, useMemo, useState } from "react";
import GlobalSearchBar from "../components/GlobalSearchBar";
import GenreMuseumBrowse from "../components/GenreMuseumBrowse";
import { exhibitions } from "../data/exhibitions";
import { useLanguage } from "../contexts/LanguageContext";
import "./searchRedesign.css";

export default function SearchPage() {
  const { t } = useLanguage();
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
      className="sr"
      style={{
        width: "100%",
        height: "100dvh",
        overflowY: "auto",
        background: "#080808",
        padding: isMobileLayout ? "var(--page-top) 14px 110px" : "var(--page-top) 28px 110px",
        boxSizing: "border-box",
      }}
    >
      <div style={{ maxWidth: 1000, margin: "0 auto" }}>
        {/* The lead the drawer study opens with: the label, the line of
            type, then the field directly under it - no card around it. */}
        <section className="sr-lead colly-rise">
          <p className="sr-lead__meta">{t({ ko: "검색", en: "SEARCH" })}</p>
          {/* Broken by hand: letting width decide split "어느" from the
              "미술관" it modifies. The comma is the meaning break. */}
          <h1>
            {t({ ko: "무엇이든,", en: "Anything," })}
            <br />
            {t({ ko: "어느 미술관에서든.", en: "in any museum." })}
          </h1>
        </section>

        <GlobalSearchBar inlineMode forceWidth="100%" museums={museums as any} />

        <GenreMuseumBrowse isMobile={isMobileLayout} museums={museums as any} />
      </div>
    </div>
  );
}
