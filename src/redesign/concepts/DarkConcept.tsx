import { Link } from "react-router-dom";
import ReadonlyGlobe from "../components/ReadonlyGlobe";
import PreviewMedia from "../components/PreviewMedia";
import { buildExhibitionModalPath, buildPreviewPath } from "../model";
import { EXHIBITION_STATUSES, formatDateRange, formatPostDate, SEARCH_SCOPES, VIEW_COPY } from "./shared";
import type { ConceptPageProps } from "./types";

function DarkLead({ view }: Pick<ConceptPageProps, "view">) {
  const copy = VIEW_COPY[view];
  return <header className="dg-lead"><h1>{copy.title}</h1><p>{copy.body}</p></header>;
}

function DarkHome({ concept, data }: ConceptPageProps) {
  return (
    <div className="dg-page dg-home">
      <section className="dg-home-stage">
        <DarkLead view="home" />
        <Link className="dg-feature" to={buildPreviewPath(concept, "work", data.featuredArtwork.id)}>
          <PreviewMedia src={data.featuredArtwork.image} alt={`${data.featuredArtwork.title} by ${data.featuredArtwork.artist}`} fallbackLabel={data.featuredArtwork.title} loading="eager" />
          <div><span>{data.featuredArtwork.artist}</span><strong>{data.featuredArtwork.title}</strong></div>
        </Link>
        <div className="dg-location-readout">
          <span>{data.featuredMuseum.location}</span>
          <strong>{data.featuredMuseum.name}</strong>
          <small>{data.featuredMuseum.exhibitionCount} exhibition records</small>
        </div>
      </section>
      <ReadonlyGlobe concept={concept} data={data} />
      <section className="dg-wall" aria-label="Current exhibitions">
        {data.exhibitions.slice(0, 7).map((item) => (
          <Link key={item.id} to={buildExhibitionModalPath(concept, "home", item.id)}>
            <PreviewMedia src={item.image} alt="" fallbackLabel={item.title} loading="lazy" />
            <span>{item.museumName}</span><strong>{item.title}</strong>
          </Link>
        ))}
      </section>
    </div>
  );
}

function DarkSearch(props: ConceptPageProps) {
  const { concept, query, setQuery, searchScope, setSearchScope, searchArtworks, searchMuseums, searchExhibitions } = props;
  return (
    <div className="dg-page dg-search">
      <section className="dg-search-console">
        <DarkLead view="search" />
        <label className="rd-search-box dg-search-box">
          <span>Search the COLLY collection</span>
          <input type="search" name="collection-search" autoComplete="off" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Artwork, artist, museum, exhibition…" />
        </label>
        <div className="rd-filter-row" aria-label="Search scope">
          {SEARCH_SCOPES.map((scope) => <button key={scope} type="button" aria-pressed={searchScope === scope} onClick={() => setSearchScope(scope)}>{scope}</button>)}
        </div>
      </section>
      <section className="dg-search-results">
        {(searchScope === "all" || searchScope === "artworks") && searchArtworks.map((item) => (
          <Link key={item.id} to={buildPreviewPath(concept, "work", item.id)}>
            <PreviewMedia src={item.image} alt={item.title} fallbackLabel={item.title} loading="lazy" />
            <strong>{item.title}</strong><span>{item.artist}</span><small>{item.year || "Date unknown"}</small>
          </Link>
        ))}
        {searchScope === "museums" && searchMuseums.map((item) => (
          <article key={item.id} className="dg-text-result"><strong>{item.name}</strong><span>{item.location}</span></article>
        ))}
        {searchScope === "exhibitions" && searchExhibitions.map((item) => (
          <Link key={item.id} className="dg-text-result" to={buildExhibitionModalPath(concept, "search", item.id)}><strong>{item.title}</strong><span>{item.museumName}</span></Link>
        ))}
        {!searchArtworks.length && !searchMuseums.length && !searchExhibitions.length ? <div className="rd-empty" role="status"><strong>No matches found.</strong><span>Clear the search to restore the collection.</span></div> : null}
      </section>
    </div>
  );
}

