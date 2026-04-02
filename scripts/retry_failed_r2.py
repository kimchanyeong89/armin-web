"""
retry_failed_r2.py
==================
18,578개 실패 임베딩을 R2 이미지 URL로 재시도.

동작:
  1. siglip_failed.jsonl 에서 실패 항목 로드
  2. search-index 파일에서 id → R2 image URL 매핑 구축
  3. R2 URL이 있는 항목: 다운로드 → SigLIP 임베딩 → Vectorize 업로드
  4. R2 URL 없는 항목(진짜 no-image): 스킵 & 기록

실행:
  python scripts/retry_failed_r2.py
  python scripts/retry_failed_r2.py --dry-run     # 통계만 확인
  python scripts/retry_failed_r2.py --batch 8     # GPU 배치 크기 변경
"""

import json, time, sys, argparse, requests, threading, gc
import urllib3
from pathlib import Path
from io import BytesIO
from concurrent.futures import ThreadPoolExecutor, as_completed

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

# ── 설정 ──────────────────────────────────────────────────────────────────────
WORKER_URL       = "https://armin-semantic-search.armin-art.workers.dev"
DATA_DIR         = Path("public/data")
FAILED_FILE      = Path("siglip_failed.jsonl")
OUTPUT_JSONL     = Path("embedding_results/siglip_embeddings.jsonl")
RETRY_STATE_FILE = Path("retry_r2_state.json")
PREFETCH_WORKERS = 6
GPU_BATCH        = 4
UPLOAD_BATCH     = 50
MODEL_ID         = "google/siglip-base-patch16-224"

# ── 메타데이터 맵 구축 ─────────────────────────────────────────────────────────
def build_meta_map():
    """search-index(패치 후) + 컬렉션 파일의 imageUrl(R2) 보강"""
    meta = {}
    manifest = DATA_DIR / "search-manifest.json"
    if not manifest.exists():
        print("⚠️  search-manifest.json 없음")
        return meta
    chunks = json.loads(manifest.read_text()).get("chunks", [])
    print(f"📖 메타데이터 로딩 ({len(chunks)}개 파일)...", flush=True)
    for cf in chunks:
        p = DATA_DIR / cf
        if not p.exists():
            continue
        data = json.loads(p.read_text(encoding="utf-8"))
        items = data if isinstance(data, list) else (data.get("artworks") or [])
        for art in items:
            aid = art.get("id")
            if aid:
                meta[aid] = {
                    "n": art.get("n", ""),
                    "a": art.get("a", ""),
                    "i": art.get("i", ""),
                    "m": art.get("m", ""),
                    "e": art.get("e", ""),
                }
    print(f"   → {len(meta):,}개 로드 (search-index)", flush=True)

    # 컬렉션 파일에서 imageUrl(R2) 추가 보강 (search-index에서 i 필드 비어있는 경우)
    COLLECTION_EXTRA = [
        ("hamburger-kunsthalle-drawings.json",  "imageUrl"),
        ("hamburger-kunsthalle-paintings.json",  "imageUrl"),
        ("hamburger-kunsthalle-video.json",       "imageUrl"),
        ("ngs-all.json",                          "imageUrl"),
        ("saam-paintings-full.json",              "imageUrl"),
        ("nmwa-collection.json",                  "imageUrl"),
        ("kroller-muller-permanent.json",         "imageUrl"),
        ("bruecke-museum-collection.json",        "imageUrl"),
        ("tepapa-collection.json",                "image"),
    ]
    enriched = 0
    for fname, field in COLLECTION_EXTRA:
        fpath = DATA_DIR / fname
        if not fpath.exists():
            continue
        try:
            raw = json.loads(fpath.read_text(encoding="utf-8"))
            items = raw if isinstance(raw, list) else next(
                (v for v in raw.values() if isinstance(v, list) and v), []
            )
            for item in items:
                aid = item.get("id")
                url = item.get(field, "")
                if aid and url and "r2.dev" in url:
                    if aid in meta:
                        if not meta[aid].get("i") or "r2.dev" not in meta[aid]["i"]:
                            meta[aid]["i"] = url
                            enriched += 1
        except Exception as e:
            print(f"  ⚠️ {fname}: {e}")
    print(f"   → R2 URL 보강: {enriched:,}개", flush=True)
    return meta

# ── 이미지 다운로드 ────────────────────────────────────────────────────────────
_session = requests.Session()
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
_retries = Retry(total=2, backoff_factor=0.5, status_forcelist=[500, 502, 503, 504])
_session.mount("http://",  HTTPAdapter(max_retries=_retries, pool_maxsize=20))
_session.mount("https://", HTTPAdapter(max_retries=_retries, pool_maxsize=20))

