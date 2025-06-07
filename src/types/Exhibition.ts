export type Artwork = {
  id: string;
  title: string;
};

export type ExhibitionItem = {
  id: string;
  name: string;          // 🔥 추가
  title: string;
  description: string;
  startDate: string;
  endDate: string;
  rooms?: {
    id: string;
    name: string;
    top: string;
    left: string;
    width: string;
    height: string;
  }[];
};

export type Exhibition = {
  id: string;
  name: string;
  slug: string;
  location: string;
  description: string;
  latitude: number;
  longitude: number;
  permanentExhibitions: ExhibitionItem[];
  temporaryExhibitions: ExhibitionItem[];
  pastExhibitions?: ExhibitionItem[];  // 🔥 추가
  representativeImage: string;         // 🔥 추가
  floorPlan: string;                   // 🔥 추가
  rooms: {
    [roomId: string]: Artwork[];
  };
};