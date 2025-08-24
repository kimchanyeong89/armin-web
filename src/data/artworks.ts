// src/data/artworks.ts
import type { Artwork } from "../types/Artwork";

const defaultArtworks: Artwork[] = [
  {
    id: "artwork1",
  name: "Starry Night",
  artist: "Vincent van Gogh",
    year: 1889,
    image: "/images/artworks/starry-night.jpg",
    roomId: "Room 2",
    exhibitionName: "TATE Modern",
    exhibitionTitle: "Tate Collection Highlights"
  },
  {
    id: "artwork2",
  name: "Mona Lisa",
  artist: "Leonardo da Vinci",
    year: 1503,
    image: "/images/artworks/mona-lisa.jpg",
    roomId: "Room 1",
    exhibitionName: "TATE Modern",
    exhibitionTitle: "Tate Collection Highlights"
  },
  // ... additional artworks
];

// Check localStorage for saved artworks
let artworks: Artwork[] = defaultArtworks;
const savedArtworks = localStorage.getItem("artworks");
if (savedArtworks) {
  try {
    artworks = JSON.parse(savedArtworks);
  } catch (e) {
    console.error("Failed to parse saved artworks:", e);
  }
}

export default artworks;