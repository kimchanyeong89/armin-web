import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { BookmarkPlus, Heart } from "lucide-react";
import { Link } from "react-router-dom";
import { useLanguage } from "../../contexts/LanguageContext";
import { ARTIST, WORKS, type ArtistWork } from "./model";
import type { DetailWork } from "../artwork/WorkDetail";
import StageDetail from "../artwork-detail/StageDetail";
import Distribution from "./Distribution";
import "./artist-studies.css";

/** Five across, four when narrow, three only on a phone.
    Measured with a ResizeObserver on the grid itself rather than a window
    resize listener: it reports the width actually available. */
function useColumns(ref: React.RefObject<HTMLDivElement | null>) {
  const [n, setN] = useState(5);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = (w: number) => setN(w <= 560 ? 3 : w <= 960 ? 4 : 5);
    read(el.getBoundingClientRect().width);
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) read(e.contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return n;
}

/** The name takes a share (fill) of its column's width, on one line and no
    larger than max. Measured, not sized from the window: how wide a name
    runs depends on its letters. */
function useFitLine(text: string, max: number, fill = 1) {
  const ref = useRef<HTMLHeadingElement | null>(null);
  const [size, setSize] = useState<number>();
  useLayoutEffect(() => {
    const el = ref.current;
    const box = el?.parentElement;
    if (!el || !box) return;
    const fit = () => {
      const was = el.style.fontSize;
      el.style.fontSize = "100px";
      const w = el.getBoundingClientRect().width;
      el.style.fontSize = was;
      if (w > 0) setSize(Math.min(max, Math.floor((100 * fill * box.clientWidth) / w)));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(box);
    document.fonts?.addEventListener("loadingdone", fit);
    void document.fonts?.ready.then(fit);
    return () => { ro.disconnect(); document.fonts?.removeEventListener("loadingdone", fit); };
  }, [text, max, fill]);
  return { ref, size };
}

/** What a detail proposal is handed when a work is opened over the grid. */
export interface OpenedWork {
  work: DetailWork; ko: boolean;
  similar: ArtistWork[]; related: ArtistWork[];
  onPick: (w: ArtistWork) => void; onClose: () => void;
}

export default function ArtistStudiesApp({ renderDetail, initialWork }: {
  /** draws the opened work in place of the chosen detail — how the proposal
      page still shows the others */
  renderDetail?: (opened: OpenedWork) => React.ReactNode;
  /** a work already open on arrival, by its place in WORKS */
  initialWork?: number;
}) {
  const { language, toggleLanguage, t } = useLanguage();
  const ko = language === "ko";
  const gridRef = useRef<HTMLDivElement | null>(null);
  const cols = useColumns(gridRef);
  const [liked, setLiked] = useState<string[]>([]);
  /* the work detail opens over the grid */
  const [open, setOpen] = useState<ArtistWork | null>(() => (initialWork === undefined ? null : WORKS[initialWork] ?? null));
  const toggle = (k: string) => setLiked((p) => (p.includes(k) ? p.filter((x) => x !== k) : [...p, k]));
  const museumOf = (w: (typeof WORKS)[number]) => (ko ? w.museumKo : w.museum);
  const name = ko ? ARTIST.nameKo : ARTIST.name;
  /* the heading scale the AI and community tabs use (3.2rem at most), or less
     when a long name would pass 55% of the column */
  const fit = useFitLine(name, 51, 0.55);

  /* Works are dealt round robin into columns, the way the live page does it,
     so the reading order still runs left to right. Only the width is set;
     each work keeps its own proportion and the column absorbs the height. */
  const columns = useMemo(
    () => Array.from({ length: cols }, (_, c) => WORKS.map((w, i) => ({ w, i })).filter(({ i }) => i % cols === c)),
    [cols],
  );

  return (
    <div className="ar-page">
      <header className="ar-header">
        <Link to="/redesign" className="ar-wordmark">COLLY <span>/ {t({ ko: "작가", en: "ARTIST" })}</span></Link>
        <div className="ar-header-actions">
          <button type="button" onClick={toggleLanguage}>{ko ? "EN" : "KR"}</button>
        </div>
      </header>
      <main className="ar-main">
        <section className="ar-head">
          <div className="ar-head__main">
            <p className="ar-head__meta">{t({ ko: "작가", en: "ARTIST" })}</p>
            <h1 ref={fit.ref} style={fit.size ? { fontSize: fit.size } : undefined}>{name}</h1>
            <p className="ar-head__life">
              {ko ? ARTIST.countryKo : ARTIST.country} · {ARTIST.born}–{ARTIST.died} · {ko ? ARTIST.categoryKo : ARTIST.category}
            </p>
          </div>
          {/* one description, the encyclopaedia's, under a caption like the
              distribution's; its source link takes the caption's figure slot */}
          <section className="ar-about">
            <header className="ar-dist__cap">
              <span>{t({ ko: "위키피디아", en: "Wikipedia" })}</span>
              <i />
              <a href={ARTIST.wiki} target="_blank" rel="noopener noreferrer" className="ar-wiki"
                aria-label={t({ ko: "위키피디아에서 읽기", en: "Read on Wikipedia" })}>↗</a>
            </header>
            <p className="ar-head__about">{ko ? ARTIST.wikiKo : ARTIST.wikiEn}</p>
          </section>
          <Distribution ko={ko} />
        </section>

        <section className="ar-works">
          <header>
            {/* the counts alone open the works — no label before them */}
            <div className="ar-figures">
              <span><b>{ARTIST.held}</b><em>{t({ ko: "작품", en: "works" })}</em></span>
              <i />
              <span><b>{ARTIST.museums}</b><em>{t({ ko: "개 미술관", en: "museums" })}</em></span>
            </div>
            <i />
          </header>
          <div className="ar-cols" ref={gridRef}>
            {columns.map((col, c) => (
              <div className="ar-col" key={c}>
                {col.map(({ w, i }) => (
                  <article key={w.image}>
                    <div className="ar-shot" role="button" tabIndex={0}
                      onClick={() => setOpen(w)}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpen(w); } }}>
                      <img src={w.image} alt={w.title} loading={i < 10 ? "eager" : "lazy"} />
                      <div className="ar-acts">
                        <button type="button" className={liked.includes(w.image) ? "is-on" : ""}
                          onClick={(e) => { e.stopPropagation(); toggle(w.image); }}
                          aria-pressed={liked.includes(w.image)} aria-label={t({ ko: "좋아요", en: "Like" })}>
                          <Heart size={14} strokeWidth={2.2} fill={liked.includes(w.image) ? "currentColor" : "none"} />
                        </button>
                        <button type="button" onClick={(e) => e.stopPropagation()}
                          aria-label={t({ ko: "플레이리스트에 추가", en: "Save to playlist" })}>
                          <BookmarkPlus size={13} strokeWidth={2.2} />
                        </button>
                      </div>
                      <div className="ar-over">
                        <h3>{w.title}</h3>
                        <p>
                          {w.year || "—"} ·{" "}
                          <a href={`/interactive/world/city/${encodeURIComponent(w.museumId)}`}
                            onClick={(e) => e.stopPropagation()}>{museumOf(w)}</a>
                        </p>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            ))}
          </div>
        </section>
      </main>

      {open && (() => {
        const detail: DetailWork = {
          ...open,
          artist: ARTIST.name, artistKo: ARTIST.nameKo, artistSlug: ARTIST.slug,
          category: ARTIST.category, categoryKo: ARTIST.categoryKo,
        };
        const others = WORKS.filter((x) => x.image !== open.image);
        /* the work opens on the globe's stage — proposal B, the one chosen */
        const opened: OpenedWork = {
          work: detail, ko, similar: others.slice(0, 6), related: others.slice(6, 12),
          onPick: setOpen, onClose: () => setOpen(null),
        };
        return renderDetail ? renderDetail(opened) : <StageDetail {...opened} />;
      })()}
    </div>
  );
}
