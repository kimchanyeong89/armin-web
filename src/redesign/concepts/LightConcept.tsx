import { Link } from "react-router-dom";
import ReadonlyGlobe from "../components/ReadonlyGlobe";
import PreviewMedia from "../components/PreviewMedia";
import { buildExhibitionModalPath, buildPreviewPath } from "../model";
import { EXHIBITION_STATUSES, formatDateRange, formatPostDate, SEARCH_SCOPES, VIEW_COPY } from "./shared";
import type { ConceptPageProps } from "./types";

function LightLead({ view }: Pick<ConceptPageProps, "view">) {
  const copy = VIEW_COPY[view];
  return <header className="lm-lead"><h1>{copy.title}</h1><p>{copy.body}</p></header>;
}

function LightHome({ concept, data }: ConceptPageProps) {
  return (
    <div className="lm-page lm-home">
      <section className="lm-folio-hero">
        <div className="lm-running-title"><span>COLLY collection index</span><small>{data.featuredMuseum.location}</small></div>
        <LightLead view="home" />
        <Link className="lm-hero-image" to={buildPreviewPath(concept, "work", data.featuredArtwork.id)}>
          <PreviewMedia src={data.featuredArtwork.image} alt={`${data.featuredArtwork.title} by ${data.featuredArtwork.artist}`} fallbackLabel={data.featuredArtwork.title} loading="eager" />
          <span>{data.featuredArtwork.artist}</span><strong>{data.featuredArtwork.title}</strong>
        </Link>
        <aside className="lm-museum-index">
          <h2>Selected museums</h2>
          {data.museums.slice(0, 6).map((museum) => <div key={museum.id}><strong>{museum.name}</strong><span>{museum.location}</span></div>)}
          <Link to={buildPreviewPath(concept, "search")}>Open the full index</Link>
        </aside>
      </section>
      <ReadonlyGlobe concept={concept} data={data} />
      <section className="lm-on-view"><h2>Exhibitions in the current index</h2><div>{data.exhibitions.slice(0, 5).map((item) => <Link key={item.id} to={buildExhibitionModalPath(concept, "home", item.id)}><PreviewMedia src={item.image} alt="" fallbackLabel={item.title} loading="lazy" /><span>{item.museumName}</span><strong>{item.title}</strong></Link>)}</div></section>
    </div>
  );
}

function LightSearch(props: ConceptPageProps) {
  const { concept, query, setQuery, searchScope, setSearchScope, searchArtworks, searchMuseums, searchExhibitions } = props;
  return (
    <div className="lm-page lm-search">
      <section className="lm-search-head"><LightLead view="search" /><label className="rd-search-box lm-search-box"><span>Search the COLLY collection</span><input type="search" name="collection-search" autoComplete="off" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Enter a title, artist, museum, or place…" /></label>
        <div className="rd-filter-row" aria-label="Search scope">{SEARCH_SCOPES.map((scope) => <button key={scope} type="button" aria-pressed={searchScope === scope} onClick={() => setSearchScope(scope)}>{scope}</button>)}</div>
      </section>
      <section className="lm-catalogue-results">
        {(searchScope === "all" || searchScope === "artworks") ? <div className="lm-work-catalogue"><h2>Works</h2>{searchArtworks.slice(0, 9).map((item) => <Link key={item.id} to={buildPreviewPath(concept, "work", item.id)}><PreviewMedia src={item.image} alt={item.title} fallbackLabel={item.title} loading="lazy" /><div><strong>{item.title}</strong><span>{item.artist}</span><small>{item.year || "Date unknown"}</small></div></Link>)}</div> : null}
        {(searchScope === "all" || searchScope === "museums") ? <aside className="lm-reference-list"><h2>Museums</h2>{searchMuseums.slice(0, 7).map((item) => <article key={item.id}><strong>{item.name}</strong><span>{item.location}</span></article>)}</aside> : null}
        {searchScope === "exhibitions" ? <div className="lm-reference-list">{searchExhibitions.map((item) => <Link key={item.id} to={buildExhibitionModalPath(concept, "search", item.id)}><strong>{item.title}</strong><span>{item.museumName}</span></Link>)}</div> : null}
        {!searchArtworks.length && !searchMuseums.length && !searchExhibitions.length ? <div className="rd-empty" role="status"><strong>No matches found.</strong><span>Clear the search to return to the complete index.</span></div> : null}
      </section>
    </div>
  );
}

