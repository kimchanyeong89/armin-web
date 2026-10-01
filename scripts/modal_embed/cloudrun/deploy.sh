#!/bin/bash
# Cloud Run 일괄 배포 스크립트
# 사용:
#   cd scripts/modal_embed/cloudrun && JINA_ENCODER_TOKEN=<토큰> bash deploy.sh
#
# 토큰은 semantic-search 워커 secret JINA_ENCODER_TOKEN 과 같은 값이다(workers/semantic-search/.env).
# 정밀 검색은 드물게 쓰여 평소엔 꺼 두고(min 0), 요금 상한을 위해 최대 1대만 띄운다.

set -e
SERVICE=jina-text-encoder
REGION=asia-northeast3   # 서울. us-central1로 바꾸려면 여기 변경.
PROJECT=$(gcloud config get-value project 2>/dev/null)

if [ -z "$JINA_ENCODER_TOKEN" ]; then
  echo "JINA_ENCODER_TOKEN 이 필요합니다 (workers/semantic-search/.env 참고)." >&2
  exit 1
fi

echo "프로젝트: $PROJECT"
echo "서비스:   $SERVICE"
echo "리전:     $REGION"
echo

# 1. 필요한 API 활성화
echo "[1/3] Cloud Run + Cloud Build API 활성화..."
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com

# 2. 소스에서 직접 배포 (Cloud Build가 Dockerfile 빌드 + Artifact Registry push + Cloud Run 배포)
echo "[2/3] 컨테이너 빌드 + 배포 중 (5-10분)..."
gcloud run deploy "$SERVICE" \
  --source . \
  --region "$REGION" \
  --memory 8Gi \
  --cpu 4 \
  --cpu-boost \
  --min-instances 0 \
  --max-instances 1 \
  --port 8080 \
  --timeout 120 \
  # 한 번에 하나만. 꺼져 있던 서버에 요청이 몰리면 모델을 불러오는 20초 동안 쌓였다가 한꺼번에 돌며
  # 메모리를 넘겨 Killed 로 죽고, 다시 켜지면 또 쌓이기를 반복했다(2026-09-16~30). 넘치는 요청은
  # 바로 429 를 받아 워커가 SigLIP 으로 넘긴다.
  --concurrency 1 \
  --allow-unauthenticated \
  --set-env-vars "JINA_ENCODER_TOKEN=$JINA_ENCODER_TOKEN" \
  --execution-environment gen2

# 3. URL 출력
URL=$(gcloud run services describe "$SERVICE" --region "$REGION" --format='value(status.url)')
echo
echo "✓ 배포 완료"
echo "URL: $URL"
echo
echo "테스트:"
echo "  curl -X POST $URL -H 'Content-Type: application/json' -H 'Authorization: Bearer <토큰>' -d '{\"text\":\"고요한 풍경\"}'"
