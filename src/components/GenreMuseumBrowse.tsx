import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useLanguage } from "../contexts/LanguageContext";

// "Browse by genre" index shown under the search bar to fill the empty lower area
// of the Search tab. Editorial / luxury-index styling (gold numerals, refined type,
// understated text links — no emojis, no chips). Each museum opens via the same route
// GlobalSearchBar uses for a museum result: /interactive/world/city/:id.
//
// Lists every HELD museum per genre (the ✅ rows of GENRE_TOP10_LIST.md — up to 10).
// Names are localized: KO uses the museum's name_ko, EN uses its canonical `name`
// (name_en is unreliable in the data — often empty or "Collection" — so we skip it).
// A few long canonical names get a short override for a cleaner grid.

type MuseumLike = { id: string; name?: string; name_ko?: string };
type GenreRow = { ko: string; en: string; ids: string[] };

const GENRES: GenreRow[] = [
  { ko: "회화", en: "Painting", ids: ["musee-du-louvre", "prado", "uffizi", "national-gallery", "rijksmuseum", "met-ny", "hermitage-museum", "musee-dorsay", "kunsthistorisches-museum-vienna", "alte-pinakothek"] },
  { ko: "사진", en: "Photography", ids: ["icp-ny", "niepce-chalon", "maison-europeenne-de-la-photographie", "fomu-antwerp", "foam-amsterdam", "huis-marseille", "getty", "vam", "centre-pompidou", "moma-collection"] },
  { ko: "비디오·미디어아트", en: "Video & Media Art", ids: ["njpac", "zkm", "ars-electronica", "tate-modern", "centre-pompidou", "walker-art-center", "stedelijk-museum", "mmca-seoul", "moca-busan", "moma-collection"] },
  { ko: "영화", en: "Film", ids: ["nfaj", "academy-museum", "filmmuseum-potsdam", "moma-collection"] },
  { ko: "제품·산업디자인", en: "Design", ids: ["cnap-france", "cooper-hewitt", "powerhouse-sydney", "mkg-hamburg", "nationalmuseum-se", "mak-vienna", "neue-sammlung", "mad-paris", "vam", "moma-collection"] },
  { ko: "판화·드로잉", en: "Prints & Drawings", ids: ["albertina-museum", "british-museum", "morgan-library", "kupferstichkabinett", "uffizi", "musee-du-louvre", "met-ny", "ashmolean", "fitzwilliam", "boijmans"] },
  { ko: "그래픽·포스터", en: "Graphic & Posters", ids: ["gestaltung-zurich", "moravian-gallery", "mak-vienna", "poster-house", "letterform-archive", "wilanow-poster", "cooper-hewitt", "mad-paris", "vam", "stedelijk-museum"] },
  { ko: "만화·애니메이션", en: "Comics · Animation", ids: ["cibdi-angouleme", "korea-manhwa"] },
  { ko: "동시대미술", en: "Contemporary", ids: ["moma-collection", "tate-modern", "centre-pompidou", "guggenheim-ny", "sfmoma", "stedelijk-museum", "mmca-seoul", "mplus", "museo-reina-sofia", "thebroad"] },
  { ko: "건축", en: "Architecture", ids: ["cca-montreal", "frac-centre", "azw-vienna", "cite-architecture", "dam-frankfurt", "het-nieuwe-instituut", "soane-museum", "art-institute-of-chicago", "centre-pompidou", "moma-collection"] },
];

// short, clean labels for museums whose canonical name is too long/awkward for the grid
const SHORT: Record<string, { ko: string; en: string }> = {
  "moma-collection": { ko: "MoMA", en: "MoMA" },
  "cnap-france": { ko: "CNAP", en: "CNAP" },
  "cibdi-angouleme": { ko: "앙굴렘 만화센터", en: "CIBDI Angoulême" },
  "maison-europeenne-de-la-photographie": { ko: "MEP 파리", en: "MEP Paris" },
  "icp-ny": { ko: "ICP 뉴욕", en: "ICP" },
  "art-institute-of-chicago": { ko: "시카고 미술관", en: "Art Institute of Chicago" },
  "vam": { ko: "V&A", en: "V&A" },
  "azw-vienna": { ko: "빈 건축센터", en: "Az W Vienna" },
  "kunsthistorisches-museum-vienna": { ko: "빈 미술사박물관", en: "Kunsthistorisches Museum" },
  "het-nieuwe-instituut": { ko: "헷 니우어 인스티튜트", en: "Het Nieuwe Instituut" },
  "mak-vienna": { ko: "MAK 빈", en: "MAK Vienna" },
  "fomu-antwerp": { ko: "FOMU 안트베르펜", en: "FOMU Antwerp" },
  "mkg-hamburg": { ko: "MKG 함부르크", en: "MKG Hamburg" },
  "frac-centre": { ko: "Frac Centre", en: "Frac Centre" },
};

