import { exhibitions as sourceMuseums } from "../data/exhibitions.ts";
import { SAMPLE_COMMUNITY_POSTS } from "../data/sampleCommunityPosts";
import type { Exhibition, ExhibitionItem } from "../types/Exhibition";

type RichExhibitionItem = ExhibitionItem & {
  titleKo?: string;
  coverImage?: string;
  detailedDescription?: string;
  fullDescription?: string;
  status?: "ongoing" | "upcoming" | "past";
  url?: string;
};

type RichMuseum = Exhibition & {
  name_ko?: string;
  description_ko?: string;
  country?: string;
};

export type PreviewMuseum = {
  id: string;
  name: string;
  nameKo?: string;
  location: string;
  country: string;
  description: string;
  image: string;
  latitude: number;
  longitude: number;
  exhibitionCount: number;
};

export type PreviewArtwork = {
  id: string;
  title: string;
  artist: string;
  year: number | null;
  image: string;
  description: string;
  museumId: string;
  museumName: string;
  exhibitionId: string;
  exhibitionTitle: string;
};

export type PreviewExhibition = {
  id: string;
  title: string;
  titleKo?: string;
  museumId: string;
  museumName: string;
  location: string;
  description: string;
  startDate: string;
  endDate: string;
  status: "ongoing" | "upcoming" | "past" | "permanent";
  image: string;
  artworks: PreviewArtwork[];
};

export type PreviewArtist = {
  id: string;
  name: string;
  works: PreviewArtwork[];
  museumNames: string[];
  yearRange: string;
};

export type PreviewPost = {
  id: string;
  title: string;
  category: string;
  authorName: string;
  authorRank: string;
  authorImage: string;
  createdAt: Date;
  likes: number;
  commentCount: number;
  summary: string;
  subject: string;
  image: string;
};

export type PreviewData = {
  museums: PreviewMuseum[];
  exhibitions: PreviewExhibition[];
  artworks: PreviewArtwork[];
  artists: PreviewArtist[];
  posts: PreviewPost[];
  featuredMuseum: PreviewMuseum;
  featuredExhibition: PreviewExhibition;
  featuredArtwork: PreviewArtwork;
  featuredArtist: PreviewArtist;
};

function normalizeImage(value: unknown): string {
  const image = typeof value === "string" ? value.trim() : "";
  if (!image) return "";
  if (/^(https?:|data:|\/)/.test(image)) return image;
  return `/${image.replace(/^\.\//, "")}`;
}

