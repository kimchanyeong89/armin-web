# Jina CLIP v2 텍스트 인코더 — Cloud Run 컨테이너
#
# 빌드 + 배포 (one-shot):
#   gcloud run deploy jina-text-encoder \
#     --source . \
#     --region asia-northeast3 \
#     --memory 4Gi --cpu 2 \
#     --min-instances 1 --max-instances 5 \
#     --port 8080 --timeout 60 \
#     --allow-unauthenticated
FROM python:3.11-slim

# 시스템 deps (PIL/torch 기본 필요한 것)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 의존성 먼저 (캐시 활용)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 모델 미리 다운로드 (이미지 빌드 시점) — cold start 회피
RUN python -c "from transformers import AutoModel; \
    AutoModel.from_pretrained('jinaai/jina-clip-v2', trust_remote_code=True)"

# 서버 코드
COPY server.py .

# Cloud Run은 PORT 환경변수 사용
ENV PORT=8080
EXPOSE 8080

CMD ["sh", "-c", "uvicorn server:app --host 0.0.0.0 --port ${PORT} --workers 1"]
