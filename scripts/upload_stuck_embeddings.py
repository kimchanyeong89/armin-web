"""
upload_stuck_embeddings.py
==========================
JSONL에 저장된 579,234개 임베딩 중 Vectorize에 업로드되지 않은 항목을 업로드.

기존 run_siglip_fast.py는 metadata를 {"e": e_id}만 저장했음.
이 스크립트는 search-index 파일을 참조해 n, a, m, i 메타데이터를 함께 업로드 → 검색 품질 향상.

실행:
  python scripts/upload_stuck_embeddings.py
  python scripts/upload_stuck_embeddings.py --dry-run      # 업로드 없이 통계만 확인
  python scripts/upload_stuck_embeddings.py --reset        # 진행 상태 초기화 후 재실행
"""

import json, time, os, sys, argparse, requests, threading
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed

# ── 설정 ──────────────────────────────────────────────────────────────────────
WORKER_URL       = "https://armin-semantic-search.armin-art.workers.dev"
JSONL_PATH       = Path("embedding_results/siglip_embeddings.jsonl")
DATA_DIR         = Path("public/data")
PROGRESS_FILE    = Path("upload_stuck_progress.json")
BATCH_SIZE       = 50    # 작은 배치 → 503 감소
PARALLEL_WORKERS = 2     # 병렬 업로드
RETRY_MAX        = 3
RETRY_DELAY      = 5
REQUEST_TIMEOUT  = 90

# ── 메타데이터 로드 (search-index-part-*.json) ────────────────────────────────
def build_metadata_map():
    """search-index에서 id → {n, a, i, m, e} 매핑 구축"""
    meta = {}
    manifest = DATA_DIR / "search-manifest.json"
    if not manifest.exists():
        print("⚠️  search-manifest.json 없음 - 메타데이터 없이 진행")
        return meta

    chunks = json.loads(manifest.read_text())
    chunk_files = chunks.get("chunks", [])
    print(f"📖 메타데이터 로딩 중 ({len(chunk_files)}개 파일)...", flush=True)

    for cf in chunk_files:
        path = DATA_DIR / cf
        if not path.exists():
            continue
        data = json.loads(path.read_text(encoding="utf-8"))
        items = data if isinstance(data, list) else (data.get("artworks") or [])
        for art in items:
            art_id = art.get("id")
            if art_id:
                meta[art_id] = {
                    "n": art.get("n", ""),
                    "a": art.get("a", ""),
                    "i": art.get("i", ""),
                    "m": art.get("m", ""),
                    "e": art.get("e", ""),
                }

    print(f"   → {len(meta):,}개 항목 로드 완료", flush=True)
    return meta

# ── 업로드 ─────────────────────────────────────────────────────────────────────
def upload_batch(batch: list) -> bool:
    payload = {"vectors": batch}
    for attempt in range(RETRY_MAX):
        try:
            resp = requests.post(
                f"{WORKER_URL}/upsert",
                json=payload,
                timeout=REQUEST_TIMEOUT,
                headers={"Content-Type": "application/json"},
            )
            if resp.status_code == 200 and resp.json().get("success"):
                return True
            if resp.status_code in (429, 503, 502):
                wait = RETRY_DELAY * (2 ** attempt)  # exponential backoff: 5s, 10s, 20s
                print(f"\n   ⚠️ HTTP {resp.status_code} — {wait}s 대기 후 재시도...")
                time.sleep(wait)
                continue
            print(f"\n   ⚠️ HTTP {resp.status_code}: {resp.text[:200]}")
        except Exception as e:
            print(f"\n   ⚠️ 요청 실패 (시도 {attempt+1}): {e}")
        if attempt < RETRY_MAX - 1:
            time.sleep(RETRY_DELAY)
    return False

# ── 진행 상태 ──────────────────────────────────────────────────────────────────
def load_progress():
    if PROGRESS_FILE.exists():
        return json.loads(PROGRESS_FILE.read_text())
    return {"uploaded_ids": [], "total": 0, "file_offset": 0}

def save_progress(progress):
    PROGRESS_FILE.write_text(json.dumps(progress, indent=2))

