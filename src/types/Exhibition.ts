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

// 임시전시 (진행중 / 예정) 타입
export interface TemporaryExhibition {
  id: string;
  title: string;
  titleKo?: string;
  description: string;
  startDate: string;        // ISO "2025-03-20" 또는 "ongoing"
  endDate: string;          // ISO "2026-06-28" 또는 "ongoing" 또는 "TBD"
  coverImage: string;       // 전시 포스터/표지 이미지 URL
  officialUrl?: string;
  admissionFee?: string;
  status: 'ongoing' | 'upcoming' | 'past';
  coverEmbedding?: number[]; // 768D SigLIP vector (배치 처리 후)
  embeddingUpdatedAt?: string;
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