import type { Artwork } from "./Artwork";

// ExhibitionItem 타입 정의
export interface ExhibitionItem {
  id: string;
  name: string;
  title: string;
  description: string;
  startDate: string;
  endDate: string;
  image?: string;
  url?: string;
  artworks?: Artwork[];
  rooms?: {
    id: string;
    name: string;
    top: string;
    left: string;
    width: string;
    height: string;
  }[];
}

// (중복 ExhibitionItem 타입 제거)

export interface Exhibition {
  id: string;
  name: string;
  slug: string;
  location: string;
  description: string;
  latitude: number;
  longitude: number;
  permanentExhibitions: ExhibitionItem[];
  temporaryExhibitions: ExhibitionItem[];
  pastExhibitions?: ExhibitionItem[];
  representativeImage: string;
  floorPlan: string;
  rooms: {
    [roomId: string]: Artwork[];
  };
}