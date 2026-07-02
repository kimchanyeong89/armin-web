# Embedding setup — SigLIP + Jina-CLIP (ready to run)

The image queues and both runner scripts are prepared. You run the GPU pass
and (for Jina) create the Vectorize index. Nothing else to wire up.

## What's ready

| | Encoder | Dim | Queue file | Count | Runner |
|---|---|---|---|---|---|
| **SigLIP** | `google/siglip-base-patch16-224` | 768 | `permanent_missing_pending.jsonl` | **413,989** (the new gap) | `scripts/run_siglip_missing_permanent.py` |
| **Jina-CLIP** | `jinaai/jina-clip-v2` | 1024 | `jina_missing_pending.jsonl` | **462,919** (48,965 old modal_embed remaining + 413,954 new) | `scripts/run_jina_clip_missing_permanent.py` |

Jina already embedded ~565k via `scripts/modal_embed/` (Modal); this queue is ONLY the gap (its leftover `remaining.jsonl` + the new collections), NOT the full corpus.

Both queues are one JSON object per line: `{"id", "e": exhibition_id, "i": image_url}`.
Regenerate any time after new scrapes:

```bash
# SigLIP gap (cross-refs siglip_processed_ids.txt)
python3 scripts/build_permanent_missing.py
# Jina gap = modal_embed/remaining.jsonl (old) + permanent_missing_pending.jsonl (new).
# Jina's ~565k done live in scripts/modal_embed/ (Modal pipeline), not jina_processed_ids.txt.
```

Both runners share the same safety guarantees: vector → disk **before** the id is
marked processed, resumable (skip already-done ids), failed uploads queued for
replay, all writes lock-guarded. Re-running is a no-op for finished items.

## 1) SigLIP — embed the 413,989 new works (existing pipeline)

Already wired to the live index (`armin-semantic-search` Worker `/upsert`, 768-dim).
Run on a GPU (Colab `Colab_SigLIP_768_Embedding.ipynb`, Modal, or local):

```bash
python3 scripts/run_siglip_missing_permanent.py
```

## 2) Jina-CLIP — new (you provide one Cloudflare index + Worker route)

**a. Create a 1024-dim Vectorize index** (do NOT reuse the 768-dim SigLIP one):

```bash
npx wrangler vectorize create armin-jina-clip --dimensions=1024 --metric=cosine
```

**b. Add a `/upsert` Worker route** that writes to it (clone the existing
`armin-semantic-search` Worker, bind the new index, same `{vectors:[{id,values,metadata}]}`
body the SigLIP path already posts). Note its URL.

**c. Run the embedder** (GPU; `pip install -U "transformers>=4.44" timm einops pillow requests torch`):

```bash
JINA_UPSERT_URL="https://<your-jina-worker>/upsert" \
  python3 scripts/run_jina_clip_missing_permanent.py
# smoke test first:  add  --limit 50
# embed-to-disk only (upload later): add  --no-upload   → embedding_results/jina_clip_*.jsonl
```

Tunables (env): `JINA_DIM` (Matryoshka truncate, default 1024), `JINA_GPU_BATCH` (8),
`JINA_UPLOAD_BATCH` (50), `JINA_PENDING` (queue file), `JINA_MODEL_ID`.

### Notes
- **Scale:** 462,919 Jina images is the remaining gap. To match SigLIP's scope first
  (just the new works), run with `JINA_PENDING=permanent_missing_pending.jsonl`
  (413,989) and expand to the full corpus later.
- **Modality gap (both encoders):** text→image queries must be caption-wrapped
  ("a painting of X") or results are noise; image→image is unaffected. The app's
  search worker already does this for SigLIP — replicate it for the Jina route.
- Outputs never overwrite each other: SigLIP → `siglip_processed_ids.txt`,
  Jina → `jina_processed_ids.txt` + `embedding_results/jina_clip_*.jsonl`.