const COPY = {
  ko: { title: "분야별로 둘러보기", sub: "관심 분야의 미술관·아카이브를 골라 컬렉션을 펼쳐보세요." },
  en: { title: "Browse by Genre", sub: "Pick a field and open its museums and archives." },
};

const GOLD = "212,165,71";

export default function GenreMuseumBrowse({ isMobile, museums }: { isMobile: boolean; museums: MuseumLike[] }) {
  const navigate = useNavigate();
  const { language } = useLanguage();
  const byId = useMemo(() => new Map(museums.map((m) => [m.id, m])), [museums]);
  const open = (id: string) => navigate(`/interactive/world/city/${encodeURIComponent(id)}`);

  const nameOf = (id: string): string => {
    if (SHORT[id]) return SHORT[id][language];
    const m = byId.get(id);
    if (!m) return id;
    // EN: canonical `name` (name_en is unreliable). KO: name_ko, falling back to name.
    return language === "en" ? (m.name || m.name_ko || id) : (m.name_ko || m.name || id);
  };

  const copy = COPY[language] || COPY.ko;

  return (
    <section
      style={{
        marginTop: isMobile ? 26 : 40,
        paddingTop: isMobile ? 24 : 32,
        borderTop: "1px solid rgba(255,255,255,0.08)",
      }}
    >
      <div style={{ marginBottom: isMobile ? 20 : 30, padding: isMobile ? "0 2px" : 0 }}>
        <span style={{ fontSize: 10.5, letterSpacing: 2.6, fontWeight: 600, textTransform: "uppercase", color: `rgba(${GOLD},0.78)` }}>
          Browse by Genre
        </span>
        <h2 style={{ margin: "9px 0 5px", fontSize: isMobile ? 19 : 23, fontWeight: 600, color: "#f4f3f1", letterSpacing: -0.4 }}>
          {copy.title}
        </h2>
        <p style={{ margin: 0, fontSize: 12.5, color: "rgba(242,242,242,0.4)", lineHeight: 1.5, fontWeight: 350 }}>
          {copy.sub}
        </p>
      </div>

      <div>
        {GENRES.map((g, gi) => (
          <div
            key={g.en}
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
                <span style={{ fontSize: isMobile ? 15.5 : 17, fontWeight: 600, color: "#f0efec", letterSpacing: -0.3 }}>
                  {language === "en" ? g.en : g.ko}
                </span>
                {language === "ko" && (
                  <span style={{ fontSize: 10, fontWeight: 500, letterSpacing: 1.7, textTransform: "uppercase", color: `rgba(${GOLD},0.5)` }}>{g.en}</span>
                )}
              </div>

              <div style={{ display: "flex", flexWrap: "wrap", columnGap: isMobile ? 17 : 22, rowGap: isMobile ? 10 : 11 }}>
                {g.ids.map((id) => (
                  <button
                    key={g.en + id}
                    type="button"
                    onClick={() => open(id)}
                    style={{
                      background: "none",
                      border: "none",
                      padding: 0,
                      margin: 0,
                      cursor: "pointer",
                      fontFamily: "inherit",
                      fontSize: isMobile ? 13 : 13.5,
                      fontWeight: 450,
                      lineHeight: 1.15,
                      color: "rgba(240,240,240,0.56)",
                      letterSpacing: "0",
                      transition: "color 0.22s ease, letter-spacing 0.22s ease",
                    }}
                    onMouseEnter={(e) => {
                      // Minimal editorial hover: brighten to gold + a hair of letter-spacing.
                      // (Replaces the old gold underline that read like a tray/shelf edge.)
                      e.currentTarget.style.color = "#eccd86";
                      e.currentTarget.style.letterSpacing = "0.02em";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.color = "rgba(240,240,240,0.56)";
                      e.currentTarget.style.letterSpacing = "0";
                    }}
                  >
                    {nameOf(id)}
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
