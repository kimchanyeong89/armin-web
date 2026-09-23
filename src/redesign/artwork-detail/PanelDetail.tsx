import { useRef } from "react";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import type { OpenedWork } from "../artist/ArtistStudiesApp";
import type { ArtistWork } from "../artist/model";
import { Acts, artistPath, museumPath, recordOf } from "../artwork/WorkDetail";
import { Meta, onActivate, two, useLiked, useOverlay, useScrollTop } from "./shared";

/**
 * A · the map's panel.
 *
 * The detail opens the way a city opens on the globe: a solid column down
 * the left, as wide as the map's guide column and edged in gold, with the
 * way back (to the artist) and the way out along its top, the title behind
 * the globe's ring, then sections under a caption and a hairline, each a
 * list of rows led by a 4:3 thumbnail — the city panel's own list. The work
 * stands on the stage to the right, where the globe stands. On a phone the
 * panel takes the screen and the work follows the title, where the city
 * panel keeps its minimap.
 */
export default function PanelDetail({ work, ko, similar, related, onPick, onClose }: OpenedWork) {
  useOverlay(onClose);
  const { liked, toggle } = useLiked();
  const root = useRef<HTMLDivElement | null>(null);
  useScrollTop(root, work.image);
  const { artistRaw, artistShown, museumShown, category } = recordOf(work, ko);

  const rows = (list: ArtistWork[]) => (
    <ul className="dp-rows">
      {list.map((w, i) => (
        <li key={w.image} className="dp-row" role="button" tabIndex={0}
          style={{ animationDelay: `${0.18 + i * 0.032}s` }}
          onClick={() => onPick(w)} onKeyDown={onActivate(() => onPick(w))}>
          <img src={w.image} alt="" loading="lazy" />
          <div className="dp-row__text">
            <b>{w.title}</b>
            <Meta className="dd-sub" parts={[
              w.year,
              <a key="museum" href={museumPath(w.museumId)} onClick={(e) => e.stopPropagation()}>
                {ko ? w.museumKo : w.museum}
              </a>,
            ]} />
          </div>
          <Acts id={w.image} liked={liked} toggle={toggle} ko={ko} size={13} stroke={1.8} />
        </li>
      ))}
    </ul>
  );

  return (
    <div ref={root} className="dd dp" role="dialog" aria-modal="true" aria-label={work.title}>
      <div className="dp-scrim" onClick={onClose} />
      <nav className="dp-nav">
        <button type="button" className="dd-back" onClick={onClose}>
          <ArrowLeft size={13} strokeWidth={2} aria-hidden="true" />
          <span>{ko ? work.artistKo || artistRaw : artistRaw}</span>
        </button>
        <button type="button" className="dd-x" onClick={onClose} aria-label={ko ? "닫기" : "Close"}>×</button>
      </nav>

      <header className="dp-head">
        <h2><i aria-hidden="true" /><span>{work.title}</span></h2>
        {work.titleAlt && <p className="dd-alt">{work.titleAlt}</p>}
        {artistRaw && (
          <p className="dp-by"><a className="dd-link" href={artistPath(artistRaw)}>{artistShown}</a></p>
        )}
        <Meta parts={[work.year, category]} />
      </header>

      <figure className="dp-stage">
        <div className="dp-plate">
          <img src={work.image} alt={work.title} />
          <Acts id={work.image} liked={liked} toggle={toggle} ko={ko} stroke={1.8} />
        </div>
      </figure>

      <div className="dp-body" data-scroll>
        <section className="dp-sec">
          <header className="ar-dist__cap">
            <span>{ko ? "소장" : "Held at"}</span><i />{work.country && <em>{work.country}</em>}
          </header>
          <p className="dp-held">
            <i className="dd-dot" aria-hidden="true" />
            {work.museumId
              ? <a className="dd-link" href={museumPath(work.museumId)}>{museumShown}</a>
              : <span>{museumShown}</span>}
            {work.sourceUrl && (
              <a className="dd-source" href={work.sourceUrl} target="_blank" rel="noopener noreferrer">
                {ko ? "원본 페이지" : "Museum page"}<ArrowUpRight size={11} strokeWidth={2} aria-hidden="true" />
              </a>
            )}
          </p>
        </section>

        {similar.length > 0 && (
          <section className="dp-sec">
            <header className="ar-dist__cap">
              <span>{ko ? "AI 추천" : "AI picks"}</span>
              <small>{ko ? "이미지 임베딩" : "by image embedding"}</small>
              <i /><em>{two(similar.length)}</em>
            </header>
            {rows(similar)}
          </section>
        )}
        {related.length > 0 && (
          <section className="dp-sec">
            <header className="ar-dist__cap">
              <span>{ko ? "관련된 작품" : "Related works"}</span><i /><em>{two(related.length)}</em>
            </header>
            {rows(related)}
          </section>
        )}
      </div>
    </div>
  );
}
