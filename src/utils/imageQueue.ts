// Simple global concurrency limiter for image loading
import { shouldLimitNetwork } from './network';

let inflight = 0;
const waiters: Array<() => void> = [];
const MAX_CONCURRENT = shouldLimitNetwork() ? 2 : 4; // tuneable per host

export function acquireSlot(): Promise<void> {
  if (inflight < MAX_CONCURRENT) {
    inflight += 1;
    return Promise.resolve();
  }
  return new Promise((resolve) => waiters.push(() => {
    inflight += 1;
    resolve();
  }));
}

export function releaseSlot(): void {
  inflight = Math.max(0, inflight - 1);
  const next = waiters.shift();
  if (next) next();
}

export async function prefetchImage(url: string): Promise<void> {
  try {
    await acquireSlot();
    await new Promise<void>((resolve, reject) => {
      const img = new Image();
      img.decoding = 'async' as any;
      img.loading = 'eager' as any;
      img.fetchPriority = 'low' as any;
      img.onload = () => resolve();
      img.onerror = () => reject();
      img.src = url;
    });
  } catch {
    // ignore
  } finally {
    releaseSlot();
  }
}