function LightAI({ concept, aiArtworks, selectedArtworkIds, toggleArtwork, data }: ConceptPageProps) {
  const recommendations = data.artworks.filter((item) => !selectedArtworkIds.has(item.id)).slice(0, 4);
  return (
    <div className="lm-page lm-ai">
      <section className="lm-ai-head"><LightLead view="ai" /><p className="lm-selection-note"><strong>{selectedArtworkIds.size}</strong> works selected</p></section>
      <section className="lm-salon-wall">
        {aiArtworks.map((item, index) => {
          const selected = selectedArtworkIds.has(item.id);
          return <button key={item.id} className={`lm-salon-frame lm-salon-frame--${(index % 4) + 1}`} type="button" aria-pressed={selected} onClick={() => toggleArtwork(item.id)}><PreviewMedia src={item.image} alt={item.title} fallbackLabel={item.title} loading="lazy" /><strong>{item.title}</strong><span>{selected ? "Selected" : "Select work"}</span></button>;
        })}
      </section>
      <section className="lm-reading-list"><header><h2>A related reading</h2><p>Unselected works placed in a quieter sequence.</p></header><div>{recommendations.map((item) => <Link key={item.id} to={buildPreviewPath(concept, "work", item.id)}><PreviewMedia src={item.image} alt={item.title} fallbackLabel={item.title} loading="lazy" /><span>{item.artist}</span><strong>{item.title}</strong></Link>)}</div></section>
    </div>
  );
}

function LightCommunity({ data, communityCategory, setCommunityCategory, visiblePosts }: ConceptPageProps) {
  const categories = ["All", ...Array.from(new Set(data.posts.map((post) => post.category)))];
  return (
    <div className="lm-page lm-community">
      <section className="lm-journal-head"><LightLead view="community" /><div className="rd-filter-row" aria-label="Community topics">{categories.map((category) => <button key={category} type="button" aria-pressed={communityCategory === category} onClick={() => setCommunityCategory(category)}>{category}</button>)}</div></section>
      <section className="lm-journal-grid">
        {visiblePosts.map((post, index) => <article key={post.id} className={index === 0 ? "lm-journal-feature" : undefined}><header><span>{post.category}</span><time>{formatPostDate(post.createdAt)}</time></header><h2>{post.title}</h2><p>{post.summary}</p><footer><strong>{post.authorName}</strong><span>{post.authorRank}</span><small>{post.likes} likes, {post.commentCount} replies</small></footer></article>)}
        {!visiblePosts.length ? <div className="rd-empty" role="status"><strong>No posts in this topic.</strong><span>Choose All to see the complete journal.</span></div> : null}
      </section>
    </div>
  );
}

function LightExhibitions({ concept, exhibitionStatus, setExhibitionStatus, visibleExhibitions }: ConceptPageProps) {
  return (
    <div className="lm-page lm-exhibitions">
      <section className="lm-exhibition-head"><LightLead view="exhibitions" /><div className="rd-filter-row" aria-label="Exhibition status">{EXHIBITION_STATUSES.map((status) => <button key={status} type="button" aria-pressed={exhibitionStatus === status} onClick={() => setExhibitionStatus(status)}>{status}</button>)}</div></section>
      <section className="lm-exhibition-ledger">{visibleExhibitions.map((item, index) => <Link key={item.id} className={index === 0 ? "lm-exhibition-lead" : undefined} to={buildExhibitionModalPath(concept, "exhibitions", item.id)}><PreviewMedia src={item.image} alt="" fallbackLabel={item.title} loading={index === 0 ? "eager" : "lazy"} /><div><span>{item.museumName}</span><strong>{item.title}</strong><small>{formatDateRange(item.startDate, item.endDate)}</small></div></Link>)}</section>
    </div>
  );
}

function LightProfile({ concept, data }: ConceptPageProps) {
  return (
    <div className="lm-page lm-profile">
      <section className="lm-profile-head"><LightLead view="profile" /><dl><div><dt>Works</dt><dd>{data.artworks.length}</dd></div><div><dt>Artists</dt><dd>{data.artists.length}</dd></div><div><dt>Museums</dt><dd>{new Set(data.artworks.map((item) => item.museumId)).size}</dd></div></dl><p>Read-only preview. Account records remain untouched.</p></section>
      <section className="lm-archive-grid">{data.artworks.slice(0, 10).map((item) => <Link key={item.id} to={buildPreviewPath(concept, "work", item.id)}><PreviewMedia src={item.image} alt={item.title} fallbackLabel={item.title} loading="lazy" /><div><strong>{item.title}</strong><span>{item.artist}</span></div></Link>)}</section>
    </div>
  );
}

