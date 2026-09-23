import type {
  PreviewArtist,
  PreviewArtwork,
  PreviewData,
  PreviewExhibition,
  PreviewMuseum,
  PreviewPost,
} from "../data";
import type { PreviewConcept, PreviewView } from "../model";

export type ConceptPageProps = {
  concept: PreviewConcept;
  view: PreviewView;
  data: PreviewData;
  artwork: PreviewArtwork;
  artist: PreviewArtist;
  exhibition: PreviewExhibition;
  query: string;
  setQuery: (value: string) => void;
  searchScope: "all" | "artworks" | "museums" | "exhibitions";
  setSearchScope: (value: "all" | "artworks" | "museums" | "exhibitions") => void;
  searchArtworks: PreviewArtwork[];
  searchMuseums: PreviewMuseum[];
  searchExhibitions: PreviewExhibition[];
  aiArtworks: PreviewArtwork[];
  selectedArtworkIds: ReadonlySet<string>;
  toggleArtwork: (id: string) => void;
  communityCategory: string;
  setCommunityCategory: (value: string) => void;
  visiblePosts: PreviewPost[];
  exhibitionStatus: "all" | "ongoing" | "upcoming";
  setExhibitionStatus: (value: "all" | "ongoing" | "upcoming") => void;
  visibleExhibitions: PreviewExhibition[];
};
