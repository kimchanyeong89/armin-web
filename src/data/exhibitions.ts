import { exhibitions as exhibitionsData } from "./exhibitions.js";
import type { Exhibition, ExhibitionItem } from "../types/Exhibition";
// Note: Do not resolve public asset URLs here. Keep plain paths like "/images/..."
// and let UI components call publicUrl() at render time to respect base href/BASE_URL.

// lightweight slugify for names
function slugify(input: string) {
	return (input || "")
		.toLowerCase()
		.replace(/\s+/g, "-")
		.replace(/[^a-z0-9\-]/g, "")
		.replace(/-+/g, "-")
		.replace(/^-|-$|/g, "");
}

// Normalize partial objects into full Exhibition shape
function normalize(obj: any): Exhibition {
	const pick = (val: any, dflt: string) => (typeof val === 'string' && val.trim()) || dflt;
	const rawRep = pick(obj.representativeImage, "/images/meta-header.svg");

	const permanent: ExhibitionItem[] = Array.isArray(obj.permanentExhibitions) ? obj.permanentExhibitions : [];
	const temporary: ExhibitionItem[] = Array.isArray(obj.temporaryExhibitions) ? obj.temporaryExhibitions : [];
	const past: ExhibitionItem[] | undefined = Array.isArray(obj.pastExhibitions) ? obj.pastExhibitions : [];

	const rooms = obj.rooms && typeof obj.rooms === "object" ? obj.rooms : {};
	const name: string = obj.name || "Untitled";
	const id: string = obj.id || slugify(name);
	const location: string = obj.location || obj.address || "";
	const floorPlan: string = typeof obj.floorPlan === "string" ? obj.floorPlan : "";

	return {
		id,
		name,
		slug: obj.slug || slugify(name),
		location,
		description: obj.description || "",
		latitude: Number(obj.latitude) || 0,
		longitude: Number(obj.longitude) || 0,
		permanentExhibitions: permanent,
		temporaryExhibitions: temporary,
		pastExhibitions: past,
		representativeImage: rawRep,
		floorPlan,
		rooms,
	};
}

export const exhibitions: Exhibition[] = (exhibitionsData as unknown as Exhibition[])
	.map(normalize);

export type { Exhibition } from "../types/Exhibition";