import { useCallback, useEffect, useMemo, useState } from "react";
import { BrowserRouter, Link, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import DetailStudiesApp from "./artwork-detail/DetailStudiesApp";
import ProfileStudiesApp from "./profile/ProfileStudiesApp";
import ExhibitionArtworkModal from "./components/ExhibitionArtworkModal";
import PreviewMedia from "./components/PreviewMedia";
import PreviewShell from "./components/PreviewShell";
import DarkConcept from "./concepts/DarkConcept";
import HybridConcept from "./concepts/HybridConcept";
import LightConcept from "./concepts/LightConcept";
import { EvolvedExperience } from "./evolved/EvolvedApp";
import CommunityStudiesApp from "./community/CommunityStudiesApp";
import CommunityBoardApp from "./community-board/CommunityBoardApp";
import CommunityAtlasApp from "./community-atlas/CommunityAtlasApp";
import AIStudiesApp from "./ai/AIStudiesApp";
import MypageStudiesApp from "./mypage/MypageStudiesApp";
import SearchStudiesApp from "./search/SearchStudiesApp";
import ArtworkStudyApp from "./artwork/ArtworkStudyApp";
import ArtistStudiesApp from "./artist/ArtistStudiesApp";
import { LanguageProvider } from "../contexts/LanguageContext";
import { createPreviewData, getExhibitionModalWorks, selectPreviewArtist, selectPreviewArtwork, selectPreviewExhibition } from "./data";
import { buildPreviewPath, parsePreviewPath } from "./model";
import "./redesign.css";

const previewData = createPreviewData();

export function PreviewIndex() {
  const conceptImages = previewData.featuredArtist.works;
  const concepts = [
    {
      id: "hybrid" as const,
      title: "Hybrid editorial",
      description: "Immersive discovery meets a calm reading surface.",
      image: conceptImages[0]?.image || previewData.featuredArtwork.image,
    },
    {
      id: "dark" as const,
      title: "Dark gallery",
      description: "A cinematic field where artworks hold the room.",
      image: conceptImages[1]?.image || previewData.featuredExhibition.image,
    },
    {
      id: "light" as const,
      title: "Light museum",
      description: "A precise catalogue built for sustained reading.",
      image: conceptImages[2]?.image || previewData.featuredMuseum.image,
    },
  ];

  return (
    <div className="rd-index">
      <header className="rd-index-header">
        <span>COLLY</span>
        <a href="/">Current experience</a>
      </header>
      <main>
        <div className="rd-index-intro">
          <p>Redesign study</p>
          <h1>Start with what COLLY already is.</h1>
          <p>One familiar evolution first, followed by three freer visual studies.</p>
        </div>
        <Link className="rd-index-evolved" to="/redesign/evolved/globe">
          <div>
            <span>Recommended direction</span>
            <h2>Evolved COLLY</h2>
            <p>The current globe, bottom navigation, panels, and exhibition flow - refined without relearning.</p>
            <strong>Open familiar redesign <i aria-hidden="true">↗</i></strong>
          </div>
          <PreviewMedia
            src={previewData.featuredArtwork.image}
            alt={`${previewData.featuredArtwork.title} by ${previewData.featuredArtwork.artist}`}
            fallbackLabel={previewData.featuredArtwork.title}
            loading="eager"
          />
        </Link>
        <section className="rd-index-community">
          <div>
            <span>Six functional studies</span>
            <h2>Community, redesigned as six different rooms.</h2>
            <p>Every study keeps the live feed, sorting, categories, nearby exhibitions, writing, likes, and comments.</p>
          </div>
          <div>
            {[
              ["living-archive", "Living Archive"],
              ["salon-stream", "Salon Stream"],
              ["critics-index", "Critics' Index"],
              ["afterimage-gallery", "Afterimage Gallery"],
              ["civic-forum", "Civic Forum"],
              ["collection-grid", "Collection Grid"],
            ].map(([slug, title], index) => (
              <Link key={slug} to={`/redesign/community/${slug}`}>
                <span>{String(index + 1).padStart(2, "0")}</span>{title}<i aria-hidden="true">↗</i>
              </Link>
            ))}
          </div>
        </section>
        <section className="rd-index-community rd-index-board">
          <div>
            <span>Five refinement studies</span>
            <h2>Same board, five levels of detail.</h2>
            <p>The live composition kept intact - only element sizing and the placement inside a row change.</p>
          </div>
          <div>
            {[
              ["tight", "Tight", "density"],
              ["gallery", "Gallery", "image-led"],
              ["aligned", "Aligned", "columns"],
              ["quiet", "Quiet", "restraint"],
              ["signal", "Signal", "activity"],
            ].map(([slug, title, skill], index) => (
              <Link key={slug} to={`/redesign/community-board/${slug}`}>
                <span>{String(index + 1).padStart(2, "0")}</span>{title}<em>{skill}</em><i aria-hidden="true">↗</i>
              </Link>
            ))}
          </div>
        </section>
        <section className="rd-index-community rd-index-board">
          <div>
            <span>AI study</span>
            <h2>The AI tab, in the globe's language.</h2>
            <p>Its own frame kept - header, tab strip, taste/random, show more - in the globe's Atlas Index language. Settled. A left-aligned title block; one bordered curation switch, split in half and stuck to the top of the window; cards where the match reads as a figure with a gold point that draws itself into a bar on hover. Paperlogy for headings, Wanted Sans for the small type.</p>
          </div>
          <div>
            <Link to="/redesign/ai">
              <span>—</span>AI tab<em>settled: sticky curation switch, a point that draws into a bar</em><i aria-hidden="true">↗</i>
            </Link>
            <Link to="/redesign/search/board">
              <span>01</span>Search · Board<em>genres left; ranks set in cells on a ruled board</em><i aria-hidden="true">↗</i>
            </Link>
            <Link to="/redesign/search/drawer">
              <span>02</span>Search · Drawer<em>genres folded away; ranks read as a dotted index</em><i aria-hidden="true">↗</i>
            </Link>
            <Link to="/redesign/artist">
              <span>—</span>Artist page<em>overlay captions; the live map over its three distribution slides</em><i aria-hidden="true">↗</i>
            </Link>
            <Link to="/redesign/artwork">
              <span>—</span>Artwork detail<em>the record plus the embedding and same-artist rails</em><i aria-hidden="true">↗</i>
            </Link>
            <Link to="/redesign/artwork-detail/panel">
              <span>—</span>Artwork detail · proposals<em>the map's panel, the globe's stage, a tab page — opened over the artist page</em><i aria-hidden="true">↗</i>
            </Link>
            <Link to="/redesign/community-atlas">
              <span>—</span>Community<em>the live board, a working composer and the post, in the same language</em><i aria-hidden="true">↗</i>
            </Link>
            <Link to="/redesign/profile/band">
              <span>—</span>My Page · proposals<em>five arrangements taken from the other tabs, the live grid kept</em><i aria-hidden="true">↗</i>
            </Link>
            <Link to="/redesign/mypage/front">
              <span>01</span>My Page · Front<em>cover across the width, avatar hanging off it</em><i aria-hidden="true">↗</i>
            </Link>
            <Link to="/redesign/mypage/side">
              <span>02</span>My Page · Side<em>the cover stands on its side, profile beside it</em><i aria-hidden="true">↗</i>
            </Link>
            <Link to="/redesign/mypage/column">
              <span>03</span>My Page · Column<em>the tab menu as a numbered rail</em><i aria-hidden="true">↗</i>
            </Link>
            <Link to="/redesign/mypage/plate">
              <span>04</span>My Page · Plate<em>the name rides the cover, tabs in a bordered switch</em><i aria-hidden="true">↗</i>
            </Link>
            <Link to="/redesign/mypage/strip">
              <span>05</span>My Page · Strip<em>cover as a band, tabs as a chip rail</em><i aria-hidden="true">↗</i>
            </Link>
            <Link to="/redesign/mypage/lead">
              <span>06</span>My Page · Lead<em>the first cell leads at four times the size</em><i aria-hidden="true">↗</i>
            </Link>
          </div>
        </section>
        <div className="rd-index-grid">
          {concepts.map((concept) => (
            <Link key={concept.id} to={buildPreviewPath(concept.id, "home")}>
              <PreviewMedia
                src={concept.image}
                alt=""
                fallbackLabel={concept.title}
                loading="eager"
              />
              <span>{concept.title}</span>
              <p>{concept.description}</p>
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}

export function PreviewExperience() {
  const location = useLocation();
  const navigate = useNavigate();
  const route = parsePreviewPath(location.pathname);
  const data = useMemo(() => previewData, []);
  const [query, setQuery] = useState("");
  const [searchScope, setSearchScope] = useState<"all" | "artworks" | "museums" | "exhibitions">("all");
  const aiArtworks = useMemo(() => data.artworks.slice(0, 12), [data]);
  const [selectedArtworkIds, setSelectedArtworkIds] = useState<Set<string>>(
    () => new Set(aiArtworks.slice(0, 3).map((artwork) => artwork.id)),
  );
  const [communityCategory, setCommunityCategory] = useState("All");
  const [exhibitionStatus, setExhibitionStatus] = useState<"all" | "ongoing" | "upcoming">("all");
  const modalExhibitionId = useMemo(
    () => new URLSearchParams(location.search).get("exhibition") || "",
    [location.search],
  );
  const modalData = useMemo(
    () => modalExhibitionId ? getExhibitionModalWorks(data, modalExhibitionId) : null,
    [data, modalExhibitionId],
  );
  const closeExhibitionModal = useCallback(() => {
    navigate(location.pathname, { replace: true });
  }, [location.pathname, navigate]);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [location.pathname]);

  if (!route) {
    return (
      <div className="rd-not-found">
        <strong>Preview page not found.</strong>
        <Link to="/redesign">Back to concepts</Link>
      </div>
    );
  }

  const normalizedQuery = query.trim().toLocaleLowerCase();
  const matchesQuery = (...values: string[]) =>
    !normalizedQuery || values.some((value) => value.toLocaleLowerCase().includes(normalizedQuery));
  const searchArtworks = data.artworks
    .filter((item) => matchesQuery(item.title, item.artist, item.museumName))
    .slice(0, 12);
  const searchMuseums = data.museums
    .filter((item) => matchesQuery(item.name, item.nameKo || "", item.location))
    .slice(0, 8);
  const searchExhibitions = data.exhibitions
    .filter((item) => matchesQuery(item.title, item.titleKo || "", item.museumName))
    .slice(0, 8);
  const visiblePosts = data.posts.filter(
    (post) => communityCategory === "All" || post.category === communityCategory,
  );
  const visibleExhibitions = data.exhibitions
    .filter((item) => exhibitionStatus === "all" || item.status === exhibitionStatus)
    .slice(0, 12);
  const toggleArtwork = (id: string) => {
    setSelectedArtworkIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const props = {
    concept: route.concept,
    view: route.view,
    data,
    artwork: selectPreviewArtwork(data, route.id),
    artist: selectPreviewArtist(data, route.id),
    exhibition: selectPreviewExhibition(data, route.id),
    query,
    setQuery,
    searchScope,
    setSearchScope,
    searchArtworks,
    searchMuseums,
    searchExhibitions,
    aiArtworks,
    selectedArtworkIds,
    toggleArtwork,
    communityCategory,
    setCommunityCategory,
    visiblePosts,
    exhibitionStatus,
    setExhibitionStatus,
    visibleExhibitions,
  };
  const Concept = route.concept === "hybrid"
    ? HybridConcept
    : route.concept === "dark"
      ? DarkConcept
      : LightConcept;

  return (
    <>
      <PreviewShell concept={route.concept} view={route.view} id={route.id}>
        <Concept {...props} />
      </PreviewShell>
      {modalData ? (
        <ExhibitionArtworkModal
          concept={route.concept}
          modalData={modalData}
          onClose={closeExhibitionModal}
        />
      ) : null}
    </>
  );
}

export default function RedesignApp() {
  return (
    <LanguageProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/redesign" element={<PreviewIndex />} />
          <Route path="/redesign/evolved/*" element={<EvolvedExperience />} />
          <Route path="/redesign/community/:study" element={<CommunityStudiesApp />} />
          <Route path="/redesign/community-board/:study" element={<CommunityBoardApp />} />
          <Route path="/redesign/community-atlas/*" element={<CommunityAtlasApp />} />
          <Route path="/redesign/artwork" element={<ArtworkStudyApp />} />
          <Route path="/redesign/artwork-detail" element={<DetailStudiesApp />} />
          <Route path="/redesign/artwork-detail/:study" element={<DetailStudiesApp />} />
          <Route path="/redesign/artist" element={<ArtistStudiesApp />} />
          <Route path="/redesign/artist/:study" element={<ArtistStudiesApp />} />
          <Route path="/redesign/search" element={<SearchStudiesApp />} />
          <Route path="/redesign/search/:study" element={<SearchStudiesApp />} />
          <Route path="/redesign/profile" element={<ProfileStudiesApp />} />
          <Route path="/redesign/profile/:study" element={<ProfileStudiesApp />} />
          <Route path="/redesign/mypage" element={<MypageStudiesApp />} />
          <Route path="/redesign/mypage/:study" element={<MypageStudiesApp />} />
          <Route path="/redesign/ai" element={<AIStudiesApp />} />
          {/* old study links keep working, all landing on the settled page */}
          <Route path="/redesign/ai/:study" element={<AIStudiesApp />} />
          <Route path="/redesign/*" element={<PreviewExperience />} />
        </Routes>
      </BrowserRouter>
    </LanguageProvider>
  );
}

export { EvolvedExperience };