# ── 메인 ───────────────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="통계만 확인, 업로드 없음")
    parser.add_argument("--reset",   action="store_true", help="진행 상태 초기화")
    parser.add_argument("--worker",  default=WORKER_URL)
    args = parser.parse_args()

    worker = args.worker

    if args.reset and PROGRESS_FILE.exists():
        PROGRESS_FILE.unlink()
        print("🔄 진행 상태 초기화됨")

    if not JSONL_PATH.exists():
        print(f"❌ JSONL 없음: {JSONL_PATH}")
        sys.exit(1)

    # 메타데이터 맵 구축
    meta_map = build_metadata_map()

    # 진행 상태 로드 (스트리밍 방식: JSONL 전체를 메모리에 올리지 않음)
    progress = load_progress()
    uploaded_ids = set(progress.get("uploaded_ids", []))
    print(f"📋 이전 업로드: {progress.get('total', 0):,}개 완료")

    if args.dry_run:
        # Dry-run: 빠른 라인 카운트만
        total_lines = sum(1 for _ in open(JSONL_PATH, encoding="utf-8") if _.strip())
        pending_est = total_lines - len(uploaded_ids)
        print(f"\n[Dry-run] JSONL 총 라인: {total_lines:,} | 업로드 대기(추정): {pending_est:,}")
        print(f"[Dry-run] 메타데이터 맵: {len(meta_map):,}개")
        r2_count = sum(1 for m in meta_map.values() if "r2.dev" in (m.get("i") or ""))
        print(f"[Dry-run] R2 이미지 있음: {r2_count:,}개")
        return

    # ── 스트리밍 업로드 (메모리 효율: JSONL을 배치 단위로만 읽음) ──────────────
    success      = 0
    failed       = 0
    start        = time.time()
    total        = progress.get("total", 0)
    lock         = threading.Lock()
    save_counter = [0]
    processed    = [0]

    def make_vector_item(r):
        m = meta_map.get(r["id"], {})
        return {
            "id":     str(r["id"])[:64],
            "values": r["vector"],
            "metadata": {
                "e": str(m.get("e") or r.get("e", "") or ""),
                "n": str(m.get("n") or ""),
                "a": str(m.get("a") or ""),
                "i": str(m.get("i") or ""),
                "m": str(m.get("m") or ""),
            },
        }

    def upload_one(args):
        ids, batch = args
        ok = upload_batch(batch)
        return ids, ok

    file_offset = progress.get("file_offset", 0)
    print(f"📤 스트리밍 업로드 시작... (오프셋: {file_offset:,})", flush=True)
    with open(JSONL_PATH, "rb") as f_seek:
        f_seek.seek(file_offset)
        start_bytes = f_seek.read(1)  # verify seekable
    with open(JSONL_PATH, encoding="utf-8") as f_in, \
         ThreadPoolExecutor(max_workers=PARALLEL_WORKERS) as executor:
        if file_offset > 0:
            f_in.seek(file_offset)

        buf_ids   = []
        buf_vecs  = []
        inflight  = []

        def flush_buf():
            nonlocal buf_ids, buf_vecs
            if not buf_vecs:
                return
            ids_copy  = buf_ids[:]
            vecs_copy = buf_vecs[:]
            buf_ids  = []
            buf_vecs = []
            fut = executor.submit(upload_one, (ids_copy, vecs_copy))
            inflight.append(fut)

        def drain_completed():
            nonlocal success, failed, total
            still_running = []
            for fut in inflight:
                if fut.done():
                    ids, ok = fut.result()
                    with lock:
                        if ok:
                            for rid in ids:
                                uploaded_ids.add(rid)
                            success += len(ids)
                            total   += len(ids)
                        else:
                            failed += len(ids)
                        save_counter[0] += 1
                        if save_counter[0] % 5 == 0:
                            progress["uploaded_ids"] = list(uploaded_ids)
                            progress["total"]        = total
                            progress["file_offset"]  = f_in.tell()
                            save_progress(progress)
                else:
                    still_running.append(fut)
            inflight[:] = still_running

        while True:
            line = f_in.readline()
            if not line:
                break
            line = line
            line = line.strip()
            if not line:
                continue
            try:
                rec = json.loads(line)
            except json.JSONDecodeError:
                continue
            if not rec.get("id") or not rec.get("vector") or len(rec["vector"]) != 768:
                continue
            vec = rec["vector"]
            if any(v is None or not isinstance(v, (int, float)) or (isinstance(v, float) and (v != v or v == float('inf') or v == float('-inf'))) for v in vec):
                continue
            processed[0] += 1
            if rec["id"] in uploaded_ids:
                continue

            buf_ids.append(rec["id"])
            buf_vecs.append(make_vector_item(rec))

            if len(buf_vecs) >= BATCH_SIZE:
                flush_buf()
                drain_completed()
                # 너무 많이 쌓이지 않도록 throttle
                while len(inflight) >= PARALLEL_WORKERS * 3:
                    drain_completed()
                    time.sleep(0.05)

            if processed[0] % 5000 == 0:
                elapsed = time.time() - start
                speed   = success / elapsed if elapsed > 0 else 0
                print(f"\r  읽는중:{processed[0]:,} | ✓{success:,} | {speed:.0f}/s   ", end="", flush=True)

        # 남은 버퍼 플러시
        flush_buf()
        # 모든 inflight 완료 대기
        for fut in inflight:
            ids, ok = fut.result()
            if ok:
                for rid in ids:
                    uploaded_ids.add(rid)
                success += len(ids)
                total   += len(ids)
            else:
                failed += len(ids)

    # 최종 저장
    progress["uploaded_ids"] = list(uploaded_ids)
    progress["total"]        = total
    save_progress(progress)
    print(f"\n\n🎉 완료! 성공:{success:,}  실패:{failed}  총Vectorize:{total:,}")


if __name__ == "__main__":
    main()
