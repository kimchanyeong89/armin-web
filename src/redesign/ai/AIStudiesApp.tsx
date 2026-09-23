import { useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent, type ReactNode } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { BookmarkPlus } from "lucide-react";
import { useLanguage } from "../../contexts/LanguageContext";
import { AuthProvider } from "../../contexts/AuthContext";
import { getOptimizedImageUrl } from "../../utils/imageProxy";
import WeeklyCurationTab from "../../components/WeeklyCurationTab";
import { HeartOverlay } from "../../components/HeartOverlay";
import { PlaylistModal } from "../../components/PlaylistModal";
import { useLikedArtworkSet } from "../../hooks/useLikedArtworkSet";
import { exhibitions } from "../../data/exhibitions";
import { COMMUNITY_FONT_OPTIONS } from "../../pages/community/communityFonts";
import { AI_COPY, GRID_COLUMNS } from "./model";
import "./ai-studies.css";


/* ─────────────────────────────────────────────────────────────
   Data — the AI tab's own search worker, so the studies show real
   artworks. Random rows carry no match score, so a stable demo
   value is derived from the id to exercise the layout.
   ───────────────────────────────────────────────────────────── */
export interface StudyArtwork {
  id: string; title: string; artist: string; museum: string; country: string; image: string; match: number;
}

/* Index rows carry a museum name but no country — their `c` field is the
   category. The country lives on the museum record; join on the name. */
const MUSEUM_COUNTRY: Map<string, string> = new Map(
  (exhibitions as any[])
    .filter((m) => m?.name && m?.country)
    .map((m) => [String(m.name).trim().toLowerCase(), String(m.country)]),
);
const countryOf = (museum: string) => MUSEUM_COUNTRY.get(museum.trim().toLowerCase()) || "";

function hash(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) { h ^= input.charCodeAt(i); h = Math.imul(h, 16777619); }
  return Math.abs(h >>> 0);
}

function useWorkerArtworks(count = 48) {
  const [items, setItems] = useState<StudyArtwork[]>([]);
  const [loading, setLoading] = useState(true);
  const requestedRef = useRef(false);
  const settledRef = useRef(false);

  useEffect(() => {
    const worker = new Worker(new URL("../../workers/search.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (event: MessageEvent) => {
      const { type, results, count: loaded } = (event as any).data || {};
      if ((type === "LOAD_PROGRESS" && typeof loaded === "number" && loaded > 100) || type === "LOAD_COMPLETE") {
        if (!requestedRef.current && !settledRef.current) {
          requestedRef.current = true;
          worker.postMessage({ type: "GET_RANDOM_ARTWORKS", count, onlyWithImage: true });
        }
        return;
      }
      if (type === "RANDOM_ARTWORKS") {
        const mapped: StudyArtwork[] = (Array.isArray(results) ? results : [])
          .map((row: any, index: number) => {
            const id = String(row.id || `random-${index}`);
            const museum = String(row.m || row.museumName || row.venue || "");
            return {
              id,
              title: String(row.n || row.name || row.title || "Untitled"),
              artist: String(row.a || row.artist || ""),
              museum,
              country: countryOf(museum),
              image: String(row.i || row.image || row.imageUrl || row.url || ""),
              match: 0.62 + (hash(id) % 37) / 100,
            };
          })
          .filter((i: StudyArtwork) => i.image.trim().length > 0)
          .sort((a: StudyArtwork, b: StudyArtwork) => b.match - a.match);
        if (mapped.length >= 8) { settledRef.current = true; setItems(mapped); setLoading(false); }
        else { requestedRef.current = false; if (mapped.length) setItems(mapped); }
      }
    };
    worker.postMessage({ type: "LOAD" });
    return () => { worker.terminate(); };
  }, [count]);

  return { items, loading };
}

function Art({ item, width }: { item: StudyArtwork; width: number }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <span className="ai-art ai-art--missing" aria-hidden="true" />;
  return <img className="ai-art" src={getOptimizedImageUrl(item.image, width)} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} />;
}

const pct = (m: number) => Math.round(m * 100) + "%";
const two = (n: number) => String(n).padStart(2, "0");

function Actions({ liked, onLike, onPlaylist, label }: {
  liked: boolean; onLike: (e: MouseEvent) => void; onPlaylist: () => void; label: string;
}) {
  return (
    <span className="ai-actions">
      <button type="button" className="ai-act" onClick={(e) => { e.stopPropagation(); onPlaylist(); }} title={label} aria-label={label}>
        <BookmarkPlus size={15} strokeWidth={1.6} />
      </button>
      <HeartOverlay isLiked={liked} onToggle={onLike} size={15} color="#D4A547" emptyColor="currentColor" className="ai-act" style={{ padding: 0 }} />
    </span>
  );
}

/* ═════════════════════════════════════════════════════════════
   Card. The figure carries the match; in front of it sits a gold
   point. Point at the card and the point draws itself out into a
   short bar - the only line on the card, and it moves inside a
   fixed slot so nothing shifts around it.
   ═════════════════════════════════════════════════════════════ */
