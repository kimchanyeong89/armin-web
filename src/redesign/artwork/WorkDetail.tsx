import { useEffect, useState } from "react";
import { ArrowUpRight, BookmarkPlus, Heart } from "lucide-react";
import type { ArtistWork } from "../artist/model";

/**
 * The artwork detail, shared by the standalone study and the artist page.
 *
 * Revised from review: the type was set far too large for a panel that has
 * to carry a record plus two recommendation rails, so the title drops to
 * ~20px and the fields to 12px. The two rails the live lightbox shows —
 * 비슷한 분위기 (the embedding's picks) and 같은 작가 — are here; the earlier
 * study left them out entirely.
 *
 * Artist and museum are links: the artist opens our own gallery, the museum
 * opens its collection modal.
 */
export interface DetailWork extends ArtistWork {
  titleAlt?: string;
  accession?: string;
  medium?: string; mediumKo?: string;
  size?: string;
  category?: string; categoryKo?: string;
  sourceUrl?: string;
  artist?: string; artistKo?: string; artistSlug?: string;
}

/* exported for the detail proposals, which keep the same links and marks */
export const artistPath = (raw: string) =>
  `/artist-gallery/${encodeURIComponent(raw.replace(/[()]/g, "").replace(/[\s_]+/g, "-").replace(/-+/g, "-").toLowerCase())}?name=${encodeURIComponent(raw)}`;
export const museumPath = (id: string) => `/interactive/world/city/${encodeURIComponent(id)}`;

export function Acts({ id, liked, toggle, ko, size = 15, stroke = 2.2 }: {
  id: string; liked: string[]; toggle: (k: string) => void; ko: boolean; size?: number; stroke?: number;
}) {
  const on = liked.includes(id);
  return (
    <div className="wd-acts">
      <button type="button" onClick={(e) => e.stopPropagation()} aria-label={ko ? "플레이리스트에 추가" : "Save to playlist"}>
        <BookmarkPlus size={size} strokeWidth={stroke} />
      </button>
      <button type="button" className={on ? "is-on" : ""}
        onClick={(e) => { e.stopPropagation(); toggle(id); }}
        aria-pressed={on} aria-label={ko ? "좋아요" : "Like"}>
        <Heart size={size + 1} strokeWidth={stroke} fill={on ? "currentColor" : "none"} />
      </button>
    </div>
  );
}

/** The record's wording, shared with the detail proposals so the rules live
    in one place. Korean mode carries both artist names — the Korean
    transliteration is what people read, the original is what they search
    and cite. */
export function recordOf(work: DetailWork, ko: boolean) {
  const artistRaw = work.artist || "";
  return {
    artistRaw,
    artistShown: ko && work.artistKo && work.artistKo !== artistRaw ? `${work.artistKo} (${artistRaw})` : artistRaw,
    museumShown: ko ? work.museumKo : work.museum,
    category: ko ? (work.categoryKo || work.category) : work.category,
  };
}

export default function WorkDetail({
  work, ko, similar, related, onPick, onClose,
}: {
  work: DetailWork; ko: boolean;
  similar: ArtistWork[]; related: ArtistWork[];
  onPick?: (w: ArtistWork) => void;
  onClose?: () => void;
}) {
  const [liked, setLiked] = useState<string[]>([]);
  const toggle = (k: string) => setLiked((p) => (p.includes(k) ? p.filter((x) => x !== k) : [...p, k]));
  useEffect(() => {
    if (!onClose) return;
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);

  const { artistRaw, artistShown, museumShown, category } = recordOf(work, ko);

  /* The live lightbox states this as a short stack — title, artist, then
     one line for the rest — rather than a field table. That is more compact
     and it is what people already read here. */
  const rail = (title: string, note: string, list: ArtistWork[]) => (
    list.length > 0 && (
      <section className="wd-rail">
        <header><span>{title}</span><i /><em>{note}</em></header>
        <div className="wd-rail__row">
          {list.map((w) => (
            <article key={w.image} className="wd-card" role="button" tabIndex={0}
              onClick={() => onPick?.(w)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onPick?.(w); } }}>
              <div className="wd-card__shot">
                <img src={w.image} alt={w.title} loading="lazy" />
                <Acts id={w.image} liked={liked} toggle={toggle} ko={ko} />
              </div>
              <b>{w.title}</b>
              <small>
                {w.year ? `${w.year} · ` : ""}
                <a href={museumPath(w.museumId)} onClick={(e) => e.stopPropagation()}>
                  {ko ? w.museumKo : w.museum}
                </a>
              </small>
            </article>
          ))}
        </div>
      </section>
    )
  );

  return (
    <article className="wd">
      <div className="wd-plate">
        <img src={work.image} alt={work.title} />
        <Acts id={work.image} liked={liked} toggle={toggle} ko={ko} />
        {onClose && (
          <button type="button" className="wd-close" onClick={onClose} aria-label={ko ? "닫기" : "Close"}>×</button>
        )}
      </div>

      <div className="wd-body">
        <div className="wd-record">
          <h2>{work.title}</h2>
          {work.titleAlt && <p className="wd-alt">{work.titleAlt}</p>}

          {artistRaw && (
            <p className="wd-by">
              <a className="wd-link" href={artistPath(artistRaw)}>{artistShown}</a>
            </p>
          )}
          {/* No field names: a date, a kind and a museum each say what they
              are. The museum's own page for the work sits with the museum. */}
          {(work.year || category) && (
            <p className="wd-meta">{[work.year, category].filter(Boolean).join(" · ")}</p>
          )}
          <p className="wd-held">
            {work.museumId
              ? <a className="wd-link" href={museumPath(work.museumId)}>{museumShown}</a>
              : museumShown}
            {work.country && <span className="wd-where">{work.country}</span>}
            {work.sourceUrl && (
              <a className="wd-link wd-source" href={work.sourceUrl} target="_blank" rel="noopener noreferrer">
                {ko ? "원본 페이지" : "Museum page"}<ArrowUpRight size={11} strokeWidth={2} aria-hidden="true" />
              </a>
            )}
          </p>
        </div>

        {rail(ko ? "AI 추천" : "AI picks",
              ko ? "이미지 임베딩" : "by image embedding", similar)}
        {rail(ko ? "관련된 작품" : "Related works",
              `${related.length}`, related)}
      </div>
    </article>
  );
}
