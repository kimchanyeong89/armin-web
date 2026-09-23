/**
 * The genre table the search tab already browses by, copied from
 * GenreMuseumBrowse so the studies show the real ten genres and the real
 * museums held under each. If that table moves, this copy is the thing to
 * delete - the studies are not a second source of truth.
 */
export interface GenreRow { ko: string; en: string; ids: string[] }

export const GENRES: GenreRow[] = [
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
