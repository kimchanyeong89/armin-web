# Missing-permanent embeddings: how this works

This pair of scripts fills a specific gap: **artworks that live inside a
`permanentExhibitions[]` entry of `src/data/exhibitions.js` but have NOT
been embedded into the SigLIP vector store.**

It exists because earlier embedding runs (`run_siglip_fast.py`,
`run_siglip_targeted.py`) drove themselves from a curated list of
exhibition IDs. Any permanent exhibition missing the `collectionFile`
field — most notably **Musée d'Orsay** — was silently skipped, so the
worker has no vectors for those works and the AI/Similar-Works panel
falls back to metadata-related items.

## The two scripts

### 1. `scripts/build_permanent_missing.py`

Parses every `permanentExhibitions: [...]` block in `exhibitions.js`,
resolves a collection JSON for each entry (uses `collectionFile` if
present, otherwise falls back to `{exh_id}.json`), enumerates the items,
computes the same vector-store ID as the frontend, and diffs against the
master `siglip_processed_ids.txt`.

Outputs:
- **`PERMANENT_MISSING.md`** — the human report (per-collection table).
- **`permanent_missing_pending.jsonl`** — one record per missing item:
  `{"id": "...", "e": "<exhibition_id>", "i": "<image_url>"}`.

Re-run anytime you want to refresh the pending list (e.g. after a new
collection JSON drops, or after a partial embedding run finishes).

```bash
python3 scripts/build_permanent_missing.py
```

### 2. `scripts/run_siglip_missing_permanent.py`

Reads `permanent_missing_pending.jsonl`, downloads each image, encodes
with `google/siglip-base-patch16-224`, writes the vector to disk, then
upserts to the Cloudflare worker.

```bash
/usr/local/bin/python3.10 scripts/run_siglip_missing_permanent.py
```

## Save guarantees ("nothing gets lost")

The pipeline is intentionally redundant so that a process crash, network
hiccup, or worker outage never destroys an embedding:

| Step | What happens | If interrupted here |
|------|--------------|---------------------|
| 1. Image fetch | Threaded download with retries | Logged to `siglip_failed_missing_permanent.jsonl`; ID still added to processed list so future runs skip it. |
| 2. SigLIP encode | Batched on MPS/CUDA (size 4) | GPU error logs the whole batch to the failed JSONL. Vector is **not** written, and the IDs are still added to processed (won't retry). |
| 3. Disk write | Append to `embedding_results/siglip_missing_permanent_embeddings.jsonl` (file-locked) | If we crash during the write, the worst case is a half-written final line. The JSONL reader tolerates that — only earlier complete lines are loaded next run. |
| 4. Mark processed | Append ID to `siglip_processed_ids.txt` | Always done **after** the disk write of the vector. If we crash between 3 and 4, the embedding is on disk but the ID isn't marked processed → next run will re-fetch & re-embed (cost: one duplicate). |
| 5. Cloudflare upsert | Batch of 50 | If upload fails, vectors stay safe on disk and get logged to `siglip_upload_retry_missing.jsonl` for later replay. **No data loss.** |

So at every point, the worst outcome of a crash is "a few items get
re-embedded" — never "an embedding disappears".

## Resuming

Both scripts are idempotent. Re-running after a crash:

1. `siglip_processed_ids.txt` is read on startup → already-done IDs are
   filtered out of the pending queue.
2. The state file (`siglip_state_missing_permanent.json`) tracks running
   totals so the dashboard reflects cumulative progress.
3. The dashboard markdown (`MISSING_EMBEDDING_PROGRESS.md`) is rewritten
   every 100 items.

## Replaying upload failures

If the Cloudflare worker was down during a run, `siglip_upload_retry_missing.jsonl`
will accumulate vector records. To replay them:

```bash
python3 scripts/upload_to_vectorize.py \
  --jsonl siglip_upload_retry_missing.jsonl \
  --worker https://armin-semantic-search.armin-art.workers.dev
```

Once successfully uploaded, you can delete or rotate the file.

## Files this run touches (write/append only — no destructive ops)

- `permanent_missing_pending.jsonl` — written by `build_permanent_missing.py`
- `embedding_results/siglip_missing_permanent_embeddings.jsonl` — vectors
- `siglip_processed_ids.txt` — appended (shared with all SigLIP scripts)
- `siglip_failed_missing_permanent.jsonl` — fetch / GPU failures
- `siglip_upload_retry_missing.jsonl` — Cloudflare upload failures
- `siglip_state_missing_permanent.json` — running totals
- `MISSING_EMBEDDING_PROGRESS.md` — live dashboard
- `PERMANENT_MISSING.md` — table report (overwritten each `build_*` run)

## Environment requirements

- **Python 3.10+** with `torch`, `transformers`, `Pillow`, `requests`
  (the host machine has `/usr/local/bin/python3.10` with torch 2.9.1 +
  MPS — verified working).
- Network access to `armin-semantic-search.armin-art.workers.dev` and to
  every artwork's image CDN (R2, museum CDNs, etc.).
- ~2 GB free disk for incremental output.
- GPU/MPS recommended; CPU fallback works but is ~10× slower.

No additional secrets / API keys are needed — the Cloudflare worker
handles Vectorize auth on its own.

## Expected runtime

At the historically-observed rate of ~10 items/sec on Apple-Silicon MPS,
the current 20,695-item queue takes ~35 minutes wall-clock. Scales
roughly linearly with queue size; the bottleneck is image fetch (network)
on most collections, GPU on Pompidou (R2-hosted images are very fast).
