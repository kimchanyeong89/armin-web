import { useState, type ReactNode } from "react";
import { MuseumLogoMark } from "./MuseumLogo";
import "./searchResultsStudy.css";

// Search results, three proposals for the redesigned /search page.
// GlobalSearchBar keeps the data and the click handlers; this file only lays the hits out.
// Pick one with ?results=a|b|c (kept for the tab), ?results=off returns to the current list.

export type ResultsVariant = "a" | "b" | "c";

export type ArtistHit = { key: string; raw: string; name: string; count: number; thumb: ReactNode; onSelect: () => void };
export type MuseumHit = { key: string; museumId: string; name: string; place: string; onSelect: () => void };
export type ArtworkHit = { key: string; artistRaw: string; title: string; artist: string; year: string; museum: string; thumb: ReactNode; onSelect: () => void };
export type ExhibitionHit = { key: string; title: string; venue: string; thumb: ReactNode; onSelect: () => void };

const STORE_KEY = "colly:results-study";

export function readResultsVariant(): ResultsVariant | null {
  if (typeof window === "undefined") return null;
  try {
    const asked = new URLSearchParams(window.location.search).get("results");
    if (asked === "off") sessionStorage.removeItem(STORE_KEY);
    else if (asked === "a" || asked === "b" || asked === "c") sessionStorage.setItem(STORE_KEY, asked);
    const kept = sessionStorage.getItem(STORE_KEY);
    return kept === "a" || kept === "b" || kept === "c" ? kept : null;
  } catch {
    return null;
  }
}

type Props = {
  variant: ResultsVariant;
  ko: boolean;
  artists?: ArtistHit[];
  museums?: MuseumHit[];
  artworks?: ArtworkHit[];
  exhibitions?: ExhibitionHit[];
  // Totals before slicing, for the counts in the section heads.
  totals?: { artists?: number; museums?: number; artworks?: number; exhibitions?: number };
};

const pad = (n: number) => String(n).padStart(2, "0");
const fmt = (n: number) => n.toLocaleString();
const tap = (fn: () => void) => (e: { stopPropagation: () => void }) => { e.stopPropagation(); fn(); };

function Head({ no, label, count }: { no: number; label: string; count: number }) {
  return (
    <header className="srr-head">
      <em>{pad(no)}</em>
      <span>{label}</span>
      <i aria-hidden="true" />
      <b>{fmt(count)}</b>
    </header>
  );
}

// "+N 더보기" / "접기" — a line of type, never a pill.
function More({ hidden, open, onToggle, ko }: { hidden: number; open: boolean; onToggle: () => void; ko: boolean }) {
  if (hidden <= 0) return null;
  return (
    <button type="button" className="srr-more" onClick={tap(onToggle)}>
      {open ? (ko ? "접기 −" : "Less −") : `${ko ? "더보기" : "More"} +${fmt(hidden)}`}
    </button>
  );
}

