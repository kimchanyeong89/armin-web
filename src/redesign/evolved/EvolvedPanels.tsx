import { Link } from "react-router-dom";
import ExhibitionArtworkModal from "../components/ExhibitionArtworkModal";
import PreviewMedia from "../components/PreviewMedia";
import ReadonlyGlobe from "../components/ReadonlyGlobe";
import type { PreviewArtwork, PreviewData } from "../data";
import { buildEvolvedPath } from "../model";
import { formatPostDate } from "../concepts/shared";

export type SearchScope = "all" | "artworks" | "museums" | "exhibitions";

export type EvolvedPanelProps = {
  data: PreviewData;
  query: string;
  setQuery: (value: string) => void;
  searchScope: SearchScope;
  setSearchScope: (scope: SearchScope) => void;
  selectedArtworkIds: ReadonlySet<string>;
  toggleArtwork: (id: string) => void;
  communityCategory: string;
  setCommunityCategory: (category: string) => void;
};

const SEARCH_SCOPES: SearchScope[] = ["all", "artworks", "museums", "exhibitions"];

function PanelHeading({ eyebrow, title, body }: { eyebrow: string; title: string; body: string }) {
  return (
    <header className="ev-panel-heading">
      <span>{eyebrow}</span>
      <h1>{title}</h1>
      <p>{body}</p>
    </header>
  );
}

export function EvolvedGlobePanel({ data }: Pick<EvolvedPanelProps, "data">) {
  return (
    <div className="ev-globe-panel">
      <ReadonlyGlobe
        data={data}
        variant="immersive"
        modalPath={(exhibitionId) => `${buildEvolvedPath("globe")}?exhibition=${encodeURIComponent(exhibitionId)}`}
      />
    </div>
  );
}

