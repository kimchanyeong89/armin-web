import { useRef, useState } from "react";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import type { OpenedWork } from "../artist/ArtistStudiesApp";
import { Acts, artistPath, museumPath, recordOf } from "../artwork/WorkDetail";
import { Meta, onActivate, two, useLiked, useOverlay, useScrollTop } from "./shared";

/**
 * C · a menu tab.
 *
 * The detail reads as a page of its own, built the way the AI tab and a
 * community post are: one left-aligned column under a sticky bar that holds
 * only the way back, as a post's does. A gold eyebrow, the title, a lede split
 * by ticks, and the museum on a line led by the reading guide's circled arrow;
 * then the work uncropped, as a post shows its image. Under it runs the AI
 * tab's own switch — one bordered control split in two that sticks under the
 * bar — turning between the two rails, each a grid of 3:4 cards whose gold
 * point draws into a bar under the pointer.
 */
export default function TabDetail({ work, ko, similar, related, onPick, onClose }: OpenedWork) {
  useOverlay(onClose);
  const { liked, toggle } = useLiked();
  const root = useRef<HTMLDivElement | null>(null);
  useScrollTop(root, work.image);
  const { artistRaw, artistShown, museumShown, category } = recordOf(work, ko);
  const [tab, setTab] = useState<"picks" | "related">("picks");
  const active = similar.length === 0 ? "related" : related.length === 0 ? "picks" : tab;
  const list = active === "picks" ? similar : related;

  return (
    <div ref={root} className="dd dt" role="dialog" aria-modal="true" aria-label={work.title}>
      <header className="dt-bar">
        <button type="button" className="dd-back" onClick={onClose}>
          <ArrowLeft size={13} strokeWidth={2} aria-hidden="true" />
          <span>{ko ? work.artistKo || artistRaw : artistRaw}</span>
        </button>
      </header>

      <div className="dt-main">
        <section className="dt-head">
          {category && <p className="dd-eyebrow">{category}</p>}
          <h2>{work.title}</h2>
          {work.titleAlt && <p className="dd-alt">{work.titleAlt}</p>}
          <Meta className="dt-lede" parts={[
            artistRaw && <a key="artist" className="dd-link" href={artistPath(artistRaw)}>{artistShown}</a>,
            work.year,
          ]} />
          <p className="dt-held">
            <span className="dt-ring" aria-hidden="true"><ArrowUpRight size={13} strokeWidth={2} /></span>
            {work.museumId
              ? <a className="dd-link" href={museumPath(work.museumId)}>{museumShown}</a>
              : <span>{museumShown}</span>}
            {work.country && <em>{work.country}</em>}
            {work.sourceUrl && (
              <a className="dd-source" href={work.sourceUrl} target="_blank" rel="noopener noreferrer">
                {ko ? "원본 페이지" : "Museum page"}<ArrowUpRight size={11} strokeWidth={2} aria-hidden="true" />
              </a>
            )}
          </p>
        </section>

        <figure className="dt-plate">
          <img src={work.image} alt={work.title} />
          <Acts id={work.image} liked={liked} toggle={toggle} ko={ko} stroke={1.8} />
        </figure>

        {list.length > 0 && (
          <>
            <div className="dt-switch" role="tablist" aria-label={ko ? "더 볼 작품" : "More works"}>
              {similar.length > 0 && (
                <button type="button" role="tab" aria-selected={active === "picks"}
                  className={active === "picks" ? "is-on" : undefined} onClick={() => setTab("picks")}>
                  <i aria-hidden="true" /><span>{ko ? "AI 추천" : "AI picks"}</span>
                  <em>{ko ? "이미지 임베딩" : "by image embedding"} · {two(similar.length)}</em>
                </button>
              )}
              {related.length > 0 && (
                <button type="button" role="tab" aria-selected={active === "related"}
                  className={active === "related" ? "is-on" : undefined} onClick={() => setTab("related")}>
                  <i aria-hidden="true" /><span>{ko ? "관련된 작품" : "Related works"}</span>
                  <em>{two(related.length)}</em>
                </button>
              )}
            </div>
            <div className="dt-grid" role="tabpanel">
              {list.map((w) => (
                <article key={w.image} className="dd-card dt-card" role="button" tabIndex={0}
                  onClick={() => onPick(w)} onKeyDown={onActivate(() => onPick(w))}>
                  <div className="dd-card__shot">
                    <img src={w.image} alt={w.title} loading="lazy" />
                    <Acts id={w.image} liked={liked} toggle={toggle} ko={ko} size={13} stroke={1.8} />
                  </div>
                  <b>{w.title}</b>
                  <div className="dt-sub">
                    <i className="dt-point" aria-hidden="true" />
                    <Meta className="dd-sub" parts={[
                      w.year,
                      <a key="museum" href={museumPath(w.museumId)} onClick={(e) => e.stopPropagation()}>
                        {ko ? w.museumKo : w.museum}
                      </a>,
                    ]} />
                  </div>
                </article>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
