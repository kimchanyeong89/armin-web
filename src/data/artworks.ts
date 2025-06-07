// src/data/artworks.ts
import type { Artwork } from "../types/Artwork";

const defaultArtworks: Artwork[] = [
  {
    id: "artwork1",
    name: "별이 빛나는 밤",
    artist: "빈센트 반 고흐",
    year: 1889,
    image: "/images/artworks/starry-night.jpg",
    roomId: "Room 2",
    exhibitionName: "TATE Modern",
    exhibitionTitle: "Tate Collection Highlights"
  },
  {
    id: "artwork2",
    name: "모나리자",
    artist: "레오나르도 다빈치",
    year: 1503,
    image: "/images/artworks/mona-lisa.jpg",
    roomId: "Room 1",
    exhibitionName: "TATE Modern",
    exhibitionTitle: "Tate Collection Highlights"
  },
  // ... 추가 작품들
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