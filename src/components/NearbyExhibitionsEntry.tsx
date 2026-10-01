import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import { MapPin, ArrowRight, X } from "lucide-react";
import { exhibitions } from "../data/exhibitions";
import NearbyExhibitions from "./NearbyExhibitions";
import { museumMapPath } from "../utils/museumMapPath";
import { useLanguage } from "../contexts/LanguageContext";
import { getOptimizedImageUrl } from "../utils/imageProxy";
import "./nearbyExhibitions.css";

/**
 * Nearby exhibitions, answered on the map.
 *
 * The sheet rises out of the trigger the way a genie leaves its lamp - scaled
 * down and squashed at the bottom edge, then unfolding - so the list reads as
 * coming from the map rather than replacing it.
 *
 * Picking a show opens its details; the modal's museum button routes to
 * /interactive/{country}/{city}/{museumId}, the path the globe already resolves
 * into "select the city, drill to it, and open that venue". Nothing leaves the
 * map tab.
 */
export type NearbyEntryVariant = "bar" | "chip" | "card";

export const NEARBY_ENTRY_VARIANTS: NearbyEntryVariant[] = ["bar", "chip", "card"];

/** Entry studies, switchable with ?nf= — the trigger's whole form changes. */
export const NEARBY_FRAMES = ["hybrid", "filmstrip", "caption", "stack", "pulse"] as const;
export type NearbyFrame = (typeof NEARBY_FRAMES)[number];

export function parseNearbyFrame(search: string): NearbyFrame {
  const v = new URLSearchParams(search).get("nf");
  return (NEARBY_FRAMES as readonly string[]).includes(v || "") ? (v as NearbyFrame) : "hybrid";
}

/** Opened-sheet frame studies, switchable with ?sf=. */
export const SHEET_FRAMES = ["frost", "droplet", "smoke", "prism", "velvet"] as const;
export type SheetFrame = (typeof SHEET_FRAMES)[number];
export function parseSheetFrame(search: string): SheetFrame {
  const v = new URLSearchParams(search).get("sf");
  return (SHEET_FRAMES as readonly string[]).includes(v || "") ? (v as SheetFrame) : "droplet";
}

export function parseNearbyVariant(search: string): NearbyEntryVariant {
  const value = new URLSearchParams(search).get("nearby");
  return (NEARBY_ENTRY_VARIANTS as string[]).includes(value || "")
    ? (value as NearbyEntryVariant)
    : "bar";
}

interface OngoingShow {
  id: string;
  museumId: string;
  title: string;
  museum: string;
  city: string;
  country: string;
  period: string;
  daysLeft: number | null;
  image: string;
}

/** Same predicate the nearby list uses, so the count never disagrees with it. */
function useOngoing(language: string): OngoingShow[] {
  return useMemo(() => {
    const rows: OngoingShow[] = [];
    (exhibitions as any[]).forEach((museum) => {
      (museum.temporaryExhibitions || []).forEach((show: any) => {
        if (show.status === "past" || !show.coverImage) return;
        const dated = show.endDate && show.endDate !== "ongoing" && show.endDate !== "TBD";
        const daysLeft = dated
          ? Math.ceil((new Date(show.endDate).getTime() - Date.now()) / 86_400_000)
          : null;
        rows.push({
          id: show.id,
          museumId: String(museum.id || ""),
          title: (language === "ko" && (show.title_ko || show.name_ko)) || show.title || show.name || "",
          museum: (language === "ko" && museum.name_ko) || museum.name,
          city: String(museum.location || "").split(",")[0].trim(),
          country: museum.country || "world",
          period: dated ? `${show.startDate} – ${show.endDate}` : (language === "ko" ? "상시" : "Ongoing"),
          daysLeft,
          image: show.coverImage,
        });
      });
    });
    // Closing soonest first: on a "what is on now" list that is the useful order.
    return rows.sort((a, b) => (a.daysLeft ?? 99999) - (b.daysLeft ?? 99999));
  }, [language]);
}

const GOLD = "#D4A547";

