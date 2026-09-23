import { Link } from "react-router-dom";
import ReadonlyGlobe from "../components/ReadonlyGlobe";
import PreviewMedia from "../components/PreviewMedia";
import { buildExhibitionModalPath, buildPreviewPath } from "../model";
import { EXHIBITION_STATUSES, formatDateRange, formatPostDate, SEARCH_SCOPES, VIEW_COPY } from "./shared";
import type { ConceptPageProps } from "./types";

function HybridLead({ view }: Pick<ConceptPageProps, "view">) {
  const copy = VIEW_COPY[view];
  return (
    <div className="hy-lead">
      <span>COLLY editorial study</span>
      <h1>{copy.title}</h1>
      <p>{copy.body}</p>
    </div>
  );
}

function HybridHome(props: ConceptPageProps) {
  const { concept, data } = props;
  return (
    <div className="hy-page hy-home">
      <section className="hy-hero">
        <div className="hy-hero-copy">
          <HybridLead view="home" />
          <Link className="rd-action" to={buildPreviewPath(concept, "exhibitions")}>
            Browse exhibitions <span aria-hidden="true">↗</span>
          </Link>
          <dl className="hy-facts">
            <div><dt>Museums</dt><dd>{data.museums.length}</dd></div>
            <div><dt>Exhibitions</dt><dd>{data.exhibitions.length}</dd></div>
            <div><dt>Works in this study</dt><dd>{data.artworks.length}</dd></div>
          </dl>
        </div>
        <Link className="hy-hero-art" to={buildPreviewPath(concept, "work", data.featuredArtwork.id)}>
          <PreviewMedia
            src={data.featuredArtwork.image}
            alt={`${data.featuredArtwork.title} by ${data.featuredArtwork.artist}`}
            fallbackLabel={data.featuredArtwork.title}
            loading="eager"
          />
          <span>{data.featuredArtwork.artist}</span>
          <strong>{data.featuredArtwork.title}</strong>
        </Link>
      </section>
      <ReadonlyGlobe concept={concept} data={data} />
      <section className="hy-paper-section" aria-labelledby="hy-on-view">
        <header>
          <h2 id="hy-on-view">On view</h2>
          <p>Current records from the COLLY exhibition index.</p>
        </header>
        <div className="hy-exhibition-strip">
          {data.exhibitions.slice(0, 4).map((item) => (
            <Link key={item.id} to={buildExhibitionModalPath(concept, "home", item.id)}>
              <PreviewMedia src={item.image} alt="" fallbackLabel={item.title} loading="lazy" />
              <span>{item.museumName}</span>
              <strong>{item.title}</strong>
              <small>{formatDateRange(item.startDate, item.endDate)}</small>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

function HybridSearch(props: ConceptPageProps) {
  const {
    concept,
    query,
    setQuery,
    searchScope,
    setSearchScope,
    searchArtworks,
    searchMuseums,
    searchExhibitions,
  } = props;
  const noResults = searchArtworks.length + searchMuseums.length + searchExhibitions.length === 0;
  return (
    <div className="hy-page hy-search">
      <section className="hy-paper-section hy-search-head">
        <HybridLead view="search" />
        <label className="rd-search-box">
          <span>Search the COLLY collection</span>
          <input
            type="search"
            name="collection-search"
            autoComplete="off"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Try Anna Ancher, Seoul, or photography…"
          />
        </label>
        <div className="rd-filter-row" aria-label="Search scope">
          {SEARCH_SCOPES.map((scope) => (
            <button
              key={scope}
              type="button"
              aria-pressed={searchScope === scope}
              onClick={() => setSearchScope(scope)}
            >
              {scope}
            </button>
          ))}
        </div>
      </section>
      <section className="hy-results">
        {noResults ? (
          <div className="rd-empty" role="status"><strong>No matches found.</strong><span>Clear the search to restore the collection.</span></div>
        ) : null}
        {searchScope === "all" || searchScope === "artworks" ? (
          <div className="hy-result-block">
            <h2>Works</h2>
            <div className="hy-art-grid">
              {searchArtworks.slice(0, 8).map((item) => (
                <Link key={item.id} to={buildPreviewPath(concept, "work", item.id)}>
                  <PreviewMedia src={item.image} alt={item.title} fallbackLabel={item.title} loading="lazy" />
                  <strong>{item.title}</strong><span>{item.artist}</span>
                </Link>
              ))}
            </div>
          </div>
        ) : null}
        {searchScope === "all" || searchScope === "museums" ? (
          <aside className="hy-museum-results">
            <h2>Museums</h2>
            {searchMuseums.slice(0, 5).map((museum) => (
              <article key={museum.id}>
                <span>{museum.location}</span><strong>{museum.name}</strong>
              </article>
            ))}
          </aside>
        ) : null}
        {searchScope === "exhibitions" ? (
          <div className="hy-exhibition-list">
            {searchExhibitions.map((item) => (
              <Link key={item.id} to={buildExhibitionModalPath(concept, "search", item.id)}>
                <span>{item.museumName}</span><strong>{item.title}</strong>
              </Link>
            ))}
          </div>
        ) : null}
      </section>
    </div>
  );
}

function HybridAI(props: ConceptPageProps) {
  const { concept, aiArtworks, selectedArtworkIds, toggleArtwork, data } = props;
  const recommendations = data.artworks.filter((item) => !selectedArtworkIds.has(item.id)).slice(0, 4);
  return (
    <div className="hy-page hy-ai">
      <section className="hy-ai-intro">
        <HybridLead view="ai" />
        <div className="hy-selection-count"><strong>{selectedArtworkIds.size}</strong><span>selected</span></div>
      </section>
      <section className="hy-paper-section">
        <div className="hy-pick-grid">
          {aiArtworks.map((item) => {
            const selected = selectedArtworkIds.has(item.id);
            return (
              <button
                key={item.id}
                type="button"
                aria-pressed={selected}
                onClick={() => toggleArtwork(item.id)}
              >
                <PreviewMedia src={item.image} alt={item.title} fallbackLabel={item.title} loading="lazy" />
                <span>{selected ? "Selected" : "Select"}</span>
                <strong>{item.title}</strong>
              </button>
            );
          })}
        </div>
        <div className="hy-recommendations">
          <header><h2>Your next room</h2><p>Based on the works selected above.</p></header>
          <div>
            {recommendations.map((item) => (
              <Link key={item.id} to={buildPreviewPath(concept, "work", item.id)}>
                <PreviewMedia src={item.image} alt={item.title} fallbackLabel={item.title} loading="lazy" />
                <span>{item.artist}</span><strong>{item.title}</strong>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

function HybridCommunity(props: ConceptPageProps) {
  const { data, communityCategory, setCommunityCategory, visiblePosts } = props;
  const categories = ["All", ...Array.from(new Set(data.posts.map((post) => post.category)))];
  const [featured, ...rest] = visiblePosts;
  return (
    <div className="hy-page hy-community">
      <section className="hy-paper-section">
        <HybridLead view="community" />
        <div className="rd-filter-row" aria-label="Community topics">
          {categories.map((category) => (
            <button key={category} type="button" aria-pressed={communityCategory === category} onClick={() => setCommunityCategory(category)}>
              {category}
            </button>
          ))}
        </div>
        {featured ? (
          <div className="hy-community-layout">
            <article className="hy-feature-post">
              <span>{featured.category}</span>
              <h2>{featured.title}</h2>
              <p>{featured.summary}</p>
              <footer>{featured.authorName}<small>{formatPostDate(featured.createdAt)}</small></footer>
            </article>
            <div className="hy-post-list">
              {rest.map((post) => (
                <article key={post.id}>
                  <span>{post.category}</span>
                  <h3>{post.title}</h3>
                  <p>{post.summary}</p>
                  <footer>{post.likes} likes <span>{post.commentCount} replies</span></footer>
                </article>
              ))}
            </div>
          </div>
        ) : <div className="rd-empty" role="status"><strong>No posts in this topic.</strong><span>Choose All to return to the full conversation.</span></div>}
      </section>
    </div>
  );
}

function HybridExhibitions(props: ConceptPageProps) {
  const { concept, exhibitionStatus, setExhibitionStatus, visibleExhibitions } = props;
  const [lead, ...rest] = visibleExhibitions;
  return (
    <div className="hy-page hy-exhibitions">
      <section className="hy-exhibition-hero">
        <HybridLead view="exhibitions" />
        <div className="rd-filter-row" aria-label="Exhibition status">
          {EXHIBITION_STATUSES.map((status) => (
            <button key={status} type="button" aria-pressed={exhibitionStatus === status} onClick={() => setExhibitionStatus(status)}>{status}</button>
          ))}
        </div>
        {lead ? (
          <Link to={buildExhibitionModalPath(concept, "exhibitions", lead.id)}>
            <PreviewMedia src={lead.image} alt={lead.title} fallbackLabel={lead.title} loading="eager" />
            <span>{lead.museumName}</span><strong>{lead.title}</strong>
          </Link>
        ) : null}
      </section>
      <section className="hy-paper-section hy-exhibition-grid">
        {rest.map((item) => (
          <Link key={item.id} to={buildExhibitionModalPath(concept, "exhibitions", item.id)}>
            <PreviewMedia src={item.image} alt="" fallbackLabel={item.title} loading="lazy" />
            <span>{item.museumName}</span><strong>{item.title}</strong><small>{formatDateRange(item.startDate, item.endDate)}</small>
          </Link>
        ))}
      </section>
    </div>
  );
}

function HybridProfile(props: ConceptPageProps) {
  const { concept, data } = props;
  return (
    <div className="hy-page hy-profile">
      <section className="hy-paper-section">
        <HybridLead view="profile" />
        <div className="hy-profile-summary">
          <div><span>Saved works</span><strong>{data.artworks.length}</strong></div>
          <div><span>Artists</span><strong>{data.artists.length}</strong></div>
          <p>Preview mode uses the current public collection and does not read or change account data.</p>
        </div>
      </section>
      <section className="hy-collection-wall">
        {data.artworks.slice(0, 8).map((item) => (
          <Link key={item.id} to={buildPreviewPath(concept, "work", item.id)}>
            <PreviewMedia src={item.image} alt={item.title} fallbackLabel={item.title} loading="lazy" />
            <span>{item.artist}</span><strong>{item.title}</strong>
          </Link>
        ))}
      </section>
    </div>
  );
}

function HybridWork(props: ConceptPageProps) {
  const { concept, artwork, data } = props;
  return (
    <article className="hy-page hy-work">
      <section className="hy-work-image">
        <PreviewMedia src={artwork.image} alt={`${artwork.title} by ${artwork.artist}`} fallbackLabel={artwork.title} loading="eager" />
      </section>
      <section className="hy-paper-section hy-work-sheet">
        <HybridLead view="work" />
        <h2>{artwork.title}</h2>
        <Link to={buildPreviewPath(concept, "artist", artwork.artist)}>{artwork.artist}</Link>
        <dl>
          <div><dt>Date</dt><dd>{artwork.year || "Unknown"}</dd></div>
          <div><dt>Museum</dt><dd>{artwork.museumName}</dd></div>
          <div><dt>Exhibition</dt><dd>{artwork.exhibitionTitle}</dd></div>
        </dl>
        <div className="hy-related">
          {data.artworks.filter((item) => item.id !== artwork.id).slice(0, 3).map((item) => (
            <Link key={item.id} to={buildPreviewPath(concept, "work", item.id)}>
              <PreviewMedia src={item.image} alt={item.title} fallbackLabel={item.title} loading="lazy" /><span>{item.title}</span>
            </Link>
          ))}
        </div>
      </section>
    </article>
  );
}

function HybridArtist(props: ConceptPageProps) {
  const { concept, artist } = props;
  return (
    <div className="hy-page hy-artist">
      <section className="hy-paper-section hy-artist-head">
        <HybridLead view="artist" />
        <h2>{artist.name}</h2>
        <p>{artist.yearRange}</p>
        <p>{artist.works.length} works across {artist.museumNames.length} museum records.</p>
      </section>
      <section className="hy-artist-works">
        {artist.works.map((item) => (
          <Link key={item.id} to={buildPreviewPath(concept, "work", item.id)}>
            <PreviewMedia src={item.image} alt={item.title} fallbackLabel={item.title} loading="lazy" />
            <span>{item.year}</span><strong>{item.title}</strong>
          </Link>
        ))}
      </section>
    </div>
  );
}

function HybridExhibitionDetail(props: ConceptPageProps) {
  const { concept, exhibition } = props;
  return (
    <article className="hy-page hy-exhibition-detail">
      <section className="hy-exhibition-cover">
        <PreviewMedia src={exhibition.image} alt={exhibition.title} fallbackLabel={exhibition.title} loading="eager" />
        <div><span>{exhibition.museumName}</span><h2>{exhibition.title}</h2></div>
      </section>
      <section className="hy-paper-section hy-exhibition-sheet">
        <HybridLead view="exhibition" />
        <dl>
          <div><dt>Dates</dt><dd>{formatDateRange(exhibition.startDate, exhibition.endDate)}</dd></div>
          <div><dt>Place</dt><dd>{exhibition.location}</dd></div>
          <div><dt>Status</dt><dd>{exhibition.status}</dd></div>
        </dl>
        <p>{exhibition.description || "COLLY has the essential exhibition record. Open the museum source for full curatorial notes."}</p>
        <Link className="rd-open-archive" to={buildExhibitionModalPath(concept, "exhibition", exhibition.id)}>Open artwork archive</Link>
        {exhibition.artworks.length ? (
          <div className="hy-related">
            {exhibition.artworks.map((item) => (
              <Link key={item.id} to={buildPreviewPath(concept, "work", item.id)}>
                <PreviewMedia src={item.image} alt={item.title} fallbackLabel={item.title} loading="lazy" /><span>{item.title}</span>
              </Link>
            ))}
          </div>
        ) : null}
      </section>
    </article>
  );
}

export default function HybridConcept(props: ConceptPageProps) {
  if (props.view === "home") return <HybridHome {...props} />;
  if (props.view === "search") return <HybridSearch {...props} />;
  if (props.view === "ai") return <HybridAI {...props} />;
  if (props.view === "community") return <HybridCommunity {...props} />;
  if (props.view === "exhibitions") return <HybridExhibitions {...props} />;
  if (props.view === "profile") return <HybridProfile {...props} />;
  if (props.view === "work") return <HybridWork {...props} />;
  if (props.view === "artist") return <HybridArtist {...props} />;
  return <HybridExhibitionDetail {...props} />;
}
