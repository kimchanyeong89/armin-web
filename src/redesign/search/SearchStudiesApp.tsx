import { useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { Search } from "lucide-react";
import { useLanguage } from "../../contexts/LanguageContext";
import { exhibitions } from "../../data/exhibitions";
import { GENRES } from "./genres";
import { RECENT, SEARCH_STUDIES, TRENDING, buildSearchPath, getSearchStudy } from "./model";
import "./search-studies.css";

const two = (n: number) => String(n).padStart(2, "0");

interface Museum { id: string; name: string; nameKo: string; country: string; }

/* `location` is inconsistent across records - "City, Country" for some,
   "Street, Country" for others - so the studies show the country, which
   every record does have. */
const MUSEUMS: Map<string, Museum> = new Map(
  (exhibitions as any[]).map((m) => [
    String(m.id),
    { id: String(m.id), name: String(m.name || ""), nameKo: String(m.name_ko || m.name || ""), country: String(m.country || "") },
  ]),
);

export default function SearchStudiesApp() {
  const { study: slug } = useParams();
  const study = getSearchStudy(slug);
  const [params] = useSearchParams();
  const { language, toggleLanguage, t } = useLanguage();
  const [genre, setGenre] = useState(0);
  const [open, setOpen] = useState<number | null>(0);
  const [query, setQuery] = useState("");
  /* the real field's two states: AI off, or AI on with an engine behind it */
  const [ai, setAi] = useState(false);
  const [precise, setPrecise] = useState(false);
  /* recent queries the viewer cleared */
  const [gone, setGone] = useState<string[]>([]);

  const rows = useMemo(
    () => GENRES.map((g) => ({ ...g, museums: g.ids.map((id) => MUSEUMS.get(id)).filter(Boolean) as Museum[] })),
    [],
  );
  const label = (g: { ko: string; en: string }) => (language === "ko" ? g.ko : g.en);
  const museumName = (m: Museum) => (language === "ko" ? m.nameKo : m.name);

  /* ── the field, shared by both studies ───────────────────────
     A rule under the line of type, and the AI control as a switch:
     the knob slides and the two engines sit beside it as tabs. */
  const field = (
    <div className="se-field">
      <Search size={15} strokeWidth={1.9} />
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={ai
          ? t({ ko: "장면이나 분위기로 찾아보세요", en: "Describe a scene or a mood" })
          : t({ ko: "작품, 작가, 미술관을 찾아보세요", en: "Search works, artists, museums" })}
      />
      <span className="se-switch" data-on={ai || undefined}>
        <button type="button" className="se-switch__toggle" onClick={() => setAi((v) => !v)} aria-pressed={ai}>
          <i className="se-switch__rail" aria-hidden="true"><b /></i>AI
        </button>
        {ai && (
          <span className="se-switch__tabs">
            <button type="button" className={!precise ? "is-active" : ""} onClick={() => setPrecise(false)}>
              {t({ ko: "빠름", en: "Fast" })}
            </button>
            <button type="button" className={precise ? "is-active" : ""} onClick={() => setPrecise(true)}>
              {t({ ko: "정밀", en: "Precise" })}
            </button>
          </span>
        )}
      </span>
    </div>
  );

  /* ── recent queries, and what is being searched now ──────────
     Recent sits directly under the field, in the slot the counts used
     to hold: one compact line, each query dated in its own margin.
     Trending is an index — the term first, a dotted leader, the figure
     on the right. Both studies carry the same two. */
  const left = RECENT.filter((r) => !gone.includes(r.term));
  const H = {
    recent: t({ ko: "최근 검색어", en: "Recent" }), trend: t({ ko: "실시간 인기 검색", en: "Trending now" }),
    clear: t({ ko: "지우기", en: "Clear" }), hour: t({ ko: "1시간 기준", en: "past hour" }),
  };
  const mark = (m: string) => (m === "up" ? "▲" : m === "down" ? "▼" : m === "new" ? "NEW" : "—");

  const recent = left.length > 0 && (
    <div className="se-recent">
      <span className="se-recent__tag">{H.recent}</span>
      <div className="se-recent__run">
        {left.map((r) => (
          <button key={r.term} type="button" onClick={() => setQuery(r.term)}>
            {r.term}<em>{language === "ko" ? r.agoKo : r.agoEn}</em>
          </button>
        ))}
      </div>
      <button type="button" className="se-recent__clear" onClick={() => setGone(RECENT.map((r) => r.term))}>
        {H.clear}
      </button>
    </div>
  );

  const live = (
    <section className="se-live">
      <header><span>{H.trend}</span><i /><em>{H.hour}</em></header>
      <ol className="se-index">
        {TRENDING.map((x, i) => (
          <li key={x.term}>
            <button type="button" onClick={() => setQuery(x.term)}>
              <u data-move={x.move} aria-hidden="true">{mark(x.move)}</u>
              <span>{x.term}</span>
              <i className="se-index__leader" aria-hidden="true" />
              <em>{two(i + 1)}</em>
            </button>
          </li>
        ))}
      </ol>
    </section>
  );

  const museumLine = (m: Museum) => (
    <button key={m.id} type="button" className="se-museum">
      <i className="se-museum__dot" aria-hidden="true" />
      <span>{museumName(m)}</span>
      <em>{m.country}</em>
    </button>
  );

  const body =
    study.slug === "drawer" ? (
      <ul className="se-drawer">
        {rows.map((g, i) => (
          <li key={g.en} className={open === i ? "is-open" : ""}>
            <button type="button" onClick={() => setOpen(open === i ? null : i)} aria-expanded={open === i}>
              <em>{two(i + 1)}</em><span>{label(g)}</span><i /><b>{two(g.museums.length)}</b>
              <u aria-hidden="true">{open === i ? "−" : "+"}</u>
            </button>
            {open === i && <div className="se-drawer__open">{g.museums.map(museumLine)}</div>}
          </li>
        ))}
      </ul>
    ) : (
      <div className="se-board">
        <nav>
          {rows.map((g, i) => (
            <button key={g.en} type="button" className={i === genre ? "is-active" : ""} onClick={() => setGenre(i)}>
              <em>{two(i + 1)}</em><span>{label(g)}</span><b>{g.museums.length}</b>
            </button>
          ))}
        </nav>
        <div className="se-board__list">
          <header><span>{label(rows[genre])}</span><i /><b>{two(rows[genre].museums.length)}</b></header>
          {rows[genre].museums.map(museumLine)}
        </div>
      </div>
    );

  return (
    <div className="se-page" data-study={study.slug}>
      <header className="se-header">
        <Link to="/redesign" className="se-wordmark">COLLY <span>/ {t({ ko: "검색", en: "SEARCH" })}</span></Link>
        <div className="se-header-actions">
          <a href="/search">{t({ ko: "현재 검색 탭", en: "Current search tab" })}</a>
          <button type="button" onClick={toggleLanguage}>{language === "ko" ? "EN" : "KR"}</button>
        </div>
      </header>

      <nav className="se-studybar" aria-label={t({ ko: "시안", en: "Studies" })}>
        <span className="se-studybar__label">{t({ ko: "시안", en: "Study" })}</span>
        {SEARCH_STUDIES.map((s, i) => (
          <Link key={s.slug} to={buildSearchPath(s.slug) + (params.toString() ? "?" + params.toString() : "")}
            className={s.slug === study.slug ? "is-active" : ""}>
            <em>{two(i + 1)}</em> {language === "ko" ? s.titleKo : s.title}
          </Link>
        ))}
      </nav>
      <p className="se-note"><b>{language === "ko" ? study.titleKo : study.title}</b> {study.noteKo}</p>

      <main className="se-main">
        <section className="se-lead">
          <p className="se-lead__meta">{t({ ko: "검색", en: "SEARCH" })}</p>
          <h1>{t({ ko: "무엇이든, 어느 미술관에서든.", en: "Anything, in any museum." })}</h1>
          {field}
          {recent}
        </section>
        {live}
        {body}
      </main>
    </div>
  );
}
