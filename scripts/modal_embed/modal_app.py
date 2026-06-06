"""
Jina CLIP v2 임베딩 파이프라인 — Modal Labs 전용

설계 요약
─────────
- 모델: jinaai/jina-clip-v2 (1024D, 다국어, EVA-L/14 이미지 인코더)
- GPU: A10G × 최대 4컨테이너 병렬 (~$1.10/h × 4)
- 데이터: 614k 작품 (scripts/modal_embed/inventory.jsonl, 사전 빌드됨)
- 체크포인트: Modal Volume `jina-embed-vol` 의 /data/processed_ids.txt
- 업서트: Cloudflare Worker `/upsert-jina` (신규 인덱스 armin-art-search-jina-1024)
- 실행: `modal run --detach scripts/modal_embed/modal_app.py::main`

준비 (이미 처리 완료/예정인 것)
  1. 새 Vectorize 인덱스 생성 + worker 바인딩 + /upsert-jina 엔드포인트 — 별도 작업
  2. inventory.jsonl 업로드 — `modal volume put jina-embed-vol scripts/modal_embed/inventory.jsonl /inventory.jsonl`

사용
  # 1. 작은 테스트 (10장)
  modal run scripts/modal_embed/modal_app.py::main --test

  # 2. 본 임베딩 (전체, 백그라운드)
  modal run --detach scripts/modal_embed/modal_app.py::main

  # 3. 진행 모니터
  modal app logs jina-clip-v2-embed
"""
import modal

# ──────────────────────────────────────────────────────────────
# 상수
# ──────────────────────────────────────────────────────────────
MODEL_ID = "jinaai/jina-clip-v2"
WORKER_UPSERT_URL = "https://armin-semantic-search.armin-art.workers.dev/upsert-jina"
VOLUME_NAME = "jina-embed-vol"

# ──────────────────────────────────────────────────────────────
# 컨테이너 이미지 — Jina CLIP v2를 빌드 시점에 미리 캐시
# ──────────────────────────────────────────────────────────────
def _prefetch_model():
    """Bake the model into the image so cold starts skip the 3GB download."""
    from transformers import AutoModel
    AutoModel.from_pretrained(MODEL_ID, trust_remote_code=True)


image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install(
        "torch==2.4.1",
        "transformers==4.45.2",
        "pillow",
        "requests",
        "einops",
        "timm",
    )
    .run_function(_prefetch_model)
)

vol = modal.Volume.from_name(VOLUME_NAME, create_if_missing=True)
app = modal.App("jina-clip-v2-embed", image=image)


