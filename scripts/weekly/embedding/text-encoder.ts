// Variant a — live. Calls ARMIN's semantic-search worker at POST /encode.
// The worker reads its SIGLIP_ENDPOINT_URL secret and proxies to the HF Space,
// keeping the encoder URL private. Falls back to a deterministic pseudo-vector
// only when the worker is unreachable (offline tests, pre-deploy, transient
// network), so the pipeline keeps running with L3-trend cards scored low
// instead of crashing.
import { createHash } from 'node:crypto';

const ENDPOINT = process.env.SIGLIP_ENCODE_ENDPOINT
  ?? 'https://armin-semantic-search.armin-art.workers.dev/encode';
const DIM = 768;

export async function encodeText(text: string): Promise<number[]> {
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) return deterministicFallback(text);
    const data = (await res.json()) as { vector?: number[] };
    if (!Array.isArray(data.vector) || data.vector.length === 0) {
      return deterministicFallback(text);
    }
    return data.vector;
  } catch {
    return deterministicFallback(text);
  }
}

function deterministicFallback(text: string): number[] {
  // Used only when the worker route is unreachable. Same hashing as the
  // previous unconditional stub so unit tests stay deterministic and
  // offline-safe.
  const h = createHash('sha256').update(text).digest();
  const v = new Array<number>(DIM);
  for (let i = 0; i < DIM; i++) v[i] = (h[i % h.length] / 255) * 2 - 1;
  return v;
}
