import { useMemo } from "react";
import { Link } from "react-router-dom";
import InteractiveGlobeMap from "../components/InteractiveGlobeMap/InteractiveGlobeMap";
import { useLanguage } from "../contexts/LanguageContext";
import { exhibitions } from "../data/exhibitions";
import {
  COLLY_GLOBE_VARIANTS,
  GLOBE_LAB_CANDIDATES,
  buildCollyGlobePath,
  buildGlobeLabPath,
  getCollyGlobeVariant,
  type CollyGlobeVariantSlug,
  type GlobeLabCandidate,
} from "./model";

type GlobeLabPageProps = {
  candidate: GlobeLabCandidate;
  collyVariant?: CollyGlobeVariantSlug;
};

export function GlobeLabPage({ candidate, collyVariant }: GlobeLabPageProps) {
  const { language, toggleLanguage } = useLanguage();
  const activeCollyVariant = candidate.slug === "colly-evolved"
    ? getCollyGlobeVariant(collyVariant)
    : null;
  const candidateIndex = GLOBE_LAB_CANDIDATES.findIndex((item) => item.slug === candidate.slug);
  const studyPosition = candidateIndex + 1;
  const previous = GLOBE_LAB_CANDIDATES[(candidateIndex + GLOBE_LAB_CANDIDATES.length - 1) % GLOBE_LAB_CANDIDATES.length];
  const next = GLOBE_LAB_CANDIDATES[(candidateIndex + 1) % GLOBE_LAB_CANDIDATES.length];
  const localizedCopy = useMemo(() => ({
    name: language === "ko" ? candidate.nameKo : candidate.name,
    headline: activeCollyVariant
      ? (language === "ko" ? "경계에서 지도를 탐구하세요." : "Explore the map from its borders.")
      : (language === "ko" ? candidate.headlineKo : candidate.headline),
    summary: activeCollyVariant
      ? (language === "ko" ? activeCollyVariant.summaryKo : activeCollyVariant.summary)
      : (language === "ko" ? candidate.summaryKo : candidate.summary),
    variantName: activeCollyVariant
      ? (language === "ko" ? activeCollyVariant.nameKo : activeCollyVariant.name)
      : null,
    detailIntroduction: activeCollyVariant ? {
      eyebrow: language === "ko" ? "컬렉션 상세 탐색" : "Collection detail",
      headline: language === "ko" ? "장소에서 작품으로 들어갑니다." : "Move from place to collection.",
      summary: language === "ko"
        ? "선택한 미술관의 작품, 재료, 시대를 한 흐름으로 살펴보는 상세 화면입니다."
        : "This view follows the selected museum through its works, materials, and periods.",
      instruction: language === "ko"
        ? "아래로 이동해 작품을 열고 필터로 범위를 좁혀보세요."
        : "Move down to open works and narrow the collection with filters.",
    } : undefined,
  }), [activeCollyVariant, candidate, language]);

  return (
    <div
      className={`globe-lab globe-lab--${candidate.slug}${activeCollyVariant ? ` globe-lab--colly-${activeCollyVariant.slug}` : ""}`}
      data-globe-lab-skin={candidate.slug}
      data-colly-globe-variant={activeCollyVariant?.slug}
      data-globe-lab-version="2"
      data-globe-map-version="3"
      data-study-position={studyPosition}
    >
      <a className="globe-lab-skip" href="#globe-lab-map">
        {language === "ko" ? "지도로 바로가기" : "Skip to interactive map"}
      </a>

      <header className="globe-lab__header">
        <div className="globe-lab__identity">
          <Link className="globe-lab-wordmark" to={buildGlobeLabPath()} translate="no">COLLY / LAB</Link>
          <p>{localizedCopy.variantName ?? localizedCopy.name}</p>
        </div>
        <nav aria-label={language === "ko" ? "글로브 시안" : "Globe studies"}>
          <Link to={buildGlobeLabPath(previous.slug)} aria-label={`Previous: ${previous.name}`}>←</Link>
          <Link to={buildGlobeLabPath()}>{language === "ko" ? "전체 시안" : "All studies"}</Link>
          <Link to={buildGlobeLabPath(next.slug)} aria-label={`Next: ${next.name}`}>→</Link>
        </nav>
        <button type="button" onClick={toggleLanguage} aria-label={language === "ko" ? "영어로 보기" : "View in Korean"}>
          {language === "ko" ? "EN" : "KO"}
        </button>
      </header>

      {activeCollyVariant && (
        <nav
          className="colly-variant-switcher"
          aria-label={language === "ko" ? "COLLY 지도 버전" : "COLLY map versions"}
        >
          {COLLY_GLOBE_VARIANTS.map((variant, index) => (
            <Link
              key={variant.slug}
              className="colly-variant-switcher__link"
              to={buildCollyGlobePath(variant.slug)}
              aria-current={activeCollyVariant.slug === variant.slug ? "page" : undefined}
            >
              <span aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
              <strong>{language === "ko" ? variant.nameKo : variant.name}</strong>
            </Link>
          ))}
        </nav>
      )}

      <aside className="globe-lab__statement" aria-labelledby="globe-lab-candidate-title">
        <div className="globe-lab__statement-meta">
          {activeCollyVariant ? (
            <span>{language === "ko" ? "지도 읽기 방식" : "Map reading method"}</span>
          ) : (
            <>
              <small>{candidate.skill}</small>
              <span>{language === "ko" ? "공유 지도 엔진" : "Shared map engine"}</span>
            </>
          )}
        </div>
        <h1 id="globe-lab-candidate-title">{localizedCopy.headline}</h1>
        <p>{localizedCopy.summary}</p>
        <footer>
          <span aria-hidden="true">↗</span>
          <span>{activeCollyVariant
            ? (language === "ko" ? "드래그하고 확대해 국가를 선택하세요" : "Drag, zoom, then select a country")
            : (language === "ko" ? "드래그하거나 대륙을 선택하세요" : "Drag the globe or choose a continent")}</span>
        </footer>
      </aside>

      <section className="globe-lab__status" aria-label={language === "ko" ? "지도 현황" : "Map status"}>
        <span>
          <strong>{exhibitions.length}</strong>
          <small>{language === "ko" ? "미술관" : "Museums"}</small>
        </span>
        <span>
          <strong>07</strong>
          <small>{language === "ko" ? "탐색 범위" : "Regions"}</small>
        </span>
        <span>
          <strong>{language === "ko" ? "실시간" : "Live"}</strong>
          <small>{language === "ko" ? "인터랙티브 지도" : "Interactive map"}</small>
        </span>
      </section>

      <main
        id="globe-lab-map"
        className="globe-lab__map"
        data-shared-globe="interactive-d3"
        tabIndex={-1}
      >
        <InteractiveGlobeMap
          exhibitions={exhibitions}
          visualPreset={candidate.slug}
          collyVariant={activeCollyVariant?.slug}
          routeBase={activeCollyVariant
            ? buildCollyGlobePath(activeCollyVariant.slug)
            : buildGlobeLabPath(candidate.slug)}
          detailIntroduction={localizedCopy.detailIntroduction}
          initialTheme={candidate.theme}
        />
      </main>

      <div className="globe-lab__rail" aria-hidden="true">
        <span>90°N</span>
        <i />
        <span>00°</span>
        <i />
        <span>90°S</span>
      </div>
    </div>
  );
}
