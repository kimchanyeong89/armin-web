#!/usr/bin/env python3
"""
로컬 Mac 임베딩 v2 — prefetch pipeline + 옵션화.

핵심 개선:
1. **Prefetch pipeline**: fetch 와 embed 를 분리된 thread + Queue 로 오버랩.
   기존: [fetch16] → [embed] → [fetch16] (순차, GPU 대기 발생)
   신규: 백그라운드 fetch가 큐에 미리 채워둠 → GPU는 줄곧 embed만 함.
   SigLIP 스크립트의 그 패턴.
2. **인자화**: source 파일, batch, workers, timeout, proxy 모드 모두 CLI args.

사용 예시:
  # R2 (직접 fetch, 빠름)
  PYTORCH_ENABLE_MPS_FALLBACK=1 PYTHONUNBUFFERED=1 \\
    arch -arm64 python3 scripts/modal_embed/local_embed_v2.py \\
      --source scripts/modal_embed/pending_r2.jsonl \\
      --batch 16 --workers 12 --timeout 5

  # 외부 호스트 (CF Worker proxy 경유, 가정용 IP 차단 우회)
  PYTORCH_ENABLE_MPS_FALLBACK=1 PYTHONUNBUFFERED=1 \\
    arch -arm64 python3 scripts/modal_embed/local_embed_v2.py \\
      --source scripts/modal_embed/pending_external.jsonl \\
      --proxy --batch 8 --workers 6 --timeout 20
"""
import os
os.environ.setdefault("PYTORCH_ENABLE_MPS_FALLBACK", "1")
os.environ.setdefault("PYTHONUNBUFFERED", "1")

import argparse
import io
import json
import signal
import sys
import time
import urllib3
import urllib.parse
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from pathlib import Path
from queue import Queue
from threading import Thread

import requests
import torch
from PIL import Image
from transformers import AutoModel

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

# ─── 상수 ─────────────────────────────────────────────────────
MODEL_ID = "jinaai/jina-clip-v2"
WORKER_BASE = "https://armin-semantic-search.armin-art.workers.dev"
UPSERT_URL = f"{WORKER_BASE}/upsert-jina"
PROXY_URL = f"{WORKER_BASE}/image-proxy"

CHECKPOINT: Path  # 아래 args 파싱 후 설정
FAILED: Path

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                  "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}

# Image size 상한 — proxy 통해 HTML 에러 페이지(528MB) 같은 거 받지 않도록
MAX_IMAGE_BYTES = 20 * 1024 * 1024  # 20MB

# ─── argparse ─────────────────────────────────────────────────
p = argparse.ArgumentParser()
p.add_argument("--source", required=True, help="JSONL of items to embed")
p.add_argument("--batch", type=int, default=16)
p.add_argument("--workers", type=int, default=12)
p.add_argument("--timeout", type=int, default=5)
p.add_argument("--proxy", action="store_true", help="모든 fetch를 CF Worker proxy 경유")
p.add_argument("--fallback-proxy", action="store_true",
               help="direct 실패 시에만 proxy 재시도 (retry pool 처리용)")
p.add_argument("--prefetch", type=int, default=4, help="prefetch 큐 크기 (배치 단위)")
p.add_argument("--checkpoint", default="scripts/modal_embed/local_processed.txt",
               help="체크포인트 파일 경로 (retry 시 별도 파일 사용)")
p.add_argument("--failed", default="scripts/modal_embed/local_failed.jsonl",
               help="실패 로그 파일 경로")
args = p.parse_args()

# ─── 디바이스 + 체크포인트 ─────────────────────────────────────
CHECKPOINT = Path(args.checkpoint)
FAILED = Path(args.failed)

if torch.cuda.is_available():
    device = "cuda"
elif torch.backends.mps.is_available():
    device = "mps"
else:
    device = "cpu"
mode = "proxy-only" if args.proxy else ("direct+fallback-proxy" if args.fallback_proxy else "direct")
print(f"[device] {device}  |  source={args.source}  |  mode={mode}")
print(f"[paths] checkpoint={CHECKPOINT}  failed={FAILED}")

processed: set = set()
if CHECKPOINT.exists():
    with CHECKPOINT.open() as f:
        for line in f:
            s = line.strip()
            if s:
                processed.add(s)
print(f"[checkpoint] {len(processed):,} 이미 처리됨")

pending = []
with open(args.source) as f:
    for line in f:
        line = line.strip()
        if not line: continue
        it = json.loads(line)
        if str(it["id"]) in processed:
            continue
        pending.append(it)
