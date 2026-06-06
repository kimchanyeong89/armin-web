#!/bin/bash
# v3 죽음 자동 감지 + 재시작. 체크포인트로 이어가니까 손실 없음.
# 종료 조건: log에 '=== DONE' 등장 시 또는 Vectorize 카운트 609,251 도달.
# 사용:
#   nohup bash scripts/modal_embed/supervisor.sh > /tmp/supervisor.log 2>&1 &

set -u
LOG_DIR=/tmp
WORK_LOG=$LOG_DIR/local_r2_v3b.log
PYTHON=/Library/Frameworks/Python.framework/Versions/3.10/bin/python3
ATTEMPT=0
TARGET=609251

# Vectorize 카운트 조회
get_count() {
  /usr/bin/curl -s -H "User-Agent: Mozilla/5.0" \
    https://armin-semantic-search.armin-art.workers.dev/jina-stats 2>/dev/null \
    | /usr/bin/grep -o '"vectorCount":[0-9]*' \
    | head -1 \
    | /usr/bin/awk -F: '{print $2}'
}

echo "[supervisor] $(date) — 시작. log=$WORK_LOG"

while true; do
  # 종료 조건 1: log에 DONE
  if [ -f "$WORK_LOG" ] && /usr/bin/grep -q "=== DONE" "$WORK_LOG"; then
    echo "[supervisor] $(date) — log에 DONE 감지. 정상 종료."
    break
  fi

  # 종료 조건 2: Vectorize 카운트가 목표 이상
  count=$(get_count)
  if [ -n "$count" ] && [ "$count" -ge "$TARGET" ]; then
    echo "[supervisor] $(date) — Vectorize $count >= $TARGET. 정상 종료."
    break
  fi

  ATTEMPT=$((ATTEMPT + 1))
  echo "[supervisor] $(date) — 시도 #$ATTEMPT  (현재 Vectorize: ${count:-?}/${TARGET})"

  # v3 실행 (foreground — 죽으면 여기서 빠져나옴)
  PYTORCH_ENABLE_MPS_FALLBACK=1 PYTHONUNBUFFERED=1 \
    arch -arm64 "$PYTHON" scripts/modal_embed/local_embed_v3.py \
    --source scripts/modal_embed/pending_r2.jsonl \
    --gpu-batch 8 --workers 6 --timeout 10 --upload-batch 50 \
    >> "$WORK_LOG" 2>&1

  EXIT_CODE=$?
  echo "[supervisor] $(date) — v3 종료 (exit=$EXIT_CODE). 10초 후 재시작."
  sleep 10
done

echo "[supervisor] $(date) — 종료. 총 시도 $ATTEMPT 회."
