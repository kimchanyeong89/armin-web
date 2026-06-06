"""
Jina CLIP v2 텍스트 인코더 — Modal Web Endpoint.

- CPU 컨테이너 (텍스트 인코딩은 GPU 불필요, 단일 쿼리 CPU에서 ~200ms)
- min_containers=1 로 always-warm → cold start 없음 (검색 latency 일정)
- 비용: 2 vCPU × 24/7 × 30일 ≈ $28.8/월 → 새 계정 크레딧 $30 으로 약 1개월

배포:
  arch -arm64 /Library/Frameworks/Python.framework/Versions/3.10/bin/python3 \\
    -m modal deploy scripts/modal_embed/modal_text_encoder.py

배포 후 URL: https://kimchanyeong89--jina-text-encoder-encode.modal.run
(query string `?text=...` 또는 POST body `{"text": "..."}` 둘 다 지원)
"""
import modal

MODEL_ID = "jinaai/jina-clip-v2"


def _prefetch_model():
    """모델을 이미지 빌드 시점에 캐시. 컨테이너 시작 시 빠르게 로드."""
    from transformers import AutoModel
    AutoModel.from_pretrained(MODEL_ID, trust_remote_code=True)


image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install(
        "torch==2.4.1",
        "transformers==4.45.2",
        "pillow",
        "einops",
        "timm",
        "fastapi",
    )
    .run_function(_prefetch_model)
)

app = modal.App("jina-text-encoder", image=image)


@app.cls(
    cpu=2,
    memory=4096,
    scaledown_window=300,       # 5분 idle 시 종료 (single warm container 외)
    min_containers=1,           # 항상 1개 warm → cold start 없음
    max_containers=3,           # 트래픽 폭주 대비
)
class TextEncoder:
    @modal.enter()
    def load(self):
        import torch
        from transformers import AutoModel
        print(f"Loading {MODEL_ID}...")
        self.model = (
            AutoModel.from_pretrained(MODEL_ID, trust_remote_code=True)
            .eval()
        )
        self.torch = torch
        print("Text encoder ready.")

    @modal.fastapi_endpoint(method="POST")
    def encode(self, data: dict) -> dict:
        """
        POST {"text": "고요한 풍경"}  또는  {"texts": ["a", "b", ...]}
        returns {"vectors": [[1024개 float], ...], "dim": 1024}
        """
        if "texts" in data:
            texts = data["texts"]
        elif "text" in data:
            texts = [data["text"]]
        else:
            return {"error": "text 또는 texts 필드 필요"}

        if not texts or not all(isinstance(t, str) for t in texts):
            return {"error": "texts must be non-empty list of strings"}

        with self.torch.no_grad():
            vecs = self.model.encode_text(texts).tolist()

        return {"vectors": vecs, "dim": len(vecs[0]) if vecs else 0}
