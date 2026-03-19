export type NetworkMode = {
  cacheBust: boolean;
  maxConcurrency: number;
};

export const isLikelyMobileDevice = (): boolean => {
  if (typeof window === 'undefined') return false;
  try {
    const ua = navigator.userAgent || '';
    const mobileUa = /Mobi|Android|iPhone|iPad|iPod|Opera Mini|IEMobile/i.test(ua);
    const coarsePointer = typeof window.matchMedia === 'function'
      ? window.matchMedia('(pointer: coarse)').matches
      : false;
    const narrowViewport = window.innerWidth < 1024;
    return mobileUa || (coarsePointer && narrowViewport);
  } catch {
    return window.innerWidth < 768;
  }
};

export const shouldLimitNetwork = (): boolean => {
  if (typeof navigator === 'undefined') return false;
  const conn = (navigator as any).connection;
  const saveData = conn?.saveData === true;
  const effectiveType = (conn?.effectiveType || '') as string;
  const slow = /2g/i.test(effectiveType) || /3g/i.test(effectiveType);
  return saveData || slow || isLikelyMobileDevice();
};

export const getWorkerNetworkMode = (): NetworkMode => {
  const constrained = shouldLimitNetwork();
  return {
    cacheBust: !constrained,
    maxConcurrency: constrained ? 2 : 6,
  };
};

export const getDataFetchOptions = (): RequestInit => {
  const constrained = shouldLimitNetwork();
  return constrained ? { cache: 'force-cache' } : { cache: 'no-store' };
};
