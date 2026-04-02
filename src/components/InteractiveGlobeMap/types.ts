import type { Exhibition as OriginalExhibition } from "../../types/Exhibition";

export type Theme = "dark" | "light";

export interface InteractiveExhibition {
    id: string;
    title: string;
    period: string;
    type: "permanent" | "current" | "upcoming";
}

export interface Venue {
    id: string; // Original exhibition ID
    name: string;
    year: string;
    category: "bauhaus" | "design" | "architecture";
    museumCity?: string;
    latitude?: number;
    longitude?: number;
    architect?: string;
    artworkCount: number; // Actual artwork count from collection files
    exhibitions: InteractiveExhibition[];
    originalExhibition: OriginalExhibition; // Keep a reference for selection
}

export interface CityMarker {
    city: string;
    coordinates: [number, number];
    country: string;
    detail?: boolean;
    venues: Venue[];
    artworkCount?: number;
}
