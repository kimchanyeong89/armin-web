import { Link, Navigate, useParams } from "react-router-dom";
import { useLanguage } from "../../contexts/LanguageContext";
import ArtistStudiesApp from "../artist/ArtistStudiesApp";
import PanelDetail from "./PanelDetail";
import StageDetail from "./StageDetail";
import TabDetail from "./TabDetail";
import "./detail-studies.css";

const STUDIES = [
  { slug: "panel", letter: "A", ko: "지도 패널", en: "Map panel", Detail: PanelDetail },
  { slug: "stage", letter: "B", ko: "글로브 무대", en: "Globe stage", Detail: StageDetail },
  { slug: "tab", letter: "C", ko: "메뉴 탭", en: "Tab page", Detail: TabDetail },
];

/**
 * The artwork detail, proposed three ways. Each opens over the artist page
 * where the shared detail opens — any work in the grid — and carries all of
 * its content. The switch pinned to the bottom of the window, where the tab
 * bar sits in the app, moves between the proposals without closing the work.
 */
export default function DetailStudiesApp() {
  const { study } = useParams();
  const { language, toggleLanguage } = useLanguage();
  const ko = language === "ko";
  const current = STUDIES.find((s) => s.slug === study);
  if (!current) return <Navigate to={`/redesign/artwork-detail/${STUDIES[0].slug}`} replace />;
  const { Detail } = current;

  return (
    <>
      <ArtistStudiesApp initialWork={2} renderDetail={(opened) => <Detail {...opened} />} />
      <nav className={`dx dx--${current.slug}`} aria-label={ko ? "작품 상세 시안" : "Detail proposals"}>
        {STUDIES.map((s) => (
          <Link key={s.slug} to={`/redesign/artwork-detail/${s.slug}`}
            className={s === current ? "is-on" : undefined} aria-current={s === current ? "page" : undefined}>
            <b>{s.letter}</b><span>{ko ? s.ko : s.en}</span>
          </Link>
        ))}
        <i aria-hidden="true" />
        <button type="button" onClick={toggleLanguage}>{ko ? "EN" : "KR"}</button>
      </nav>
    </>
  );
}
