import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { Play, Pencil, Palette, Calendar, MapPin, User, ListMusic, Bookmark } from "lucide-react";
import { useLanguage } from "../../contexts/LanguageContext";
import { COMMUNITY_FONT_OPTIONS } from "../../pages/community/communityFonts";
import { getOptimizedImageUrl } from "../../utils/imageProxy";
import { exhibitions } from "../../data/exhibitions";
import { MY_STUDIES, TABS, buildMyPath, getMyStudy, type TabKey } from "./model";
import "./mypage-studies.css";

/* ─────────────────────────────────────────────────────────────
   Data — the search worker the AI tab uses. Rows come back parsed
   (name/artist/image/museumName), not as the index's short keys.
   ───────────────────────────────────────────────────────────── */
/* exported with useWorks for the later My Page proposals (src/redesign/profile) */
export interface Work { id: string; title: string; artist: string; museum: string; country: string; image: string; }

const MUSEUM_COUNTRY: Map<string, string> = new Map(
  (exhibitions as any[])
    .filter((m) => m?.name && m?.country)
    .map((m) => [String(m.name).trim().toLowerCase(), String(m.country)]),
);

export function useWorks(count = 48) {
  const [items, setItems] = useState<Work[]>([]);
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
        const mapped: Work[] = (Array.isArray(results) ? results : [])
          .map((row: any, i: number) => {
            const museum = String(row.museumName || row.m || "");
            return {
              id: String(row.id || `w-${i}`),
              title: String(row.name || row.n || "Untitled"),
              artist: String(row.artist || row.a || ""),
              museum,
              country: MUSEUM_COUNTRY.get(museum.trim().toLowerCase()) || "",
              image: String(row.image || row.i || ""),
            };
          })
          .filter((w: Work) => w.image.trim().length > 0);
        if (mapped.length >= 8) { settledRef.current = true; setItems(mapped); }
        else { requestedRef.current = false; if (mapped.length) setItems(mapped); }
      }
    };
    worker.postMessage({ type: "LOAD" });
    return () => { worker.terminate(); };
  }, [count]);

  return items;
}

const two = (n: number) => String(n).padStart(2, "0");
const TAB_ICONS = { artworks: Palette, exhibitions: Calendar, museums: MapPin, artists: User, playlists: ListMusic, curations: Bookmark };

function Shot({ work, width, ratio }: { work?: Work; width: number; ratio?: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <span className="my-shot" style={ratio ? ({ aspectRatio: ratio } as CSSProperties) : undefined}>
      {work && !failed ? (
        <img src={getOptimizedImageUrl(work.image, width)} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} />
      ) : null}
    </span>
  );
}

/* ═════════════════════════════════════════════════════════════
   One style — the home globe's. Six compositions of the same
   parts: cover, avatar, name + rank, account line, action, the
   six counted tabs, the grid.
   ═════════════════════════════════════════════════════════════ */
