"""
Jina CLIP v2 텍스트 인코더 — Cloud Run 호스팅.

Lazy loading: 컨테이너 시작 시 PORT 즉시 listen,
모델은 첫 요청(또는 /warmup) 시 로드 — startup probe 통과 보장.
"""
import os
import time
from typing import Optional
from threading import Lock

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import torch
from transformers import AutoModel

MODEL_ID = "jinaai/jina-clip-v2"

app = FastAPI()
_model = None
_model_lock = Lock()


def get_model():
    """첫 호출 시에만 모델 로드. 이후는 캐시된 인스턴스 반환."""
    global _model
    if _model is not None:
        return _model
    with _model_lock:
        if _model is not None:
            return _model
        print(f"[lazy-load] loading {MODEL_ID}...", flush=True)
        t0 = time.time()
        m = AutoModel.from_pretrained(MODEL_ID, trust_remote_code=True).eval()
        print(f"[lazy-load] ready in {time.time()-t0:.1f}s", flush=True)
        _model = m
        return _model


class EncodeRequest(BaseModel):
    text: Optional[str] = None
    texts: Optional[list] = None


@app.get("/")
def health():
    """Health probe — 모델 로드 안 하고 즉시 응답."""
    return {"status": "ok", "model": MODEL_ID, "loaded": _model is not None}


@app.get("/warmup")
def warmup():
    """수동 워밍업 트리거 — 모델 미리 로드."""
    t0 = time.time()
    get_model()
    return {"warmed": True, "took_seconds": round(time.time() - t0, 1)}


@app.post("/")
def encode(req: EncodeRequest):
    if req.texts:
        texts = req.texts
    elif req.text:
        texts = [req.text]
    else:
        raise HTTPException(400, "text 또는 texts 필드 필요")

    if not isinstance(texts, list) or not all(isinstance(t, str) for t in texts):
        raise HTTPException(400, "texts must be list of strings")

    model = get_model()
    with torch.no_grad():
        vecs = model.encode_text(texts).tolist()

    return {"vectors": vecs, "dim": len(vecs[0]) if vecs else 0}
