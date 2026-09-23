import { useMemo, useState } from "react";
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
  { ko: "동시대미술", en: "Contemporary", ids: ["moma-collection", "tate-modern", "centre-pompidou", "guggenheim-ny", "sfmoma", "stedelijk-museum", "mmca-seoul", "mplus", "museo-reina-sofia", "thebroad"] },
  { ko: "사진", en: "Photography", ids: ["icp-ny", "niepce-chalon", "maison-europeenne-de-la-photographie", "fomu-antwerp", "foam-amsterdam", "huis-marseille", "getty", "vam", "centre-pompidou", "moma-collection"] },
  { ko: "비디오·미디어아트", en: "Video & Media Art", ids: ["njpac", "zkm", "ars-electronica", "tate-modern", "centre-pompidou", "walker-art-center", "stedelijk-museum", "mmca-seoul", "moca-busan", "moma-collection"] },
  { ko: "건축", en: "Architecture", ids: ["cca-montreal", "frac-centre", "azw-vienna", "cite-architecture", "dam-frankfurt", "het-nieuwe-instituut", "soane-museum", "centre-pompidou", "moma-collection"] },
  { ko: "영화", en: "Film", ids: ["nfaj", "academy-museum", "filmmuseum-potsdam", "moma-collection"] },
  { ko: "제품·산업디자인", en: "Design", ids: ["cnap-france", "cooper-hewitt", "powerhouse-sydney", "mkg-hamburg", "nationalmuseum-se", "mak-vienna", "neue-sammlung", "mad-paris", "vam", "moma-collection"] },
  { ko: "그래픽·포스터", en: "Graphic & Posters", ids: ["gestaltung-zurich", "moravian-gallery", "mak-vienna", "poster-house", "letterform-archive", "wilanow-poster", "cooper-hewitt", "mad-paris", "vam", "stedelijk-museum"] },
  { ko: "판화·드로잉", en: "Prints & Drawings", ids: ["albertina-museum", "british-museum", "morgan-library", "kupferstichkabinett", "uffizi", "musee-du-louvre", "met-ny", "ashmolean", "fitzwilliam", "boijmans"] },
  { ko: "만화·애니메이션", en: "Comics · Animation", ids: ["cibdi-angouleme", "korea-manhwa"] },
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

export default function GenreMuseumBrowse({ isMobile, museums }: { isMobile: boolean; museums: MuseumLike[] }) {
  const navigate = useNavigate();
  const { language, t } = useLanguage();
  const byId = useMemo(() => new Map(museums.map((m) => [m.id, m])), [museums]);
  const open = (id: string) => navigate(`/interactive/world/city/${encodeURIComponent(id)}`);
  // Folded away until asked: one genre open at a time, none to begin with,
  // so the ten read as a list of headings until one is chosen.
  const [openGenre, setOpenGenre] = useState<number | null>(null);

  const nameOf = (id: string): string => {
    if (SHORT[id]) return SHORT[id][language];
    const m = byId.get(id);
    if (!m) return id;
    // EN: canonical `name` (name_en is unreliable). KO: name_ko, falling back to name.
    return language === "en" ? (m.name || m.name_ko || id) : (m.name_ko || m.name || id);
  };
  const countryOf = (id: string): string => String((byId.get(id) as any)?.country || "");
  const two = (n: number) => String(n).padStart(2, "0");

  return (
    <section style={{ marginTop: isMobile ? 26 : 40 }}>
      <ul className="sr-drawer">
        {GENRES.map((g, gi) => {
          const isOpen = openGenre === gi;
          return (
            <li key={g.en} className={isOpen ? "is-open" : ""}>
              <button
                type="button"
                className="sr-drawer__head"
                aria-expanded={isOpen}
                onClick={() => setOpenGenre(isOpen ? null : gi)}
              >
                <em>{two(gi + 1)}</em>
                <span>{language === "en" ? g.en : g.ko}</span>
                <i />
                <b>{two(g.ids.length)}</b>
                <u aria-hidden="true">{isOpen ? "\u2212" : "+"}</u>
              </button>
              {isOpen && (
                <div className="sr-drawer__open">
                  {g.ids.map((id) => (
                    <button key={g.en + id} type="button" className="sr-museum" onClick={() => open(id)}>
                      <i className="sr-museum__dot" aria-hidden="true" />
                      <span>{nameOf(id)}</span>
                      <em>{countryOf(id)}</em>
                    </button>
                  ))}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <p style={{ margin: "18px 2px 0", fontFamily: "var(--num)", fontSize: 9, letterSpacing: "0.06em", color: "rgba(244,241,234,0.4)" }}>
        {t({ ko: "장르를 열면 그 분야를 소장한 미술관이 나옵니다.", en: "Open a genre to see the museums that hold it." })}
      </p>
    </section>
  );
}
