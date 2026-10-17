import { useState, type ReactNode } from "react";
import { MuseumLogoMark } from "./MuseumLogo";
import { CollyLotusLoader } from "./CollyMark";
import { getOptimizedImageUrl } from "../utils/imageProxy";
import "./searchResultsWall.css";

// Search results on /search: artists, then the works hung at their own proportions like a salon
// wall, then exhibitions and museums. GlobalSearchBar keeps the data and the click handlers.

export type ArtistHit = { key: string; name: string; count: number; thumb: ReactNode; onSelect: () => void };
export type MuseumHit = { key: string; museumId: string; name: string; place: string; onSelect: () => void };
export type ArtworkHit = { key: string; image?: string; title: string; artist: string; year: string; onSelect: () => void };
export type ExhibitionHit = { key: string; title: string; venue: string; thumb: ReactNode; onSelect: () => void };

const PAGE = 24;

type Props = {
  ko: boolean;
  artists?: ArtistHit[];
  museums?: MuseumHit[];
  artworks?: ArtworkHit[];
  exhibitions?: ExhibitionHit[];
  // Totals before slicing, for the counts in the section heads.
  totals?: { museums?: number };
  // Fetches the next batch from the server once the works already here have all been shown.
  // Resolves to false when there is nothing more to fetch.
  onMoreArtworks?: () => Promise<boolean>;
};

// The whole picture at its own proportions. Until it arrives it holds a 4:5 place, so the wall
// does not collapse and re-stack as pictures land.
function WholeImg({ url }: { url?: string }) {
  const [step, setStep] = useState(0);
  const [ready, setReady] = useState(false);
  const srcs = url ? [getOptimizedImageUrl(url, 400, 78, "webp"), url] : [];
  const src = srcs[step];
  if (!src) return <span className="srr-noimg" aria-hidden="true" />;
  return (
    <img
      src={src} alt="" loading="lazy" decoding="async" data-ready={ready || undefined}
      // a cached picture can finish before onLoad is attached, so check on mount too
      ref={(el) => { if (el && !ready && el.complete && el.naturalWidth > 0) setReady(true); }}
      onLoad={() => setReady(true)} onError={() => setStep((n) => n + 1)}
    />
  );
}

const pad = (n: number) => String(n).padStart(2, "0");
const fmt = (n: number) => n.toLocaleString();
const tap = (fn: () => void) => (e: { stopPropagation: () => void }) => { e.stopPropagation(); fn(); };

function Head({ no, label, count }: { no: number; label: string; count?: number }) {
  return (
    <header className="srr-head">
      <em>{pad(no)}</em>
      <span>{label}</span>
      <i aria-hidden="true" />
      <b>{count != null ? fmt(count) : ""}</b>
    </header>
  );
}

export default function SearchResultsWall({ ko, artists = [], museums = [], artworks = [], exhibitions = [], totals = {}, onMoreArtworks }: Props) {
  const [shown, setShown] = useState(PAGE);
  const [loading, setLoading] = useState(false);
  const [exhausted, setExhausted] = useState(false);
  const L = {
    artists: ko ? "작가" : "Artists",
    museums: ko ? "미술관" : "Museums",
    artworks: ko ? "작품" : "Artworks",
    exhibitions: ko ? "전시" : "Exhibitions",
    works: ko ? "점" : " works",
  };

  // Reveal what is already here first; ask the server only when that runs out.
  const more = async () => {
    if (shown < artworks.length) { setShown((n) => n + PAGE); return; }
    if (!onMoreArtworks || loading) return;
    setLoading(true);
    const got = await onMoreArtworks();
    setLoading(false);
    if (got) setShown((n) => n + PAGE); else setExhausted(true);
  };
  const canMore = shown < artworks.length || (!!onMoreArtworks && !exhausted);

  let no = 0;
  return (
    <div className="srr">
      {artists.length > 0 && (
        <section className="srr-sec">
          <Head no={++no} label={L.artists} count={artists.length} />
          <div className="srr-artists">
            {artists.map((a) => (
              <button key={a.key} type="button" onClick={tap(a.onSelect)}>
                <span className="srr-face">{a.thumb}</span>
                <span className="srr-artists__text">
                  <b>{a.name}</b>
                  <em>{fmt(a.count)}{L.works}</em>
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      {artworks.length > 0 && (
        <section className="srr-sec">
          <Head no={++no} label={L.artworks} />
          <ul className="srr-wall">
            {artworks.slice(0, shown).map((w) => (
              <li key={w.key}>
                <button type="button" onClick={tap(w.onSelect)}>
                  <span className="srr-pic"><WholeImg url={w.image} /></span>
                  <span className="srr-label">
                    <b>{w.title}</b>
                    <span>{w.artist}{w.year && <em> {w.year}</em>}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {loading ? (
            <div className="srr-loading"><CollyLotusLoader size={40} /></div>
          ) : canMore && (
            <button type="button" className="srr-more" onClick={tap(() => { void more(); })}>
              {ko ? "더 보기" : "Show more"}
            </button>
          )}
        </section>
      )}

      {exhibitions.length > 0 && (
        <section className="srr-sec">
          <Head no={++no} label={L.exhibitions} count={exhibitions.length} />
          <ul className="srr-strip">
            {exhibitions.map((x) => (
              <li key={x.key}>
                <button type="button" onClick={tap(x.onSelect)}>
                  <span className="srr-poster">{x.thumb}</span>
                  <span className="srr-cap__title">{x.title}</span>
                  <span className="srr-cap__sub">{x.venue}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {museums.length > 0 && (
        <section className="srr-sec">
          <Head no={++no} label={L.museums} count={totals.museums ?? museums.length} />
          <div className="srr-run">
            {museums.map((m) => (
              <button key={m.key} type="button" onClick={tap(m.onSelect)}>
                <MuseumLogoMark museumId={m.museumId} color="currentColor" maxWidth={40} maxHeight={16} area={420} />
                {m.name}<sup>{m.place}</sup>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
