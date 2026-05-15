// Museum slug → full display name.
//
// The collection JSONs are filed under terse slugs ("smk-collection",
// "aic-collection") that mean nothing to a reader. This map is the
// single source of truth for what the user actually sees.
//
// If a slug is missing from the map, the helper falls back to a
// best-effort title-casing of the slug. Add explicit entries here
// whenever you bring a new collection into a curation.

const FULL_NAMES: Record<string, string> = {
  // Used by the 2026-W20 Hammershøi curation
  "smk-collection": "Statens Museum for Kunst, Copenhagen",
  "hirschsprung-collection": "Den Hirschsprungske Samling, Copenhagen",
  "staedel-museum-collection": "Städel Museum, Frankfurt",
  "smb-alte-nationalgalerie-collection": "Alte Nationalgalerie, Berlin",
  "cma-collection": "The Cleveland Museum of Art",
  "aic-collection": "Art Institute of Chicago",
  "nmwa-collection": "National Museum of Western Art, Tokyo",
  "getty-collection": "The J. Paul Getty Museum, Los Angeles",
  "aros-collection": "ARoS Aarhus Kunstmuseum",
  "nasjonal-collection": "Nasjonalmuseet, Oslo",
  "ateneum-collection": "Ateneum, Helsinki",
  "glyptoteket-collection": "Ny Carlsberg Glyptotek, Copenhagen",
  "skagens-collection": "Skagens Kunstmuseer",
  "sweden-collection": "Nationalmuseum, Stockholm",
  "met-ny-collection": "The Metropolitan Museum of Art, New York",
  "dia-collection": "Detroit Institute of Arts",

  // Other big collections likely to appear in future curations
  "tate-modern-collection": "Tate Modern, London",
  "tate-britain-collection": "Tate Britain, London",
  "moma-collection": "Museum of Modern Art, New York",
  "rijksmuseum-paintings": "Rijksmuseum, Amsterdam",
  "rijksmuseum-paintings-collection": "Rijksmuseum, Amsterdam",
  "musee-orsay-collection": "Musée d'Orsay, Paris",
  "louvre-collection": "Musée du Louvre, Paris",
  "prado-collection": "Museo del Prado, Madrid",
  "thyssen-collection": "Museo Nacional Thyssen-Bornemisza, Madrid",
  "nga-collection": "National Gallery of Art, Washington",
  "national-gallery-collection": "The National Gallery, London",
  "british-museum": "The British Museum, London",
  "courtauld-gallery-collection": "The Courtauld Gallery, London",
  "uffizi-collection": "Galleria degli Uffizi, Firenze",
  "accademia-collection": "Gallerie dell'Accademia, Venezia",
  "doria-pamphilj-collection": "Galleria Doria Pamphilj, Roma",
  "borghese-arte-antica-collection": "Galleria Borghese, Roma",
  "alte-pinakothek-collection": "Alte Pinakothek, München",
  "hamburger-kunsthalle-paintings": "Hamburger Kunsthalle",
  "albertina-permanent-collection": "Albertina, Wien",
  "belvedere-collection": "Belvedere, Wien",
  "bruecke-museum-collection": "Brücke-Museum, Berlin",
  "carnavalet-paintings": "Musée Carnavalet, Paris",
  "carnavalet-prints": "Musée Carnavalet, Paris",
  "dali-foundation-collection": "Fundació Gala-Salvador Dalí",
  "agnsw-collection": "Art Gallery of New South Wales",
  "qagoma-collection": "Queensland Art Gallery & GoMA",
  "beyeler-collection": "Fondation Beyeler, Basel",
  "basel-collection": "Kunstmuseum Basel",
  "castello-di-rivoli-collection": "Castello di Rivoli, Torino",
  "ambrosiana-collection": "Pinacoteca Ambrosiana, Milano",
  "saam-paintings-100": "Smithsonian American Art Museum",
  "crystal-bridges-gac": "Crystal Bridges Museum of American Art",
  "adachi-collection": "Adachi Museum of Art, Shimane",
  "busan-museum": "Busan Museum of Art",
  "china-art-museum-collection": "China Art Museum, Shanghai",
  "acropolis-museum-collection": "Acropolis Museum, Athens",
  "bordeaux-collection": "Musée des Beaux-Arts de Bordeaux",
  "dpm-intl-paintings-all": "Museums of Russia",
  "dulwich-collection": "Dulwich Picture Gallery, London",
};

/**
 * Look up the full museum name for a collection slug. Falls back to a
 * best-effort title-cased version of the slug when no explicit mapping
 * exists — better than showing "smk-collection" raw.
 */
export function museumDisplayName(slug: string | null | undefined): string {
  if (!slug) return "";
  const explicit = FULL_NAMES[slug];
  if (explicit) return explicit;
  // Fallback: drop scrape-source suffixes and title-case the rest.
  return slug
    .replace(/-collection$/, "")
    .replace(/-paintings$/, " Paintings")
    .replace(/-prints$/, " Prints")
    .split("-")
    .map((w) => (w.length <= 3 ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1)))
    .join(" ");
}
