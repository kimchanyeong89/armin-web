"""
SigLIP text + image encoder — minimal FastAPI server for HuggingFace Spaces (CPU free tier).

Endpoints:
    GET  /              - health check
    POST /encode        - { "text": str }       →  { "vector": [768 floats], "model": "..." }
    POST /encode-image  - { "image_url": str }  →  { "vector": [768 floats], "model": "..." }

Designed to be called from the Cloudflare semantic-search worker. /encode-image is
used by the worker's /encode-and-upsert endpoint to embed artworks whose original IDs
are too long for Vectorize (>64 bytes); the image vector lets us re-embed them under
a deterministic short alias without losing semantic search coverage.

Optional auth: set the SIGLIP_ENCODER_TOKEN environment variable in the Space settings,
then the same value as SIGLIP_ENDPOINT_TOKEN in the worker. If unset, both endpoints
are open.
"""
import os
import time
from contextlib import asynccontextmanager
from io import BytesIO

import requests
import torch
from fastapi import FastAPI, Header, HTTPException
from PIL import Image
from pydantic import BaseModel
from transformers import AutoModel, AutoProcessor, AutoTokenizer

MODEL_ID = "google/siglip-base-patch16-224"
EXPECTED_DIM = 768
AUTH_TOKEN = os.environ.get("SIGLIP_ENCODER_TOKEN", "").strip()
IMAGE_FETCH_TIMEOUT = 30
IMAGE_FETCH_HEADERS = {
    "User-Agent": "armin-siglip-encoder/1.0 (+https://github.com/kimchanyeong89/armin-web)",
}

# Loaded once at startup
state = {"tokenizer": None, "processor": None, "model": None, "loaded_at": 0.0}


@asynccontextmanager
async def lifespan(_app: FastAPI):
    print(f"[siglip] loading {MODEL_ID} on CPU...")
    t0 = time.time()
    state["tokenizer"] = AutoTokenizer.from_pretrained(MODEL_ID)
    state["processor"] = AutoProcessor.from_pretrained(MODEL_ID)
    state["model"] = AutoModel.from_pretrained(MODEL_ID).eval()
    state["loaded_at"] = time.time()
    print(f"[siglip] model ready in {state['loaded_at'] - t0:.1f}s")
    yield


app = FastAPI(title="SigLIP Text + Image Encoder", lifespan=lifespan)


class EncodeRequest(BaseModel):
    text: str


class EncodeImageRequest(BaseModel):
    image_url: str


@app.get("/")
def health():
    return {
        "status": "ok",
        "model": MODEL_ID,
        "dim": EXPECTED_DIM,
        "auth_required": bool(AUTH_TOKEN),
        "uptime_s": (time.time() - state["loaded_at"]) if state["loaded_at"] else 0,
        "endpoints": ["GET /", "POST /encode", "POST /encode-image"],
    }


def _check_auth(authorization: str | None):
    if not AUTH_TOKEN:
        return
    expected = f"Bearer {AUTH_TOKEN}"
    if authorization != expected:
        raise HTTPException(status_code=401, detail="invalid bearer token")


@app.post("/encode")
def encode(req: EncodeRequest, authorization: str | None = Header(default=None)):
    _check_auth(authorization)

    text = (req.text or "").strip()
    if len(text) < 1:
        raise HTTPException(status_code=400, detail="text is required")
    if len(text) > 1000:
        text = text[:1000]

    tokenizer, model = state["tokenizer"], state["model"]
    if tokenizer is None or model is None:
        raise HTTPException(status_code=503, detail="model still loading")

    with torch.no_grad():
        # SigLIP tokenizer pads to fixed length; truncate to 64 to match training
        inputs = tokenizer(
            [text],
            padding="max_length",
            max_length=64,
            truncation=True,
            return_tensors="pt",
        )
        # SiglipModel.get_text_features → [1, 768]
        features = model.get_text_features(**inputs)
        vec = features[0].cpu().tolist()

    if len(vec) != EXPECTED_DIM:
        raise HTTPException(
            status_code=500,
            detail=f"unexpected dim: got {len(vec)}, want {EXPECTED_DIM}",
        )

    # L2-normalize to match the worker's expectation
    norm = sum(v * v for v in vec) ** 0.5
    if norm == 0:
        raise HTTPException(status_code=500, detail="zero vector")
    vec = [v / norm for v in vec]

    return {"vector": vec, "model": MODEL_ID}


@app.post("/encode-image")
def encode_image(req: EncodeImageRequest, authorization: str | None = Header(default=None)):
    """Encode an image (by URL) to a 768-D SigLIP vector.

    The image is fetched server-side (so it must be publicly reachable —
    R2 public buckets work, signed URLs work, etc.), opened with Pillow,
    and run through the same SigLIP backbone as /encode but using the
    image processor + get_image_features() head. Returns an L2-normalized
    768-D vector that lives in the same embedding space as text.
    """
    _check_auth(authorization)

    url = (req.image_url or "").strip()
    if not url:
        raise HTTPException(status_code=400, detail="image_url is required")

    # Fetch the image bytes
    try:
        resp = requests.get(url, timeout=IMAGE_FETCH_TIMEOUT, headers=IMAGE_FETCH_HEADERS, stream=False)
        resp.raise_for_status()
    except requests.exceptions.RequestException as e:
        raise HTTPException(status_code=400, detail=f"image fetch failed: {e}")

    # Decode → RGB
    try:
        img = Image.open(BytesIO(resp.content)).convert("RGB")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"image decode failed: {e}")

    processor, model = state["processor"], state["model"]
    if processor is None or model is None:
        raise HTTPException(status_code=503, detail="model still loading")

    with torch.no_grad():
        inputs = processor(images=[img], return_tensors="pt")
        # SiglipModel.get_image_features → [1, 768]
        features = model.get_image_features(**inputs)
        vec = features[0].cpu().tolist()

    if len(vec) != EXPECTED_DIM:
        raise HTTPException(
            status_code=500,
            detail=f"unexpected dim: got {len(vec)}, want {EXPECTED_DIM}",
        )

    # L2-normalize (cosine-similar to the text vectors)
    norm = sum(v * v for v in vec) ** 0.5
    if norm == 0:
        raise HTTPException(status_code=500, detail="zero vector")
    vec = [v / norm for v in vec]

    return {"vector": vec, "model": MODEL_ID, "image_size": list(img.size)}
