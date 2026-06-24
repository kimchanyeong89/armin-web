import { useNavigate } from "react-router-dom";

// "Browse by genre" index shown under the search bar to fill the empty lower area
// of the Search tab. Editorial / luxury-index styling (gold numerals, refined type,
// understated text links — no emojis, no chips). Each museum opens via the same route
// GlobalSearchBar uses for a museum result: /interactive/world/city/:id.
// All ids are verified to exist in src/data/exhibitions.js.

type Pick = { id: string; label: string };
type GenreRow = { ko: string; en: string; museums: Pick[] };

const GENRES: GenreRow[] = [
  { ko: "회화", en: "Painting", museums: [
    { id: "musee-du-louvre", label: "루브르" },
    { id: "prado", label: "프라도" },
    { id: "uffizi", label: "우피치" },
    { id: "met-ny", label: "메트로폴리탄" },
    { id: "musee-dorsay", label: "오르세" },
  ] },
  { ko: "사진", en: "Photography", museums: [
    { id: "icp-ny", label: "ICP 뉴욕" },
    { id: "niepce-chalon", label: "니엡스" },
    { id: "maison-europeenne-de-la-photographie", label: "MEP 파리" },
    { id: "foam-amsterdam", label: "Foam" },
    { id: "getty", label: "게티" },
  ] },
  { ko: "비디오·미디어아트", en: "Video & Media Art", museums: [
    { id: "njpac", label: "백남준아트센터" },
    { id: "zkm", label: "ZKM" },
    { id: "tate-modern", label: "테이트 모던" },
    { id: "walker-art-center", label: "워커 아트센터" },
    { id: "mmca-seoul", label: "국립현대미술관" },
  ] },
  { ko: "영화", en: "Film", museums: [
    { id: "academy-museum", label: "아카데미 영화박물관" },
    { id: "nfaj", label: "도쿄 국립영화아카이브" },
    { id: "filmmuseum-potsdam", label: "포츠담 영화박물관" },
    { id: "moma-collection", label: "MoMA 필름" },
  ] },
  { ko: "제품·산업디자인", en: "Design", museums: [
    { id: "cnap-france", label: "CNAP 프랑스" },
    { id: "cooper-hewitt", label: "쿠퍼 휴잇" },
    { id: "powerhouse-sydney", label: "파워하우스" },
    { id: "mad-paris", label: "파리 장식미술관" },
    { id: "nationalmuseum-se", label: "스웨덴 국립" },
  ] },
  { ko: "판화·드로잉", en: "Prints & Drawings", museums: [
    { id: "albertina-museum", label: "알베르티나" },
    { id: "british-museum", label: "대영박물관" },
    { id: "morgan-library", label: "모건 도서관" },
    { id: "kupferstichkabinett", label: "베를린 동판화관" },
    { id: "ashmolean", label: "애슈몰린" },
  ] },
  { ko: "그래픽·포스터", en: "Graphic & Posters", museums: [
    { id: "gestaltung-zurich", label: "취리히 조형미술관" },
    { id: "moravian-gallery", label: "모라비아 갤러리" },
    { id: "poster-house", label: "포스터 하우스" },
    { id: "letterform-archive", label: "레터폼 아카이브" },
    { id: "wilanow-poster", label: "빌라누프 포스터" },
  ] },
  { ko: "만화·애니메이션", en: "Comics · Animation", museums: [
    { id: "cibdi-angouleme", label: "앙굴렘 만화박물관" },
    { id: "korea-manhwa", label: "한국만화박물관" },
  ] },
  { ko: "동시대미술", en: "Contemporary", museums: [
    { id: "moma-collection", label: "MoMA" },
    { id: "tate-modern", label: "테이트 모던" },
    { id: "centre-pompidou", label: "퐁피두" },
    { id: "guggenheim-ny", label: "구겐하임" },
    { id: "museo-reina-sofia", label: "레이나 소피아" },
  ] },
  { ko: "건축", en: "Architecture", museums: [
    { id: "cca-montreal", label: "캐나다 건축센터" },
    { id: "soane-museum", label: "존 손 미술관" },
    { id: "cite-architecture", label: "시테 건축유산" },
    { id: "dam-frankfurt", label: "독일 건축박물관" },
    { id: "art-institute-of-chicago", label: "시카고 미술관" },
  ] },
];

