import { useState, type ComponentType } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { useLanguage } from "../../contexts/LanguageContext";
import { useWorks } from "../mypage/MypageStudiesApp";
import { PROFILE_STUDIES, type ProfileSlug, type SortKey, type TabKey } from "./model";
import { LiveGrid, type CoverState, type TopProps } from "./parts";
import { BandTop, BoardTop, PanelTop, StageTop, StatementTop } from "./tops";
import "./profile-studies.css";

const TOPS: Record<ProfileSlug, ComponentType<TopProps>> = {
  band: BandTop, stage: StageTop, statement: StatementTop, board: BoardTop, panel: PanelTop,
};

/**
 * My Page, proposed five ways. Each takes its arrangement from another of the
 * app's tabs and keeps everything the live page shows above the grid; the
 * grid itself is the live one. The pill pinned to the bottom switches the
 * proposal and the language, and the tab, sort, cover and open playlist
 * carry over as you switch.
 */
export default function ProfileStudiesApp() {
  const { study } = useParams();
  const { language, toggleLanguage } = useLanguage();
  const ko = language === "ko";
  const works = useWorks(60);
  const [tab, setTab] = useState<TabKey>("artworks");
  const [sort, setSort] = useState<SortKey>("recent");
  const [cover, setCover] = useState<CoverState>({ pick: null, focusY: 50 });
  const [openList, setOpenList] = useState<string | null>(null);

  const current = PROFILE_STUDIES.find((s) => s.slug === study);
  if (!current) return <Navigate to={`/redesign/profile/${PROFILE_STUDIES[0].slug}`} replace />;
  const Top = TOPS[current.slug];

  const props: TopProps = {
    ko, works, tab, sort, cover, openList, setSort, setCover,
    /* as on the live page: a tab leaves an open playlist, and a playlist opens under Artworks */
    pickTab: (t) => { setTab(t); setOpenList(null); },
    openPlaylist: (id) => { if (id) setTab("artworks"); setOpenList(id); },
  };

  return (
    <div className="pf" data-study={current.slug}>
      <Top {...props} />
      <LiveGrid works={works} tab={tab} sort={sort} openList={openList} />
      <nav className="pf-switch" aria-label={ko ? "마이페이지 시안" : "My Page proposals"}>
        {PROFILE_STUDIES.map((s) => (
          <Link key={s.slug} to={`/redesign/profile/${s.slug}`}
            className={s === current ? "is-on" : undefined} aria-current={s === current ? "page" : undefined}>
            <b>{s.letter}</b><span>{ko ? s.ko : s.en}</span>
          </Link>
        ))}
        <i aria-hidden="true" />
        <button type="button" onClick={toggleLanguage}>{ko ? "EN" : "KR"}</button>
      </nav>
    </div>
  );
}