const surface: CSSProperties = {
  border: `1px solid ${GOLD}55`,
  background: "rgba(12,12,12,0.42)",
  backdropFilter: "blur(30px) saturate(1.2)",
  WebkitBackdropFilter: "blur(30px) saturate(1.2)",
  color: "#f2efe6",
  fontFamily: 'Hana2, "Apple SD Gothic Neo", sans-serif',
};

export default function NearbyExhibitionsEntry({ frame = "hybrid", sheetFrame = "droplet" }: { variant?: NearbyEntryVariant; frame?: NearbyFrame; sheetFrame?: SheetFrame }) {
  const navigate = useNavigate();
  const { language } = useLanguage();
  const shows = useOngoing(language);
  const [open, setOpen] = useState(false);
  const [isLight, setIsLight] = useState(() => {
    try { return localStorage.getItem("homeTheme") === "light"; } catch { return false; }
  });
  useEffect(() => {
    const sync = () => {
      try { setIsLight(localStorage.getItem("homeTheme") === "light"); } catch { setIsLight(false); }
    };
    window.addEventListener("theme-changed", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("theme-changed", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  // The language switch is fixed at z-index 199900, far above the globe layer
  // this sheet lives in, and a child cannot escape its parent stacking context.
  // Flagging the document lets that chrome step aside instead.
  useEffect(() => {
    if (!open) return;
    document.documentElement.dataset.overlayPanel = "1";
    return () => { delete document.documentElement.dataset.overlayPanel; };
  }, [open]);

  if (!shows.length) return null;

  const label = language === "ko" ? "현재 진행중인 전시" : "On view now";
  const sub = language === "ko" ? "눌러서 지도에서 보기" : "Tap to see it on the map";
  const countText = language === "ko" ? `${shows.length}개` : String(shows.length);

  /** Stops at the venue panel: the museum id resolves to "city selected,
      museum selected, no exhibition opened". */
  const openMuseum = (museumId: string) => {
    const path = museumMapPath(museumId);
    if (!path) return;
    setOpen(false);
    navigate(path);
  };

  const anchor: CSSProperties = {
    position: "absolute",
    zIndex: 20,
    cursor: "pointer",
    textAlign: "left",
    bottom: "calc(env(safe-area-inset-bottom, 0px) + 104px)",
  };

  const covers = shows.slice(0, 6);

  const trigger = frame === "hybrid" ? (
    /* 00 HYBRID — the caption's instrument voice carried by the stack's
       physicality: fanned posters with the mono readout beside them. */
    <button type="button" onClick={() => setOpen(true)} aria-label={`${label} ${countText}`}
      className="ne-t-hybrid" style={anchor}>
      <span className="ne-t-stack-fan" aria-hidden="true">
        {covers.slice(0, 3).map((show, i) => (
          <img key={show.id} src={getOptimizedImageUrl(show.image, 160)} alt="" width={40} height={54}
            loading="lazy" decoding="async" className={`ne-t-stack-img ne-t-stack-img--${i}`} />
        ))}
      </span>
      <span className="ne-t-hybrid-text">
        <span className="ne-t-hybrid-line">
          <span className="ne-t-caption-dot" aria-hidden="true" />
          <b>{label}</b>
          <em>{countText}</em>
          <span className="ne-t-caption-rule" aria-hidden="true" />
          <ArrowRight size={13} strokeWidth={2} />
        </span>
        <span className="ne-t-hybrid-sub">{sub}</span>
      </span>
    </button>
  ) : frame === "caption" ? (
    /* 02 CAPTION — no box at all. A monospace instrument line, the same
       voice as the map's coordinate readouts. */
    <button type="button" onClick={() => setOpen(true)} aria-label={`${label} ${countText}`}
      className="ne-t-caption" style={anchor}>
      <span className="ne-t-caption-dot" aria-hidden="true" />
      <span className="ne-t-caption-label">{label}</span>
      <span className="ne-t-caption-count">{countText}</span>
      <span className="ne-t-caption-rule" aria-hidden="true" />
      <ArrowRight size={13} strokeWidth={2} />
    </button>
  ) : frame === "stack" ? (
    /* 03 STACK — three fanned posters, like tickets set down on the map. */
    <button type="button" onClick={() => setOpen(true)} aria-label={`${label} ${countText}`}
      className="ne-t-stack" style={anchor}>
      <span className="ne-t-stack-fan" aria-hidden="true">
        {covers.slice(0, 3).map((show, i) => (
          <img key={show.id} src={getOptimizedImageUrl(show.image, 160)} alt="" width={44} height={58}
            loading="lazy" decoding="async" className={`ne-t-stack-img ne-t-stack-img--${i}`} />
        ))}
      </span>
      <span className="ne-t-stack-text">
        <b>{label}</b>
        <i>{countText} · {sub}</i>
      </span>
    </button>
  ) : frame === "pulse" ? (
    /* 04 PULSE — the selected-city locator, promoted to a control: a pin
       with a breathing ring and a bare label. */
    <button type="button" onClick={() => setOpen(true)} aria-label={`${label} ${countText}`}
      className="ne-t-pulse" style={anchor}>
      <span className="ne-t-pulse-ring" aria-hidden="true"><MapPin size={15} strokeWidth={2.2} /></span>
      <span className="ne-t-pulse-text">
        <b>{label} <em>{countText}</em></b>
        <i>{sub}</i>
      </span>
    </button>
  ) : (
    /* 01 FILMSTRIP — the content is the control: a strip of tonight's
       posters peeking from the bottom edge, caption above. */
    <button type="button" onClick={() => setOpen(true)} aria-label={`${label} ${countText}`}
      className="ne-t-film" style={anchor}>
      <span className="ne-t-film-caption">
        <span className="ne-t-film-kicker">{language === "ko" ? "지금" : "NOW"}</span>
        <b>{label}</b>
        <em>{countText}</em>
        <ArrowRight size={12} strokeWidth={2.2} style={{ marginLeft: "auto", opacity: .6 }} />
      </span>
      <span className="ne-t-film-strip" aria-hidden="true">
        {covers.map((show) => (
          <img key={show.id} src={getOptimizedImageUrl(show.image, 200)} alt="" width={72} height={50}
            loading="lazy" decoding="async" />
        ))}
      </span>
    </button>
  );

  return (
    <>
      {!open && trigger}
      {open && (
        <div
          role="dialog"
          aria-label={label}
          className={`ne-sheet ne-sf-${sheetFrame}`}
          style={{
            ...surface,
            position: "absolute",
            zIndex: 24,
            left: "clamp(12px, 3vw, 40px)",
            right: "clamp(12px, 3vw, 40px)",
            top: "clamp(14px, 3vh, 44px)",
            bottom: "calc(env(safe-area-inset-bottom, 0px) + 96px)",
            maxWidth: 1180,
            margin: "0 auto",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            boxShadow: "0 28px 70px rgba(0,0,0,0.6)",
          }}
        >
          <div className="ne-head">
            <MapPin size={13} strokeWidth={2.2} color={GOLD} />
            <span className="ne-head-kicker">{language === "ko" ? "지금" : "On view"}</span>
            <span className="ne-head-title">{label}</span>
            <span className="ne-head-count">{countText}</span>
            <button type="button" className="ne-head-close" onClick={() => setOpen(false)}
              aria-label={language === "ko" ? "닫기" : "Close"}>
              <X size={16} strokeWidth={2.2} />
            </button>
          </div>

          {/* The list the community tab already uses - same cards, same sort
              chips - just hosted in this overlay instead of a page. */}
          <div style={{ overflowY: "auto", minHeight: 0, flex: "1 1 auto" }}>
            <NearbyExhibitions
              isLight={isLight}
              language={language}
              onOpenMuseum={openMuseum}
              /* five across on a computer; a phone gets three, so each card's words still read */
              columns={typeof window !== "undefined" && window.innerWidth < 768 ? 3 : 5}
            />
          </div>
        </div>
      )}
    </>
  );
}
