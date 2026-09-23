import type { SyntheticEvent } from "react";
import { createPortal } from "react-dom";
import { ArrowRight, ArrowUpRight, Heart, X } from "lucide-react";
import { ReviewPanel } from "./Ratings/ReviewPanel";
import { useCloseOnEscape } from "./Ratings/useMyRating";
import { NO_IMAGE_PLACEHOLDER_DARK } from "../utils/noImagePlaceholder";
import type { BookingSite } from "../data/exhibitionBooking";
import "./collyGlass.css";
import "./nearbyExhibitionModal.css";

type Copy = { ko: string; en: string };

export interface ExhibitionDetail {
  id: string;
  title: string;
  venue: string;
  image: string;
  period: string;
  distance?: number;
  /** 1–99 match with the signed-in user's liked artworks; absent until they have a taste. */
  tasteMatch?: number;
  description: string;
  detailUrl: string;
  /** the booking site, when one is known; the button leads with it */
  booking?: BookingSite | null;
}

/**
 * One exhibition from the nearby list, opened over the map sheet: its poster,
 * dates and introduction, the way to its museum, and the shared rating panel.
 */
export default function NearbyExhibitionModal({
  ex,
  isLight,
  language,
  liked,
  onToggleLike,
  onOpenMuseum,
  onClose,
}: {
  ex: ExhibitionDetail;
  isLight: boolean;
  language: string;
  liked: boolean;
  onToggleLike: () => void;
  /** Null when the museum is not on the map. */
  onOpenMuseum: (() => void) | null;
  onClose: () => void;
}) {
  useCloseOnEscape(onClose);
  const tr = (copy: Copy) => (language === "ko" ? copy.ko : copy.en);
  // A portal still bubbles React events to the card that opened it.
  const keep = (event: SyntheticEvent) => event.stopPropagation();
  const light = isLight || undefined;

  return createPortal(
    <div
      className="nem-backdrop"
      data-light={light}
      onClick={(event) => {
        keep(event);
        if (event.target === event.currentTarget) onClose();
      }}
      onMouseDown={keep}
      onPointerDown={keep}
      onKeyDown={keep}
    >
      <div role="dialog" aria-modal="true" aria-label={ex.title} className="nem colly-glass" data-light={light}>
        <button type="button" className="nem-close" onClick={onClose} aria-label={tr({ ko: "닫기", en: "Close" })}>
          <X size={15} strokeWidth={2} />
        </button>

        <div className="nem-scroll">
          <div className="nem-top">
            <figure className="nem-poster">
              <img
                src={ex.image || NO_IMAGE_PLACEHOLDER_DARK}
                alt={ex.title}
                onError={(event) => {
                  event.currentTarget.src = NO_IMAGE_PLACEHOLDER_DARK;
                }}
              />
            </figure>

            <div className="nem-info">
              <p className="nem-kicker">
                <b>{ex.venue}</b>
                {ex.tasteMatch !== undefined && (
                  <>
                    <i aria-hidden="true" />
                    <span>{tr({ ko: `취향 일치 ${ex.tasteMatch}%`, en: `${ex.tasteMatch}% taste match` })}</span>
                  </>
                )}
              </p>
              <h2 className="nem-title">{ex.title}</h2>

              <dl className="nem-facts">
                {ex.period && (
                  <div>
                    <dt>{tr({ ko: "기간", en: "DATES" })}</dt>
                    <dd>{ex.period}</dd>
                  </div>
                )}
                {ex.distance !== undefined && (
                  <div>
                    <dt>{tr({ ko: "거리", en: "DISTANCE" })}</dt>
                    <dd>{ex.distance}km</dd>
                  </div>
                )}
              </dl>

              {ex.description && <p className="nem-about">{ex.description}</p>}

              <div className="nem-acts">
                {/* Booking leads: it is what someone opening a current exhibition
                    most often wants next. The button names who takes the booking,
                    so leaving the app for another site is never a surprise. */}
                {ex.booking && (
                  <a className="nem-book" href={ex.booking.url} target="_blank" rel="noopener noreferrer">
                    <span>{ex.booking.reserve ? tr({ ko: "예약하기", en: "Reserve" }) : tr({ ko: "예매하기", en: "Book" })}</span>
                    <small>{tr(ex.booking.site)}</small>
                    <ArrowUpRight size={15} strokeWidth={1.9} />
                  </a>
                )}
                {onOpenMuseum && (
                  <button type="button" className="nem-go" onClick={onOpenMuseum}>
                    <span aria-hidden="true">
                      <ArrowRight size={16} strokeWidth={1.8} />
                    </span>
                    {tr({ ko: "미술관으로 이동하기", en: "Go to the museum" })}
                  </button>
                )}
                {ex.detailUrl && ex.detailUrl !== ex.booking?.url && (
                  <button
                    type="button"
                    className="nem-link"
                    onClick={() => window.open(ex.detailUrl, "_blank", "noopener,noreferrer")}
                  >
                    {tr({ ko: "자세히 보기", en: "Details" })}
                    <ArrowUpRight size={14} strokeWidth={1.8} />
                  </button>
                )}
                <button
                  type="button"
                  className="nem-heart"
                  aria-label={tr({ ko: "좋아요", en: "Like" })}
                  aria-pressed={liked}
                  onClick={onToggleLike}
                >
                  <Heart size={16} strokeWidth={1.9} fill={liked ? "currentColor" : "none"} />
                </button>
              </div>
            </div>
          </div>

          <div className="nem-ratings">
            <ReviewPanel subject={{ kind: "exhibition", id: ex.id }} isLight={isLight} />
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
