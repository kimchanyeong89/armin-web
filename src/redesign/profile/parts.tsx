import {
  useEffect, useLayoutEffect, useMemo, useRef, useState,
  type CSSProperties, type Dispatch, type ReactNode, type SetStateAction,
} from "react";
import { ArrowLeft, Bookmark, BookmarkPlus, Calendar, ListMusic, MapPin, Palette, Pencil, Play, User } from "lucide-react";
import { LikeIcon } from "../../components/like/LikeIcon";
import ProfileAvatar from "../../components/ProfileAvatar";
import { RankInfo } from "../../components/RankInfo";
import { getOptimizedImageUrl } from "../../utils/imageProxy";
import { two } from "../artwork-detail/shared";
import type { Work } from "../mypage/MypageStudiesApp";
import { ME, PLAYLISTS, SORTS, TABS, type SortKey, type TabKey } from "./model";
/* the live page's own card classes: the stacked like/save marks and the title line */
import "../../components/mypageRedesign.css";

/* The parts every proposal is built from. The values are the live page's;
   a proposal only decides where the parts stand and which variant it uses. */

/** The cover the owner chose — which liked work (null is the live page's
    Auto, the first of them) and where the picture sits in its frame. */
export interface CoverState { pick: number | null; focusY: number }

export interface TopProps {
  ko: boolean;
  works: Work[];
  tab: TabKey; pickTab: (t: TabKey) => void;
  sort: SortKey; setSort: (s: SortKey) => void;
  cover: CoverState; setCover: Dispatch<SetStateAction<CoverState>>;
  openList: string | null; openPlaylist: (id: string | null) => void;
}

const GOLD = "#D4A547";

/* the live tab row's own icons */
const TAB_ICONS: Record<TabKey, typeof Palette> = {
  artworks: Palette, exhibitions: Calendar, museums: MapPin, artists: User, playlists: ListMusic, curations: Bookmark,
};

const figure = (n: number) => (n < 100 ? two(n) : n.toLocaleString());

/** An image that steps aside when it fails and leaves its frame's own ground,
    as the live page shows no broken-image mark either. */
function Img({ src, alt = "", style, loading }: { src: string; alt?: string; style?: CSSProperties; loading?: "lazy" | "eager" }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return <img src={src} alt={alt} style={style} loading={loading} decoding="async" onError={() => setFailed(true)} />;
}

export function Cover({ works, cover, width = 1600, className }: {
  works: Work[]; cover: CoverState; width?: number; className?: string;
}) {
  const w = works[cover.pick ?? 0];
  return (
    <span className={`pf-cover ${className ?? ""}`}>
      {w && (
        <Img key={w.image} src={getOptimizedImageUrl(w.image, width)}
          style={{ objectPosition: `50% ${cover.focusY}%` }} />
      )}
    </span>
  );
}

export function Avatar({ size }: { size: number }) {
  return (
    <span className="pf-avatar" style={{ width: size, height: size }}>
      <ProfileAvatar src={ME.avatar} size={size} alt="" background="rgba(244,241,234,.06)" fallback={ME.name.slice(0, 1)} />
    </span>
  );
}

/** The nickname, with the live level mark and its question mark beside it. */
export function Name({ size = 22, as: Tag = "h1", className }: { size?: number; as?: "h1" | "h2"; className?: string }) {
  return (
    <div className={`pf-name ${className ?? ""}`}>
      <Tag>{ME.name}</Tag>
      <RankInfo score={ME.score} size={size} />
    </div>
  );
}

export const Email = () => <span className="pf-email">{ME.email}</span>;

export const Score = ({ ko }: { ko: boolean }) => (
  <span className="pf-score">{ko ? "점수" : "Score"} <b>{ME.score.toLocaleString()}</b></span>
);

/** The map guide's way in: a circled mark and a label as one button. */
export function Cta({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <button type="button" className="pf-cta"><span aria-hidden="true">{icon}</span>{children}</button>
  );
}

/** The slideshow of the liked works — as the guide's circled button, or as
    one of the community board's gold text actions. */
export function Slideshow({ ko, variant = "circle" }: { ko: boolean; variant?: "circle" | "act" }) {
  const label = ko ? "슬라이드쇼" : "Slideshow";
  if (variant === "act") {
    return (
      <button type="button" className="pf-act pf-act--gold">
        <Play size={13} strokeWidth={2.2} aria-hidden="true" />{label}
      </button>
    );
  }
  return <Cta icon={<Play size={12} strokeWidth={2.2} />}>{label}</Cta>;
}

/** Editing the profile, as a bare mark and word. */
export const Edit = ({ ko }: { ko: boolean }) => (
  <button type="button" className="pf-act" title={ko ? "프로필 편집" : "Edit profile"}>
    <Pencil size={12} strokeWidth={2} aria-hidden="true" />{ko ? "편집" : "Edit"}
  </button>
);