export function EvolvedCommunityPanel({
  data,
  communityCategory,
  setCommunityCategory,
}: Pick<EvolvedPanelProps, "data" | "communityCategory" | "setCommunityCategory">) {
  const categories = ["All", ...Array.from(new Set(data.posts.map((post) => post.category)))];
  const posts = data.posts.filter(
    (post) => communityCategory === "All" || post.category === communityCategory,
  );

  return (
    <div className="ev-panel ev-community-panel">
      <div className="ev-panel-topline">
        <PanelHeading
          eyebrow="Community"
          title="Latest notes from the community"
          body="The same compact COLLY feed, with clearer subjects, authors, and visit context."
        />
        <span className="ev-read-only">Read only</span>
      </div>
      <div className="ev-filter-rail" aria-label="Community topics">
        {categories.map((category) => (
          <button
            aria-pressed={communityCategory === category}
            key={category}
            onClick={() => setCommunityCategory(category)}
            type="button"
          >
            {category}
          </button>
        ))}
      </div>
      <section className="ev-community-list" aria-label="Community posts">
        {posts.map((post, index) => (
          <article key={post.id}>
            <span className="ev-list-index">{String(index + 1).padStart(2, "0")}</span>
            <div className="ev-post-image">
              <PreviewMedia src={post.image} alt="" fallbackLabel={post.subject} loading="lazy" />
            </div>
            <div className="ev-post-copy">
              <span>{post.category} · {post.subject}</span>
              <h2>{post.title}</h2>
              <p>{post.summary}</p>
            </div>
            <div className="ev-post-meta">
              <strong>{post.authorName}</strong>
              <span>{post.authorRank}</span>
              <time dateTime={post.createdAt.toISOString()}>{formatPostDate(post.createdAt)}</time>
              <small>{post.likes} likes · {post.commentCount} replies</small>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}

export function EvolvedAIPanel({
  data,
  selectedArtworkIds,
  toggleArtwork,
}: Pick<EvolvedPanelProps, "data" | "selectedArtworkIds" | "toggleArtwork">) {
  const choices = data.artworks.slice(0, 12);
  const related = data.artworks.filter((work) => !selectedArtworkIds.has(work.id)).slice(12, 18);

  return (
    <div className="ev-panel ev-ai-panel">
      <div className="ev-panel-topline">
        <PanelHeading
          eyebrow="Personal curation"
          title="Build your taste"
          body="Choose at least 3 works. The preview builds a nearby route without changing your account."
        />
        <div className="ev-selection-count" aria-live="polite">
          <strong>{selectedArtworkIds.size.toString().padStart(2, "0")}</strong>
          <span>selected</span>
        </div>
      </div>
      <section className="ev-ai-grid" aria-label="Artwork taste selection">
        {choices.map((work) => {
          const selected = selectedArtworkIds.has(work.id);
          return (
            <button
              aria-pressed={selected}
              key={work.id}
              onClick={() => toggleArtwork(work.id)}
              type="button"
            >
              <PreviewMedia src={work.image} alt={work.title} fallbackLabel={work.title} loading="lazy" />
              <span>{selected ? "Selected" : "Select"}</span>
              <strong>{work.title}</strong>
              <small>{work.artist}</small>
            </button>
          );
        })}
      </section>
      <section className="ev-related-strip">
        <header><span>Next route</span><h2>Works just outside your selection</h2></header>
        <div>
          {related.map((work) => (
            <Link key={work.id} to={buildEvolvedPath("work", work.id)}>
              <PreviewMedia src={work.image} alt={work.title} fallbackLabel={work.title} loading="lazy" />
              <span>{work.artist}</span><strong>{work.title}</strong>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

export function EvolvedProfilePanel({ data }: Pick<EvolvedPanelProps, "data">) {
  return (
    <div className="ev-panel ev-profile-panel">
      <div className="ev-panel-topline">
        <PanelHeading
          eyebrow="Profile"
          title="Your collection at a glance"
          body="A read-only collection shelf using the same places and works already inside COLLY."
        />
        <span className="ev-read-only">Preview data</span>
      </div>
      <dl className="ev-profile-stats">
        <div><dt>Works</dt><dd>{data.artworks.length}</dd></div>
        <div><dt>Exhibitions</dt><dd>{data.exhibitions.length}</dd></div>
        <div><dt>Museums</dt><dd>{data.museums.length}</dd></div>
        <div><dt>Artists</dt><dd>{data.artists.length}</dd></div>
      </dl>
      <section className="ev-collection-grid" aria-label="Collection works">
        {data.artworks.slice(0, 12).map((work, index) => (
          <Link key={work.id} to={buildEvolvedPath("work", work.id)}>
            <PreviewMedia src={work.image} alt={work.title} fallbackLabel={work.title} loading="lazy" />
            <span>{String(index + 1).padStart(2, "0")} · {work.artist}</span>
            <strong>{work.title}</strong>
          </Link>
        ))}
      </section>
    </div>
  );
}

export function EvolvedSearchPanel({
  data,
  query,
  setQuery,
  searchScope,
  setSearchScope,
}: Pick<EvolvedPanelProps, "data" | "query" | "setQuery" | "searchScope" | "setSearchScope">) {
  const normalized = query.trim().toLocaleLowerCase();
  const matches = (...values: string[]) =>
    !normalized || values.some((value) => value.toLocaleLowerCase().includes(normalized));
  const works = data.artworks.filter((work) => matches(work.title, work.artist, work.museumName)).slice(0, 12);
  const museums = data.museums.filter((museum) => matches(museum.name, museum.nameKo || "", museum.location)).slice(0, 8);
  const exhibitions = data.exhibitions.filter((item) => matches(item.title, item.museumName)).slice(0, 8);
  const getExhibitionPath = (exhibitionId: string) => {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (searchScope !== "all") params.set("scope", searchScope);
    params.set("exhibition", exhibitionId);
    return `${buildEvolvedPath("search")}?${params.toString()}`;
  };

  return (
    <div className="ev-panel ev-search-panel">
      <h1 className="ev-sr-only">Search the collection</h1>
      <label className="ev-search-field">
        <span>Search the current COLLY index</span>
        <input
          autoComplete="off"
          name="evolved-search"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search artworks, artists, museums…"
          type="search"
          value={query}
        />
      </label>
      <div className="ev-filter-rail" aria-label="Search scope">
        {SEARCH_SCOPES.map((scope) => (
          <button
            aria-pressed={searchScope === scope}
            key={scope}
            onClick={() => setSearchScope(scope)}
            type="button"
          >
            {scope}
          </button>
        ))}
      </div>
      <div className="ev-search-layout">
        {(searchScope === "all" || searchScope === "artworks") ? (
          <section className="ev-search-works">
            <header><span>Works</span><strong>{works.length} shown</strong></header>
            {works.length ? <div>
              {works.map((work) => (
                <Link key={work.id} to={buildEvolvedPath("work", work.id)}>
                  <PreviewMedia src={work.image} alt={work.title} fallbackLabel={work.title} loading="lazy" />
                  <span>{work.artist}</span><strong>{work.title}</strong><small>{work.museumName}</small>
                </Link>
              ))}
            </div> : <p className="ev-search-empty" role="status">No works match this search.</p>}
          </section>
        ) : null}
        {(searchScope === "all" || searchScope === "museums") ? (
          <aside className="ev-search-ledger">
            <header><span>Museums</span><strong>{museums.length} shown</strong></header>
            {museums.length ? museums.map((museum, index) => (
              <article key={museum.id}><span>{String(index + 1).padStart(2, "0")}</span><strong>{museum.name}</strong><small>{museum.location}</small></article>
            )) : <p className="ev-search-empty" role="status">No museums match this search.</p>}
          </aside>
        ) : null}
        {searchScope === "exhibitions" ? (
          <section className="ev-search-ledger ev-search-exhibitions">
            <header><span>Exhibitions</span><strong>{exhibitions.length} shown</strong></header>
            {exhibitions.length ? exhibitions.map((exhibition, index) => (
              <Link key={exhibition.id} to={getExhibitionPath(exhibition.id)}>
                <span>{String(index + 1).padStart(2, "0")}</span><strong>{exhibition.title}</strong><small>{exhibition.museumName}</small>
              </Link>
            )) : <p className="ev-search-empty" role="status">No exhibitions match this search.</p>}
          </section>
        ) : null}
      </div>
    </div>
  );
}

export function EvolvedWorkPanel({ data, artwork }: { data: PreviewData; artwork: PreviewArtwork }) {
  const related = data.artworks.filter((work) => work.id !== artwork.id).slice(0, 5);
  return (
    <article className="ev-work-panel">
      <section className="ev-work-image">
        <PreviewMedia src={artwork.image} alt={`${artwork.title} by ${artwork.artist}`} fallbackLabel={artwork.title} loading="eager" />
      </section>
      <section className="ev-work-record">
        <Link to={buildEvolvedPath("profile")}>Back to collection</Link>
        <span>COLLY work record</span>
        <h1>{artwork.title}</h1>
        <h2>{artwork.artist}</h2>
        <dl>
          <div><dt>Year</dt><dd>{artwork.year || "Date unknown"}</dd></div>
          <div><dt>Museum</dt><dd>{artwork.museumName}</dd></div>
          <div><dt>Exhibition</dt><dd>{artwork.exhibitionTitle}</dd></div>
        </dl>
        <p>{artwork.description || "The current COLLY record includes the work, artist, museum, and exhibition context."}</p>
        <div className="ev-work-related">
          {related.map((work) => (
            <Link key={work.id} to={buildEvolvedPath("work", work.id)}>
              <PreviewMedia src={work.image} alt={work.title} fallbackLabel={work.title} loading="lazy" />
              <span>{work.title}</span>
            </Link>
          ))}
        </div>
      </section>
    </article>
  );
}

export { ExhibitionArtworkModal };
