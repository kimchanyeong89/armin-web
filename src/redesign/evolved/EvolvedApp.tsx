import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { createPreviewData, getExhibitionModalWorks, selectPreviewArtwork } from "../data";
import { buildEvolvedPath, parseEvolvedPath, type EvolvedPanel } from "../model";
import {
  EvolvedAIPanel,
  EvolvedCommunityPanel,
  EvolvedGlobePanel,
  EvolvedProfilePanel,
  EvolvedSearchPanel,
  EvolvedWorkPanel,
  ExhibitionArtworkModal,
  type SearchScope,
} from "./EvolvedPanels";

const evolvedData = createPreviewData();
const EVOLVED_SEARCH_SCOPES: readonly SearchScope[] = ["all", "artworks", "museums", "exhibitions"];
const EVOLVED_COMMUNITY_CATEGORIES = new Set([
  "All",
  ...evolvedData.posts.map((post) => post.category),
]);

const NAV_ITEMS: Array<{ panel: Exclude<EvolvedPanel, "work">; label: string; mark: string }> = [
  { panel: "globe", label: "Globe", mark: "◎" },
  { panel: "community", label: "Community", mark: "◌" },
  { panel: "ai", label: "AI", mark: "✣" },
  { panel: "profile", label: "Profile", mark: "◇" },
  { panel: "search", label: "Search", mark: "⌕" },
];

export function EvolvedExperience() {
  const location = useLocation();
  const navigate = useNavigate();
  const route = parseEvolvedPath(location.pathname) || { panel: "globe" as const };
  const searchParams = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const query = searchParams.get("q") || "";
  const scopeParam = searchParams.get("scope");
  const searchScope = scopeParam && EVOLVED_SEARCH_SCOPES.includes(scopeParam as SearchScope)
    ? scopeParam as SearchScope
    : "all";
  const topicParam = searchParams.get("topic") || "All";
  const communityCategory = EVOLVED_COMMUNITY_CATEGORIES.has(topicParam) ? topicParam : "All";
  const [selectedArtworkIds, setSelectedArtworkIds] = useState<Set<string>>(
    () => new Set(evolvedData.artworks.slice(0, 3).map((work) => work.id)),
  );
  const modalExhibitionId = searchParams.get("exhibition") || "";
  const modalData = useMemo(
    () => modalExhibitionId ? getExhibitionModalWorks(evolvedData, modalExhibitionId) : null,
    [modalExhibitionId],
  );
  const setUrlParam = useCallback((key: string, value: string, defaultValue: string) => {
    const next = new URLSearchParams(location.search);
    if (!value || value === defaultValue) next.delete(key);
    else next.set(key, value);
    const serialized = next.toString();
    navigate(
      { pathname: location.pathname, search: serialized ? `?${serialized}` : "" },
      { replace: true },
    );
  }, [location.pathname, location.search, navigate]);
  const setQuery = (value: string) => setUrlParam("q", value, "");
  const setSearchScope = (value: SearchScope) => setUrlParam("scope", value, "all");
  const setCommunityCategory = (value: string) => setUrlParam("topic", value, "All");
  const closeModal = useCallback(() => {
    const next = new URLSearchParams(location.search);
    next.delete("exhibition");
    const serialized = next.toString();
    navigate(
      { pathname: location.pathname, search: serialized ? `?${serialized}` : "" },
      { replace: true },
    );
  }, [location.pathname, location.search, navigate]);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [location.pathname]);

  const toggleArtwork = (id: string) => {
    setSelectedArtworkIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const panelProps = {
    data: evolvedData,
    query,
    setQuery,
    searchScope,
    setSearchScope,
    selectedArtworkIds,
    toggleArtwork,
    communityCategory,
    setCommunityCategory,
  };
  const content = route.panel === "globe"
    ? <EvolvedGlobePanel data={evolvedData} />
    : route.panel === "community"
      ? <EvolvedCommunityPanel {...panelProps} />
      : route.panel === "ai"
        ? <EvolvedAIPanel {...panelProps} />
        : route.panel === "profile"
          ? <EvolvedProfilePanel data={evolvedData} />
          : route.panel === "search"
            ? <EvolvedSearchPanel {...panelProps} />
            : <EvolvedWorkPanel data={evolvedData} artwork={selectPreviewArtwork(evolvedData, route.id)} />;

  return (
    <div className="ev" data-evolved-panel={route.panel}>
      <a className="ev-skip" href="#evolved-main">Skip to content</a>
      <header className="ev-topbar">
        <Link className="ev-wordmark" to="/redesign">COLLY</Link>
        <div className="ev-data-line">
          <span>{evolvedData.artworks.length.toLocaleString("en")} linked works</span>
          <span>{evolvedData.exhibitions.length.toLocaleString("en")} exhibitions</span>
          <span>{evolvedData.museums.length.toLocaleString("en")} museums</span>
        </div>
        <div className="ev-utility"><span>Read only</span><strong>EN</strong></div>
      </header>
      <main id="evolved-main" className="ev-main">{content}</main>
      <nav className="ev-nav" aria-label="Evolved primary navigation">
        {NAV_ITEMS.map((item) => (
          <Link
            aria-current={route.panel === item.panel ? "page" : undefined}
            key={item.panel}
            to={buildEvolvedPath(item.panel)}
          >
            <i aria-hidden="true">{item.mark}</i><span>{item.label}</span>
          </Link>
        ))}
        <Link className="ev-more" to="/redesign" aria-label="Open redesign studies">···</Link>
      </nav>
      {modalData ? (
        <ExhibitionArtworkModal
          modalData={modalData}
          onClose={closeModal}
          showRecordLink={false}
          workPath={(id) => buildEvolvedPath("work", id)}
        />
      ) : null}
    </div>
  );
}

export default EvolvedExperience;