/** A caption rule: a gold label, an optional note, a hairline, then a figure
    or a control at the end. */
export function Caption({ label, note, count, end }: { label: ReactNode; note?: ReactNode; count?: ReactNode; end?: ReactNode }) {
  return (
    <header className="pf-cap">
      <span>{label}</span>
      {note && <small>{note}</small>}
      <i aria-hidden="true" />
      {count !== undefined && <em>{count}</em>}
      {end}
    </header>
  );
}

/** Change background: the live page's picker — a liked work as the cover,
    or Auto — and where the picture sits in its frame. It applies as it goes;
    Escape or a press outside closes it. */
export function CoverPicker({ ko, works, cover, setCover }: {
  ko: boolean; works: Work[]; cover: CoverState; setCover: Dispatch<SetStateAction<CoverState>>;
}) {
  /* each change lands on the latest cover, so a pick and a move made in quick
     succession don't undo each other */
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);
  return (
    <div ref={box} className="pf-picker">
      <button type="button" className="pf-act" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <Palette size={12} strokeWidth={2} aria-hidden="true" />{ko ? "배경 변경" : "Change background"}
      </button>
      {open && (
        <div className="pf-picker__card" role="dialog" aria-label={ko ? "하트 작품 배경" : "Heart List Backgrounds"}>
          <header>
            <span>{ko ? "하트 작품 배경" : "Heart List Backgrounds"}</span>
            <button type="button" aria-pressed={cover.pick === null} onClick={() => setCover((c) => ({ ...c, pick: null }))}>
              {ko ? "자동" : "Auto"}
            </button>
          </header>
          <label className="pf-picker__pos">
            <span>{ko ? "배경 위치" : "Background position"}</span>
            <em>{cover.focusY}%</em>
            <input type="range" min={15} max={85} step={1} value={cover.focusY}
              onChange={(e) => { const focusY = Number(e.currentTarget.value); setCover((c) => ({ ...c, focusY })); }} />
          </label>
          <div className="pf-picker__grid">
            {works.slice(0, 12).map((w, i) => (
              <button key={w.id} type="button" aria-pressed={cover.pick === i}
                title={w.artist ? `${w.title} - ${w.artist}` : w.title}
                onClick={() => setCover((c) => ({ ...c, pick: i }))}>
                <Img src={getOptimizedImageUrl(w.image, 220)} loading="lazy" />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** The six counted tabs. "cells" keeps the live row's shape — a figure over
    its label in six equal cells; "line" sets them as the community board's
    targets — the label, then its count. */
export function CountTabs({ ko, tab, pickTab, variant = "cells" }: {
  ko: boolean; tab: TabKey; pickTab: (t: TabKey) => void; variant?: "cells" | "line";
}) {
  return (
    <nav className={`pf-tabs pf-tabs--${variant}`} role="tablist" aria-label={ko ? "나의 기록" : "My collections"}>
      {TABS.map((x) => {
        const Icon = TAB_ICONS[x.key];
        const on = tab === x.key;
        return (
          <button key={x.key} type="button" role="tab" aria-selected={on} onClick={() => pickTab(x.key)}>
            <b>{figure(x.count)}</b>
            <span><Icon size={12} strokeWidth={on ? 2.2 : 1.8} aria-hidden="true" />{ko ? x.ko : x.en}</span>
          </button>
        );
      })}
    </nav>
  );
}

/** The sort, as the community board sets its own: labels over a hairline and
    a short gold bar that slides to the chosen one. */
export function SortLine({ ko, sort, setSort }: { ko: boolean; sort: SortKey; setSort: (s: SortKey) => void }) {
  const row = useRef<HTMLDivElement | null>(null);
  const [x, setX] = useState(0);
  const measure = () => {
    const on = row.current?.querySelector<HTMLButtonElement>('button[aria-pressed="true"]');
    if (on) setX(on.offsetLeft);
  };
  useLayoutEffect(measure, [sort, ko]);
  useEffect(() => { void document.fonts?.ready.then(measure); }, []);
  return (
    <div ref={row} className="pf-sort" role="group" aria-label={ko ? "정렬" : "Sort"}>
      {SORTS.map((s) => (
        <button key={s.key} type="button" aria-pressed={sort === s.key} onClick={() => setSort(s.key)}>
          {ko ? s.ko : s.en}
        </button>
      ))}
      <i className="pf-sort__bar" style={{ transform: `translateX(${x}px)` }} aria-hidden="true" />
    </div>
  );
}

/** The tabs and the sort together, sticky as the live bar is. An open
    playlist puts the way back to all works beside the sort, as it does live. */
export function TabsBar({ ko, tab, pickTab, sort, setSort, openList, openPlaylist, variant = "cells" }:
  Pick<TopProps, "ko" | "tab" | "pickTab" | "sort" | "setSort" | "openList" | "openPlaylist"> & { variant?: "cells" | "line" | "fill" }) {
  const list = PLAYLISTS.find((p) => p.id === openList);
  const back = list ? (
    <button type="button" className="pf-back" onClick={() => openPlaylist(null)}>
      <ArrowLeft size={12} strokeWidth={2} aria-hidden="true" />{list.title}
    </button>
  ) : null;
  if (variant === "line") {
    return (
      <div className="pf-bar pf-bar--line">
        <CountTabs ko={ko} tab={tab} pickTab={pickTab} variant="line" />
        <div className="pf-bar__end">{back}<SortLine ko={ko} sort={sort} setSort={setSort} /></div>
      </div>
    );
  }
  /* "fill": the targets spread over the whole width, the sort on its own line */
  if (variant === "fill") {
    return (
      <>
        <div className="pf-bar pf-bar--fill"><CountTabs ko={ko} tab={tab} pickTab={pickTab} variant="line" /></div>
        <div className="pf-sortrow">{back ?? <span />}<SortLine ko={ko} sort={sort} setSort={setSort} /></div>
      </>
    );
  }
  return (
    <>
      <div className="pf-bar"><CountTabs ko={ko} tab={tab} pickTab={pickTab} /></div>
      <div className="pf-sortrow">{back ?? <span />}<SortLine ko={ko} sort={sort} setSort={setSort} /></div>
    </>
  );
}

/** My Playlists: each list's first work, its name and how many works it
    holds; pressing one opens it in the grid. "cards" stands them as tiles,
    "rows" lays them as list rows. */
export function Playlists({ ko, works, openList, openPlaylist, variant = "cards" }: {
  ko: boolean; works: Work[]; openList: string | null; openPlaylist: (id: string | null) => void; variant?: "cards" | "rows";
}) {
  return (
    <ul className={`pf-lists pf-lists--${variant}`}>
      {PLAYLISTS.map((p, i) => {
        const w = works[2 + i];
        const on = openList === p.id;
        return (
          <li key={p.id}>
            <button type="button" className={on ? "pf-list is-open" : "pf-list"} aria-pressed={on}
              onClick={() => openPlaylist(on ? null : p.id)}>
              <span className="pf-list__shot">{w && <Img src={getOptimizedImageUrl(w.image, 360)} loading="lazy" />}</span>
              <span className="pf-list__text">
                <b>{p.title}</b>
                <small>{two(p.items)} {ko ? "작품" : p.items === 1 ? "work" : "works"}</small>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** The live page's artwork grid, unchanged: square cells four to a row (three
    on a phone) 2px apart on #151515, a shade rising from the bottom, the like
    and save marks stacked at the upper right and the title and artist at the
    lower left — those two in the live page's own classes. */
export function LiveGrid({ works, tab, sort, openList }: Pick<TopProps, "works" | "tab" | "sort" | "openList">) {
  const [unliked, setUnliked] = useState<Set<string>>(() => new Set());
  const items = useMemo(() => {
    let list: Work[];
    const at = PLAYLISTS.findIndex((p) => p.id === openList);
    if (at >= 0) {
      list = works.slice(24 + at * 12, 24 + at * 12 + PLAYLISTS[at].items);
    } else {
      const shift = TABS.findIndex((x) => x.key === tab) * 7;
      list = [...works.slice(shift), ...works.slice(0, shift)];
    }
    if (sort === "oldest") list = [...list].reverse();
    else if (sort === "year") list = [...list].sort((a, b) => a.title.localeCompare(b.title));
    return list.slice(0, 24);
  }, [works, tab, sort, openList]);
  const toggle = (id: string) => setUnliked((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  return (
    <div className="mp pf-grid">
      {items.map((w) => {
        const off = unliked.has(w.id);
        return (
          <div key={w.id} className="pf-card">
            <Img src={getOptimizedImageUrl(w.image, 400)} alt={w.title} loading="lazy" />
            <div className="pf-card__shade" />
            <div className="mp-acts">
              <button type="button" title={off ? "Like again" : "Unlike"} onClick={() => toggle(w.id)}>
                <LikeIcon liked={!off} size={12} strokeWidth={2.2} color={GOLD} emptyColor="#fff" />
              </button>
              <button type="button" title="Save to Playlist">
                <BookmarkPlus size={12} strokeWidth={2.2} />
              </button>
            </div>
            <div className="mp-name-line">
              <b>{w.title}</b>
              <small>{w.artist || w.museum}</small>
            </div>
          </div>
        );
      })}
    </div>
  );
}
