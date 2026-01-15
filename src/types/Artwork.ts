


export type Artwork = {
  id: string;
  name: string;
  artist: string;
  year: number;
  image: string;
  // 고해상도 원본 (image) 외에 최적화 파이프라인에서 추가될 파생 필드들
  thumb?: string;    // 아주 작은 썸네일 (예: 120~200w)
  lq?: string;       // 블러/LQIP 용 중간 저품질 (예: 400w, quality 20~30)
  variants?: {
    // 사전 생성된 width 세트 (jpg/webp/avif). 키는 포맷, 값은 넓이별 URL 매핑
    webp?: Record<string, string>; // width -> url
    avif?: Record<string, string>;
    jpg?: Record<string, string>;
  };
  imageLocal?: string;
  roomId: string;
  exhibitionName: string;
  exhibitionTitle: string;
  date?: string;
  dimension?: string;
  sourceUrl?: string;
  createdAt?: any;
  type?: '2D' | '3D' | 'video' | 'unknown';  // 작품 유형 (2D: 회화/사진, 3D: 조각/유물, video: 영상)
  isArchival?: boolean;  // 아카이브 자료 여부
  onView?: boolean;      // 작품 전시 여부 (true: 현재 전시 중)
  // 영상 컨텐츠 지원
  duration?: string;     // 영상 작품 재생 시간 (예: "4 minutes 29 secondes")
  medium?: string;       // 기법/매체 (예: "Film 16 mm couleur, sonore")
  technique?: string;    // 기법 (alternative to medium)
  materials?: string;    // 재료 (alternative to medium)
  category?: string;     // 작품 분류 (예: "Painting", "Sculpture")
  artworkType?: string;  // 작품 유형 (alternative to category)
  description?: string;  // 설명/텍스트
  categories?: string[]; // 사이트 내 카테고리/태그 (예: On view, Site-specific)
  metadata?: Record<string, string>; // 라벨 기반 추가 메타데이터
  location?: string;     // 전시 위치/갤러리 등
  youtubeId?: string;    // YouTube 영상 ID (11자)
  mediaType?: 'image' | 'video';  // 미디어 타입
};