function cleanText(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#8217;|&rsquo;/gi, "’")
    .replace(/&#8211;|&ndash;/gi, "-")
    .replace(/[—–]/g, "-")
    .replace(/\*\*|__/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function requireFirst<T>(items: T[], label: string): T {
  const first = items[0];
  if (!first) throw new Error(`COLLY preview requires at least one ${label} record.`);
  return first;
}

function makeArtwork(
  raw: NonNullable<RichExhibitionItem["artworks"]>[number],
  museum: PreviewMuseum,
  exhibitionId: string,
  exhibitionTitle: string,
): PreviewArtwork | null {
  const richRaw = raw as typeof raw & { title?: string; artistName?: string };
  const image = normalizeImage(raw.image || raw.thumb || raw.imageLocal);
  const title = cleanText(raw.name || richRaw.title);
  const artist = cleanText(raw.artist || richRaw.artistName);
  if (!image || !title || !artist) return null;

  return {
    id: String(raw.id || `${exhibitionId}-${title}`),
    title,
    artist,
    year: Number.isFinite(Number(raw.year)) ? Number(raw.year) : null,
    image,
    description: cleanText(raw.description),
    museumId: museum.id,
    museumName: museum.name,
    exhibitionId,
    exhibitionTitle,
  };
}

function statusRank(status: PreviewExhibition["status"]): number {
  if (status === "ongoing") return 0;
  if (status === "upcoming") return 1;
  if (status === "permanent") return 2;
  return 3;
}

export function createPreviewData(): PreviewData {
  const richMuseums = sourceMuseums as RichMuseum[];
  const museums: PreviewMuseum[] = richMuseums
    .map((museum) => {
      const locationParts = museum.location.split(",");
      const fallbackCountry = locationParts[locationParts.length - 1]?.trim() || "";
      return {
      id: museum.id,
      name: cleanText(museum.name),
      nameKo: cleanText(museum.name_ko) || undefined,
      location: cleanText(museum.location),
      country: cleanText(museum.country || fallbackCountry),
      description: cleanText(museum.description_ko || museum.description),
      image: normalizeImage(museum.representativeImage),
      latitude: museum.latitude,
      longitude: museum.longitude,
      exhibitionCount:
        museum.permanentExhibitions.length +
        museum.temporaryExhibitions.length +
        (museum.pastExhibitions?.length || 0),
      };
    })
    .filter((museum) => museum.image)
    .sort((a, b) => b.exhibitionCount - a.exhibitionCount || a.name.localeCompare(b.name));

  const museumById = new Map(museums.map((museum) => [museum.id, museum]));
  const exhibitionRecords: PreviewExhibition[] = [];

  for (const sourceMuseum of richMuseums) {
    const museum = museumById.get(sourceMuseum.id);
    if (!museum) continue;

    const buckets: Array<{
      items: RichExhibitionItem[];
      defaultStatus: PreviewExhibition["status"];
    }> = [
      { items: sourceMuseum.temporaryExhibitions as RichExhibitionItem[], defaultStatus: "ongoing" },
      { items: sourceMuseum.permanentExhibitions as RichExhibitionItem[], defaultStatus: "permanent" },
      { items: (sourceMuseum.pastExhibitions || []) as RichExhibitionItem[], defaultStatus: "past" },
    ];

    for (const bucket of buckets) {
      for (const raw of bucket.items) {
        const title = cleanText(raw.title || raw.name);
        const image = normalizeImage(raw.coverImage || raw.image || museum.image);
        if (!title || !image) continue;

        const artworks = (raw.artworks || [])
          .map((artwork) => makeArtwork(artwork, museum, raw.id, title))
          .filter((artwork): artwork is PreviewArtwork => artwork !== null);

        exhibitionRecords.push({
          id: raw.id,
          title,
          titleKo: cleanText(raw.titleKo) || undefined,
          museumId: museum.id,
          museumName: museum.name,
          location: museum.location,
          description: cleanText(raw.fullDescription || raw.detailedDescription || raw.description),
          startDate: cleanText(raw.startDate),
          endDate: cleanText(raw.endDate),
          status: raw.status || bucket.defaultStatus,
          image,
          artworks,
        });
      }
    }
  }

  const exhibitions = exhibitionRecords.sort(
    (a, b) => statusRank(a.status) - statusRank(b.status) || a.title.localeCompare(b.title),
  );
  const artworks = exhibitions.flatMap((exhibition) => exhibition.artworks);
  const artistGroups = new Map<string, PreviewArtwork[]>();

  for (const artwork of artworks) {
    const group = artistGroups.get(artwork.artist) || [];
    group.push(artwork);
    artistGroups.set(artwork.artist, group);
  }

  const artists: PreviewArtist[] = Array.from(artistGroups, ([name, works]) => {
    const years = works
      .map((work) => work.year)
      .filter((year): year is number => year !== null)
      .sort((a, b) => a - b);
    const firstYear = years[0];
    const lastYear = years[years.length - 1];
    const yearRange = firstYear
      ? firstYear === lastYear
        ? String(firstYear)
        : `${firstYear}-${lastYear}`
      : "Date unknown";

    return {
      id: name,
      name,
      works,
      museumNames: Array.from(new Set(works.map((work) => work.museumName))),
      yearRange,
    };
  }).sort((a, b) => b.works.length - a.works.length || a.name.localeCompare(b.name));

  const posts: PreviewPost[] = SAMPLE_COMMUNITY_POSTS.map((post) => ({
    id: post.id,
    title: cleanText(post.title),
    category: cleanText(post.category),
    authorName: cleanText(post.authorName),
    authorRank: cleanText(post.authorRank || "Member"),
    authorImage: normalizeImage(post.authorPhotoURL),
    createdAt: post.createdAt,
    likes: post.likes,
    commentCount: post.commentCount,
    summary: cleanText(post.contentSnippet),
    subject: cleanText(post.header.name),
    image: normalizeImage(post.header.image),
  }));

  const featuredArtist =
    artists.find((artist) => artist.name === "Anna Ancher") ||
    artists.find((artist) => !/^unknown/i.test(artist.name) && artist.works.length >= 3) ||
    requireFirst(artists, "artist");
  const featuredArtwork = requireFirst(featuredArtist.works, "artwork");
  const featuredExhibition =
    exhibitions.find((exhibition) => exhibition.id === featuredArtwork.exhibitionId) ||
    requireFirst(exhibitions, "exhibition");
  const featuredMuseum =
    museums.find((museum) => museum.id === featuredExhibition.museumId) ||
    requireFirst(museums, "museum");

  return {
    museums,
    exhibitions,
    artworks,
    artists,
    posts,
    featuredMuseum,
    featuredExhibition,
    featuredArtwork,
    featuredArtist,
  };
}

export function selectPreviewArtwork(data: PreviewData, id?: string): PreviewArtwork {
  return data.artworks.find((artwork) => artwork.id === id) || data.featuredArtwork;
}

export function selectPreviewArtist(data: PreviewData, id?: string): PreviewArtist {
  return data.artists.find((artist) => artist.id === id) || data.featuredArtist;
}

export function selectPreviewExhibition(data: PreviewData, id?: string): PreviewExhibition {
  return data.exhibitions.find((exhibition) => exhibition.id === id) || data.featuredExhibition;
}

export function getGlobeMuseums(data: PreviewData): PreviewMuseum[] {
  const museumIds = new Set(data.exhibitions.map((exhibition) => exhibition.museumId));
  return data.museums.filter(
    (museum) =>
      Number.isFinite(museum.latitude) &&
      Number.isFinite(museum.longitude) &&
      museumIds.has(museum.id),
  );
}

export type ExhibitionModalWorks = {
  exhibition: PreviewExhibition;
  works: PreviewArtwork[];
  source: "exhibition" | "museum" | "empty";
};

export function getExhibitionModalWorks(
  data: PreviewData,
  exhibitionId: string,
): ExhibitionModalWorks | null {
  const exhibition = data.exhibitions.find((item) => item.id === exhibitionId);
  if (!exhibition) return null;
  if (exhibition.artworks.length) {
    return { exhibition, works: exhibition.artworks, source: "exhibition" };
  }

  const museumWorks = data.artworks
    .filter((artwork) => artwork.museumId === exhibition.museumId)
    .slice(0, 24);
  return {
    exhibition,
    works: museumWorks,
    source: museumWorks.length ? "museum" : "empty",
  };
}
