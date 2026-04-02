import React, { useState, useMemo, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { CityMarker, Venue, Theme } from "./types";
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

function formatCoord(lat: number, lon: number): string {
  const latD = lat >= 0 ? "N" : "S";
  const lonD = lon >= 0 ? "E" : "W";
  return `${Math.abs(lat).toFixed(1)}\u00b0${latD}  ${Math.abs(lon).toFixed(1)}\u00b0${lonD}`;
}

function catDotStyle(category: string, t: boolean): React.CSSProperties {
  if (category === "bauhaus") return { backgroundColor: "#BFFF0A" };
  if (category === "design") return { backgroundColor: t ? "rgba(0,0,0,0.45)" : "rgba(255,255,255,0.55)" };
  const borderColor = t ? "rgba(0,0,0,0.28)" : "rgba(255,255,255,0.35)";
  return {
    borderTop: `1px solid ${borderColor}`,
    borderRight: `1px solid ${borderColor}`,
    borderBottom: `1px solid ${borderColor}`,
    borderLeft: `1px solid ${borderColor}`,
  };
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
          <img src={exhibition.coverImage} alt={exhibition.title} className="w-full h-full object-cover" />
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
              style={{
                fontSize: "9px",
                letterSpacing: "0.12em",
                textTransform: "uppercase" as const,
                color: !activeFilter ? limeColor : fgMute,
                backgroundColor: !activeFilter ? limeBg : "transparent",
                borderTop: `1px solid ${!activeFilter ? limeBorder : (t ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.06)")}`,
                borderRight: `1px solid ${!activeFilter ? limeBorder : (t ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.06)")}`,
                borderBottom: `1px solid ${!activeFilter ? limeBorder : (t ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.06)")}`,
                borderLeft: `1px solid ${!activeFilter ? limeBorder : (t ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.06)")}`,
              }}
            >All</button>
            {availableCategories.map((cat) => {
              const count = exhibition.artworks.filter((a) => a.category === cat).length;
              const isActive = activeFilter === cat;
              return (
                <button key={cat} onClick={() => { setActiveFilter(isActive ? null : cat); setActiveArtwork(null); setHoveredArtwork(null); }}
                  className="cursor-pointer px-3 py-1.5 transition-all duration-200 flex items-center gap-1.5"
                  style={{
                    fontSize: "9px",
                    letterSpacing: "0.12em",
                    textTransform: "uppercase" as const,
                    color: isActive ? limeColor : fgMute,
                    backgroundColor: isActive ? limeBg : "transparent",
                    borderTop: `1px solid ${isActive ? limeBorder : (t ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.06)")}`,
                    borderRight: `1px solid ${isActive ? limeBorder : (t ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.06)")}`,
                    borderBottom: `1px solid ${isActive ? limeBorder : (t ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.06)")}`,
                    borderLeft: `1px solid ${isActive ? limeBorder : (t ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.06)")}`,
                  }}
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
                          style={{ transform: isHovered ? "scale(1.04)" : "scale(1)" }}
                        />
                        <div
                          className="absolute inset-0 transition-all duration-200"
                          style={{
                            borderTop: isSelected
                              ? `2px solid ${limeColor}`
                              : isHovered
                              ? `1px solid ${t ? "rgba(0,0,0,0.20)" : "rgba(255,255,255,0.20)"}`
                              : "1px solid transparent",
                            borderRight: isSelected
                              ? `2px solid ${limeColor}`
                              : isHovered
                              ? `1px solid ${t ? "rgba(0,0,0,0.20)" : "rgba(255,255,255,0.20)"}`
                              : "1px solid transparent",
                            borderBottom: isSelected
                              ? `2px solid ${limeColor}`
                              : isHovered
                              ? `1px solid ${t ? "rgba(0,0,0,0.20)" : "rgba(255,255,255,0.20)"}`
                              : "1px solid transparent",
                            borderLeft: isSelected
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
                          style={{ maxHeight: "58vh", objectFit: "contain" }}
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

function normalizeCollectionPath(inputPath: unknown): string {
  if (typeof inputPath !== "string") return "";
  const trimmed = inputPath.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("https://")) return trimmed;
  if (trimmed.startsWith("http://")) return `https://${trimmed.slice("http://".length)}`;
  if (trimmed.startsWith("/")) return trimmed;
  if (trimmed.startsWith("data/")) return `/${trimmed}`;
  return `/data/${trimmed.replace(/^\.?\//, "")}`;
}

function extractItemsFromPayload(payload: any): any[] {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return [];

  const topLevelKeys = ["items", "data", "objects", "artworks", "results", "rows", "records", "collection", "list"];
  for (const key of topLevelKeys) {
    const candidate = (payload as any)[key];
    if (Array.isArray(candidate)) return candidate;
  }

  for (const value of Object.values(payload)) {
    if (Array.isArray(value)) return value;
    if (value && typeof value === "object") {
      for (const nested of Object.values(value as Record<string, unknown>)) {
        if (Array.isArray(nested)) return nested;
      }
    }
  }

  return [];
}

function normalizeImageUrl(url: unknown): string {
  if (typeof url !== "string") return "";
  let normalized = url.trim();
  if (!normalized || normalized === "null" || normalized === "undefined") return "";
  if (normalized.startsWith("//")) normalized = `https:${normalized}`;
  if (normalized.startsWith("http://")) normalized = `https://${normalized.slice("http://".length)}`;
  if (normalized.startsWith("images/")) normalized = `/${normalized}`;
  return normalized;
}

function resolveArtworkImage(item: any): string {
  const candidates: unknown[] = [
    item?.originalImage,
    item?.original_image,
    item?.i,
    item?.image,
    item?.imageUrl,
    item?.thumbnailUrl,
    item?.thumb,
    item?.generated_image_url,
    item?.firstPhoto?.file,
    item?.photos,
    Array.isArray(item?.images) ? item.images[0] : "",
  ];

  if (Array.isArray(item?.images)) candidates.push(...item.images);
  if (Array.isArray(item?.photos)) candidates.push(...item.photos);

  for (const candidate of candidates) {
    if (candidate && typeof candidate === "object") {
      const obj = candidate as Record<string, unknown>;
      const nested = normalizeImageUrl(obj.imageUrl ?? obj.url ?? obj.src ?? obj.file ?? obj.thumbnailUrl ?? obj.thumbnail);
      if (nested) return nested;
      continue;
    }

    const normalized = normalizeImageUrl(candidate);
    if (normalized) return normalized;
  }

  return "";
}

// ─── Component ─────────────────────────────────────────────

interface VenuePanelProps {
  city: CityMarker;
  theme: Theme;
  onClose: () => void;
  onOpenExhibition?: (exhibition: any) => void;
}

export function VenuePanel({ city, theme, onClose, onOpenExhibition }: VenuePanelProps) {
  const [selectedVenue, setSelectedVenue] = useState<Venue | null>(null);
  const [hoveredVenueIdx, setHoveredVenueIdx] = useState<number | null>(null);
  const [coverByExhibitionId, setCoverByExhibitionId] = useState<Record<string, string>>({});
  const t = theme === "light";

  // Use real exhibition data from the venue, not mock data
  const exhibitions = selectedVenue ? selectedVenue.exhibitions : [];

  // (Tailwind string vars removed — using resolved inline color values below in return)

  // Resolved inline color values (replacing non-functional Tailwind class strings)
  const cFg90  = t ? "rgba(0,0,0,0.80)"  : "rgba(255,255,255,0.75)";
  const cFg35  = t ? "rgba(0,0,0,0.30)"  : "rgba(255,255,255,0.25)";
  const cFg20  = t ? "rgba(0,0,0,0.15)"  : "rgba(255,255,255,0.12)";
  const cFg12  = t ? "rgba(0,0,0,0.08)"  : "rgba(255,255,255,0.06)";
  const cDiv   = t ? "rgba(0,0,0,0.06)"  : "rgba(255,255,255,0.04)";
  const cBorder= t ? "rgba(0,0,0,0.06)"  : "rgba(255,255,255,0.05)";
  const cPanelBg = t ? "rgba(255,255,255,0.92)" : "rgba(12,12,12,0.92)";
  const scrollbarTrack = t ? "rgba(0,0,0,0.05)" : "rgba(255,255,255,0.04)";
  const scrollbarThumb = t ? "rgba(0,0,0,0.22)" : "rgba(255,255,255,0.20)";
  const scrollbarThumbHover = t ? "rgba(0,0,0,0.34)" : "rgba(255,255,255,0.32)";

  useEffect(() => {
    if (!selectedVenue || exhibitions.length === 0) return;

    const abortController = new AbortController();
    const original = selectedVenue.originalExhibition as any;
    const allSubs = [
      ...(original?.permanentExhibitions || []),
      ...(original?.temporaryExhibitions || []),
      ...(original?.pastExhibitions || []),
    ];

    const loadCovers = async () => {
      const nextCovers: Record<string, string> = {};

      for (const ex of exhibitions) {
        if (coverByExhibitionId[ex.id]) continue;

        const matchedSub = allSubs.find((sub: any) => sub?.id === ex.id);
        const candidateFiles = [
          matchedSub?.collectionFile,
          matchedSub?.collection,
          original?.collectionFile,
          original?.collection,
        ]
          .map(normalizeCollectionPath)
          .filter(Boolean);

        let cover = normalizeImageUrl(matchedSub?.representativeImage || original?.representativeImage || "");
        if (cover) {
          nextCovers[ex.id] = cover;
          continue;
        }

        for (const candidate of candidateFiles) {
          try {
            const response = await fetch(candidate, { cache: "force-cache", signal: abortController.signal });
            if (!response.ok) continue;

            const rawText = await response.text();
            let payload: any;
            try {
              payload = JSON.parse(rawText);
            } catch {
              payload = rawText
                .split("\n")
                .map((line) => line.trim())
                .filter(Boolean)
                .map((line) => {
                  try {
                    return JSON.parse(line);
                  } catch {
                    return null;
                  }
                })
                .filter(Boolean);
            }

            const items = extractItemsFromPayload(payload);
            const firstImage = items.map(resolveArtworkImage).find(Boolean) || "";
            if (firstImage) {
              cover = firstImage;
              break;
            }
          } catch {
            if (abortController.signal.aborted) return;
          }
        }

        if (cover) nextCovers[ex.id] = cover;
      }

      if (!abortController.signal.aborted && Object.keys(nextCovers).length > 0) {
        setCoverByExhibitionId((prev) => ({ ...prev, ...nextCovers }));
      }
    };

    loadCovers();
    return () => abortController.abort();
  }, [selectedVenue, exhibitions]);

  return (
    <>
      <motion.div
        initial={{ opacity: 0, x: 24 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: 24 }}
        transition={{ duration: 0.25, ease: "easeOut" }}
        style={{
          position: 'absolute',
          top: 0, right: 0, bottom: 0,
          width: '540px',
          maxWidth: '96vw',
          zIndex: 30,
          background: cPanelBg,
          backdropFilter: 'blur(30px) saturate(200%)',
          WebkitBackdropFilter: 'blur(30px) saturate(200%)',
          borderLeft: `1px solid ${cBorder}`,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          fontFamily: "'Space Grotesk', sans-serif",
        }}
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
              style={{ display: 'flex', flexDirection: 'column', height: '100%' }}
            >
              {/* Header */}
              <div style={{ padding: '32px 24px 0', flexShrink: 0 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ color: cFg90, letterSpacing: '0.18em', textTransform: 'uppercase', fontSize: '14px' }}>
                      {city.city}
                    </div>
                    <div style={{ color: cFg35, marginTop: '4px', fontSize: '11px' }}>
                      {city.country}
                    </div>
                    <button
                      onClick={onClose}
                      style={{
                        marginTop: '10px',
                        display: 'inline-flex', alignItems: 'center', gap: '6px',
                        color: cFg35, fontSize: '10px',
                        letterSpacing: '0.12em', textTransform: 'uppercase',
                        fontFamily: "'Space Mono', monospace",
                        cursor: 'pointer',
                        background: 'none', borderTop: 'none', borderRight: 'none', borderBottom: 'none', borderLeft: 'none', outline: 'none',
                        padding: 0,
                      }}
                      aria-label="Back to map"
                    >
                      <span>&larr;</span>
                      <span>Back to map</span>
                    </button>
                  </div>
                  <button
                    onClick={onClose}
                    style={{
                      color: cFg35, cursor: 'pointer', padding: '4px', marginRight: '-4px', marginTop: '-4px',
                      fontSize: '18px', fontFamily: "'Space Mono', monospace", lineHeight: 1,
                      background: 'none', borderTop: 'none', borderRight: 'none', borderBottom: 'none', borderLeft: 'none', outline: 'none',
                    }}
                  >
                    &times;
                  </button>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '12px' }}>
                  <span style={{ color: cFg20, fontFamily: "'Space Mono', monospace", fontSize: '10px' }}>
                    {formatCoord(city.coordinates[1], city.coordinates[0])}
                  </span>
                  <span style={{ color: cFg12, fontSize: '10px' }}>&middot;</span>
                  <span style={{ color: cFg20, fontFamily: "'Space Mono', monospace", fontSize: '10px' }}>
                    {city.venues.length} {city.venues.length === 1 ? "venue" : "venues"}
                  </span>
                </div>

                <div style={{ width: '100%', height: '1px', background: cDiv, marginTop: '20px' }} />
              </div>

              {/* ── Mini City Map ── */}
              <div style={{ flexShrink: 0, position: 'relative', overflow: 'hidden', borderBottom: `1px solid ${cBorder}` }}>
                <MiniCityMap
                  cityName={city.city}
                  venues={city.venues.map((v) => {
                    const museumCity = (v.museumCity || (v.originalExhibition as any)?.city || city.city).trim();
                    return {
                      name: v.name,
                      category: v.category,
                      latitude: v.latitude ?? (v.originalExhibition as any)?.latitude,
                      longitude: v.longitude ?? (v.originalExhibition as any)?.longitude,
                      museumCity,
                      isMainCity: museumCity.toLowerCase() === city.city.trim().toLowerCase(),
                    };
                  })}
                  hoveredIdx={hoveredVenueIdx}
                  onHoverIdx={setHoveredVenueIdx}
                  onSelectIdx={(idx) => setSelectedVenue(city.venues[idx])}
                  theme={theme}
                />
              </div>

              {/* Venue list */}
              <div
                className="venue-panel-scroll"
                style={{
                  padding: '12px',
                  flex: 1,
                  overflowY: 'auto',
                  scrollbarWidth: 'thin',
                  scrollbarColor: `${scrollbarThumb} ${scrollbarTrack}`,
                }}
              >
                {city.venues.map((v, idx) => {
                  const isHL = hoveredVenueIdx === idx;
                  return (
                    <button
                      key={v.name}
                      onClick={() => setSelectedVenue(v)}
                      onMouseEnter={() => setHoveredVenueIdx(idx)}
                      onMouseLeave={() => setHoveredVenueIdx(null)}
                      style={{
                        width: '100%', display: 'flex', alignItems: 'center', gap: '16px',
                        padding: '16px 12px', textAlign: 'left', cursor: 'pointer',
                        background: isHL ? (t ? "rgba(0,0,0,0.032)" : "rgba(255,255,255,0.032)") : 'transparent',
                        borderTop: 'none', borderRight: 'none', borderBottom: 'none', borderLeft: 'none', outline: 'none', transition: 'background 0.15s',
                      }}
                    >
                      <div
                        style={{
                          flexShrink: 0, width: '6px', height: '6px', borderRadius: '50%', transition: 'background 0.15s',
                          ...(isHL ? { backgroundColor: t ? "#5A7800" : "#BFFF0A" } : catDotStyle(v.category, t)),
                        }}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '12px' }}>
                          <span
                            style={{
                              fontSize: '13px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                              color: isHL
                                ? (t ? "rgba(0,0,0,0.78)" : "rgba(255,255,255,0.82)")
                                : (t ? "rgba(0,0,0,0.50)" : "rgba(255,255,255,0.46)"),
                              transition: 'color 0.15s',
                            }}
                          >
                            {v.name}
                          </span>
                          <span style={{ color: cFg20, fontFamily: "'Space Mono', monospace", fontSize: '10px', flexShrink: 0 }}>
                            {v.year}
                          </span>
                        </div>
                        {v.architect && (
                          <div style={{ color: cFg35, marginTop: '4px', fontSize: '11px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {v.architect}
                          </div>
                        )}
                      </div>
                      <span
                        style={{
                          flexShrink: 0, fontSize: '16px', transition: 'color 0.15s',
                          color: isHL ? (t ? "rgba(0,0,0,0.25)" : "rgba(255,255,255,0.25)") : (t ? "rgba(0,0,0,0.08)" : "rgba(255,255,255,0.06)"),
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
              style={{ display: 'flex', flexDirection: 'column', height: '100%' }}
            >
              {/* Back */}
              <div style={{ padding: '28px 24px 0', flexShrink: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <button
                    onClick={() => setSelectedVenue(null)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '8px', color: cFg35,
                      fontSize: '10px', cursor: 'pointer', background: 'none', borderTop: 'none', borderRight: 'none', borderBottom: 'none', borderLeft: 'none',
                      outline: 'none', letterSpacing: '0.12em', textTransform: 'uppercase',
                    }}
                  >
                    <span>&larr;</span>
                    <span>{city.city}</span>
                  </button>
                  <button
                    onClick={onClose}
                    style={{
                      color: cFg35, cursor: 'pointer', padding: '4px', marginRight: '-4px',
                      fontSize: '18px', fontFamily: "'Space Mono', monospace", lineHeight: 1,
                      background: 'none', borderTop: 'none', borderRight: 'none', borderBottom: 'none', borderLeft: 'none', outline: 'none',
                    }}
                  >
                    &times;
                  </button>
                </div>
              </div>

              {/* Venue info */}
              <div style={{ padding: '24px 24px 0', flexShrink: 0 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                  <div
                    style={{
                      flexShrink: 0, width: '7px', height: '7px', borderRadius: '50%', marginTop: '6px',
                      ...catDotStyle(selectedVenue.category, t),
                    }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: cFg90, letterSpacing: '0.06em', fontSize: '16px' }}>
                      {selectedVenue.name}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginTop: '16px', marginLeft: '19px' }}>
                  <span style={{ color: cFg20, fontFamily: "'Space Mono', monospace", fontSize: '12px' }}>
                    {selectedVenue.year}
                  </span>
                  {selectedVenue.architect && (
                    <>
                      <span style={{ color: cFg12 }}>&middot;</span>
                      <span style={{ color: cFg35, fontSize: '12px' }}>{selectedVenue.architect}</span>
                    </>
                  )}
                </div>

                <div style={{ width: '100%', height: '1px', background: cDiv, marginTop: '24px' }} />
              </div>

              {/* Exhibitions section */}
              <div
                className="venue-panel-scroll"
                style={{
                  flex: 1,
                  overflowY: 'auto',
                  padding: '20px 20px 24px',
                  scrollbarWidth: 'thin',
                  scrollbarColor: `${scrollbarThumb} ${scrollbarTrack}`,
                }}
              >
                {exhibitions.length > 0 ? (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                      <span style={{ color: cFg20, letterSpacing: '0.2em', textTransform: 'uppercase', fontSize: '9px' }}>
                        Exhibitions
                      </span>
                      <span style={{ color: cFg12, fontFamily: "'Space Mono', monospace", fontSize: '9px' }}>
                        {exhibitions.length}
                      </span>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {exhibitions.map((ex) => (
                        <button
                          key={ex.id || ex.title}
                          onClick={() => {
                            if (!selectedVenue) return;
                            const origEx = selectedVenue.originalExhibition;
                            const allSubs = [
                              ...(origEx.permanentExhibitions || []),
                              ...(origEx.temporaryExhibitions || []),
                              ...((origEx as any).pastExhibitions || []),
                            ];
                            const sub = allSubs.find(s => s.id === ex.id) || allSubs[0] || null;
                            const rawFile = sub ? (sub as any).collectionFile : undefined;
                            const colFile = normalizeCollectionPath(rawFile);
                            onOpenExhibition?.({
                              ...origEx,
                              _exhibitionTitle: ex.title,
                              _selectedExhibitionId: ex.id,
                              _selectedExhibitionType: ex.type,
                              _routeCountry: city.country,
                              _routeCity: city.city,
                              _routeVenue: selectedVenue.name,
                              collectionFile: colFile,
                            });
                          }}
                          style={{
                            width: '100%', textAlign: 'left', cursor: 'pointer',
                            background: t ? "rgba(0,0,0,0.015)" : "rgba(255,255,255,0.015)",
                            borderTop: 'none', borderRight: 'none', borderBottom: 'none', borderLeft: 'none', outline: 'none', padding: 0,
                          }}
                        >
                          <div style={{ display: 'flex', gap: '12px', padding: '12px' }}>
                            {/* Thumbnail */}
                            <div style={{ flexShrink: 0, width: '88px', height: '66px', overflow: 'hidden' }}>
                              <div style={{ width: '100%', height: '100%', background: t ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)' }}>
                                {(coverByExhibitionId[ex.id] || selectedVenue?.originalExhibition?.representativeImage) && (
                                  <img
                                    src={coverByExhibitionId[ex.id] || selectedVenue?.originalExhibition?.representativeImage || ''}
                                    alt={ex.title}
                                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                  />
                                )}
                              </div>
                            </div>
                            {/* Text */}
                            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '2px 0' }}>
                              <div
                                style={{
                                  fontSize: '12px',
                                  color: t ? "rgba(0,0,0,0.6)" : "rgba(255,255,255,0.55)",
                                  display: '-webkit-box',
                                  WebkitLineClamp: 2,
                                  WebkitBoxOrient: 'vertical' as any,
                                  overflow: 'hidden',
                                }}
                              >
                                {ex.title}
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px' }}>
                                <div style={{ width: '4px', height: '4px', borderRadius: '50%', flexShrink: 0, backgroundColor: typeColor(ex.type, t) }} />
                                <span style={{ fontFamily: "'Space Mono', monospace", fontSize: '9px', color: t ? "rgba(0,0,0,0.22)" : "rgba(255,255,255,0.22)" }}>
                                  {ex.period}
                                </span>
                                <span style={{ fontSize: '7px', letterSpacing: '0.1em', textTransform: 'uppercase', color: typeColor(ex.type, t) }}>
                                  {ex.type}
                                </span>
                              </div>
                            </div>
                            {/* Arrow */}
                            <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', fontSize: '14px', color: t ? "rgba(0,0,0,0.08)" : "rgba(255,255,255,0.08)" }}>
                              &rsaquo;
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </>
                ) : (
                  <div style={{ color: cFg12, letterSpacing: '0.1em', marginTop: '16px', fontSize: '11px' }}>
                    No exhibition data available
                  </div>
                )}
              </div>

              {/* Footer */}
              <div style={{ flexShrink: 0, padding: '16px 24px', borderTop: `1px solid ${cBorder}` }}>
                <span style={{ color: cFg12, fontFamily: "'Space Mono', monospace", fontSize: '9px' }}>
                  {formatCoord(city.coordinates[1], city.coordinates[0])}
                </span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
      <style>{`
        .venue-panel-scroll {
          scrollbar-gutter: stable both-edges;
        }

        .venue-panel-scroll::-webkit-scrollbar {
          width: 10px;
        }

        .venue-panel-scroll::-webkit-scrollbar-track {
          background: ${scrollbarTrack};
          border-left: 1px solid ${cBorder};
        }

        .venue-panel-scroll::-webkit-scrollbar-thumb {
          background: ${scrollbarThumb};
          border-radius: 999px;
          border: 2px solid transparent;
          background-clip: padding-box;
        }

        .venue-panel-scroll::-webkit-scrollbar-thumb:hover {
          background: ${scrollbarThumbHover};
          border: 2px solid transparent;
          background-clip: padding-box;
        }
      `}</style>

    </>
  );
}