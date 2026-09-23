import { useRef } from "react";
import { ArrowUpRight } from "lucide-react";
import type { OpenedWork } from "../artist/ArtistStudiesApp";
import type { ArtistWork } from "../artist/model";
import { Acts, artistPath, museumPath, recordOf } from "../artwork/WorkDetail";
import { Meta, onActivate, two, useLiked, useOverlay, useScrollTop } from "./shared";
import "./detail-studies.css";

/**
 * B · the globe's stage.
 *
 * The detail takes the screen the way the map does. The work stands in the
 * dark field where the globe stands, under the globe's frosted halo and with
 * its pale rim along the top edge. The top of the window carries a thin
 * strip between two hairlines, as the map carries its totals; here it names
 * the two rails and takes you down to them. The way out stands where KO | EN
 * does, the title on the left like the map's reading guide, and the museum in
 * the bottom-left corner on a gold point and a drawn line, the way the map
 * holds its live exhibitions. The rails follow under the stage, each work at
 * one height and in its own shape, never cropped. Like and save ride the
 * painting's corner, a size up from the rails' marks, since the work is large
 * enough to carry them; the year follows the title in brackets.
 *
 * Chosen from the three proposals on 2026-09-15: the artist page opens this.
 */
export default function StageDetail({ work, ko, similar, related, onPick, onClose }: OpenedWork) {
  useOverlay(onClose);
  const { liked, toggle } = useLiked();
  const root = useRef<HTMLDivElement | null>(null);
  useScrollTop(root, work.image);
  const { artistRaw, artistShown, museumShown, category } = recordOf(work, ko);
  const down = (rail: string) =>
    root.current?.querySelector(`[data-rail="${rail}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" });

  const cards = (list: ArtistWork[]) => (
    <div className="ds-cards">
      {list.map((w) => (
        <article key={w.image} className="dd-card" role="button" tabIndex={0}
          onClick={() => onPick(w)} onKeyDown={onActivate(() => onPick(w))}>
          <div className="dd-card__shot">
            <img src={w.image} alt={w.title} loading="lazy" />
            <Acts id={w.image} liked={liked} toggle={toggle} ko={ko} size={13} stroke={1.8} />
          </div>
          <b>{w.title}</b>
          <Meta className="dd-sub" parts={[
            w.year,
            <a key="museum" href={museumPath(w.museumId)} onClick={(e) => e.stopPropagation()}>
              {ko ? w.museumKo : w.museum}
            </a>,
          ]} />
        </article>
      ))}
    </div>
  );

  return (
    <div ref={root} className="dd ds" role="dialog" aria-modal="true" aria-label={work.title}>
      <section className="ds-stage">
        <p className="ds-strip">
          <i aria-hidden="true" />
          {similar.length > 0 && (
            <button type="button" onClick={() => down("picks")}>
              {ko ? "AI 추천" : "AI picks"}<b>{two(similar.length)}</b>
            </button>
          )}
          {related.length > 0 && (
            <button type="button" onClick={() => down("related")}>
              {ko ? "관련된 작품" : "Related works"}<b>{two(related.length)}</b>
            </button>
          )}
          <i aria-hidden="true" />
        </p>
        <button type="button" className="dd-x ds-x" onClick={onClose} aria-label={ko ? "닫기" : "Close"}>×</button>

        <div className="ds-title">
          <Meta className="dd-eyebrow" parts={[category]} />
          <h2>{work.title}{work.year && <span className="ds-year"> ({work.year})</span>}</h2>
          {work.titleAlt && <p className="dd-alt">{work.titleAlt}</p>}
          {artistRaw && (
            <p className="ds-by"><a className="dd-link" href={artistPath(artistRaw)}>{artistShown}</a></p>
          )}
        </div>

        <figure className="ds-plate">
          <img src={work.image} alt={work.title} />
          <Acts id={work.image} liked={liked} toggle={toggle} ko={ko} size={20} stroke={1.8} />
        </figure>

        <p className="ds-held">
          <i className="dd-dot" aria-hidden="true" />
          {work.museumId
            ? <a href={museumPath(work.museumId)}>{museumShown}</a>
            : <span>{museumShown}</span>}
          {work.country && <em>{work.country}</em>}
          <u aria-hidden="true" />
          {work.sourceUrl && (
            <a className="dd-source" href={work.sourceUrl} target="_blank" rel="noopener noreferrer">
              {ko ? "원본 페이지" : "Museum page"}<ArrowUpRight size={11} strokeWidth={2} aria-hidden="true" />
            </a>
          )}
        </p>
      </section>

      {similar.length > 0 && (
        <section className="ds-rail" data-rail="picks">
          <header className="ar-dist__cap">
            <span>{ko ? "AI 추천" : "AI picks"}</span>
            <small>{ko ? "이미지 임베딩" : "by image embedding"}</small>
            <i /><em>{two(similar.length)}</em>
          </header>
          {cards(similar)}
        </section>
      )}
      {related.length > 0 && (
        <section className="ds-rail" data-rail="related">
          <header className="ar-dist__cap">
            <span>{ko ? "관련된 작품" : "Related works"}</span><i /><em>{two(related.length)}</em>
          </header>
          {cards(related)}
        </section>
      )}
    </div>
  );
}
