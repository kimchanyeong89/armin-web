import { getWorkerNetworkMode } from './network';

let sharedSearchWorker: Worker | null = null;
let hasRequestedLoad = false;

export const ensureSharedSearchWorkerLoaded = (): Worker | null => {
  if (typeof window === 'undefined') return null;

  if (!sharedSearchWorker) {
    sharedSearchWorker = new Worker(new URL('../workers/search.worker.ts', import.meta.url), { type: 'module' });
  }

  sharedSearchWorker.postMessage({ type: 'SET_MODE', mode: getWorkerNetworkMode() });

  if (!hasRequestedLoad) {
    hasRequestedLoad = true;
    sharedSearchWorker.postMessage({ type: 'LOAD' });
  }

  return sharedSearchWorker;
};
