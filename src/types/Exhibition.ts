export type ExhibitionItem = {
  id: string;
  title: string;
  description: string;
  startDate: string;
  endDate: string;
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
};