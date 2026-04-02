"""
SigLIP 텍스트 인코딩 로컬 API 서버
- GET  /health  — 상태 확인
- POST /encode   — 텍스트 → 768D 벡터 반환

Cloudflare Worker가 이 서버로 텍스트를 보내고,
벡터를 받아 Vectorize DB 검색에 사용합니다.

실행: python3 scripts/siglip_text_api.py
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
import torch
from transformers import AutoProcessor, AutoModel
import urllib3

urllib3.disable_warnings()

app = Flask(__name__)
CORS(app)  # 모든 origin 허용 (로컬 개발용)

MODEL_ID = "google/siglip-base-patch16-224"
print(f"🚀 SigLIP 텍스트 API 서버 로딩 중... ({MODEL_ID})")

device = "cpu"  # CPU 사용 - 임베딩 프로세스와 MPS 충돌 방지
print(f"   device: {device} (임베딩 프로세스와 MPS 충돌 방지를 위해 CPU 사용)")

model = AutoModel.from_pretrained(MODEL_ID).to(device)
processor = AutoProcessor.from_pretrained(MODEL_ID)
model.eval()

# 결과 캐시 (같은 쿼리 재인코딩 방지)
cache: dict = {}

print("✅ 모델 로드 완료! http://localhost:5200 에서 서비스 중")


@app.route("/health")
def health():
    return jsonify({"status": "ok", "model": MODEL_ID, "device": device})


@app.route("/encode", methods=["POST"])
def encode():
    data = request.get_json()
    if not data or not data.get("text"):
        return jsonify({"error": "text field required"}), 400

    text = data["text"].strip()
    if len(text) < 1:
        return jsonify({"error": "text too short"}), 400

    # 캐시 히트
    if text in cache:
        return jsonify({"vector": cache[text], "dim": len(cache[text]), "cached": True})

    try:
        inputs = processor(text=[text], return_tensors="pt", padding="max_length").to(device)
        with torch.no_grad():
            text_features = model.get_text_features(**inputs)
        # L2 정규화
        text_features = text_features / text_features.norm(p=2, dim=-1, keepdim=True)
        vector = text_features[0].cpu().numpy().tolist()
        # 캐시 저장 (최대 500개)
        if len(cache) < 500:
            cache[text] = vector
        return jsonify({"vector": vector, "dim": len(vector)})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5200, debug=False, threaded=False)  # 싱글스레드
