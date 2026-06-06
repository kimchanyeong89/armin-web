#!/usr/bin/env python3
"""
로컬 임베딩 v3 — SigLIP fast 패턴 적용.

v2 대비 핵심 개선:
1. **as_completed 스트리밍**: 배치 단위 wait 대신 fetch 완료 순으로 즉시 GPU 버퍼에 적재.
   → 느린 URL 하나가 다른 15개 막던 현상 제거.
2. **3-thread pipeline**: fetcher / GPU / uploader 완전 분리.
   GPU가 멈춤 없이 추론, fetcher는 다음 이미지 미리 download, uploader는 별도 HTTP.
3. **Upload batching (50)**: HTTP 호출 1/3로 감소.
4. **GPU_BATCH 4** (small for MPS stability — SigLIP 검증치).

사용 동일:
  PYTORCH_ENABLE_MPS_FALLBACK=1 PYTHONUNBUFFERED=1 \\
    arch -arm64 /Library/Frameworks/Python.framework/Versions/3.10/bin/python3 \\
    scripts/modal_embed/local_embed_v3.py \\
      --source scripts/modal_embed/pending_r2.jsonl
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
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import timedelta
from pathlib import Path
from queue import Queue
from threading import Thread, Lock

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

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                  "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}
MAX_IMAGE_BYTES = 20 * 1024 * 1024

# ─── argparse ─────────────────────────────────────────────────
p = argparse.ArgumentParser()
p.add_argument("--source", required=True)
p.add_argument("--gpu-batch", type=int, default=4, help="GPU 배치 (MPS 안정 4)")
p.add_argument("--workers", type=int, default=12)
p.add_argument("--timeout", type=int, default=5)
p.add_argument("--upload-batch", type=int, default=50, help="HTTP upsert 모아서 보낼 크기")
p.add_argument("--proxy", action="store_true")
p.add_argument("--fallback-proxy", action="store_true")
p.add_argument("--checkpoint", default="scripts/modal_embed/local_processed.txt")
p.add_argument("--failed", default="scripts/modal_embed/local_failed.jsonl")
p.add_argument("--limit", type=int, default=0, help="처리 개수 제한 (벤치마크용)")
args = p.parse_args()

CHECKPOINT = Path(args.checkpoint)
FAILED = Path(args.failed)

# ─── 디바이스 + 체크포인트 ─────────────────────────────────────
if torch.cuda.is_available():
    device = "cuda"
elif torch.backends.mps.is_available():
    device = "mps"
else:
    device = "cpu"
mode = "proxy-only" if args.proxy else ("direct+fallback" if args.fallback_proxy else "direct")
print(f"[v3] device={device} mode={mode} source={args.source}")
print(f"[v3] gpu_batch={args.gpu_batch} workers={args.workers} upload_batch={args.upload_batch}")

processed: set = set()
if CHECKPOINT.exists():
    with CHECKPOINT.open() as f:
        for line in f:
            s = line.strip()
            if s: processed.add(s)
print(f"[checkpoint] {len(processed):,}")

pending = []
with open(args.source) as f:
    for line in f:
        line = line.strip()
        if not line: continue
        it = json.loads(line)
        if str(it["id"]) in processed: continue
        pending.append(it)
        if args.limit and len(pending) >= args.limit:
            break
print(f"[pending] {len(pending):,}")
if not pending:
    sys.exit("✓ 모두 완료")

# ─── 모델 (fp16 on MPS/CUDA) ──────────────────────────────────
print(f"[model] loading {MODEL_ID}...")
model = AutoModel.from_pretrained(MODEL_ID, trust_remote_code=True).to(device).eval()
if device in ("mps", "cuda"):
    model = model.half()
print(f"[model] ready ({'fp16' if device != 'cpu' else 'fp32'})")

sess = requests.Session()
file_lock = Lock()


def _try_fetch(url, timeout):
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
            return None, f"too small {len(body)}B"
        img = Image.open(io.BytesIO(body)).convert("RGB")
        return img, None
    except Exception as e:
        return None, str(e)[:120]


def fetch_one(item):
    src = item["i"]
    if args.proxy:
        purl = f"{PROXY_URL}?url={urllib.parse.quote(src, safe='')}"
        img, err = _try_fetch(purl, args.timeout)
        return item, img, err
    img, err = _try_fetch(src, args.timeout)
    if img is not None:
        return item, img, None
    if args.fallback_proxy:
        purl = f"{PROXY_URL}?url={urllib.parse.quote(src, safe='')}"
        img2, err2 = _try_fetch(purl, max(args.timeout * 2, 15))
        if img2 is not None:
            return item, img2, None
        return item, None, f"direct: {err} | proxy: {err2}"
    return item, None, err


# ─── 3-thread pipeline ────────────────────────────────────────
# fetch → gpu_q → (GPU thread) → upload_q → (uploader thread) → worker

gpu_q: "Queue" = Queue(maxsize=128)   # fetcher → GPU
upload_q: "Queue" = Queue()           # GPU → uploader

stats = {"ok": 0, "bad": 0, "ufail": 0}
stats_lock = Lock()
done_event = {"fetcher": False, "gpu": False}
total = len(pending)
t0 = time.time()


def fetcher():
    """모든 pending 을 ThreadPool 로 fetch, as_completed 로 즉시 gpu_q 적재."""
    with ThreadPoolExecutor(max_workers=args.workers) as ex:
        futures = {ex.submit(fetch_one, it): it for it in pending}
        for fut in as_completed(futures):
            try:
                item, img, err = fut.result()
            except Exception as e:
                item = futures[fut]
                img, err = None, str(e)[:120]
            if img is None:
                # 실패: 직접 upload_q 거치지 않고 카운트만
                with file_lock:
                    with FAILED.open("a") as f:
                        f.write(json.dumps({"id": str(item["id"]), "e": str(item.get("e","")), "error": err}, ensure_ascii=False) + "\n")
                    with CHECKPOINT.open("a") as f:
                        f.write(str(item["id"]) + "\n")
                with stats_lock:
                    stats["bad"] += 1
            else:
                gpu_q.put((item, img))
    gpu_q.put(None)  # sentinel
    done_event["fetcher"] = True


def gpu_worker():
    """gpu_q 에서 받아서 GPU_BATCH 모이면 inference. 결과는 upload_q 로."""
    buf = []  # [(item, img), ...]
    while True:
        x = gpu_q.get()
        if x is None:
            # flush 남은 버퍼
            if buf:
                _embed_and_enqueue(buf)
                buf.clear()
            break
        buf.append(x)
        if len(buf) >= args.gpu_batch:
            _embed_and_enqueue(buf)
            buf = []
    upload_q.put(None)  # sentinel to uploader
    done_event["gpu"] = True


def _embed_and_enqueue(buf):
    try:
        with torch.no_grad():
            vecs = model.encode_image([b[1] for b in buf]).tolist()
        for _, img in buf:
            try: img.close()
            except: pass
        for (it, _), v in zip(buf, vecs):
            upload_q.put({
                "id": str(it["id"]),
                "values": v,
                "metadata": {"e": str(it.get("e", ""))},
            })
    except Exception as e:
        print(f"[gpu error] {e}")


def uploader():
    """upload_q 에서 args.upload_batch 모이면 worker POST."""
    pending_upsert = []
    while True:
        x = upload_q.get()
        if x is None:
            if pending_upsert:
                _send_upsert(pending_upsert)
                pending_upsert.clear()
            break
        pending_upsert.append(x)
        if len(pending_upsert) >= args.upload_batch:
            _send_upsert(pending_upsert)
            pending_upsert = []


def _send_upsert(batch):
    try:
        r = sess.post(UPSERT_URL, json={"vectors": batch}, timeout=30)
        if r.status_code == 200:
            with file_lock:
                with CHECKPOINT.open("a") as f:
                    for x in batch:
                        f.write(x["id"] + "\n")
            with stats_lock:
                stats["ok"] += len(batch)
        else:
            with stats_lock:
                stats["ufail"] += 1
            print(f"[upsert HTTP {r.status_code}] {r.text[:160]}")
    except Exception as e:
        with stats_lock:
            stats["ufail"] += 1
        print(f"[upsert exception] {e}")


# ─── 진행 출력 thread ─────────────────────────────────────────
def progress_reporter():
    last_done = 0
    while not (done_event["fetcher"] and done_event["gpu"]):
        time.sleep(20)
        with stats_lock:
            done = stats["ok"] + stats["bad"]
            ok, bad, uf = stats["ok"], stats["bad"], stats["ufail"]
        elapsed = time.time() - t0
        rate = done / elapsed if elapsed > 0 else 0
        rem = total - done
        eta = rem / rate if rate > 0 else 0
        delta = done - last_done
        last_done = done
        print(f"[{done:>6,}/{total:,}] {rate:.2f} imgs/s | "
              f"+{delta} in 20s | "
              f"ETA {timedelta(seconds=int(eta))} | "
              f"ok={ok:,} bad={bad:,} ufail={uf} "
              f"gpu_q={gpu_q.qsize()} up_q={upload_q.qsize()}")


# ─── 시작 ─────────────────────────────────────────────────────
interrupted = False
def handle_int(signum, frame):
    global interrupted
    interrupted = True
    print("\n[interrupt] 진행 중 종료. 체크포인트로 이어감.")
signal.signal(signal.SIGINT, handle_int)

threads = [
    Thread(target=fetcher, daemon=False),
    Thread(target=gpu_worker, daemon=False),
    Thread(target=uploader, daemon=False),
    Thread(target=progress_reporter, daemon=True),
]
for t in threads:
    t.start()

# 메인 thread 는 fetcher/gpu_worker/uploader 완료 대기
threads[0].join()  # fetcher
threads[1].join()  # gpu
threads[2].join()  # uploader

elapsed = time.time() - t0
print(f"\n=== DONE ===")
print(f"ok={stats['ok']:,} bad={stats['bad']:,} ufail={stats['ufail']}")
print(f"time: {timedelta(seconds=int(elapsed))}  rate: {(stats['ok']+stats['bad'])/elapsed:.2f} imgs/s")
