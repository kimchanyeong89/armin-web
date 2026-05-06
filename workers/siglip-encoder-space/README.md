---
title: SigLIP Text + Image Encoder
emoji: 🔍
colorFrom: gray
colorTo: gray
sdk: docker
app_port: 7860
pinned: false
---

# SigLIP Text + Image Encoder

Tiny FastAPI server that exposes `google/siglip-base-patch16-224` as a 768-dim
text + image encoding endpoint. Used by the Armin semantic-search Cloudflare
Worker.

## Endpoints

```
GET  /              health check (also lists endpoints + auth requirement)
POST /encode        { "text": "pigeon" }                    → { "vector": [768 floats], "model": "..." }
POST /encode-image  { "image_url": "https://..." }          → { "vector": [768 floats], "model": "...", "image_size": [w,h] }
```

`/encode-image` fetches the image server-side (so it must be publicly reachable
from the Space — R2 public buckets work) and runs it through
`SiglipModel.get_image_features()`. Used by the worker's `/encode-and-upsert` to
back-fill artworks whose original IDs were too long for Vectorize (>64 bytes).

## Deploy on HuggingFace Spaces (free CPU)

1. Create a new Space → SDK = **Docker** → Hardware = **CPU basic (free)**.
2. Upload `Dockerfile`, `requirements.txt`, `app.py`, and this `README.md`.
3. (Optional) Settings → Variables and Secrets → add `SIGLIP_ENCODER_TOKEN` = some random string.
4. Wait for the build (~10 min — torch is large).
5. Test:
   ```
   curl -X POST https://<your-username>-<space-name>.hf.space/encode \
     -H "Content-Type: application/json" \
     -d '{"text":"pigeon"}'

   curl -X POST https://<your-username>-<space-name>.hf.space/encode-image \
     -H "Content-Type: application/json" \
     -d '{"image_url":"https://upload.wikimedia.org/wikipedia/commons/thumb/4/47/PNG_transparency_demonstration_1.png/280px-PNG_transparency_demonstration_1.png"}'
   ```

### Re-deploying after adding /encode-image

If your Space already has the text-only build, push the updated `app.py` +
`requirements.txt` (now includes `Pillow` and `requests`) to the Space repo.
HuggingFace will rebuild automatically (~5-10 min for the requirement diff).

## Wire into the worker

```
cd workers/semantic-search
echo "https://<your-username>-<space-name>.hf.space" | npx wrangler secret put SIGLIP_ENDPOINT_URL
# (only if you set a token in step 3)
echo "<token>" | npx wrangler secret put SIGLIP_ENDPOINT_TOKEN
npx wrangler deploy
```

## Notes

- Free CPU Spaces sleep after 48h of no traffic. First request after sleep takes ~30-60s.
- The worker has a KV query cache (7-day TTL), so repeat queries don't hit the Space at all.
- Cold-start latency is the only downside; consider HF PRO ($9/mo) to keep the Space always-on.
