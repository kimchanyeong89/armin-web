# Jina CLIP v2 텍스트 인코더 — Cloud Run 컨테이너
#
# 빌드 + 배포는 deploy.sh 로 한다(토큰, 최소 0대·최대 1대 설정 포함):
#   JINA_ENCODER_TOKEN=<토큰> bash deploy.sh
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
