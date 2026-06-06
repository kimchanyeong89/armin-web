#!/usr/bin/env python3
"""
로컬 Mac MPS / CUDA / CPU 폴백으로 remaining.jsonl 임베딩 처리.
Modal/Kaggle과 동일한 worker `/upsert-jina`에 업서트 → 같은 Vectorize 인덱스.

사용:
  cd /Users/kietzsche/armin-web-main
  arch -arm64 python3 scripts/modal_embed/local_embed_remaining.py

진행상황은 JINA_EMBED_DASHBOARD.md (remote_dashboard.py 가 자동 갱신).
"""
import os
# MPS 미지원 op를 CPU 폴백 허용 — 없으면 일부 Jina v2 op에서 에러/멈춤
os.environ.setdefault("PYTORCH_ENABLE_MPS_FALLBACK", "1")
# stdout 라인 버퍼링 (nohup 환경에서도 print 즉시 보임)
os.environ.setdefault("PYTHONUNBUFFERED", "1")

import json
import io
import sys
import time
import signal
import urllib3
from pathlib import Path
from datetime import timedelta
from concurrent.futures import ThreadPoolExecutor

import requests
import torch
from PIL import Image
from transformers import AutoModel

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

# ─────────────────────────────────────────────────────────────
MODEL_ID = "jinaai/jina-clip-v2"
UPSERT_URL = "https://armin-semantic-search.armin-art.workers.dev/upsert-jina"

REMAINING = Path("scripts/modal_embed/remaining.jsonl")
CHECKPOINT = Path("scripts/modal_embed/local_processed.txt")
FAILED = Path("scripts/modal_embed/local_failed.jsonl")

# SigLIP 스크립트가 검증한 안정 설정 따라감 (24 workers → 6, 20s → 10s timeout)
BATCH_SIZE = 8          # MPS fp16: 메모리 여유 있되 fetch 와 균형
FETCH_WORKERS = 6       # IP rate-limit 회피 (SigLIP 검증치)
FETCH_TIMEOUT = 10      # 느린 URL 빨리 포기
PROGRESS_EVERY = 5

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                  "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",  # 일부 사이트가 ko-KR이면 403 — en으로 위장
}

# ─────────────────────────────────────────────────────────────
# 1) device 자동 감지
if torch.cuda.is_available():
    device = "cuda"
elif torch.backends.mps.is_available():
    device = "mps"
else:
    device = "cpu"
print(f"[device] {device}")

# 2) checkpoint 로드
processed = set()
if CHECKPOINT.exists():
    with CHECKPOINT.open() as f:
        for line in f:
            s = line.strip()
            if s:
                processed.add(s)
print(f"[checkpoint] {len(processed):,} 이미 처리됨 (로컬)")

# 3) pending 로드
pending = []
with REMAINING.open() as f:
    for line in f:
        item = json.loads(line)
        if str(item["id"]) in processed:
            continue
        pending.append(item)
print(f"[pending] {len(pending):,} 개 처리 예정")

if not pending:
    print("✓ 모두 완료 — 종료")
    sys.exit(0)

# 4) 모델 로드 — MPS면 fp16 (속도 ~2배)
print(f"[model] loading {MODEL_ID} on {device}...")
model = AutoModel.from_pretrained(MODEL_ID, trust_remote_code=True).to(device).eval()
if device in ("mps", "cuda"):
    model = model.half()  # fp16
    print(f"[model] ✓ ready (fp16)")
else:
    print(f"[model] ✓ ready (fp32)")

# 5) 세션 + fetch 함수
sess = requests.Session()

def fetch(item):
    try:
        r = sess.get(item["i"], timeout=FETCH_TIMEOUT, headers=HEADERS, verify=False)
        r.raise_for_status()
        img = Image.open(io.BytesIO(r.content)).convert("RGB")
        return item, img, None
    except Exception as e:
        return item, None, str(e)[:120]

# 6) 메인 루프
batches = [pending[i:i + BATCH_SIZE] for i in range(0, len(pending), BATCH_SIZE)]
print(f"[batches] {len(batches):,} × {BATCH_SIZE} = {len(pending):,} items\n")

total_ok = total_bad = upsert_fail = 0
t0 = time.time()
interrupted = False

def handle_int(signum, frame):
    global interrupted
    interrupted = True
    print("\n[interrupt] 다음 배치 후 정리하고 종료. 다시 실행하면 checkpoint로 이어감.")

signal.signal(signal.SIGINT, handle_int)

for bi, batch in enumerate(batches):
    if interrupted:
        break

    # download images in parallel
    with ThreadPoolExecutor(max_workers=FETCH_WORKERS) as ex:
        results = list(ex.map(fetch, batch))

    good = [(it, img) for it, img, err in results if img is not None]
    bad = [{"id": str(it["id"]), "e": str(it.get("e", "")), "error": err}
           for it, _, err in results if err is not None]

    if good:
        try:
            with torch.no_grad():
                vecs = model.encode_image([g[1] for g in good]).tolist()
            for _, img in good:
                try: img.close()
                except: pass
        except Exception as e:
            print(f"[batch {bi}] GPU encode error: {e}")
            continue

        payload = [
            {"id": str(it["id"]), "values": v, "metadata": {"e": str(it.get("e", ""))}}
            for (it, _), v in zip(good, vecs)
        ]
        try:
            r = sess.post(UPSERT_URL, json={"vectors": payload}, timeout=30)
            if r.status_code == 200:
                with CHECKPOINT.open("a") as f:
                    for it, _ in good:
                        f.write(str(it["id"]) + "\n")
                total_ok += len(good)
            else:
                upsert_fail += 1
                print(f"[batch {bi}] upsert HTTP {r.status_code}: {r.text[:160]}")
        except Exception as e:
            upsert_fail += 1
            print(f"[batch {bi}] upsert exception: {e}")

    if bad:
        with FAILED.open("a") as f:
            for b in bad:
                f.write(json.dumps(b, ensure_ascii=False) + "\n")
        with CHECKPOINT.open("a") as f:
            for b in bad:
                f.write(b["id"] + "\n")
        total_bad += len(bad)

    if (bi + 1) % PROGRESS_EVERY == 0:
        elapsed = time.time() - t0
        done = total_ok + total_bad
        rate = done / elapsed if elapsed > 0 else 0
        remaining_items = len(pending) - done
        eta = remaining_items / rate if rate > 0 else 0
        print(f"[{bi+1:>4}/{len(batches)}] {rate:.1f} imgs/s | "
              f"ETA {timedelta(seconds=int(eta))} | "
              f"ok={total_ok:,} bad={total_bad:,} ufail={upsert_fail}")

elapsed = time.time() - t0
print(f"\n=== {'INTERRUPTED' if interrupted else 'DONE'} ===")
print(f"ok: {total_ok:,}")
print(f"bad (이미지 fetch 실패): {total_bad:,}")
print(f"upsert_fail (worker 응답 실패): {upsert_fail}")
print(f"time: {timedelta(seconds=int(elapsed))}")
