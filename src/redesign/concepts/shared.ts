import type { PreviewView } from "../model";

export const VIEW_COPY: Record<PreviewView, { title: string; body: string }> = {
  home: {
    title: "Museums, mapped by what is on view.",
    body: "Move from a city to an exhibition, then stay with the work that brought you there.",
  },
  search: {
    title: "Search across the collection.",
    body: "Find a work, artist, museum, or exhibition without losing the visual context.",
  },
  ai: {
    title: "Choose what holds your attention.",
    body: "Select three works. COLLY builds a quiet route through related images and artists.",
  },
  community: {
    title: "Notes from people who went.",
    body: "Read reviews, practical questions, and conversations attached to real visits.",
  },
  exhibitions: {
    title: "Open now and opening next.",
    body: "A current view of exhibitions with the dates, place, and artwork kept legible.",
  },
  profile: {
    title: "Your collection, held in one place.",
    body: "Saved works become a personal exhibition instead of a list of disconnected likes.",
  },
  work: {
    title: "Stay with one work.",
    body: "Image, maker, date, museum, and related works share one uninterrupted reading path.",
  },
  artist: {
    title: "See the artist through the work.",
    body: "The archive starts with images, then gives dates and museum context room to breathe.",
  },
  exhibition: {
    title: "Plan the visit from the art.",
    body: "The exhibition image leads. Dates, place, description, and included works follow.",
  },
};

export const SEARCH_SCOPES = ["all", "artworks", "museums", "exhibitions"] as const;
export const EXHIBITION_STATUSES = ["all", "ongoing", "upcoming"] as const;

export function formatDateRange(startDate: string, endDate: string): string {
  if (!startDate && !endDate) return "Dates to be announced";
  const formatter = new Intl.DateTimeFormat("en", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
  const format = (value: string) => {
    const parsed = new Date(`${value}T00:00:00Z`);
    return Number.isNaN(parsed.getTime()) ? value : formatter.format(parsed);
  };
  if (!endDate || startDate === endDate) return format(startDate || endDate);
  return `${format(startDate)} - ${format(endDate)}`;
}

export function formatPostDate(date: Date): string {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
  }).format(date);
}