const GOLD = "212,165,71";

export default function GenreMuseumBrowse({ isMobile }: { isMobile: boolean }) {
  const navigate = useNavigate();
  const open = (id: string) => navigate(`/interactive/world/city/${encodeURIComponent(id)}`);

  return (
    <section
      style={{
        marginTop: isMobile ? 26 : 40,
        paddingTop: isMobile ? 24 : 32,
        borderTop: "1px solid rgba(255,255,255,0.08)",
      }}
    >
      <div style={{ marginBottom: isMobile ? 20 : 30, padding: isMobile ? "0 2px" : 0 }}>
        <span
          style={{
            fontSize: 10.5,
            letterSpacing: 2.6,
            fontWeight: 600,
            textTransform: "uppercase",
            color: `rgba(${GOLD},0.78)`,
          }}
        >
          Browse by Genre
        </span>
        <h2 style={{ margin: "9px 0 5px", fontSize: isMobile ? 19 : 23, fontWeight: 600, color: "#f4f3f1", letterSpacing: -0.4 }}>
          분야별로 둘러보기
        </h2>
        <p style={{ margin: 0, fontSize: 12.5, color: "rgba(242,242,242,0.4)", lineHeight: 1.5, fontWeight: 350 }}>
          관심 분야의 미술관·아카이브를 골라 컬렉션을 펼쳐보세요.
        </p>
      </div>

      <div>
        {GENRES.map((g, gi) => (
          <div
            key={g.ko}
            style={{
              display: "grid",
              gridTemplateColumns: isMobile ? "26px 1fr" : "54px 1fr",
              gap: isMobile ? 14 : 24,
              alignItems: "start",
              padding: isMobile ? "17px 2px" : "21px 2px",
              borderTop: gi === 0 ? "none" : "1px solid rgba(255,255,255,0.055)",
            }}
          >
            <span
              style={{
                fontSize: isMobile ? 14 : 21,
                fontWeight: 300,
                lineHeight: 1,
                color: `rgba(${GOLD},0.48)`,
                fontVariantNumeric: "tabular-nums",
                letterSpacing: 0.5,
                paddingTop: isMobile ? 3 : 4,
              }}
            >
              {String(gi + 1).padStart(2, "0")}
            </span>

            <div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: isMobile ? 11 : 13, flexWrap: "wrap" }}>
                <span style={{ fontSize: isMobile ? 15.5 : 17, fontWeight: 600, color: "#f0efec", letterSpacing: -0.3 }}>{g.ko}</span>
                <span style={{ fontSize: 10, fontWeight: 500, letterSpacing: 1.7, textTransform: "uppercase", color: `rgba(${GOLD},0.5)` }}>{g.en}</span>
              </div>

              <div style={{ display: "flex", flexWrap: "wrap", columnGap: isMobile ? 17 : 22, rowGap: isMobile ? 10 : 11 }}>
                {g.museums.map((m) => (
                  <button
                    key={g.ko + m.id}
                    type="button"
                    onClick={() => open(m.id)}
                    style={{
                      background: "none",
                      border: "none",
                      borderBottom: "1px solid transparent",
                      padding: "0 0 2px",
                      margin: 0,
                      cursor: "pointer",
                      fontFamily: "inherit",
                      fontSize: isMobile ? 13 : 13.5,
                      fontWeight: 450,
                      lineHeight: 1.15,
                      color: "rgba(240,240,240,0.56)",
                      transition: "color 0.18s ease, border-color 0.18s ease",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.color = "#eccd86";
                      e.currentTarget.style.borderBottomColor = `rgba(${GOLD},0.7)`;
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.color = "rgba(240,240,240,0.56)";
                      e.currentTarget.style.borderBottomColor = "transparent";
                    }}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