function LightWork({ concept, artwork, data }: ConceptPageProps) {
  return (
    <article className="lm-page lm-work">
      <section className="lm-work-plate"><span>COLLY collection plate</span><PreviewMedia src={artwork.image} alt={`${artwork.title} by ${artwork.artist}`} fallbackLabel={artwork.title} loading="eager" /><small>{artwork.museumName}</small></section>
      <section className="lm-work-copy"><LightLead view="work" /><h2>{artwork.title}</h2><Link to={buildPreviewPath(concept, "artist", artwork.artist)}>{artwork.artist}</Link><dl><div><dt>Date</dt><dd>{artwork.year || "Unknown"}</dd></div><div><dt>Museum</dt><dd>{artwork.museumName}</dd></div><div><dt>Exhibition</dt><dd>{artwork.exhibitionTitle}</dd></div></dl><h3>Related works</h3><div className="lm-related-row">{data.artworks.filter((item) => item.id !== artwork.id).slice(0, 4).map((item) => <Link key={item.id} to={buildPreviewPath(concept, "work", item.id)}><PreviewMedia src={item.image} alt={item.title} fallbackLabel={item.title} loading="lazy" /><span>{item.title}</span></Link>)}</div></section>
    </article>
  );
}

function LightArtist({ concept, artist }: ConceptPageProps) {
  return (
    <div className="lm-page lm-artist"><section className="lm-artist-title"><LightLead view="artist" /><h2>{artist.name}</h2><p>{artist.yearRange}</p><p>{artist.works.length} works represented in {artist.museumNames.join(", ")}.</p></section><section className="lm-artist-catalogue">{artist.works.map((item) => <Link key={item.id} to={buildPreviewPath(concept, "work", item.id)}><PreviewMedia src={item.image} alt={item.title} fallbackLabel={item.title} loading="lazy" /><div><span>{item.year}</span><strong>{item.title}</strong><small>{item.museumName}</small></div></Link>)}</section></div>
  );
}

function LightExhibitionDetail({ concept, exhibition }: ConceptPageProps) {
  return (
    <article className="lm-page lm-exhibition-detail"><section className="lm-exhibition-plate"><PreviewMedia src={exhibition.image} alt={exhibition.title} fallbackLabel={exhibition.title} loading="eager" /><span>{exhibition.museumName}</span></section><section className="lm-exhibition-copy"><LightLead view="exhibition" /><h2>{exhibition.title}</h2><dl><div><dt>Dates</dt><dd>{formatDateRange(exhibition.startDate, exhibition.endDate)}</dd></div><div><dt>Place</dt><dd>{exhibition.location}</dd></div><div><dt>Status</dt><dd>{exhibition.status}</dd></div></dl><p>{exhibition.description || "The current COLLY record contains the essential visit information."}</p><Link className="rd-open-archive" to={buildExhibitionModalPath(concept, "exhibition", exhibition.id)}>Open artwork archive</Link>{exhibition.artworks.length ? <div className="lm-related-row">{exhibition.artworks.map((item) => <Link key={item.id} to={buildPreviewPath(concept, "work", item.id)}><PreviewMedia src={item.image} alt={item.title} fallbackLabel={item.title} loading="lazy" /><span>{item.title}</span></Link>)}</div> : null}</section></article>
  );
}

export default function LightConcept(props: ConceptPageProps) {
  if (props.view === "home") return <LightHome {...props} />;
  if (props.view === "search") return <LightSearch {...props} />;
  if (props.view === "ai") return <LightAI {...props} />;
  if (props.view === "community") return <LightCommunity {...props} />;
  if (props.view === "exhibitions") return <LightExhibitions {...props} />;
  if (props.view === "profile") return <LightProfile {...props} />;
  if (props.view === "work") return <LightWork {...props} />;
  if (props.view === "artist") return <LightArtist {...props} />;
  return <LightExhibitionDetail {...props} />;
}
