import { useEffect } from 'react';
import { prefetchImage } from '../utils/imageQueue';

// Session-level simple cache to avoid re-prefetching identical URLs repeatedly
const seen = new Set<string>();

/**
 * Prefetch adjacent (neighbor) high-res images around the current index to make next/prev navigation instant.
 * radius=1 prefetches index-1 and index+1; can be increased (keep small for bandwidth).
 */
export function usePrefetchNeighbors<T extends { image?: string | null }>(
  list: T[],
  index: number,
  radius: number = 1
) {
  useEffect(() => {
    if (!Array.isArray(list) || list.length === 0) return;
    const targets: number[] = [];
    for (let r = 1; r <= radius; r++) {
      const left = index - r;
      const right = index + r;
      if (left >= 0) targets.push(left);
      if (right < list.length) targets.push(right);
    }
    // Deduplicate
    const uniq = Array.from(new Set(targets));
    uniq.forEach(i => {
      const img = list[i]?.image;
      if (img && !seen.has(img)) {
        seen.add(img);
        prefetchImage(img).catch(()=>{});
      }
    });
  }, [list, index, radius]);
}
