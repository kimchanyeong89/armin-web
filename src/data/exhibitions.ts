import { exhibitions as exhibitionsData } from "./exhibitions.js";
import type { Exhibition } from "../types/Exhibition";
export const exhibitions: Exhibition[] = exhibitionsData as unknown as Exhibition[];
export type { Exhibition } from "../types/Exhibition";