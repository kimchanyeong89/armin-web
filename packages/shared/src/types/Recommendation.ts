export type RecommendationMode = "taste" | "random";

export type RecommendationSeed = {
  id: string;
  title?: string;
  artist?: string;
  image?: string;
};

export type RecommendedArtwork = {
  id: string;
  name?: string;
  title?: string;
  artist?: string;
  image?: string;
  score?: number;
  finalScore?: number;
  museumName?: string;
  exhibitionName?: string;
  source?: string;
  [key: string]: unknown;
};

export type RecommendationResponse = {
  results: RecommendedArtwork[];
};