export default function MypageStudiesApp() {
  const { study: slug } = useParams();
  const study = getMyStudy(slug);
  const [params] = useSearchParams();
  const { language, toggleLanguage, t } = useLanguage();
  const works = useWorks(48);
  const [tab, setTab] = useState<TabKey>("artworks");

  /* Paperlogy + Wanted Sans, from the community board's font table. */
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
      if (option.faceCss && !document.getElementById(`my-face-${key}`)) {
        const style = document.createElement("style");
        style.id = `my-face-${key}`;
        style.textContent = option.faceCss;
        document.head.appendChild(style); nodes.push(style);
      }
    });
    return () => { nodes.forEach((n) => n.remove()); };
  }, []);

  const name = "김채영";
  const rank = "LV.4 큐레이터";
  const email = "chaeyoung@colly.art";
  const score = 1840;
  const cover = works[0];
  const labelOf = (x: (typeof TABS)[number]) => (language === "ko" ? x.ko : x.en);
  const activeIndex = TABS.findIndex((x) => x.key === tab);

  /* ── the parts ── */
  const coverBlock = (
    <div className="my-cover">
      <Shot work={cover} width={1600} />
      {study.slug === "plate" && (
        <>
          <div className="my-cover__name">
            <p>COLLY · {t({ ko: "나의 기록", en: "My record" })}</p>
            <h2>{name}</h2>
          </div>
          <div className="my-cover__readout" aria-hidden="true">
            <div>{two(activeIndex + 1)} / 06</div>
            <div>{TABS[activeIndex].count}</div>
          </div>
        </>
      )}
    </div>
  );

  const profileBlock = (
    <div className="my-profile">
      <div className="my-profile__id">
        <span className="my-avatar" aria-hidden="true"><Shot work={works[1]} width={200} ratio="1 / 1" /></span>
        <div className="my-profile__text">
          <h1>{name} <em>{rank}</em></h1>
          <div className="my-facts">
            <span>{email}</span>
            <i />
            <span className="my-facts__score">SCORE <b>{score}</b></span>
            <button type="button" className="my-edit"><Pencil size={10} /> {t({ ko: "편집", en: "Edit" })}</button>
          </div>
        </div>
      </div>
      <div className="my-profile__actions">
        <button type="button" className="my-cta"><Play size={13} strokeWidth={2.2} /> {t({ ko: "슬라이드쇼", en: "Slideshow" })}</button>
      </div>
    </div>
  );

  const tabsBlock = (
    <nav className="my-tabs" role="tablist">
      {TABS.map((x, i) => {
        const Icon = TAB_ICONS[x.key];
        const active = tab === x.key;
        return (
          <button key={x.key} type="button" role="tab" aria-selected={active}
            className={active ? "is-active" : ""} onClick={() => setTab(x.key)}>
            <em className="my-tabs__no">{two(i + 1)}</em>
            <b>{x.count}</b>
            <span><Icon size={10} strokeWidth={active ? 2.3 : 1.9} /> {labelOf(x)}</span>
          </button>
        );
      })}
    </nav>
  );

  const gridBlock = (
    <ul className="my-grid">
      {works.slice(0, study.slug === "strip" ? 25 : 18).map((w, i) => (
        <li key={tab + w.id} className={study.slug === "lead" && i === 0 ? "is-lead" : ""}>
          <span className="my-cell">
            <Shot work={w} width={i === 0 && study.slug === "lead" ? 900 : 420} ratio="1 / 1" />
            <i className="my-cell__no" aria-hidden="true">{two(i + 1)}</i>
          </span>
        </li>
      ))}
    </ul>
  );

  /* ── the six arrangements ── */
  let body;
  if (study.slug === "side") {
    body = (
      <div className="my-body">
        <div className="my-side">
          {coverBlock}
          {profileBlock}
        </div>
        {tabsBlock}
        {gridBlock}
      </div>
    );
  } else if (study.slug === "column") {
    body = (
      <div className="my-body">
        {coverBlock}
        <div className="my-lower">
          {profileBlock}
          <div className="my-split">
            {tabsBlock}
            {gridBlock}
          </div>
        </div>
      </div>
    );
  } else {
    body = (
      <div className="my-body">
        {coverBlock}
        <div className="my-lower">
          {profileBlock}
          {tabsBlock}
          {gridBlock}
        </div>
      </div>
    );
  }

  return (
    <div className="my-page" data-study={study.slug} data-works={works.length}>
      <header className="my-header">
        <Link to="/redesign" className="my-wordmark">COLLY <span>/ {t({ ko: "마이페이지", en: "MY PAGE" })}</span></Link>
        <div className="my-header-actions">
          <a href="/mypage">{t({ ko: "현재 마이페이지", en: "Current My Page" })}</a>
          <button type="button" onClick={toggleLanguage}>{language === "ko" ? "EN" : "KR"}</button>
        </div>
      </header>

      <nav className="my-studybar" aria-label={t({ ko: "시안", en: "Studies" })}>
        <span className="my-studybar__label">{t({ ko: "시안", en: "Study" })}</span>
        {MY_STUDIES.map((s, i) => (
          <Link key={s.slug} to={buildMyPath(s.slug) + (params.toString() ? "?" + params.toString() : "")}
            className={s.slug === study.slug ? "is-active" : ""}>
            <em>{two(i + 1)}</em> {language === "ko" ? s.titleKo : s.title}
          </Link>
        ))}
      </nav>
      <p className="my-note"><b>{language === "ko" ? study.titleKo : study.title}</b> {study.noteKo}</p>

      {body}
    </div>
  );
}
