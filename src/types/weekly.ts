export type PersonaId = 'yuna-choi' | 'marco-rinaldi' | 'anika-voss';

export type LensId = 'biographical' | 'thematic' | 'dialogue';

export type TriggerType = 'anniversary' | 'motif' | 'trend-google' | 'trend-naver';

export interface Trigger {
  type: TriggerType;
  value: string;            // human-readable label, e.g., "Vermeer · death 1675-12-15"
  source: string;           // file or URL identifying provenance
  similarity?: number;      // for trend triggers, the SigLIP cosine score
}

export interface WeeklyWork {
  position: number;                // 1-indexed
  role: 'hero' | 'standard';
  artwork_ref: string;             // `${collection}#${id}`
  artist: string;
  title: string;
  year: string;                    // raw `date` string from collection JSON
  image_url: string;
  source_collection: string;       // collection slug, e.g., 'aic-collection'
  source_url: string;
  lqip?: string;
  caption_en: string;
  caption_ko: string;
}

export interface WeeklyCard {
  id: string;                      // `${persona_id}__${lens}__${slug}`
  persona_id: PersonaId;
  lens: LensId;
  trigger: Trigger;
  score: number;                   // 0..1 quality score
  title_en: string;
  title_ko: string;
  intro_en: string;
  intro_ko: string;
  subtitle_chip: string;           // small ko chip under intro (e.g., "빛과 실내")
  works: WeeklyWork[];
  alternates: Array<Pick<WeeklyWork, 'position' | 'artwork_ref' | 'artist' | 'title' | 'year' | 'image_url' | 'source_collection' | 'source_url' | 'lqip'>>;
}

export interface WeeklyProposalFile {
  week: string;                    // `2026-W19`
  generated_at: string;            // ISO timestamp
  cards: WeeklyCard[];
}

export interface WeeklyPublishedFile extends Omit<WeeklyCard, 'alternates' | 'score'> {
  week: string;
  published_at: string;
  published_by: string;
}