def download_image(art_id, img_url):
    """이미지 다운로드 → PIL Image. 실패 시 (art_id, None, error)"""
    try:
        from PIL import Image
        r = _session.get(
            img_url,
            timeout=15,
            verify=False,
            headers={"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"},
        )
        r.raise_for_status()
        img = Image.open(BytesIO(r.content)).convert("RGB")
        return art_id, img_url, img, None
    except Exception as e:
        return art_id, img_url, None, str(e)[:80]

# ── Vectorize 업로드 ───────────────────────────────────────────────────────────
def upload_to_vectorize(batch):
    payload = {"vectors": batch}
    try:
        resp = _session.post(f"{WORKER_URL}/upsert", json=payload, timeout=30)
        if resp.status_code == 200:
            return resp.json().get("success", False), None
        return False, f"HTTP {resp.status_code}: {resp.text[:100]}"
    except Exception as e:
        return False, str(e)[:80]

# ── 진행 상태 ──────────────────────────────────────────────────────────────────
def load_state():
    if RETRY_STATE_FILE.exists():
        return json.loads(RETRY_STATE_FILE.read_text())
    return {"done_ids": [], "success": 0, "failed_again": 0, "no_r2_url": 0}

def save_state(state):
    RETRY_STATE_FILE.write_text(json.dumps(state, indent=2))