print(f"[pending] {len(pending):,} 처리 예정")
if not pending:
    sys.exit("✓ 모두 완료 — 종료")

# ─── 모델 로드 (fp16 on MPS/CUDA) ─────────────────────────────
print(f"[model] loading {MODEL_ID}...")
model = AutoModel.from_pretrained(MODEL_ID, trust_remote_code=True).to(device).eval()
if device in ("mps", "cuda"):
    model = model.half()
    print(f"[model] ✓ ready (fp16)")
else:
    print(f"[model] ✓ ready (fp32)")

# ─── fetch 함수 (proxy 옵션) ──────────────────────────────────
sess = requests.Session()


def _try_fetch(url, timeout):
    """단일 URL 시도. 성공시 (img, None), 실패시 (None, err)."""
    try:
        r = sess.get(url, timeout=timeout, headers=HEADERS, verify=False, stream=True)
        r.raise_for_status()
        chunks = []
        size = 0
        for chunk in r.iter_content(chunk_size=65536):
            if not chunk: continue
            size += len(chunk)
            if size > MAX_IMAGE_BYTES:
                return None, f"oversized {size//1024//1024}MB"
            chunks.append(chunk)
        body = b"".join(chunks)
        if len(body) < 1000:
            return None, f"too small {len(body)}B (HTML error page?)"
        img = Image.open(io.BytesIO(body)).convert("RGB")
        return img, None
    except Exception as e:
        return None, str(e)[:120]


def fetch_one(item):
    src = item["i"]

    # mode 1: proxy-only — 항상 proxy로
    if args.proxy:
        purl = f"{PROXY_URL}?url={urllib.parse.quote(src, safe='')}"
        img, err = _try_fetch(purl, args.timeout)
        return item, img, err

    # mode 2: direct, optional proxy fallback
    img, err = _try_fetch(src, args.timeout)
    if img is not None:
        return item, img, None

    if args.fallback_proxy:
        # proxy 재시도 — proxy는 latency 더 크므로 timeout 여유 있게
        purl = f"{PROXY_URL}?url={urllib.parse.quote(src, safe='')}"
        img2, err2 = _try_fetch(purl, max(args.timeout * 2, 15))
        if img2 is not None:
            return item, img2, None
        return item, None, f"direct: {err} | proxy: {err2}"

    return item, None, err


def fetch_batch(batch):
    """parallel fetch for one batch."""
    with ThreadPoolExecutor(max_workers=args.workers) as ex:
        return list(ex.map(fetch_one, batch))


# ─── 배치 + 프리페치 파이프라인 ────────────────────────────────
batches = [pending[i:i + args.batch] for i in range(0, len(pending), args.batch)]
print(f"[batches] {len(batches):,} × {args.batch} = {len(pending):,} items")
print(f"[prefetch] queue size {args.prefetch} batches\n")

fetch_q: "Queue" = Queue(maxsize=args.prefetch)


def producer():
    """백그라운드 thread — 배치를 미리 fetch 해서 큐에 채움."""
    for batch in batches:
        results = fetch_batch(batch)
        fetch_q.put(results)
    fetch_q.put(None)  # sentinel


prod_thread = Thread(target=producer, daemon=True)
prod_thread.start()

# ─── 메인 루프 — GPU 전담 ─────────────────────────────────────
total_ok = total_bad = upsert_fail = 0
t0 = time.time()
interrupted = False


def handle_int(signum, frame):
    global interrupted
    interrupted = True
    print("\n[interrupt] 정리 후 종료. 다시 실행하면 checkpoint로 이어감.")


signal.signal(signal.SIGINT, handle_int)

bi = 0
while not interrupted:
    results = fetch_q.get()
    if results is None:
        break
    bi += 1

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

    if bi % 5 == 0:
        elapsed = time.time() - t0
        done = total_ok + total_bad
        rate = done / elapsed if elapsed > 0 else 0
        remaining = len(pending) - done
        eta = remaining / rate if rate > 0 else 0
        print(f"[{bi:>4}/{len(batches)}] {rate:.2f} imgs/s | "
              f"ETA {timedelta(seconds=int(eta))} | "
              f"ok={total_ok:,} bad={total_bad:,} ufail={upsert_fail} "
              f"| queue={fetch_q.qsize()}")

elapsed = time.time() - t0
print(f"\n=== {'INTERRUPTED' if interrupted else 'DONE'} ===")
print(f"ok={total_ok:,}  bad={total_bad:,}  upsert_fail={upsert_fail}")
print(f"time: {timedelta(seconds=int(elapsed))}")
