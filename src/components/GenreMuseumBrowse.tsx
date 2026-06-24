import { useNavigate } from "react-router-dom";

// Curated "browse by genre" recommendations shown under the search bar to fill
// the empty lower area of the Search tab. Each pill opens that museum via the
// same route GlobalSearchBar uses for a museum result: /interactive/world/city/:id.
// All ids are verified to exist in src/data/exhibitions.js.

type Pick = { id: string; label: string };
type GenreRow = { emoji: string; ko: string; en: string; museums: Pick[] };

const GENRES: GenreRow[] = [
  { emoji: "🎨", ko: "회화", en: "Painting", museums: [
    { id: "musee-du-louvre", label: "루브르" },
    { id: "prado", label: "프라도" },
    { id: "uffizi", label: "우피치" },
    { id: "met-ny", label: "메트로폴리탄" },
    { id: "musee-dorsay", label: "오르세" },
  ] },
  { emoji: "📷", ko: "사진", en: "Photography", museums: [
    { id: "icp-ny", label: "ICP 뉴욕" },
    { id: "niepce-chalon", label: "니엡스" },
    { id: "maison-europeenne-de-la-photographie", label: "MEP 파리" },
    { id: "foam-amsterdam", label: "Foam" },
    { id: "getty", label: "게티" },
  ] },
  { emoji: "📺", ko: "비디오·미디어아트", en: "Video & Media Art", museums: [
    { id: "njpac", label: "백남준아트센터" },
    { id: "zkm", label: "ZKM" },
    { id: "tate-modern", label: "테이트 모던" },
    { id: "walker-art-center", label: "워커 아트센터" },
    { id: "mmca-seoul", label: "국립현대미술관" },
  ] },
  { emoji: "🎬", ko: "영화", en: "Film", museums: [
    { id: "academy-museum", label: "아카데미 영화박물관" },
    { id: "nfaj", label: "도쿄 국립영화아카이브" },
    { id: "filmmuseum-potsdam", label: "포츠담 영화박물관" },
    { id: "moma-collection", label: "MoMA 필름" },
  ] },
  { emoji: "🪑", ko: "제품·산업디자인", en: "Design", museums: [
    { id: "cnap-france", label: "CNAP 프랑스" },
    { id: "cooper-hewitt", label: "쿠퍼 휴잇" },
    { id: "powerhouse-sydney", label: "파워하우스" },
    { id: "mad-paris", label: "파리 장식미술관" },
    { id: "nationalmuseum-se", label: "스웨덴 국립" },
  ] },
  { emoji: "✏️", ko: "판화·드로잉", en: "Prints & Drawings", museums: [
    { id: "albertina-museum", label: "알베르티나" },
    { id: "british-museum", label: "대영박물관" },
    { id: "morgan-library", label: "모건 도서관" },
    { id: "kupferstichkabinett", label: "베를린 동판화관" },
    { id: "ashmolean", label: "애슈몰린" },
  ] },
  { emoji: "🖼", ko: "그래픽·포스터", en: "Graphic & Posters", museums: [
    { id: "gestaltung-zurich", label: "취리히 조형미술관" },
    { id: "moravian-gallery", label: "모라비아 갤러리" },
    { id: "poster-house", label: "포스터 하우스" },
    { id: "letterform-archive", label: "레터폼 아카이브" },
    { id: "wilanow-poster", label: "빌라누프 포스터" },
  ] },
  { emoji: "💬", ko: "만화·애니메이션", en: "Comics · Animation", museums: [
    { id: "cibdi-angouleme", label: "앙굴렘 만화박물관" },
    { id: "korea-manhwa", label: "한국만화박물관" },
  ] },
  { emoji: "🌐", ko: "동시대미술", en: "Contemporary", museums: [
    { id: "moma-collection", label: "MoMA" },
    { id: "tate-modern", label: "테이트 모던" },
    { id: "centre-pompidou", label: "퐁피두" },
    { id: "guggenheim-ny", label: "구겐하임" },
    { id: "museo-reina-sofia", label: "레이나 소피아" },
  ] },
  { emoji: "🏛", ko: "건축", en: "Architecture", museums: [
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
        marginTop: isMobile ? 22 : 30,
        paddingTop: isMobile ? 20 : 26,
        borderTop: "1px solid rgba(255,255,255,0.07)",
      }}
    >
      <div style={{ marginBottom: isMobile ? 14 : 20, padding: isMobile ? "0 4px" : 0 }}>
        <span
          style={{
            fontSize: 10.5,
            letterSpacing: 2.2,
            fontWeight: 600,
            textTransform: "uppercase",
            color: `rgba(${GOLD},0.85)`,
          }}
        >
          Browse by Genre
        </span>
        <h2 style={{ margin: "7px 0 3px", fontSize: isMobile ? 17 : 20, fontWeight: 600, color: "#f4f4f4", letterSpacing: -0.2 }}>
          분야별로 둘러보기
        </h2>
        <p style={{ margin: 0, fontSize: 12.5, color: "rgba(242,242,242,0.46)", lineHeight: 1.5 }}>
          관심 분야의 미술관·아카이브를 골라 컬렉션을 바로 펼쳐보세요.
        </p>
      </div>

      <div style={{ display: "flex", flexDirection: "column" }}>
        {GENRES.map((g) => (
          <div
            key={g.ko}
            style={{
              display: isMobile ? "flex" : "grid",
              flexDirection: isMobile ? "column" : undefined,
              gridTemplateColumns: isMobile ? undefined : "180px 1fr",
              alignItems: isMobile ? undefined : "start",
              gap: isMobile ? 9 : 18,
              padding: isMobile ? "13px 4px" : "15px 4px",
              borderBottom: "1px solid rgba(255,255,255,0.06)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
              <span style={{ fontSize: 15, opacity: 0.92, lineHeight: 1 }} aria-hidden>{g.emoji}</span>
              <span style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: "#ededed", letterSpacing: -0.1 }}>{g.ko}</span>
                <span style={{ fontSize: 9.5, letterSpacing: 0.6, textTransform: "uppercase", color: "rgba(242,242,242,0.34)" }}>{g.en}</span>
              </span>
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {g.museums.map((m) => (
                <button
                  key={g.ko + m.id}
                  type="button"
                  onClick={() => open(m.id)}
                  style={{
                    padding: "7px 13px",
                    borderRadius: 999,
                    border: "1px solid rgba(255,255,255,0.12)",
                    background: "rgba(255,255,255,0.035)",
                    color: "rgba(242,242,242,0.82)",
                    fontSize: 12.5,
                    fontWeight: 500,
                    lineHeight: 1,
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                    fontFamily: "inherit",
                    transition: "border-color 0.18s ease, background 0.18s ease, color 0.18s ease, transform 0.18s ease",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = `rgba(${GOLD},0.55)`;
                    e.currentTarget.style.background = `rgba(${GOLD},0.12)`;
                    e.currentTarget.style.color = "#fff";
                    e.currentTarget.style.transform = "translateY(-1px)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = "rgba(255,255,255,0.12)";
                    e.currentTarget.style.background = "rgba(255,255,255,0.035)";
                    e.currentTarget.style.color = "rgba(242,242,242,0.82)";
                    e.currentTarget.style.transform = "translateY(0)";
                  }}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
