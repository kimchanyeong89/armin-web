#!/bin/bash
# Cloud Run 일괄 배포 스크립트
# 사용:
#   cd scripts/modal_embed/cloudrun && bash deploy.sh

set -e
SERVICE=jina-text-encoder
REGION=asia-northeast3   # 서울. us-central1로 바꾸려면 여기 변경.
PROJECT=$(gcloud config get-value project 2>/dev/null)

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
  --min-instances 1 \
  --max-instances 5 \
  --port 8080 \
  --timeout 120 \
  --concurrency 4 \
  --allow-unauthenticated \
  --execution-environment gen2

# 3. URL 출력
URL=$(gcloud run services describe "$SERVICE" --region "$REGION" --format='value(status.url)')
echo
echo "✓ 배포 완료"
echo "URL: $URL"
echo
echo "테스트:"
echo "  curl -X POST $URL -H 'Content-Type: application/json' -d '{\"text\":\"고요한 풍경\"}'"
