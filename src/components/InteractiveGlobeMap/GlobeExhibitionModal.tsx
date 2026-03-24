import React, { useState, useMemo, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import type { CityMarker, Venue, Theme } from "./Globe";
import { MiniCityMap } from "./MiniCityMap";

// ─── Exhibition mock data ──────────────────────────────────

interface Exhibition {
  title: string;
  period: string;
  type: "permanent" | "current" | "upcoming";
  coverImage: string;
  description: string;
  curator?: string;
  medium?: string;
  artworkCount?: number;
  artworks: Artwork[];
}

interface Artwork {
  title: string;
  artist: string;
  year: string;
  image: string;
  category: ArtworkCategory;
  dimensions: string;
  material: string;
  collection: string;
  inventoryNo: string;
}

type ArtworkCategory = "Painting" | "Drawing" | "Sculpture" | "Photography" | "Textile" | "Architecture" | "Product Design" | "Print";

const ARTWORK_CATEGORIES: ArtworkCategory[] = [
  "Painting", "Drawing", "Sculpture", "Photography", "Textile", "Architecture", "Product Design", "Print",
];

const COVER_IMAGES = [
  "https://images.unsplash.com/photo-1608700272578-057e251574b3?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxiYXVoYXVzJTIwYXJjaGl0ZWN0dXJlJTIwZXhoaWJpdGlvbiUyMGdhbGxlcnl8ZW58MXx8fHwxNzc0MzE2ODk4fDA&ixlib=rb-4.1.0&q=80&w=1080",
  "https://images.unsplash.com/photo-1771189255285-3bcb030e1f47?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxtb2Rlcm4lMjBhcnQlMjBtdXNldW0lMjBpbnRlcmlvciUyMGxpZ2h0JTIwc2hhZG93fGVufDF8fHx8MTc3NDMxNjg5OHww&ixlib=rb-4.1.0&q=80&w=1080",
  "https://images.unsplash.com/photo-1590622974113-66a9160acf20?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxhYnN0cmFjdCUyMGdlb21ldHJpYyUyMGJhdWhhdXMlMjBhcnR3b3JrfGVufDF8fHx8MTc3NDMxNjg5OHww&ixlib=rb-4.1.0&q=80&w=1080",
  "https://images.unsplash.com/photo-1774021793488-f2902f8e1321?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxtaW5pbWFsaXN0JTIwZGVzaWduJTIwZXhoaWJpdGlvbiUyMHNwYWNlfGVufDF8fHx8MTc3NDMxNjg5OXww&ixlib=rb-4.1.0&q=80&w=1080",
  "https://images.unsplash.com/photo-1692855280352-29490e1d0f0d?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxjb250ZW1wb3JhcnklMjBzY3VscHR1cmUlMjBnYWxsZXJ5fGVufDF8fHx8MTc3NDMxNjg5OXww&ixlib=rb-4.1.0&q=80&w=1080",
  "https://images.unsplash.com/photo-1769283979195-d418a41ae2ec?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxicnV0YWxpc3QlMjBhcmNoaXRlY3R1cmUlMjBjb25jcmV0ZSUyMGJ1aWxkaW5nfGVufDF8fHx8MTc3NDMxNjkwMHww&ixlib=rb-4.1.0&q=80&w=1080",
];

const ARTWORK_IMAGES = [
  "https://images.unsplash.com/photo-1760716478125-aa948e99ef85?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxtb2Rlcm5pc3QlMjBmdXJuaXR1cmUlMjBkZXNpZ24lMjBjaGFpcnxlbnwxfHx8fDE3NzQzMTY5MDB8MA&ixlib=rb-4.1.0&q=80&w=1080",
  "https://images.unsplash.com/photo-1612718115067-8f92930ce598?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxwaG90b2dyYXBoeSUyMGV4aGliaXRpb24lMjBibGFjayUyMHdoaXRlfGVufDF8fHx8MTc3NDMxNjkwMHww&ixlib=rb-4.1.0&q=80&w=1080",
  "https://images.unsplash.com/photo-1635141849017-c531949fb5b3?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxhYnN0cmFjdCUyMHBhaW50aW5nJTIwY29sb3JmdWwlMjBjYW52YXN8ZW58MXx8fHwxNzc0MzE2OTAxfDA&ixlib=rb-4.1.0&q=80&w=1080",
  "https://images.unsplash.com/photo-1762628437902-315a5efb810c?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxjZXJhbWljJTIwcG90dGVyeSUyMGNyYWZ0JTIwYXJ0aXNhbnxlbnwxfHx8fDE3NzQzMTY5MDF8MA&ixlib=rb-4.1.0&q=80&w=1080",
  "https://images.unsplash.com/photo-1721244653693-1d13e68b66c1?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxhcmNoaXRlY3R1cmFsJTIwYmx1ZXByaW50JTIwZHJhd2luZyUyMHBsYW58ZW58MXx8fHwxNzc0MjY5ODMzfDA&ixlib=rb-4.1.0&q=80&w=1080",
  "https://images.unsplash.com/photo-1771098302131-4c453dbe5836?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHx0ZXh0aWxlJTIwd2VhdmluZyUyMGZhYnJpYyUyMHBhdHRlcm58ZW58MXx8fHwxNzc0MzE2OTAyfDA&ixlib=rb-4.1.0&q=80&w=1080",
  "https://images.unsplash.com/photo-1654716246527-385302b3ad47?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxtdXNldW0lMjBnYWxsZXJ5JTIwd2FsbCUyMGFydHdvcmslMjBoYW5naW5nfGVufDF8fHx8MTc3NDMxNzIwMnww&ixlib=rb-4.1.0&q=80&w=1080",
  "https://images.unsplash.com/photo-1589089851450-0396bf7deeb6?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxpbmR1c3RyaWFsJTIwZGVzaWduJTIwcHJvZHVjdCUyMG1pbmltYWx8ZW58MXx8fHwxNzc0MzE3MjAzfDA&ixlib=rb-4.1.0&q=80&w=1080",
  "https://images.unsplash.com/photo-1765616926738-5be33d02926a?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxhYnN0cmFjdCUyMG1ldGFsJTIwc2N1bHB0dXJlJTIwb3V0ZG9vcnxlbnwxfHx8fDE3NzQzMTcyMDN8MA&ixlib=rb-4.1.0&q=80&w=1080",
  "https://images.unsplash.com/photo-1773182124517-74acd640727d?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxtb2Rlcm4lMjBhcmNoaXRlY3R1cmUlMjBpbnRlcmlvciUyMGxpZ2h0JTIwc2hhZG93fGVufDF8fHx8MTc3NDMxNzIwM3ww&ixlib=rb-4.1.0&q=80&w=1080",
];

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function buildExhibition(
  title: string,
  period: string,
  type: "permanent" | "current" | "upcoming",
  idx: number
): Exhibition {
  const h = hashStr(title);
  const coverIdx = h % COVER_IMAGES.length;
  const artCount = 10 + (h % 6);
  const artists = [
    "Walter Gropius", "Ludwig Mies van der Rohe", "Marcel Breuer",
    "Anni Albers", "László Moholy-Nagy", "Oskar Schlemmer",
    "Josef Albers", "Paul Klee", "Wassily Kandinsky",
    "Marianne Brandt", "Herbert Bayer", "Lyonel Feininger",
  ];
  const titlePrefixes = [
    "Composition in Space", "Study for Form", "Untitled Structure",
    "Geometric Meditation", "Material Investigation", "Light & Shadow",
    "Rhythmic Sequence", "Spatial Tension", "Chromatic Field",
    "Structural Relief", "Planar Intersection", "Kinetic Study",
    "Tectonic Fragment", "Linear Progression", "Surface Variation",
  ];
  const materials = [
    "Oil on canvas", "Graphite on paper", "Painted steel",
    "Silver gelatin print", "Cotton, linen weave", "Concrete, steel, glass",
    "Injection-molded ABS", "Lithograph on paper", "Watercolor on paper",
    "Bronze cast", "Wool tapestry", "Plywood, lacquer",
    "Ink on vellum", "Ceramic, glaze", "Aluminum, anodized",
  ];
  const dimensionsList = [
    "120 × 90 cm", "45 × 32 cm", "H 180 × W 60 × D 60 cm",
    "30.5 × 24 cm", "200 × 150 cm", "1:200 scale model",
    "22 × 14 × 8 cm", "76 × 56 cm", "H 240 × W 120 cm",
    "50 × 50 cm", "165 × 110 cm", "38 × 28 cm",
  ];
  const collections = [
    "Bauhaus-Archiv, Berlin", "MoMA, New York", "Vitra Design Museum",
    "Neue Nationalgalerie", "Private Collection", "Museum Collection",
    "Stiftung Bauhaus Dessau", "Centre Pompidou, Paris",
  ];

  const artworks: Artwork[] = Array.from({ length: artCount }, (_, i) => {
    const seed = h + i * 13;
    const cat = ARTWORK_CATEGORIES[seed % ARTWORK_CATEGORIES.length];
    return {
      title: titlePrefixes[(seed) % titlePrefixes.length] + ` No.${(seed) % 40 + 1}`,
      artist: artists[seed % artists.length],
      year: `${1919 + (seed % 107)}`,
      image: ARTWORK_IMAGES[seed % ARTWORK_IMAGES.length],
      category: cat,
      dimensions: dimensionsList[seed % dimensionsList.length],
      material: materials[seed % materials.length],
      collection: collections[seed % collections.length],
      inventoryNo: `INV-${String(seed % 9999 + 1).padStart(4, "0")}`,
    };
  });

  const curators = [
    "Dr. Regina Bittner", "Annemarie Jaeggi", "Friedrich von Borries",
    "Mateo Kries", "Paola Antonelli",
  ];
  const descriptions = [
    "An immersive exploration of form, material, and function that traces the evolution of modernist thought through seminal works and archival documents.",
    "This exhibition brings together rarely seen pieces from the permanent collection, offering new perspectives on the intersection of art and industry.",
    "A comprehensive survey examining how design principles shaped the built environment and everyday objects of the twentieth century.",
    "Curated around the theme of reduction and clarity, this show presents works that embody the ethos of 'less but better' across multiple disciplines.",
  ];
  const mediums = [
    "Mixed media, Installation", "Photography, Print", "Architecture, Model",
    "Oil on canvas", "Steel, Glass", "Textile, Weaving",
    "Sculpture, Wood", "Lithograph, Paper",
  ];

  return {
    title,
    period,
    type,
    coverImage: COVER_IMAGES[(coverIdx + idx) % COVER_IMAGES.length],
    description: descriptions[h % descriptions.length],
    curator: curators[h % curators.length],
    medium: mediums[h % mediums.length],
    artworkCount: artCount,
    artworks,
  };
}

const RAW_EXHIBITIONS: Record<string, { title: string; period: string; type: "permanent" | "current" | "upcoming" }[]> = {
  "Bauhaus Dessau": [
    { title: "Original Bauhaus \u2014 The Centenary Exhibition", period: "Permanent", type: "permanent" },
    { title: "Versuchsst\u00e4tte Bauhaus. The Collection", period: "2024\u20132026", type: "current" },
  ],
  "Meisterh\u00e4user": [
    { title: "The Masters\u2019 Houses \u2014 Living & Working", period: "Permanent", type: "permanent" },
  ],
  "Bauhaus-Universit\u00e4t": [
    { title: "Van de Velde Building \u2014 Atelier Wing", period: "Permanent", type: "permanent" },
  ],
  "Bauhaus Museum Weimar": [
    { title: "Das Bauhaus kommt aus Weimar", period: "Permanent", type: "permanent" },
    { title: "Designing New Worlds", period: "2025", type: "current" },
  ],
  "Bauhaus-Archiv": [
    { title: "The Bauhaus Collection", period: "Permanent", type: "permanent" },
    { title: "Bauhaus and Photography", period: "2025\u20132026", type: "current" },
  ],
  "Neue Nationalgalerie": [
    { title: "Art of the 20th Century", period: "Permanent", type: "permanent" },
    { title: "Mies & Modernity", period: "2025\u20132026", type: "current" },
    { title: "Joan Mitchell \u2014 Retrospective", period: "2026", type: "upcoming" },
  ],
  "Berliner Philharmonie": [
    { title: "Concert Hall Architecture Tour", period: "Permanent", type: "permanent" },
  ],
  "HfG Ulm": [
    { title: "The Ulm Model \u2014 Design Education", period: "Permanent", type: "permanent" },
  ],
  "Museum Angewandte Kunst": [
    { title: "The Design Collection", period: "Permanent", type: "permanent" },
    { title: "Dieter Rams. Ein Blick zur\u00fcck und voraus", period: "2025", type: "current" },
  ],
  "Muji / Good Design": [
    { title: "Found MUJI", period: "Permanent", type: "permanent" },
    { title: "Good Design Awards Archive", period: "2025", type: "current" },
  ],
  "21_21 Design Sight": [
    { title: "The Original \u2014 Exploration of Creativity", period: "2025", type: "current" },
  ],
  "National Art Center": [
    { title: "Architecture as Art \u2014 Kurokawa\u2019s Vision", period: "Permanent", type: "permanent" },
  ],
  "Designmuseum Danmark": [
    { title: "Danish Design Now", period: "Permanent", type: "permanent" },
    { title: "The Danish Chair \u2014 A Century of Design", period: "2025", type: "current" },
  ],
  "Design Museum Helsinki": [
    { title: "Utopia Now \u2014 Finnish Design Story", period: "Permanent", type: "permanent" },
  ],
  "Finlandia Hall": [
    { title: "Aalto\u2019s Marble Fantasy", period: "Permanent", type: "permanent" },
  ],
  "IIT Crown Hall": [
    { title: "Mies van der Rohe \u2014 Universal Space", period: "Permanent", type: "permanent" },
  ],
  "Robie House": [
    { title: "Wright\u2019s Prairie Masterpiece", period: "Permanent", type: "permanent" },
  ],
  "MoMA": [
    { title: "Collection Galleries 1880s\u2013Present", period: "Permanent", type: "permanent" },
    { title: "Is It Modern?", period: "2025\u20132026", type: "current" },
    { title: "Design for Modern Life", period: "2025", type: "current" },
  ],
  "Guggenheim Museum": [
    { title: "Thannhauser Collection", period: "Permanent", type: "permanent" },
    { title: "Wright\u2019s Spiral \u2014 Architecture Walk", period: "Permanent", type: "permanent" },
  ],
  "Triennale di Milano": [
    { title: "Italian Design Museum", period: "Permanent", type: "permanent" },
    { title: "Broken Nature \u2014 XXII Triennale", period: "2025", type: "current" },
  ],
  "Fondazione Prada": [
    { title: "Atlas \u2014 Koolhaas / OMA Retrospective", period: "Permanent", type: "permanent" },
    { title: "Recycled Futures", period: "2025", type: "current" },
  ],
  "Barcelona Pavilion": [
    { title: "Mies 1929 \u2014 The Reconstruction", period: "Permanent", type: "permanent" },
  ],
  "Fundaci\u00f3 Joan Mir\u00f3": [
    { title: "The Joan Mir\u00f3 Collection", period: "Permanent", type: "permanent" },
    { title: "Sert\u2019s Architecture of Light", period: "Permanent", type: "permanent" },
  ],
  "MASP": [
    { title: "A m\u00e3o do povo brasileiro", period: "Permanent", type: "permanent" },
    { title: "Lina Bo Bardi \u2014 Habitat", period: "2025", type: "current" },
  ],
  "National Congress": [
    { title: "Niemeyer\u2019s Democratic Architecture", period: "Permanent", type: "permanent" },
  ],
  "Cathedral of Bras\u00edlia": [
    { title: "Light and Structure \u2014 Niemeyer\u2019s Vision", period: "Permanent", type: "permanent" },
  ],
  "DDP": [
    { title: "Zaha Hadid \u2014 Design Innovation", period: "Permanent", type: "permanent" },
    { title: "Seoul Design Festival", period: "2025", type: "upcoming" },
  ],
  "Leeum Museum of Art": [
    { title: "Korean Art Through the Ages", period: "Permanent", type: "permanent" },
    { title: "Three Architects, One Vision", period: "Permanent", type: "permanent" },
  ],
  "Capitol Complex": [
    { title: "Le Corbusier\u2019s Urban Utopia", period: "Permanent", type: "permanent" },
  ],
  "Vitra Design Museum": [
    { title: "The Vitra Design Museum Collection", period: "Permanent", type: "permanent" },
    { title: "Transform! Design & the Future of Energy", period: "2024\u20132025", type: "current" },
  ],
  "Vitra Fire Station": [
    { title: "Zaha Hadid \u2014 Deconstructivism", period: "Permanent", type: "permanent" },
  ],
  "VitraHaus": [
    { title: "Home Stories \u2014 100 Years, 20 Interiors", period: "Permanent", type: "permanent" },
  ],
  "Pinakothek der Moderne": [
    { title: "Die Neue Sammlung \u2014 Design Museum", period: "Permanent", type: "permanent" },
    { title: "Modern Art Collection", period: "Permanent", type: "permanent" },
  ],
  "BMW Museum": [
    { title: "100 Years of BMW Design", period: "Permanent", type: "permanent" },
  ],
  "Weissenhof Estate": [
    { title: "The Weissenhof Museum \u2014 Modernist Housing", period: "Permanent", type: "permanent" },
  ],
  "Elbphilharmonie": [
    { title: "Plaza \u2014 Architecture Walk", period: "Permanent", type: "permanent" },
  ],
  "Eames House (CSH #8)": [
    { title: "Charles & Ray Eames \u2014 Living and Working", period: "Permanent", type: "permanent" },
  ],
  "Getty Center": [
    { title: "Meier\u2019s White City", period: "Permanent", type: "permanent" },
    { title: "Photographs & Architecture", period: "2025", type: "current" },
  ],
  "MAXXI Museum": [
    { title: "MAXXI Architecture Collection", period: "Permanent", type: "permanent" },
    { title: "Zaha Hadid \u2014 Fluid Spaces", period: "2025\u20132026", type: "current" },
  ],
  "Ara Pacis Museum": [
    { title: "Ara Pacis Augustae", period: "Permanent", type: "permanent" },
  ],
  "Guggenheim Bilbao": [
    { title: "The Matter of Time \u2014 Richard Serra", period: "Permanent", type: "permanent" },
    { title: "Gehry\u2019s Titanium Dream", period: "Permanent", type: "permanent" },
  ],
  "Chichu Art Museum": [
    { title: "James Turrell \u2014 Open Sky", period: "Permanent", type: "permanent" },
    { title: "Walter De Maria \u2014 Time/Timeless/No Time", period: "Permanent", type: "permanent" },
  ],
  "Benesse House": [
    { title: "Art & Architecture \u2014 Ando\u2019s Integration", period: "Permanent", type: "permanent" },
  ],
  "LEGO House": [
    { title: "Masterpiece Gallery", period: "Permanent", type: "permanent" },
    { title: "BIG Architecture \u2014 Building for Play", period: "Permanent", type: "permanent" },
  ],
  "Alvar Aalto Museum": [
    { title: "Aalto \u2014 Second Nature", period: "Permanent", type: "permanent" },
  ],
  "MAM Rio": [
    { title: "Reidy\u2019s Garden Architecture", period: "Permanent", type: "permanent" },
  ],
  "Niter\u00f3i Contemporary Art Museum": [
    { title: "Niemeyer \u2014 Flying Saucer on the Cliff", period: "Permanent", type: "permanent" },
  ],
  "IIM Ahmedabad": [
    { title: "Louis Kahn \u2014 Brick, Light & Silence", period: "Permanent", type: "permanent" },
  ],
  "Shodhan House": [
    { title: "Le Corbusier \u2014 Indian Modernism", period: "Permanent", type: "permanent" },
  ],
};

// Build full exhibition objects
const EXHIBITIONS: Record<string, Exhibition[]> = {};
for (const [venue, exList] of Object.entries(RAW_EXHIBITIONS)) {
  EXHIBITIONS[venue] = exList.map((e, i) => buildExhibition(e.title, e.period, e.type, i));
}

// ─── Helpers ───────────────────────────────────────────────

const CAT_LABEL: Record<string, string> = {
  bauhaus: "Bauhaus",
  design: "Design",
  architecture: "Architecture",
};

function formatCoord(lat: number, lon: number): string {
  const latD = lat >= 0 ? "N" : "S";
  const lonD = lon >= 0 ? "E" : "W";
  return `${Math.abs(lat).toFixed(1)}\u00b0${latD}  ${Math.abs(lon).toFixed(1)}\u00b0${lonD}`;
}

function catDotStyle(category: string, t: boolean): React.CSSProperties {
  if (category === "bauhaus") return { backgroundColor: "#BFFF0A" };
  if (category === "design") return { backgroundColor: t ? "rgba(0,0,0,0.45)" : "rgba(255,255,255,0.55)" };
  return { border: `1px solid ${t ? "rgba(0,0,0,0.28)" : "rgba(255,255,255,0.35)"}` };
}

function typeColor(type: string, t: boolean): string {
  if (type === "current") return t ? "#5A7800" : "#BFFF0A";
  if (type === "upcoming") return t ? "rgba(90,120,0,0.5)" : "rgba(191,255,10,0.5)";
  return t ? "rgba(0,0,0,0.18)" : "rgba(255,255,255,0.22)";
}

// ─── Column count hook ─────────────────────────────────────
function useColumnCount() {
  const [cols, setCols] = useState(2);
  useEffect(() => {
    const update = () => {
      if (window.innerWidth >= 1024) setCols(5);
      else if (window.innerWidth >= 768) setCols(4);
      else if (window.innerWidth >= 640) setCols(3);
      else setCols(2);
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  return cols;
}

// ─── Exhibition Detail Modal ──────────────────────────────

function ExhibitionModal({
  exhibition,
  venueName,
  theme,
  onClose,
}: {
  exhibition: Exhibition;
  venueName: string;
  theme: Theme;
  onClose: () => void;
}) {
  const t = theme === "light";
  const [activeArtwork, setActiveArtwork] = useState<number | null>(null);
  const [hoveredArtwork, setHoveredArtwork] = useState<number | null>(null);
  const [activeFilter, setActiveFilter] = useState<ArtworkCategory | null>(null);
  const colCount = useColumnCount();

  const bgColor = t ? "#FAFAFA" : "#080808";
  const bgSticky = t ? "rgba(250,250,250,0.97)" : "rgba(8,8,8,0.97)";
  const fgHigh = t ? "rgba(0,0,0,0.90)" : "rgba(255,255,255,0.92)";
  const fgMed = t ? "rgba(0,0,0,0.68)" : "rgba(255,255,255,0.72)";
  const fgLow = t ? "rgba(0,0,0,0.50)" : "rgba(255,255,255,0.55)";
  const fgMute = t ? "rgba(0,0,0,0.32)" : "rgba(255,255,255,0.38)";
  const fgFaint = t ? "rgba(0,0,0,0.16)" : "rgba(255,255,255,0.20)";
  const dividerColor = t ? "rgba(0,0,0,0.07)" : "rgba(255,255,255,0.06)";
  const imgFilter = t
    ? "saturate(0.55) contrast(1.05)"
    : "saturate(0.35) brightness(0.82) contrast(1.1)";
  const limeColor = t ? "#5A7800" : "#BFFF0A";
  const limeBg = t ? "rgba(90,120,0,0.08)" : "rgba(191,255,10,0.08)";
  const limeBorder = t ? "rgba(90,120,0,0.25)" : "rgba(191,255,10,0.2)";

  const availableCategories = useMemo(() => {
    const cats = new Set(exhibition.artworks.map((a) => a.category));
    return ARTWORK_CATEGORIES.filter((c) => cats.has(c));
  }, [exhibition.artworks]);

  const filteredArtworks = useMemo(() => {
    if (!activeFilter) return exhibition.artworks;
    return exhibition.artworks.filter((a) => a.category === activeFilter);
  }, [exhibition.artworks, activeFilter]);

  const inspectedIdx = hoveredArtwork !== null ? hoveredArtwork : activeArtwork;
  const inspectedArt = inspectedIdx !== null ? filteredArtworks[inspectedIdx] : null;

  // Group artworks into rows for inline expansion
  const artworkRows = useMemo(() => {
    const rows: { aw: Artwork; globalIdx: number }[][] = [];
    for (let i = 0; i < filteredArtworks.length; i += colCount) {
      rows.push(
        filteredArtworks.slice(i, i + colCount).map((aw, j) => ({ aw, globalIdx: i + j }))
      );
    }
    return rows;
  }, [filteredArtworks, colCount]);

  const selectedRow = activeArtwork !== null ? Math.floor(activeArtwork / colCount) : -1;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className="fixed inset-0 z-[100] overflow-hidden"
      style={{ fontFamily: "'Space Grotesk', sans-serif", backgroundColor: bgColor }}
    >
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 20 }}
        transition={{ duration: 0.35, ease: "easeOut", delay: 0.05 }}
        className="h-full overflow-y-auto overflow-x-hidden"
      >
        {/* ── Hero ── */}
        <div className="relative w-full" style={{ height: "52vh", minHeight: "340px" }}>
          <img src={exhibition.coverImage} alt={exhibition.title} className="w-full h-full object-cover" style={{ filter: imgFilter }} />
          <div className="absolute inset-0" style={{ background: `linear-gradient(to bottom, ${bgColor}00 0%, ${bgColor}00 35%, ${bgColor}F2 82%, ${bgColor} 100%)` }} />
          <div className="absolute inset-0" style={{ background: `linear-gradient(to bottom, ${bgColor}99 0%, ${bgColor}00 25%)` }} />
          <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-6 sm:px-10 pt-6 sm:pt-8">
            <button onClick={onClose} className="flex items-center gap-2.5 group cursor-pointer" style={{ fontSize: "10px" }}>
              <span className="group-hover:-translate-x-1 transition-transform" style={{ color: fgLow }}>&larr;</span>
              <span className="tracking-[0.15em] uppercase" style={{ color: fgLow }}>Back</span>
            </button>
            <span className="px-2.5 py-1 tracking-[0.15em] uppercase" style={{ fontSize: "8px", backgroundColor: t ? "rgba(255,255,255,0.75)" : "rgba(0,0,0,0.55)", color: typeColor(exhibition.type, t), backdropFilter: "blur(8px)" }}>{exhibition.type}</span>
          </div>
          <div className="absolute bottom-0 left-0 right-0 px-6 sm:px-10 pb-2">
            <div className="max-w-[720px]">
              <h1 className="tracking-[0.02em]" style={{ fontSize: "clamp(24px, 4vw, 40px)", color: fgHigh, lineHeight: 1.15 }}>{exhibition.title}</h1>
            </div>
          </div>
        </div>

        {/* ── Info ── */}
        <div className="px-6 sm:px-10 pt-6 pb-0 max-w-[900px]">
          <div className="flex items-center gap-4 flex-wrap">
            <span style={{ fontFamily: "'Space Mono', monospace", fontSize: "11px", color: fgLow }}>{exhibition.period}</span>
            <span style={{ fontSize: "11px", color: fgFaint }}>&middot;</span>
            <span style={{ fontSize: "11px", color: fgLow }}>{venueName}</span>
            {exhibition.curator && (<><span style={{ fontSize: "11px", color: fgFaint }}>&middot;</span><span style={{ fontSize: "11px", color: fgMute }}>Curated by {exhibition.curator}</span></>)}
          </div>
          <div className="mt-5" style={{ height: "1px", backgroundColor: dividerColor }} />
          <div className="mt-6 max-w-[600px]">
            <p style={{ fontSize: "14px", lineHeight: 1.85, color: fgMed }}>{exhibition.description}</p>
          </div>
          <div className="mt-8 grid grid-cols-2 sm:grid-cols-4 gap-6">
            {[{ label: "Period", value: exhibition.period }, { label: "Medium", value: exhibition.medium || "Various" }, { label: "Works", value: `${exhibition.artworks.length} pieces` }, { label: "Type", value: exhibition.type.charAt(0).toUpperCase() + exhibition.type.slice(1) }].map((meta) => (
              <div key={meta.label}>
                <div className="tracking-[0.2em] uppercase" style={{ fontSize: "8px", color: fgMute }}>{meta.label}</div>
                <div className="mt-1.5" style={{ fontSize: "12px", color: fgMed }}>{meta.value}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Works section header + filters ── */}
        <div className="px-6 sm:px-10 mt-14">
          {/* Header */}
          <div className="flex items-center gap-4 mb-6">
            <div style={{ width: "24px", height: "1px", backgroundColor: dividerColor }} />
            <span className="tracking-[0.25em] uppercase" style={{ fontSize: "9px", color: fgMute }}>Featured Works</span>
            <span style={{ fontFamily: "'Space Mono', monospace", fontSize: "9px", color: fgFaint }}>{filteredArtworks.length}{activeFilter ? ` / ${exhibition.artworks.length}` : ""}</span>
            <div className="flex-1" style={{ height: "1px", backgroundColor: dividerColor }} />
          </div>

          {/* Category filters */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              onClick={() => { setActiveFilter(null); setActiveArtwork(null); setHoveredArtwork(null); }}
              className="cursor-pointer px-3 py-1.5 transition-all duration-200"
              style={{ fontSize: "9px", letterSpacing: "0.12em", textTransform: "uppercase" as const, color: !activeFilter ? limeColor : fgMute, backgroundColor: !activeFilter ? limeBg : "transparent", border: `1px solid ${!activeFilter ? limeBorder : (t ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.06)")}` }}
            >All</button>
            {availableCategories.map((cat) => {
              const count = exhibition.artworks.filter((a) => a.category === cat).length;
              const isActive = activeFilter === cat;
              return (
                <button key={cat} onClick={() => { setActiveFilter(isActive ? null : cat); setActiveArtwork(null); setHoveredArtwork(null); }}
                  className="cursor-pointer px-3 py-1.5 transition-all duration-200 flex items-center gap-1.5"
                  style={{ fontSize: "9px", letterSpacing: "0.12em", textTransform: "uppercase" as const, color: isActive ? limeColor : fgMute, backgroundColor: isActive ? limeBg : "transparent", border: `1px solid ${isActive ? limeBorder : (t ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.06)")}` }}
                >{cat}<span style={{ fontFamily: "'Space Mono', monospace", fontSize: "8px", opacity: 0.6 }}>{count}</span></button>
              );
            })}
          </div>
        </div>

        {/* ── Sticky metadata panel ── */}
        <div
          className="px-6 sm:px-10 mt-4"
          style={{
            position: "sticky",
            top: 0,
            zIndex: 20,
            backgroundColor: bgSticky,
            backdropFilter: "blur(12px)",
            borderBottom: `1px solid ${inspectedArt ? limeBorder : dividerColor}`,
            transition: "border-color 0.2s",
          }}
        >
          <div
            className="py-4 px-5 transition-all duration-200"
            style={{
              borderLeft: `2px solid ${inspectedArt ? limeColor : "transparent"}`,
              minHeight: "80px",
            }}
          >
            <AnimatePresence mode="wait">
              {inspectedArt ? (
                <motion.div key={inspectedArt.title + inspectedArt.inventoryNo} initial={{ opacity: 0, x: 6 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -6 }} transition={{ duration: 0.12 }}>
                  <div style={{ fontSize: "15px", color: fgHigh }}>{inspectedArt.title}</div>
                  <div className="flex items-center gap-3 mt-1.5">
                    <span style={{ fontSize: "12px", color: fgMed }}>{inspectedArt.artist}</span>
                    <span style={{ fontFamily: "'Space Mono', monospace", fontSize: "10px", color: fgLow }}>{inspectedArt.year}</span>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-x-6 gap-y-2">
                    {[
                      { label: "Category", value: inspectedArt.category },
                      { label: "Medium", value: inspectedArt.material },
                      { label: "Dimensions", value: inspectedArt.dimensions },
                    ].map((m) => (
                      <div key={m.label}>
                        <div className="tracking-[0.15em] uppercase" style={{ fontSize: "7px", color: fgMute }}>{m.label}</div>
                        <div className="mt-0.5 truncate" style={{ fontSize: "11px", color: fgLow }}>{m.value}</div>
                      </div>
                    ))}
                  </div>
                </motion.div>
              ) : (
                <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }} className="flex items-center" style={{ minHeight: "56px" }}>
                  <span className="tracking-[0.12em]" style={{ fontSize: "10px", color: fgFaint }}>Hover over a work to see details</span>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* ── Row-based artwork grid with inline expansion ── */}
        <div className="px-6 sm:px-10 mt-6 mb-4">
          {artworkRows.map((row, rowIdx) => (
            <React.Fragment key={`row-${rowIdx}`}>
              {/* One row of artwork items */}
              <div
                className="grid gap-2 sm:gap-3 mb-2 sm:mb-3 items-start"
                style={{ gridTemplateColumns: `repeat(${colCount}, minmax(0, 1fr))` }}
              >
                {row.map(({ aw, globalIdx }) => {
                  const isSelected = activeArtwork === globalIdx;
                  const isHovered = hoveredArtwork === globalIdx;
                  return (
                    <button
                      key={aw.inventoryNo + globalIdx}
                      className="text-left cursor-pointer relative"
                      onClick={() => setActiveArtwork(isSelected ? null : globalIdx)}
                      onMouseEnter={() => setHoveredArtwork(globalIdx)}
                      onMouseLeave={() => setHoveredArtwork(null)}
                    >
                      <div className="relative overflow-hidden w-full">
                        <img
                          src={aw.image}
                          alt={aw.title}
                          className="w-full h-auto block transition-all duration-400"
                          style={{ filter: imgFilter, transform: isHovered ? "scale(1.04)" : "scale(1)" }}
                        />
                        <div
                          className="absolute inset-0 transition-all duration-200"
                          style={{
                            border: isSelected
                              ? `2px solid ${limeColor}`
                              : isHovered
                              ? `1px solid ${t ? "rgba(0,0,0,0.20)" : "rgba(255,255,255,0.20)"}`
                              : "1px solid transparent",
                          }}
                        />
                      </div>
                      <div className="mt-1.5 px-0.5">
                        <div style={{ fontFamily: "'Space Mono', monospace", fontSize: "8px", color: fgMute }}>
                          {String(globalIdx + 1).padStart(2, "0")}
                        </div>
                        <div className="truncate transition-colors mt-0.5" style={{ fontSize: "10px", color: isSelected || isHovered ? fgHigh : fgMed }}>
                          {aw.title} <span style={{ color: fgMute }}>({aw.year})</span>
                        </div>
                        <div className="truncate mt-0.5" style={{ fontSize: "9px", color: fgMute }}>
                          {aw.artist}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Inline row expansion — opens right below the row */}
              <AnimatePresence>
                {selectedRow === rowIdx && activeArtwork !== null && filteredArtworks[activeArtwork] && (
                  <motion.div
                    key={`exp-${activeArtwork}`}
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.32, ease: "easeOut" }}
                    className="overflow-hidden mb-2 sm:mb-3"
                  >
                    <div style={{ height: "1px", backgroundColor: dividerColor }} />
                    <div className="py-7 flex flex-col lg:flex-row gap-8">
                      {/* Enlarged image */}
                      <div className="flex-1 min-w-0 flex items-start justify-center">
                        <img
                          src={filteredArtworks[activeArtwork].image}
                          alt={filteredArtworks[activeArtwork].title}
                          className="w-full h-auto block"
                          style={{ maxHeight: "58vh", objectFit: "contain", filter: imgFilter }}
                        />
                      </div>
                      {/* Metadata sidebar */}
                      <div className="lg:w-[240px] flex-shrink-0 flex flex-col justify-between">
                        <div>
                          <div style={{ fontSize: "17px", color: fgHigh, lineHeight: 1.3 }}>
                            {filteredArtworks[activeArtwork].title}
                          </div>
                          <div className="mt-2.5" style={{ fontSize: "13px", color: fgMed }}>
                            {filteredArtworks[activeArtwork].artist}
                          </div>
                          <div className="mt-1" style={{ fontFamily: "'Space Mono', monospace", fontSize: "11px", color: fgLow }}>
                            {filteredArtworks[activeArtwork].year}
                          </div>
                          <div className="mt-4" style={{ height: "1px", backgroundColor: dividerColor }} />
                          <div className="mt-4 flex flex-col gap-3">
                            {[
                              { label: "Category", value: filteredArtworks[activeArtwork].category },
                              { label: "Material", value: filteredArtworks[activeArtwork].material },
                              { label: "Dimensions", value: filteredArtworks[activeArtwork].dimensions },
                              { label: "Collection", value: filteredArtworks[activeArtwork].collection },
                              { label: "Inventory No.", value: filteredArtworks[activeArtwork].inventoryNo },
                            ].map((m) => (
                              <div key={m.label} className="flex items-baseline justify-between gap-3">
                                <span className="tracking-[0.15em] uppercase flex-shrink-0" style={{ fontSize: "8px", color: fgMute }}>
                                  {m.label}
                                </span>
                                <span className="text-right" style={{ fontSize: "11px", color: fgLow }}>
                                  {m.value}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                        <button
                          onClick={() => setActiveArtwork(null)}
                          className="mt-6 cursor-pointer flex items-center gap-2 group"
                          style={{ fontSize: "10px" }}
                        >
                          <span className="tracking-[0.12em] uppercase" style={{ color: fgMute }}>Close</span>
                          <span className="group-hover:translate-x-0.5 transition-transform" style={{ color: fgMute }}>&times;</span>
                        </button>
                      </div>
                    </div>
                    <div style={{ height: "1px", backgroundColor: dividerColor }} />
                  </motion.div>
                )}
              </AnimatePresence>
            </React.Fragment>
          ))}
        </div>

        {/* ── Footer ── */}
        <div className="px-6 sm:px-10 mt-16 mb-10 max-w-[900px]">
          <div style={{ height: "1px", backgroundColor: dividerColor }} />
          <div className="mt-5 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <span className="tracking-[0.15em] uppercase" style={{ fontSize: "8px", color: fgFaint }}>{venueName}</span>
              <span style={{ fontSize: "9px", color: fgFaint }}>&middot;</span>
              <span className="tracking-[0.1em] uppercase" style={{ fontSize: "8px", color: fgFaint }}>{exhibition.period}</span>
            </div>
            <button onClick={onClose} className="cursor-pointer group flex items-center gap-2" style={{ fontSize: "10px" }}>
              <span className="tracking-[0.12em] uppercase transition-colors" style={{ color: fgMute }}>Back to venue</span>
              <span className="group-hover:translate-x-0.5 transition-transform" style={{ color: fgMute }}>&rarr;</span>
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─── Component ─────────────────────────────────────────────

interface VenuePanelProps {
  city: CityMarker;
  theme: Theme;
  onClose: () => void;
}

export function VenuePanel({ city, theme, onClose }: VenuePanelProps) {
  const [selectedVenue, setSelectedVenue] = useState<Venue | null>(null);
  const [selectedExhibition, setSelectedExhibition] = useState<Exhibition | null>(null);
  const [hoveredVenueIdx, setHoveredVenueIdx] = useState<number | null>(null);
  const t = theme === "light";

  const exhibitions = selectedVenue ? EXHIBITIONS[selectedVenue.name] || [] : [];

  // base colors
  const panelBg = t ? "bg-white/[0.92]" : "bg-[#0c0c0c]/[0.92]";
  const borderColor = t ? "border-black/[0.06]" : "border-white/[0.05]";
  const fg90 = t ? "text-black/80" : "text-white/75";
  const fg60 = t ? "text-black/55" : "text-white/50";
  const fg35 = t ? "text-black/30" : "text-white/25";
  const fg20 = t ? "text-black/15" : "text-white/12";
  const fg12 = t ? "text-black/[0.08]" : "text-white/[0.06]";
  const divider = t ? "bg-black/[0.06]" : "bg-white/[0.04]";
  const hoverBg = t ? "hover:bg-black/[0.03]" : "hover:bg-white/[0.02]";
  const limeAccent = t ? "text-[#5A7800]" : "text-[#BFFF0A]";

  return (
    <>
      <motion.div
        initial={{ opacity: 0, x: 24 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: 24 }}
        transition={{ duration: 0.25, ease: "easeOut" }}
        className={`absolute z-30
          bottom-0 left-0 right-0 max-h-[75vh]
          sm:top-0 sm:right-0 sm:bottom-0 sm:left-auto sm:w-[420px] sm:max-h-none
          ${panelBg} backdrop-blur-xl border-t sm:border-t-0 sm:border-l ${borderColor}
          overflow-y-auto overflow-x-hidden
        `}
        style={{ fontFamily: "'Space Grotesk', sans-serif" }}
      >
        <AnimatePresence mode="wait">
          {!selectedVenue ? (
            /* ── Venue list ── */
            <motion.div
              key="list"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, x: -16 }}
              transition={{ duration: 0.15 }}
              className="flex flex-col h-full"
            >
              {/* Header */}
              <div className="px-6 pt-6 sm:pt-8 pb-0 flex-shrink-0">
                <div className="flex items-start justify-between">
                  <div>
                    <div className={`${fg90} tracking-[0.18em] uppercase`} style={{ fontSize: "14px" }}>
                      {city.city}
                    </div>
                    <div className={`${fg35} mt-1`} style={{ fontSize: "11px" }}>
                      {city.country}
                    </div>
                  </div>
                  <button
                    onClick={onClose}
                    className={`${fg35} transition-colors cursor-pointer p-1 -mr-1 -mt-1`}
                    style={{ fontSize: "18px", fontFamily: "'Space Mono', monospace", lineHeight: 1 }}
                  >
                    &times;
                  </button>
                </div>

                <div className="flex items-center gap-3 mt-3">
                  <span className={fg20} style={{ fontFamily: "'Space Mono', monospace", fontSize: "10px" }}>
                    {formatCoord(city.coordinates[1], city.coordinates[0])}
                  </span>
                  <span className={fg12} style={{ fontSize: "10px" }}>&middot;</span>
                  <span className={fg20} style={{ fontFamily: "'Space Mono', monospace", fontSize: "10px" }}>
                    {city.venues.length} {city.venues.length === 1 ? "venue" : "venues"}
                  </span>
                </div>

                <div className={`w-full h-px ${divider} mt-5`} />
              </div>

              {/* ── Mini City Map ── */}
              <div className="flex-shrink-0 relative overflow-hidden" style={{ borderBottom: `1px solid ${t ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.05)"}` }}>
                <MiniCityMap
                  cityName={city.city}
                  venues={city.venues.map((v) => ({ name: v.name, category: v.category }))}
                  hoveredIdx={hoveredVenueIdx}
                  onHoverIdx={setHoveredVenueIdx}
                  onSelectIdx={(idx) => setSelectedVenue(city.venues[idx])}
                  theme={theme}
                />
              </div>

              {/* Venue list */}
              <div className="px-3 py-3 flex-1 overflow-y-auto">
                {city.venues.map((v, idx) => {
                  const isHL = hoveredVenueIdx === idx;
                  return (
                    <button
                      key={v.name}
                      className="w-full flex items-center gap-4 px-3 py-4 text-left cursor-pointer transition-all duration-150"
                      onClick={() => setSelectedVenue(v)}
                      onMouseEnter={() => setHoveredVenueIdx(idx)}
                      onMouseLeave={() => setHoveredVenueIdx(null)}
                      style={{
                        backgroundColor: isHL
                          ? (t ? "rgba(0,0,0,0.032)" : "rgba(255,255,255,0.032)")
                          : "transparent",
                      }}
                    >
                      <div
                        className="flex-shrink-0 w-[6px] h-[6px] rounded-full transition-colors duration-150"
                        style={isHL
                          ? { backgroundColor: t ? "#5A7800" : "#BFFF0A" }
                          : catDotStyle(v.category, t)}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline justify-between gap-3">
                          <span
                            className="truncate transition-colors duration-150"
                            style={{
                              fontSize: "13px",
                              color: isHL
                                ? (t ? "rgba(0,0,0,0.78)" : "rgba(255,255,255,0.82)")
                                : (t ? "rgba(0,0,0,0.50)" : "rgba(255,255,255,0.46)"),
                            }}
                          >
                            {v.name}
                          </span>
                          <span className={fg20} style={{ fontFamily: "'Space Mono', monospace", fontSize: "10px" }}>
                            {v.year}
                          </span>
                        </div>
                        {v.architect && (
                          <div className={`${fg35} mt-1 truncate`} style={{ fontSize: "11px" }}>
                            {v.architect}
                          </div>
                        )}
                      </div>
                      <span
                        className="flex-shrink-0 transition-colors duration-150"
                        style={{
                          fontSize: "16px",
                          color: isHL
                            ? (t ? "rgba(0,0,0,0.25)" : "rgba(255,255,255,0.25)")
                            : (t ? "rgba(0,0,0,0.08)" : "rgba(255,255,255,0.06)"),
                        }}
                      >
                        &rsaquo;
                      </span>
                    </button>
                  );
                })}
              </div>
            </motion.div>
          ) : (
            /* ── Venue detail with exhibition cards ── */
            <motion.div
              key={selectedVenue.name}
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="flex flex-col h-full"
            >
              {/* Back */}
              <div className="px-6 pt-5 sm:pt-7 pb-0 flex-shrink-0">
                <div className="flex items-center justify-between">
                  <button
                    onClick={() => setSelectedVenue(null)}
                    className={`flex items-center gap-2 ${fg35} transition-colors cursor-pointer group`}
                    style={{ fontSize: "10px" }}
                  >
                    <span className="group-hover:-translate-x-0.5 transition-transform">&larr;</span>
                    <span className="tracking-[0.12em] uppercase">{city.city}</span>
                  </button>
                  <button
                    onClick={onClose}
                    className={`${fg35} transition-colors cursor-pointer p-1 -mr-1`}
                    style={{ fontSize: "18px", fontFamily: "'Space Mono', monospace", lineHeight: 1 }}
                  >
                    &times;
                  </button>
                </div>
              </div>

              {/* Venue info */}
              <div className="px-6 pt-6 pb-0 flex-shrink-0">
                <div className="flex items-start gap-3">
                  <div
                    className="flex-shrink-0 w-[7px] h-[7px] rounded-full mt-[6px]"
                    style={catDotStyle(selectedVenue.category, t)}
                  />
                  <div className="flex-1 min-w-0">
                    <div className={`${fg90} tracking-[0.06em]`} style={{ fontSize: "16px" }}>
                      {selectedVenue.name}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-4 mt-4 ml-[19px]">
                  <span className={fg20} style={{ fontFamily: "'Space Mono', monospace", fontSize: "12px" }}>
                    {selectedVenue.year}
                  </span>
                  {selectedVenue.architect && (
                    <>
                      <span className={fg12}>&middot;</span>
                      <span className={fg35} style={{ fontSize: "12px" }}>
                        {selectedVenue.architect}
                      </span>
                    </>
                  )}
                </div>

                <div className="flex items-center gap-3 mt-2 ml-[19px]">
                  <span className={`${fg20} tracking-[0.12em] uppercase`} style={{ fontSize: "9px" }}>
                    {CAT_LABEL[selectedVenue.category]}
                  </span>
                </div>

                <div className={`w-full h-px ${divider} mt-6`} />
              </div>

              {/* Exhibitions section — card grid */}
              <div className="flex-1 overflow-y-auto px-5 pt-5 pb-6">
                {exhibitions.length > 0 ? (
                  <>
                    <div className="flex items-center justify-between mb-4">
                      <span className={`${fg20} tracking-[0.2em] uppercase`} style={{ fontSize: "9px" }}>
                        Exhibitions
                      </span>
                      <span className={fg12} style={{ fontFamily: "'Space Mono', monospace", fontSize: "9px" }}>
                        {exhibitions.length}
                      </span>
                    </div>

                    <div className="flex flex-col gap-2">
                      {exhibitions.map((ex) => (
                        <button
                          key={ex.title}
                          className="w-full text-left group cursor-pointer transition-colors"
                          style={{
                            backgroundColor: t ? "rgba(0,0,0,0.015)" : "rgba(255,255,255,0.015)",
                          }}
                          onClick={() => setSelectedExhibition(ex)}
                        >
                          {/* Card with cover image */}
                          <div className="flex gap-3 p-3">
                            {/* Thumbnail */}
                            <div
                              className="flex-shrink-0 overflow-hidden"
                              style={{ width: "88px", height: "66px" }}
                            >
                              <img
                                src={ex.coverImage}
                                alt={ex.title}
                                className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.05]"
                                style={{
                                  filter: t
                                    ? "saturate(0.5) contrast(1.05)"
                                    : "saturate(0.3) brightness(0.75) contrast(1.1)",
                                }}
                              />
                            </div>
                            {/* Text content */}
                            <div className="flex-1 min-w-0 flex flex-col justify-between py-0.5">
                              <div>
                                <div
                                  className="line-clamp-2 transition-colors"
                                  style={{
                                    fontSize: "12px",
                                    color: t ? "rgba(0,0,0,0.6)" : "rgba(255,255,255,0.55)",
                                    display: "-webkit-box",
                                    WebkitLineClamp: 2,
                                    WebkitBoxOrient: "vertical",
                                    overflow: "hidden",
                                  }}
                                >
                                  {ex.title}
                                </div>
                              </div>
                              <div className="flex items-center gap-2 mt-1.5">
                                {/* Status dot */}
                                <div
                                  className="w-[4px] h-[4px] rounded-full flex-shrink-0"
                                  style={{ backgroundColor: typeColor(ex.type, t) }}
                                />
                                <span
                                  style={{
                                    fontFamily: "'Space Mono', monospace",
                                    fontSize: "9px",
                                    color: t ? "rgba(0,0,0,0.22)" : "rgba(255,255,255,0.22)",
                                  }}
                                >
                                  {ex.period}
                                </span>
                                <span
                                  className="tracking-[0.1em] uppercase"
                                  style={{
                                    fontSize: "7px",
                                    color: typeColor(ex.type, t),
                                  }}
                                >
                                  {ex.type}
                                </span>
                              </div>
                            </div>
                            {/* Arrow */}
                            <div
                              className="flex-shrink-0 flex items-center transition-colors"
                              style={{
                                fontSize: "14px",
                                color: t ? "rgba(0,0,0,0.08)" : "rgba(255,255,255,0.08)",
                              }}
                            >
                              &rsaquo;
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className={`${fg12} tracking-[0.1em] mt-4`} style={{ fontSize: "11px" }}>
                    No exhibition data available
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className={`flex-shrink-0 px-6 py-4 border-t ${borderColor}`}>
                <div className="flex items-center justify-between">
                  <span className={fg12} style={{ fontFamily: "'Space Mono', monospace", fontSize: "9px" }}>
                    {formatCoord(city.coordinates[1], city.coordinates[0])}
                  </span>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Exhibition Detail Modal */}
      <AnimatePresence>
        {selectedExhibition && selectedVenue && (
          <ExhibitionModal
            exhibition={selectedExhibition}
            venueName={selectedVenue.name}
            theme={theme}
            onClose={() => setSelectedExhibition(null)}
          />
        )}
      </AnimatePresence>
    </>
  );
}