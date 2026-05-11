// Variant b — stub. Reason: a real SigLIP text encoder exists at
// `workers/siglip-encoder-space/app.py` (`POST /encode` on the HF Space),
// fronted by `workers/semantic-search` at
// https://armin-semantic-search.armin-art.workers.dev, but:
//   1. The Space URL is held only as a Cloudflare worker secret
//      (`SIGLIP_ENDPOINT_URL`), not in the repo or any local env.
//   2. The deployed worker only exposes consumer routes (/search-by-text,
//      /search-by-vector, …) — none return the raw query vector, so we
//      can't reach the encoder from this Node script without the secret.
//   3. Per the L3 (trends) spec, cards built on this stub must be marked
//      `score: 0` so they never pass the quality threshold in production.
// Replace with variant (a) once a public text→vector route exists (e.g.
// `POST /encode` on the semantic-search worker, or the HF Space URL
// promoted out of secrets).
import { createHash } from 'node:crypto';

const DIM = 768;

export async function encodeText(text: string): Promise<number[]> {
  const h = createHash('sha256').update(text).digest();
  const v = new Array<number>(DIM);
  for (let i = 0; i < DIM; i++) v[i] = (h[i % h.length] / 255) * 2 - 1;
  return v;
}