# ──────────────────────────────────────────────────────────────
# GPU 클래스 — 모델은 @enter에서 한 번만 로드, 메서드는 재사용
# ──────────────────────────────────────────────────────────────
@app.cls(
    gpu="A10G",
    volumes={"/data": vol},
    timeout=60 * 60 * 4,        # 컨테이너당 4시간 한도
    scaledown_window=60,        # 60초 idle 후 컨테이너 종료
    max_containers=6,           # 동시 컨테이너 6개 = 비용 캡 ~$6.6/h, 예상 총 비용 $15-20
)
class JinaEmbedder:
    @modal.enter()
    def load(self):
        import torch
        from transformers import AutoModel
        print(f"Loading {MODEL_ID} on CUDA...")
        self.model = (
            AutoModel.from_pretrained(MODEL_ID, trust_remote_code=True)
            .to("cuda")
            .eval()
        )
        self.torch = torch
        print("Model ready.")

    @modal.method()
    def embed_batch(self, items: list[dict]) -> dict:
        """
        items: [{id, i (image url), e (exhibition_id)}, ...]
        returns: {ok: [{id, e, vector}], bad: [{id, e, error}]}
        """
        from PIL import Image
        import requests, io, urllib3
        from concurrent.futures import ThreadPoolExecutor

        urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

        HEADERS = {
            "User-Agent": (
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
            ),
            "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        }

        def fetch(item):
            # R2 fallback 미적용 사유 (2026-05-23 감사):
            #   - 매니페스트의 97%는 이미 i 필드가 R2 URL → 1차 시도가 R2
            #   - 외부 호스트 3% (slks.dk, kansallisgalleria.fi 등)은 R2 mirror가 없음
            #     (`/artworks/{exhibition}/{id}` HEAD probe로 확인 — 전부 404)
            #   - 실패의 거의 전부가 원본 URL 자체가 죽은 (404) 경우
            # 향후 데이터팀이 외부 컬렉션을 R2로 mirror하면 여기에 폴백 로직 추가.
            try:
                r = requests.get(item["i"], timeout=15, headers=HEADERS, verify=False)
                r.raise_for_status()
                img = Image.open(io.BytesIO(r.content)).convert("RGB")
                return item, img, None
            except Exception as e:
                return item, None, str(e)[:120]

        # I/O bound — 이전 실행에서 fetch가 GPU보다 4-5배 느림. 워커 4배로 늘려서 균형.
        with ThreadPoolExecutor(max_workers=48) as ex:
            results = list(ex.map(fetch, items))

        good = [(it, img) for it, img, err in results if img is not None]
        bad = [
            {"id": it["id"], "e": it["e"], "error": err}
            for it, _, err in results
            if err is not None
        ]

        if not good:
            return {"ok": [], "bad": bad}

        imgs = [g[1] for g in good]
        with self.torch.no_grad():
            # encode_image: returns L2-normalized 1024D tensors by default
            vecs = self.model.encode_image(imgs).tolist()

        # close PIL handles
        for _, img in good:
            try: img.close()
            except: pass

        ok = [
            {"id": it["id"], "e": it["e"], "vector": v}
            for (it, _), v in zip(good, vecs)
        ]
        return {"ok": ok, "bad": bad}


# ──────────────────────────────────────────────────────────────
# 클라우드 오케스트레이터 — 전체 실행을 Modal 위에서 수행 (detach 가능)
# ──────────────────────────────────────────────────────────────
@app.function(
    volumes={"/data": vol},
    timeout=60 * 60 * 12,   # 최대 12시간
)
def run_embedding(batch_size: int = 32, max_items: int = 0):
    """
    Modal 위에서 전체 인벤토리 처리.
    - 볼륨의 inventory.jsonl 읽기
    - 볼륨의 processed_ids.txt 로 재개
    - embed_batch.map() 으로 4컨테이너 병렬 처리
    - 결과를 worker /upsert-jina 로 업서트
    - 진행상황을 볼륨에 커밋
    """
    import json
    import requests
    from pathlib import Path
    import time

    INV = Path("/data/inventory.jsonl")
    PROCESSED = Path("/data/processed_ids.txt")
    FAILED = Path("/data/failed.jsonl")

    if not INV.exists():
        raise RuntimeError(
            f"{INV} not found. Upload first:\n"
            f"  modal volume put {VOLUME_NAME} scripts/modal_embed/inventory.jsonl /inventory.jsonl"
        )

    # 1. 체크포인트 로드
    processed = set()
    if PROCESSED.exists():
        with PROCESSED.open() as f:
            for line in f:
                s = line.strip()
                if s:
                    processed.add(s)
    print(f"[checkpoint] already processed: {len(processed):,}")

    # 2. 보류 리스트 (skip processed + manifest 내 중복 ID 제거)
    #    매니페스트 자체에 4,683개 중복 ID가 있어 (감사 확인) — set으로 dedup 하지 않으면
    #    같은 작품이 같은 실행 안에서 두 번 임베딩됨.
    pending = []
    seen_in_pending: set = set()
    dup_in_inventory = 0
    with INV.open() as f:
        for line in f:
            item = json.loads(line)
            iid = str(item["id"])
            if iid in processed:
                continue
            if iid in seen_in_pending:
                dup_in_inventory += 1
                continue
            seen_in_pending.add(iid)
            pending.append(item)
            if max_items and len(pending) >= max_items:
                break
    print(f"[pending] {len(pending):,} items to embed (dedup from inventory: {dup_in_inventory:,} dupes skipped)")

    if not pending:
        print("Nothing to do.")
        return {"ok": 0, "bad": 0, "skipped": 0}

    # 3. 배치
    batches = [pending[i : i + batch_size] for i in range(0, len(pending), batch_size)]
    print(f"[batches] {len(batches):,} batches of up to {batch_size}")

    sess = requests.Session()
    total_ok = 0
    total_bad = 0
    upsert_fail = 0
    t0 = time.time()

    embedder = JinaEmbedder()

    # 4. 병렬 디스패치
    for i, result in enumerate(
        embedder.embed_batch.map(batches, return_exceptions=True)
    ):
        if isinstance(result, Exception):
            print(f"[batch {i}] EXCEPTION: {result}")
            continue

        ok_items = result.get("ok", [])
        bad_items = result.get("bad", [])

        # 4a. OK 벡터 → worker 업서트
        # 주의: 일부 컬렉션의 ID는 number 타입. 모든 파일 쓰기 / payload 빌드 시 str() 캐스팅.
        if ok_items:
            payload = [
                {"id": str(x["id"]), "values": x["vector"], "metadata": {"e": str(x["e"])}}
                for x in ok_items
            ]
            try:
                r = sess.post(WORKER_UPSERT_URL, json={"vectors": payload}, timeout=30)
                if r.status_code == 200:
                    with PROCESSED.open("a") as f:
                        for x in ok_items:
                            f.write(str(x["id"]) + "\n")
                    total_ok += len(ok_items)
                else:
                    upsert_fail += 1
                    print(f"[batch {i}] upsert HTTP {r.status_code}: {r.text[:200]}")
                    # do NOT mark processed — will retry on next run
            except Exception as e:
                upsert_fail += 1
                print(f"[batch {i}] upsert exception: {e}")

        # 4b. 실패 기록 + 재시도 방지
        if bad_items:
            with FAILED.open("a") as f:
                for b in bad_items:
                    f.write(json.dumps(b, ensure_ascii=False, default=str) + "\n")
            with PROCESSED.open("a") as f:
                for b in bad_items:
                    f.write(str(b["id"]) + "\n")  # 영구 실패도 processed로 마킹 → 무한루프 방지
            total_bad += len(bad_items)

        # 4c. 주기적으로 볼륨 커밋 + 진행 로그
        if (i + 1) % 20 == 0:
            vol.commit()
            elapsed = time.time() - t0
            done = total_ok + total_bad
            rate = done / elapsed if elapsed > 0 else 0
            remaining = len(pending) - done
            eta = remaining / rate if rate > 0 else 0
            print(
                f"[progress] batches {i+1}/{len(batches)} | "
                f"ok={total_ok:,} bad={total_bad:,} | "
                f"{rate:.1f} imgs/s | "
                f"ETA {int(eta/60)}min"
            )

    vol.commit()
    elapsed = time.time() - t0
    print(
        f"\n[done] ok={total_ok:,} bad={total_bad:,} upsert_fail={upsert_fail} "
        f"in {int(elapsed/60)}min"
    )
    return {"ok": total_ok, "bad": total_bad, "upsert_fail": upsert_fail}


# ──────────────────────────────────────────────────────────────
# 로컬 진입점 — CLI에서 호출
# ──────────────────────────────────────────────────────────────
@app.local_entrypoint()
def main(test: bool = False, max_items: int = 0, batch_size: int = 64):
    if test:
        max_items = 10
        print("[mode] TEST RUN — 10장만 처리")
    else:
        print(f"[mode] FULL RUN — max_items={max_items or 'all'}")

    result = run_embedding.remote(batch_size=batch_size, max_items=max_items)
    print(f"\nResult: {result}")