# ── 메인 ───────────────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--batch",   type=int, default=GPU_BATCH, help="GPU 배치 크기")
    parser.add_argument("--reset",   action="store_true")
    args = parser.parse_args()

    if args.reset and RETRY_STATE_FILE.exists():
        RETRY_STATE_FILE.unlink()
        print("🔄 진행 상태 초기화")

    # 실패 항목 로드
    if not FAILED_FILE.exists():
        print(f"❌ {FAILED_FILE} 없음")
        sys.exit(1)

    failed_items = []
    with open(FAILED_FILE, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                try:
                    failed_items.append(json.loads(line))
                except:
                    pass
    print(f"📋 실패 항목: {len(failed_items):,}개")

    # 메타데이터 맵
    meta_map = build_meta_map()

    # R2 URL 있는 것 vs 없는 것 분류
    state    = load_state()
    done_ids = set(state.get("done_ids", []))

    can_retry    = []  # R2 URL 있음
    no_r2        = []  # R2 URL 없음 (진짜 no-image)
    already_done = 0

    for item in failed_items:
        aid = item.get("id", "")
        if aid in done_ids:
            already_done += 1
            continue
        m = meta_map.get(aid)
        if m and m.get("i") and "r2.dev" in m["i"]:
            can_retry.append({"id": aid, "url": m["i"], "meta": m})
        else:
            no_r2.append(aid)

    print(f"\n   R2 URL 있음 (재시도 가능): {len(can_retry):,}개")
    print(f"   R2 URL 없음 (스킵):         {len(no_r2):,}개")
    print(f"   이미 완료:                  {already_done:,}개")

    if args.dry_run:
        # 어느 미술관이 R2 URL 없는지
        from collections import Counter
        no_r2_exh = Counter()
        for item in failed_items:
            aid = item.get("id", "")
            if aid not in done_ids:
                m = meta_map.get(aid)
                if not (m and m.get("i") and "r2.dev" in m["i"]):
                    no_r2_exh[item.get("e", "unknown")] += 1
        print("\n[Dry-run] R2 없는 항목 상위 전시관:")
        for exh, cnt in sorted(no_r2_exh.items(), key=lambda x: -x[1])[:15]:
            print(f"   {exh}: {cnt}개")
        return

    if not can_retry:
        print("✅ 재시도할 항목 없음 (모두 R2 URL 없음)")
        return

    # 모델 로드
    print("\n🤖 SigLIP 모델 로딩...", flush=True)
    import torch
    from transformers import AutoProcessor, AutoModel
    device = "mps" if torch.backends.mps.is_available() else "cpu"
    print(f"   device: {device}")
    model = AutoModel.from_pretrained(MODEL_ID).to(device)
    processor = AutoProcessor.from_pretrained(MODEL_ID)
    model.eval()

    OUTPUT_JSONL.parent.mkdir(exist_ok=True)
    file_lock = threading.Lock()
    upload_batch_buf = []

    success_count      = 0
    failed_again_count = 0
    start              = time.time()

    gpu_batch_size = args.batch

    print(f"\n⚡ 임베딩 시작 (프리페치:{PREFETCH_WORKERS}, GPU배치:{gpu_batch_size})...\n", flush=True)

    with ThreadPoolExecutor(max_workers=PREFETCH_WORKERS) as executor:
        futures = {
            executor.submit(download_image, item["id"], item["url"]): item
            for item in can_retry
        }

        gpu_buf = []  # (art_id, img_url, image, meta)
        processed = 0

        def flush_gpu_buf(buf):
            nonlocal success_count, failed_again_count
            if not buf:
                return
            try:
                tensors = processor(
                    images=[b[2] for b in buf],
                    return_tensors="pt",
                    padding=True
                ).to(device)
                with torch.no_grad():
                    feats = model.get_image_features(**tensors)
                feats = feats / feats.norm(p=2, dim=-1, keepdim=True)
                vecs  = feats.cpu().numpy().tolist()
                del tensors, feats

                for i, (bid, burl, bimg, bmeta) in enumerate(buf):
                    vec = vecs[i]
                    bimg.close()
                    # JSONL에 저장
                    with file_lock:
                        with open(OUTPUT_JSONL, "a") as fout:
                            fout.write(json.dumps({"id": bid, "e": bmeta.get("e",""), "vector": vec}) + "\n")
                    upload_batch_buf.append({
                        "id":     bid,
                        "values": vec,
                        "metadata": {
                            "e": bmeta.get("e", ""),
                            "n": bmeta.get("n", ""),
                            "a": bmeta.get("a", ""),
                            "i": bmeta.get("i", ""),
                            "m": bmeta.get("m", ""),
                        },
                    })
                    done_ids.add(bid)
                    success_count += 1

                gc.collect()

            except Exception as gpu_err:
                print(f"\n   ⚠️ GPU 오류: {gpu_err}")
                for bid, burl, bimg, bmeta in buf:
                    if bimg:
                        bimg.close()
                    done_ids.add(bid)
                    failed_again_count += len(buf)

        def maybe_upload():
            nonlocal upload_batch_buf
            if len(upload_batch_buf) >= UPLOAD_BATCH:
                batch = upload_batch_buf[:UPLOAD_BATCH]
                upload_batch_buf = upload_batch_buf[UPLOAD_BATCH:]
                ok, err = upload_to_vectorize(batch)
                if not ok:
                    print(f"\n   ⚠️ 업로드 실패: {err}")

        for future in as_completed(futures):
            art_id, img_url, image, err = future.result()
            processed += 1
            item = futures[future]

            if err or image is None:
                done_ids.add(art_id)
                failed_again_count += 1
                elapsed = time.time() - start
                print(
                    f"\r⟳ {processed}/{len(can_retry)} | ✓{success_count} ✗{failed_again_count} | {elapsed:.0f}s   ",
                    end="", flush=True
                )
                continue

            gpu_buf.append((art_id, img_url, image, item["meta"]))

            if len(gpu_buf) >= gpu_batch_size:
                flush_gpu_buf(gpu_buf[:gpu_batch_size])
                gpu_buf = gpu_buf[gpu_batch_size:]
                maybe_upload()

            elapsed = time.time() - start
            print(
                f"\r⟳ {processed}/{len(can_retry)} | ✓{success_count} ✗{failed_again_count} | {elapsed:.0f}s   ",
                end="", flush=True
            )

            # 진행 저장 (100개마다)
            if processed % 100 == 0:
                state["done_ids"]      = list(done_ids)
                state["success"]       = success_count
                state["failed_again"]  = failed_again_count
                state["no_r2_url"]     = len(no_r2)
                save_state(state)

        # 남은 GPU 버퍼 처리
        if gpu_buf:
            flush_gpu_buf(gpu_buf)
            gpu_buf = []

    # 남은 업로드 플러시
    while upload_batch_buf:
        batch = upload_batch_buf[:UPLOAD_BATCH]
        upload_batch_buf = upload_batch_buf[UPLOAD_BATCH:]
        upload_to_vectorize(batch)
        time.sleep(0.1)

    # 최종 상태 저장
    state["done_ids"]     = list(done_ids)
    state["success"]      = success_count
    state["failed_again"] = failed_again_count
    state["no_r2_url"]    = len(no_r2)
    save_state(state)

    print(f"\n\n🎉 retry 완료!")
    print(f"   새로 임베딩 성공: {success_count:,}개")
    print(f"   다시 실패:        {failed_again_count:,}개")
    print(f"   R2 URL 없어 스킵: {len(no_r2):,}개")


if __name__ == "__main__":
    main()