function DarkAI({ concept, aiArtworks, selectedArtworkIds, toggleArtwork, data }: ConceptPageProps) {
  const next = data.artworks.filter((item) => !selectedArtworkIds.has(item.id)).slice(0, 3);
  return (
    <div className="dg-page dg-ai">
      <section className="dg-ai-head"><DarkLead view="ai" /><strong>{selectedArtworkIds.size.toString().padStart(2, "0")}</strong></section>
      <section className="dg-selection-wall">
        {aiArtworks.map((item) => {
          const selected = selectedArtworkIds.has(item.id);
          return (
            <button key={item.id} type="button" aria-pressed={selected} onClick={() => toggleArtwork(item.id)}>
              <PreviewMedia src={item.image} alt={item.title} fallbackLabel={item.title} loading="lazy" />
              <span>{selected ? "In your route" : "Add to route"}</span><strong>{item.title}</strong>
            </button>
          );
        })}
      </section>
      <section className="dg-next-room">
        <header><h2>Next room</h2><p>Three works outside your selection.</p></header>
        {next.map((item) => <Link key={item.id} to={buildPreviewPath(concept, "work", item.id)}><PreviewMedia src={item.image} alt={item.title} fallbackLabel={item.title} loading="lazy" /><span>{item.artist}</span></Link>)}
      </section>
    </div>
  );
}

function DarkCommunity({ data, communityCategory, setCommunityCategory, visiblePosts }: ConceptPageProps) {
  const categories = ["All", ...Array.from(new Set(data.posts.map((post) => post.category)))];
  return (
    <div className="dg-page dg-community">
      <section className="dg-community-head"><DarkLead view="community" />
        <div className="rd-filter-row" aria-label="Community topics">{categories.map((category) => <button key={category} type="button" aria-pressed={communityCategory === category} onClick={() => setCommunityCategory(category)}>{category}</button>)}</div>
      </section>
      <section className="dg-post-board">
        {visiblePosts.map((post, index) => (
          <article key={post.id} className={index === 0 ? "dg-post-feature" : undefined}>
            <header><span>{post.category}</span><time>{formatPostDate(post.createdAt)}</time></header>
            <h2>{post.title}</h2><p>{post.summary}</p>
            <footer><strong>{post.authorName}</strong><span>{post.likes} likes</span><span>{post.commentCount} replies</span></footer>
          </article>
        ))}
        {!visiblePosts.length ? <div className="rd-empty" role="status"><strong>No posts in this topic.</strong><span>Choose All to see every conversation.</span></div> : null}
      </section>
    </div>
  );
}

function DarkExhibitions({ concept, exhibitionStatus, setExhibitionStatus, visibleExhibitions }: ConceptPageProps) {
  return (
    <div className="dg-page dg-exhibitions">
      <section className="dg-exhibition-head"><DarkLead view="exhibitions" />
        <div className="rd-filter-row" aria-label="Exhibition status">{EXHIBITION_STATUSES.map((status) => <button key={status} type="button" aria-pressed={exhibitionStatus === status} onClick={() => setExhibitionStatus(status)}>{status}</button>)}</div>
      </section>
      <section className="dg-exhibition-track">
        {visibleExhibitions.map((item) => (
          <Link key={item.id} to={buildExhibitionModalPath(concept, "exhibitions", item.id)}>
            <PreviewMedia src={item.image} alt={item.title} fallbackLabel={item.title} loading="lazy" />
            <span>{item.museumName}</span><strong>{item.title}</strong><small>{formatDateRange(item.startDate, item.endDate)}</small>
          </Link>
        ))}
      </section>
    </div>
  );
}

function DarkProfile({ concept, data }: ConceptPageProps) {
  return (
    <div className="dg-page dg-profile">
      <section className="dg-profile-head"><DarkLead view="profile" /><strong>{data.artworks.length}</strong><span>works in this read-only study</span></section>
      <section className="dg-vault">
        {data.artworks.slice(0, 10).map((item, index) => (
          <Link key={item.id} className={index === 0 ? "dg-vault-lead" : undefined} to={buildPreviewPath(concept, "work", item.id)}>
            <PreviewMedia src={item.image} alt={item.title} fallbackLabel={item.title} loading="lazy" /><span>{item.artist}</span><strong>{item.title}</strong>
          </Link>
        ))}
      </section>
    </div>
  );
}