function Card({ item, unknown, width, actions, onOpen }: {
  item: StudyArtwork; unknown: string; width: number; actions: ReactNode; onOpen: () => void;
}) {
  const artist = (item.artist || unknown).toUpperCase();
  const place = [item.museum, item.country].filter(Boolean).join(" · ") || "—";

  return (
    <div className="ai-card">
      <div className="ai-shot">
        <button type="button" className="ai-coverbtn" onClick={onOpen} aria-label={item.title}>
          <span className="ai-cover"><Art item={item} width={width} /></span>
        </button>
        <span className="ai-onimg">{actions}</span>
      </div>

      <div className="ai-body">
        <button type="button" className="ai-titlebtn" onClick={onOpen}>{item.title}</button>
        <p className="ai-meta">
          <strong>{artist}</strong>
          <span className="ai-read">
            <i className="ai-dot" aria-hidden="true"><b /></i>
            <em>{pct(item.match)}</em>
          </span>
        </p>
        <small>{place}</small>
      </div>
    </div>
  );
}

/* ═════════════════════════════════════════════════════════════ */
function AIStudies() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { language, toggleLanguage, t } = useLanguage();
  const [chapter, setChapter] = useState<"mine" | "weekly">("mine");
  const mode = params.get("mode") === "random" ? "random" : "taste";
  const { items, loading } = useWorkerArtworks(48);
  const [shownCount, setShownCount] = useState(20);
  const [playlistArtwork, setPlaylistArtwork] = useState<StudyArtwork | null>(null);
  const { isLiked, toggleLike } = useLikedArtworkSet();

  /* Type is settled as a pair: Paperlogy sets the headings and the large
     text, Wanted Sans the small text. Both come from the community board's
     table, so no face is defined twice. */
  useEffect(() => {
    const nodes: HTMLElement[] = [];
    ["paperlogy", "wanted"].forEach((key) => {
      const option = COMMUNITY_FONT_OPTIONS.find((o) => o.key === key);
      if (!option) return;
      option.hrefs.forEach((href) => {
        if (document.querySelector(`link[href="${href}"]`)) return;
        const link = document.createElement("link");
        link.rel = "stylesheet"; link.href = href;
        document.head.appendChild(link); nodes.push(link);
      });
      if (option.faceCss && !document.getElementById(`ai-face-${key}`)) {
        const style = document.createElement("style");
        style.id = `ai-face-${key}`;
        style.textContent = option.faceCss;
        document.head.appendChild(style); nodes.push(style);
      }
    });
    return () => { nodes.forEach((n) => n.remove()); };
  }, []);

  const [isLight, setIsLight] = useState(() => {
    try { return localStorage.getItem("homeTheme") === "light"; } catch { return false; }
  });
  useEffect(() => {
    const sync = () => { try { setIsLight(localStorage.getItem("homeTheme") === "light"); } catch { setIsLight(false); } };
    window.addEventListener("theme-changed", sync);
    window.addEventListener("storage", sync);
    return () => { window.removeEventListener("theme-changed", sync); window.removeEventListener("storage", sync); };
  }, []);

  const shown = useMemo(
    () => (mode === "random" ? [...items].sort((a, b) => hash(a.id + "r") - hash(b.id + "r")) : items),
    [items, mode],
  );
  const visible = shown.slice(0, shownCount);
  const avg = items.length ? Math.round((items.reduce((s, i) => s + i.match, 0) / items.length) * 100) : 0;
  const museums = new Set(items.map((i) => i.museum).filter(Boolean)).size;

  const tr = (copy: { ko: string; en: string }) => (language === "ko" ? copy.ko : copy.en);
  const unknown = t({ ko: "작가 미상", en: "Unknown" });
  const playlistLabel = t({ ko: "재생목록에 추가", en: "Save to playlist" });
  const weeklyLabel = t({ ko: "주간 큐레이션", en: "Weekly curation" });
  const mineLabel = t({ ko: "나의 큐레이션", en: "My curation" });
  const weeklyPalette = isLight
    ? { t: true, fg: "rgba(0,0,0,0.92)", fgMed: "rgba(0,0,0,0.72)", fgLow: "rgba(0,0,0,0.58)", fgFaint: "rgba(0,0,0,0.36)", divider: "rgba(0,0,0,0.08)" }
    : { t: false, fg: "rgba(244,241,234,0.96)", fgMed: "rgba(244,241,234,0.82)", fgLow: "rgba(244,241,234,0.64)", fgFaint: "rgba(244,241,234,0.40)", divider: "rgba(244,241,234,0.08)" };

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value); else next.delete(key);
    setParams(next);
  };

  return (
    <div className="ai-page" data-light={isLight || undefined}>
      <header className="ai-header">
        <Link to="/redesign" className="ai-wordmark">COLLY <span>/ AI</span></Link>
        <div className="ai-stats" aria-label={t({ ko: "추천 통계", en: "Recommendation stats" })}>
          <span>{items.length || "—"} <em>{t({ ko: "추천", en: "picks" })}</em></span>
          <i />
          <span>{museums || "—"} <em>{t({ ko: "미술관", en: "museums" })}</em></span>
          <i />
          <span>{avg ? avg + "%" : "—"} <em>{t({ ko: "평균 일치", en: "avg match" })}</em></span>
        </div>
        <div className="ai-header-actions">
          <a href="/ai">{t({ ko: "현재 AI 탭", en: "Current AI tab" })}</a>
          <button type="button" onClick={toggleLanguage}>{language === "ko" ? "EN" : "KR"}</button>
        </div>
      </header>

      <main className="ai-main">
        <section className="ai-statement">
          <p className="ai-statement__meta">{tr(AI_COPY.kicker)}</p>
          <h1>{tr(AI_COPY.title)}</h1>
          <div className="ai-statement__aside">
            <p>{tr(AI_COPY.body)}</p>
            <footer>
              <span aria-hidden="true">
                <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2.5 9.5 9.5 2.5M4 2.5h5.5V8" />
                </svg>
              </span>
              <span>{tr(AI_COPY.foot)}</span>
            </footer>
          </div>
        </section>

        {/* One bordered switch, split in half and centred, that sticks to
            the top of the window once the title has scrolled past. */}
        <div className="ai-tabsbar">
          <div className="ai-tabs" role="tablist" aria-label={t({ ko: "큐레이션", en: "Curations" })}>
            <button type="button" role="tab" aria-selected={chapter === "mine"} className={chapter === "mine" ? "is-active" : ""} onClick={() => setChapter("mine")}>
              <span className="ai-tabs__inner">
                <i className="ai-tabs__dot" aria-hidden="true" />
                <span>{mineLabel}</span>
              </span>
            </button>
            <button type="button" role="tab" aria-selected={chapter === "weekly"} className={chapter === "weekly" ? "is-active" : ""} onClick={() => setChapter("weekly")}>
              <span className="ai-tabs__inner">
                <i className="ai-tabs__dot" aria-hidden="true" />
                <span>{weeklyLabel}</span>
              </span>
            </button>
          </div>
        </div>

        {chapter === "weekly" ? (
          <div className="ai-weekly-host"><WeeklyCurationTab {...weeklyPalette} language={language} tr={tr} /></div>
        ) : (
          <>
            <div className="ai-modebar">
              <div className="ai-mode" role="group" aria-label={t({ ko: "추천 방식", en: "Mode" })}>
                <button type="button" className={mode === "taste" ? "is-active" : ""} onClick={() => setParam("mode", null)}>{t({ ko: "맞춤 추천", en: "Taste" })}</button>
                <button type="button" className={mode === "random" ? "is-active" : ""} onClick={() => setParam("mode", "random")}>{t({ ko: "랜덤 추천", en: "Random" })}</button>
              </div>
              <i className="ai-rule-line" />
              <span className="ai-readout">{two(visible.length)} / {two(shown.length)}</span>
            </div>

            {!shown.length ? (
              <p className="ai-empty" role="status" aria-live="polite">
                {loading ? t({ ko: "작품을 불러오는 중…", en: "Loading artworks…" }) : t({ ko: "보여줄 작품이 없습니다.", en: "Nothing to show." })}
              </p>
            ) : (
              <ul className="ai-grid" data-cols={GRID_COLUMNS}>
                {visible.map((item, index) => (
                  <li key={item.id} style={{ animationDelay: Math.min(index, 11) * 40 + "ms" } as CSSProperties}>
                    <Card
                      item={item} unknown={unknown} width={480}
                      onOpen={() => navigate("/ai")}
                      actions={
                        <Actions
                          liked={isLiked(item.id)}
                          onLike={() => { void toggleLike(item); }}
                          onPlaylist={() => setPlaylistArtwork(item)}
                          label={playlistLabel}
                        />
                      }
                    />
                  </li>
                ))}
                {visible.length < shown.length && (
                  <li className="ai-more">
                    <button type="button" onClick={() => setShownCount((c) => c + 10)}>
                      {t({ ko: "더 보기", en: "Show more" })} <span className="ai-mono">+10</span>
                    </button>
                  </li>
                )}
              </ul>
            )}
          </>
        )}
      </main>

      {playlistArtwork && (
        <PlaylistModal isOpen onClose={() => setPlaylistArtwork(null)} item={playlistArtwork} itemType="artwork" theme={isLight ? "light" : "dark"} />
      )}
    </div>
  );
}

/* The like and playlist controls read the signed-in user, which the
   /redesign routes do not otherwise provide. */
export default function AIStudiesApp() {
  return (
    <AuthProvider>
      <AIStudies />
    </AuthProvider>
  );
}