export default function SearchResultsStudy({ variant, ko, artists = [], museums = [], artworks = [], exhibitions = [], totals = {} }: Props) {
  const [artistsOpen, setArtistsOpen] = useState(false);
  const [worksOpen, setWorksOpen] = useState(false);
  const L = {
    artists: ko ? "작가" : "Artists",
    museums: ko ? "미술관" : "Museums",
    artworks: ko ? "작품" : "Artworks",
    exhibitions: ko ? "전시" : "Exhibitions",
    works: ko ? "점" : " works",
    page: ko ? "작가 페이지" : "Artist page",
  };
  let no = 0;
  const sections: ReactNode[] = [];

  // ── A · 색인: every result as a row of the same index the genre drawer uses ──
  if (variant === "a") {
    if (artists.length) {
      const shown = artistsOpen ? artists : artists.slice(0, 8);
      sections.push(
        <section key="artists" className="srr-sec">
          <Head no={++no} label={L.artists} count={totals.artists ?? artists.length} />
          <ul className="srr-a-artists">
            {shown.map((a) => (
              <li key={a.key}>
                <button type="button" onClick={tap(a.onSelect)}>
                  <span className="srr-face">{a.thumb}</span>
                  <span className="srr-a-name">{a.name}</span>
                  <i className="srr-leader" aria-hidden="true" />
                  <em>{fmt(a.count)}</em>
                </button>
              </li>
            ))}
          </ul>
          <More hidden={artists.length - 8} open={artistsOpen} onToggle={() => setArtistsOpen((v) => !v)} ko={ko} />
        </section>,
      );
    }
    if (museums.length) {
      sections.push(
        <section key="museums" className="srr-sec">
          <Head no={++no} label={L.museums} count={totals.museums ?? museums.length} />
          <ul className="srr-a-rows">
            {museums.map((m) => (
              <li key={m.key}>
                <button type="button" className="srr-a-museum" onClick={tap(m.onSelect)}>
                  <span className="srr-a-logo">
                    <MuseumLogoMark museumId={m.museumId} color="currentColor" maxWidth={52} maxHeight={22} area={620} />
                  </span>
                  <span className="srr-a-title">{m.name}</span>
                  <em>{m.place}</em>
                </button>
              </li>
            ))}
          </ul>
        </section>,
      );
    }
    if (artworks.length) {
      sections.push(
        <section key="artworks" className="srr-sec">
          <Head no={++no} label={L.artworks} count={totals.artworks ?? artworks.length} />
          <ul className="srr-a-rows">
            {artworks.map((w) => (
              <li key={w.key}>
                <button type="button" className="srr-a-work" onClick={tap(w.onSelect)}>
                  <span className="srr-a-thumb">{w.thumb}</span>
                  <span className="srr-a-text">
                    <span className="srr-a-title">{w.title}</span>
                    <span className="srr-a-sub">{[w.artist, w.museum].filter(Boolean).join(" · ")}</span>
                  </span>
                  <em>{w.year}</em>
                </button>
              </li>
            ))}
          </ul>
        </section>,
      );
    }
    if (exhibitions.length) {
      sections.push(
        <section key="exhibitions" className="srr-sec">
          <Head no={++no} label={L.exhibitions} count={totals.exhibitions ?? exhibitions.length} />
          <ul className="srr-a-rows">
            {exhibitions.map((x) => (
              <li key={x.key}>
                <button type="button" className="srr-a-work srr-a-work--poster" onClick={tap(x.onSelect)}>
                  <span className="srr-a-thumb">{x.thumb}</span>
                  <span className="srr-a-text">
                    <span className="srr-a-title">{x.title}</span>
                    <span className="srr-a-sub">{x.venue}</span>
                  </span>
                  <em aria-hidden="true">→</em>
                </button>
              </li>
            ))}
          </ul>
        </section>,
      );
    }
  }

  // ── B · 격자: the best match as a band, the rest as a wall of pictures ──
  if (variant === "b") {
    if (artists.length) {
      const [lead, ...rest] = artists;
      const shown = artistsOpen ? rest : rest.slice(0, 10);
      sections.push(
        <section key="artists" className="srr-sec">
          <Head no={++no} label={L.artists} count={totals.artists ?? artists.length} />
          <button type="button" className="srr-band" onClick={tap(lead.onSelect)}>
            <span className="srr-face srr-face--lead">{lead.thumb}</span>
            <span className="srr-band__text">
              <strong>{lead.name}</strong>
              <span>
                <em>{fmt(lead.count)}</em>{L.works}<i aria-hidden="true">·</i><u>{L.page} →</u>
              </span>
            </span>
          </button>
          {rest.length > 0 && (
            <ul className="srr-b-faces">
              {shown.map((a) => (
                <li key={a.key}>
                  <button type="button" onClick={tap(a.onSelect)}>
                    <span className="srr-face">{a.thumb}</span>
                    <span className="srr-b-faces__name">{a.name}</span>
                    <em>{fmt(a.count)}</em>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <More hidden={rest.length - 10} open={artistsOpen} onToggle={() => setArtistsOpen((v) => !v)} ko={ko} />
        </section>,
      );
    }
    if (artworks.length) {
      sections.push(
        <section key="artworks" className="srr-sec">
          <Head no={++no} label={L.artworks} count={totals.artworks ?? artworks.length} />
          <ul className="srr-b-grid">
            {artworks.map((w) => (
              <li key={w.key}>
                <button type="button" onClick={tap(w.onSelect)}>
                  <span className="srr-b-img">{w.thumb}</span>
                  <span className="srr-cap__title">{w.title}</span>
                  <span className="srr-cap__sub">{w.artist}{w.year && <em> {w.year}</em>}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>,
      );
    }
    if (museums.length) {
      sections.push(
        <section key="museums" className="srr-sec">
          <Head no={++no} label={L.museums} count={totals.museums ?? museums.length} />
          <ul className="srr-b-tiles">
            {museums.map((m) => (
              <li key={m.key}>
                <button type="button" onClick={tap(m.onSelect)}>
                  <span className="srr-b-tile">
                    <MuseumLogoMark museumId={m.museumId} color="currentColor" maxWidth={150} maxHeight={46} area={3400} />
                  </span>
                  <span className="srr-cap__title">{m.name}</span>
                  <span className="srr-cap__sub">{m.place}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>,
      );
    }
    if (exhibitions.length) {
      sections.push(
        <section key="exhibitions" className="srr-sec">
          <Head no={++no} label={L.exhibitions} count={totals.exhibitions ?? exhibitions.length} />
          <ul className="srr-b-grid srr-b-grid--posters">
            {exhibitions.map((x) => (
              <li key={x.key}>
                <button type="button" onClick={tap(x.onSelect)}>
                  <span className="srr-b-img">{x.thumb}</span>
                  <span className="srr-cap__title">{x.title}</span>
                  <span className="srr-cap__sub">{x.venue}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>,
      );
    }
  }

  // ── C · 무대 + 띠: the top artist on a stage with their works, the rest as strips ──
  if (variant === "c") {
    if (artists.length) {
      const [lead, ...rest] = artists;
      const leadWorks = artworks.filter((w) => w.artistRaw === lead.raw).slice(0, 12);
      sections.push(
        <section key="artists" className="srr-sec">
          <Head no={++no} label={L.artists} count={totals.artists ?? artists.length} />
          <div className="srr-stage">
            <button type="button" className="srr-stage__who" onClick={tap(lead.onSelect)}>
              <span className="srr-face srr-face--stage">{lead.thumb}</span>
              <strong>{lead.name}</strong>
              <span><em>{fmt(lead.count)}</em>{L.works}</span>
              <u>{L.page} →</u>
            </button>
            {leadWorks.length > 0 && (
              <ul className="srr-strip srr-strip--stage">
                {leadWorks.map((w) => (
                  <li key={w.key}>
                    <button type="button" onClick={tap(w.onSelect)}>
                      <span className="srr-c-img">{w.thumb}</span>
                      <span className="srr-cap__title">{w.title}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {rest.length > 0 && (
            <div className="srr-run">
              {(artistsOpen ? rest : rest.slice(0, 12)).map((a) => (
                <button key={a.key} type="button" onClick={tap(a.onSelect)}>
                  {a.name}<sup>{fmt(a.count)}</sup>
                </button>
              ))}
              <More hidden={rest.length - 12} open={artistsOpen} onToggle={() => setArtistsOpen((v) => !v)} ko={ko} />
            </div>
          )}
        </section>,
      );
    }
    if (artworks.length) {
      sections.push(
        <section key="artworks" className="srr-sec">
          <Head no={++no} label={L.artworks} count={totals.artworks ?? artworks.length} />
          <ul className={`srr-strip${worksOpen ? " is-open" : ""}`}>
            {artworks.map((w) => (
              <li key={w.key}>
                <button type="button" onClick={tap(w.onSelect)}>
                  <span className="srr-c-img">{w.thumb}</span>
                  <span className="srr-cap__title">{w.title}</span>
                  <span className="srr-cap__sub">{w.artist}{w.year && <em> {w.year}</em>}</span>
                </button>
              </li>
            ))}
          </ul>
          {artworks.length > 4 && (
            <button type="button" className="srr-more" onClick={tap(() => setWorksOpen((v) => !v))}>
              {worksOpen ? (ko ? "한 줄로 −" : "One row −") : `${ko ? "모두 펼치기" : "Show all"} +${fmt(artworks.length)}`}
            </button>
          )}
        </section>,
      );
    }
    if (exhibitions.length) {
      sections.push(
        <section key="exhibitions" className="srr-sec">
          <Head no={++no} label={L.exhibitions} count={totals.exhibitions ?? exhibitions.length} />
          <ul className="srr-strip srr-strip--posters">
            {exhibitions.map((x) => (
              <li key={x.key}>
                <button type="button" onClick={tap(x.onSelect)}>
                  <span className="srr-c-img">{x.thumb}</span>
                  <span className="srr-cap__title">{x.title}</span>
                  <span className="srr-cap__sub">{x.venue}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>,
      );
    }
    if (museums.length) {
      sections.push(
        <section key="museums" className="srr-sec">
          <Head no={++no} label={L.museums} count={totals.museums ?? museums.length} />
          <div className="srr-run srr-run--museums">
            {museums.map((m) => (
              <button key={m.key} type="button" onClick={tap(m.onSelect)}>
                <MuseumLogoMark museumId={m.museumId} color="currentColor" maxWidth={40} maxHeight={16} area={420} />
                {m.name}<sup>{m.place}</sup>
              </button>
            ))}
          </div>
        </section>,
      );
    }
  }

  return <div className={`srr srr--${variant}`}>{sections}</div>;
}