function DarkWork({ concept, artwork, data }: ConceptPageProps) {
  return (
    <article className="dg-page dg-work">
      <section className="dg-work-field"><PreviewMedia src={artwork.image} alt={`${artwork.title} by ${artwork.artist}`} fallbackLabel={artwork.title} loading="eager" /></section>
      <section className="dg-work-deck"><DarkLead view="work" /><h2>{artwork.title}</h2><Link to={buildPreviewPath(concept, "artist", artwork.artist)}>{artwork.artist}</Link>
        <dl><div><dt>Year</dt><dd>{artwork.year || "Unknown"}</dd></div><div><dt>Museum</dt><dd>{artwork.museumName}</dd></div><div><dt>Exhibition</dt><dd>{artwork.exhibitionTitle}</dd></div></dl>
        <div className="dg-mini-rail">{data.artworks.filter((item) => item.id !== artwork.id).slice(0, 4).map((item) => <Link key={item.id} to={buildPreviewPath(concept, "work", item.id)}><PreviewMedia src={item.image} alt={item.title} fallbackLabel={item.title} loading="lazy" /></Link>)}</div>
      </section>
    </article>
  );
}

function DarkArtist({ concept, artist }: ConceptPageProps) {
  return (
    <div className="dg-page dg-artist">
      <section className="dg-artist-head"><DarkLead view="artist" /><h2>{artist.name}</h2><span>{artist.yearRange}</span><p>{artist.works.length} works in {artist.museumNames.join(", ")}.</p></section>
      <section className="dg-artist-wall">{artist.works.map((item) => <Link key={item.id} to={buildPreviewPath(concept, "work", item.id)}><PreviewMedia src={item.image} alt={item.title} fallbackLabel={item.title} loading="lazy" /><span>{item.year}</span><strong>{item.title}</strong></Link>)}</section>
    </div>
  );
}

function DarkExhibitionDetail({ concept, exhibition }: ConceptPageProps) {
  return (
    <article className="dg-page dg-exhibition-detail">
      <section className="dg-exhibition-image"><PreviewMedia src={exhibition.image} alt={exhibition.title} fallbackLabel={exhibition.title} loading="eager" /><div><span>{exhibition.museumName}</span><h2>{exhibition.title}</h2></div></section>
      <section className="dg-exhibition-deck"><DarkLead view="exhibition" /><p>{exhibition.description || "The current COLLY record contains the essential visit information."}</p><dl><div><dt>Dates</dt><dd>{formatDateRange(exhibition.startDate, exhibition.endDate)}</dd></div><div><dt>Place</dt><dd>{exhibition.location}</dd></div><div><dt>Status</dt><dd>{exhibition.status}</dd></div></dl>
        <Link className="rd-open-archive" to={buildExhibitionModalPath(concept, "exhibition", exhibition.id)}>Open artwork archive</Link>
        <div className="dg-mini-rail">{exhibition.artworks.map((item) => <Link key={item.id} to={buildPreviewPath(concept, "work", item.id)}><PreviewMedia src={item.image} alt={item.title} fallbackLabel={item.title} loading="lazy" /></Link>)}</div>
      </section>
    </article>
  );
}

export default function DarkConcept(props: ConceptPageProps) {
  if (props.view === "home") return <DarkHome {...props} />;
  if (props.view === "search") return <DarkSearch {...props} />;
  if (props.view === "ai") return <DarkAI {...props} />;
  if (props.view === "community") return <DarkCommunity {...props} />;
  if (props.view === "exhibitions") return <DarkExhibitions {...props} />;
  if (props.view === "profile") return <DarkProfile {...props} />;
  if (props.view === "work") return <DarkWork {...props} />;
  if (props.view === "artist") return <DarkArtist {...props} />;
  return <DarkExhibitionDetail {...props} />;
}
