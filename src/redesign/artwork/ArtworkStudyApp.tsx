import { useState } from "react";
import { Link } from "react-router-dom";
import { useLanguage } from "../../contexts/LanguageContext";
import { ARTIST, WORKS } from "../artist/model";
import WorkDetail, { type DetailWork } from "./WorkDetail";
import "../artist/artist-studies.css";
import "./workDetail.css";

/**
 * The artwork detail on its own page. The same component the artist page
 * opens over its grid, so there is one thing to review, not two.
 */
export default function ArtworkStudyApp() {
  const { language, toggleLanguage, t } = useLanguage();
  const ko = language === "ko";
  const [at, setAt] = useState(0);

  const w = WORKS[at];
  const work: DetailWork = {
    ...w,
    artist: ARTIST.name,
    artistKo: ARTIST.nameKo,
    artistSlug: ARTIST.slug,
    category: ARTIST.category,
    categoryKo: ARTIST.categoryKo,
  };
  const others = WORKS.filter((_, i) => i !== at);
  const jump = (next: (typeof WORKS)[number]) => {
    const i = WORKS.findIndex((x) => x.image === next.image);
    if (i >= 0) setAt(i);
  };

  return (
    <div className="ar-page wd-page">
      <header className="ar-header">
        <Link to="/redesign" className="ar-wordmark">COLLY <span>/ {t({ ko: "작품", en: "WORK" })}</span></Link>
        <div className="ar-header-actions">
          <button type="button" onClick={toggleLanguage}>{ko ? "EN" : "KR"}</button>
        </div>
      </header>
      <p className="ar-note">
        <b>{t({ ko: "작품 상세", en: "Work detail" })}</b>
        <span>{t({
          ko: "글자를 줄이고 아래에 비슷한 분위기와 같은 작가를 붙였습니다. 작가와 소장처는 각각 우리 작가 페이지와 그 미술관 모달로 이어집니다.",
          en: "Smaller type, with the embedding picks and more by the artist under it.",
        })}</span>
      </p>
      <main className="ar-main">
        <WorkDetail work={work} ko={ko}
          similar={others.slice(0, 6)} related={others.slice(6, 12)} onPick={jump} />
      </main>
    </div>
  );
}
