"""
Armin Gallery - SigLIP 이미지 임베딩 생성기 (GPU 최적화 배치 처리 버전)
모델: google/siglip-base-patch16-224 (768차원)

사용법:
  pip install torch torchvision transformers pillow requests
  python generate_siglip.py

재시작 안전: 이미 처리된 항목은 자동 스킵합니다.
진행 현황은 EMBEDDING_PROGRESS.md 에서 실시간 확인 가능합니다.
"""

import os
import json
import time
import requests
import urllib3
from io import BytesIO
from PIL import Image
import torch
from transformers import AutoProcessor, AutoModel
from concurrent.futures import ThreadPoolExecutor, as_completed
import threading

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

# ============================================================
# 설정 (Colab 환경이면 자동으로 경로가 조정됩니다)
# ============================================================
IS_COLAB = os.path.exists('/content')
if IS_COLAB:
    # Google Drive 마운트 경로 기준
    BASE_DIR = "/content/drive/MyDrive/armin_siglip"
    DATA_DIR = "/content/armin-web-main/public/data"
else:
    BASE_DIR = "."
    DATA_DIR = "./public/data"

OUTPUT_JSONL     = os.path.join(BASE_DIR, "siglip_embeddings.jsonl")
PROCESSED_FILE   = os.path.join(BASE_DIR, "siglip_processed_ids.txt")
STATE_FILE       = os.path.join(BASE_DIR, "siglip_state.json")
PROGRESS_MD      = os.path.join(BASE_DIR, "EMBEDDING_PROGRESS.md")

# 공개 저장소에도 PROGRESS MD 복사 (프로젝트 루트)
PROJECT_PROGRESS_MD = "./EMBEDDING_PROGRESS.md"

MODEL_ID       = "google/siglip-base-patch16-224"
BATCH_SIZE     = 16    # GPU 메모리에 맞게 조정 (T4 기준 16 권장, 없으면 4)
SAVE_INTERVAL  = 50    # 50개마다 상태 저장
IMG_TIMEOUT    = 12    # 이미지 다운로드 타임아웃(초)
MAX_WORKERS    = 8     # 이미지 다운로드 병렬 스레드 수
IMG_SIZE       = 224   # SigLIP base 모델 입력 크기

# ============================================================
# 상태 관리
# ============================================================
write_lock = threading.Lock()

def load_state():
    state = {
        "model": MODEL_ID,
        "dimensions": 768,
        "stats": {"total_success": 0, "total_failed": 0, "total_skipped": 0},
        "museum_counts": {},
        "museum_processed": {},
        "started_at": time.strftime('%Y-%m-%d %H:%M:%S'),
        "last_updated": ""
    }
    if os.path.exists(STATE_FILE):
        with open(STATE_FILE, "r") as f:
            saved = json.load(f)
            state.update(saved)

    processed_set = set()
    if os.path.exists(PROCESSED_FILE):
        with open(PROCESSED_FILE, "r") as f:
            for line in f:
                stripped = line.strip()
                if stripped:
                    processed_set.add(stripped)
    return state, processed_set

def save_state(state):
    state["last_updated"] = time.strftime('%Y-%m-%d %H:%M:%S')
    with open(STATE_FILE, "w") as f:
        json.dump(state, f, indent=2)

# ============================================================
# 진행 대시보드 (EMBEDDING_PROGRESS.md 실시간 업데이트)
# ============================================================
def update_progress_md(state, current_e=None):
    total_imgs = sum(state['museum_counts'].values())
    total_done = sum(state['museum_processed'].values())
    total_pct  = (total_done / total_imgs * 100) if total_imgs > 0 else 0.0

    elapsed_note = ""
    if total_done > 0 and state.get("started_at"):
        try:
            from datetime import datetime
            start_dt = datetime.strptime(state["started_at"], '%Y-%m-%d %H:%M:%S')
            elapsed_sec = (datetime.now() - start_dt).total_seconds()
            speed = total_done / elapsed_sec if elapsed_sec > 0 else 0
            remaining = (total_imgs - total_done) / speed if speed > 0 else 0
            elapsed_note = f" | 처리 속도: **{speed:.1f}개/초** | 예상 잔여: **{remaining/3600:.1f}시간**"
        except Exception:
            pass

    lines = [
        f"# 🎨 SigLIP 임베딩 진행 현황",
        f"",
        f"> 마지막 업데이트: `{state['last_updated']}`{elapsed_note}",
        f"> 모델: `{state.get('model', MODEL_ID)}` | 차원: `{state.get('dimensions', 768)}D`",
        f"",
        f"## 📊 전체 진행률",
        f"",
        f"```",
        f"전체: {total_done:,} / {total_imgs:,} ({total_pct:.2f}%)",
        f"성공: {state['stats']['total_success']:,}  실패: {state['stats']['total_failed']:,}",
        f"{'█' * int(total_pct // 2)}{' ' * (50 - int(total_pct // 2))} {total_pct:.1f}%",
        f"```",
        f"",
    ]

    if current_e:
        lines += [f"🔥 **현재 처리 중**: `{current_e}`", f""]

    lines += [
        f"## 🏛️ 영구전시별 세부 현황",
        f"",
        f"| 영구전시 ID | 전체 | 완료 | % | 상태 |",
        f"|:---|---:|---:|---:|:---:|",
    ]

    for e_id, total in sorted(state['museum_counts'].items()):
        done    = state['museum_processed'].get(e_id, 0)
        pct     = (done / total * 100) if total > 0 else 0
        if current_e == e_id:
            status = "🔥 진행중"
        elif done >= total and total > 0:
            status = "✅ 완료"
        elif done > 0:
            status = "⏸️ 부분"
        else:
            status = "⏳ 대기"
        lines.append(f"| `{e_id}` | {total:,} | {done:,} | {pct:.1f}% | {status} |")

    lines += [
        f"",
        f"---",
        f"*이 파일은 스크립트가 자동으로 업데이트합니다. 중단 후 재실행해도 이어서 진행됩니다.*"
    ]

    content = "\n".join(lines)
    os.makedirs(BASE_DIR, exist_ok=True)
    with open(PROGRESS_MD, "w", encoding="utf-8") as f:
        f.write(content)

    # 프로젝트 루트에도 복사
    try:
        with open(PROJECT_PROGRESS_MD, "w", encoding="utf-8") as f:
            f.write(content)
    except Exception:
        pass

# ============================================================
# 이미지 다운로드 (병렬)
# ============================================================
def download_image(args):
    """(idx, art) 튜플을 받아 (idx, art, PIL.Image 또는 None) 반환"""
    idx, art = args
    img_url = art.get("i")
    if not img_url:
        return idx, art, None
    try:
        resp = requests.get(
            img_url, timeout=IMG_TIMEOUT, verify=False,
            headers={"User-Agent": "Mozilla/5.0 (compatible; ArminBot/1.0)"}
        )
        if resp.status_code == 200:
            img = Image.open(BytesIO(resp.content)).convert("RGB")
            return idx, art, img
    except Exception:
        pass
    return idx, art, None

# ============================================================
# 배치 임베딩
# ============================================================
def embed_batch(model, processor, batch_items, device):
    """
    batch_items: [(idx, art, PIL.Image), ...]
    유효한 이미지만 처리, 나머지는 None 벡터 반환
    반환: [(idx, art, vector_or_None, success: bool), ...]
    """
    valid   = [(i, art, img) for i, art, img in batch_items if img is not None]
    invalid = [(i, art, None) for i, art, img in batch_items if img is None]

    results = []
    if valid:
        imgs = [img for _, _, img in valid]
        try:
            inputs = processor(images=imgs, return_tensors="pt", padding=True).to(device)
            with torch.no_grad():
                feats = model.get_image_features(**inputs)
            feats = feats / feats.norm(p=2, dim=-1, keepdim=True)
            vectors = feats.cpu().float().tolist()

            for (i, art, _), vec in zip(valid, vectors):
                results.append((i, art, vec, True))
        except Exception as e:
            print(f"\n   ⚠️ 배치 임베딩 오류: {e}")
            for i, art, _ in valid:
                results.append((i, art, None, False))

    for i, art, _ in invalid:
        results.append((i, art, None, False))

    return results

# ============================================================
# 메인
# ============================================================
def main():
    os.makedirs(BASE_DIR, exist_ok=True)
    print(f"🚀 초기화 중... 모델: {MODEL_ID}")
    print(f"📁 출력 디렉토리: {BASE_DIR}")

    # GPU 설정
    if torch.cuda.is_available():
        device = "cuda"
        print(f"💻 GPU: {torch.cuda.get_device_name(0)}")
    elif hasattr(torch.backends, 'mps') and torch.backends.mps.is_available():
        device = "mps"
        print("💻 Apple Silicon MPS 사용")
    else:
        device = "cpu"
        print("💻 CPU 사용 (느릴 수 있음 - Colab GPU 권장)")

    # 모델 로드
    print("📥 모델 로딩 중...")
    model     = AutoModel.from_pretrained(MODEL_ID).to(device)
    processor = AutoProcessor.from_pretrained(MODEL_ID)
    model.eval()
    print("✅ 모델 로드 완료!")

    # 상태 복원
    state, processed_ids = load_state()
    print(f"📋 이전 진행: {len(processed_ids):,}개 처리됨")

    # 데이터 로드 및 영구전시별 그룹핑
    manifest_path = os.path.join(DATA_DIR, "search-manifest.json")
    if not os.path.exists(manifest_path):
        print(f"❌ search-manifest.json 없음: {manifest_path}")
        print("   DATA_DIR 경로를 확인하거나 Colab에서 armin-web-main 레포를 clone하세요.")
        return

    print("🔍 데이터 스캔 중...")
    grouped = {}
    with open(manifest_path) as f:
        manifest = json.load(f)

    for chunk_file in manifest["chunks"]:
        chunk_path = os.path.join(DATA_DIR, chunk_file)
        with open(chunk_path) as f:
            data = json.load(f)
        items = data[0] if isinstance(data, list) and isinstance(data[0], list) else data
        for art in items:
            if not art.get("i"):
                continue
            e_id = art.get("e", "unknown")
            grouped.setdefault(e_id, []).append(art)

    total_all = sum(len(v) for v in grouped.values())
    print(f"📊 총 {total_all:,}개 작품 (이미지 있음) / {len(grouped)}개 영구전시")

    # museum_counts 갱신
    for e_id, arts in grouped.items():
        state["museum_counts"][e_id] = len(arts)
    save_state(state)
    update_progress_md(state)

    # 임베딩 출력 파일
    output_f = open(OUTPUT_JSONL, "a", encoding="utf-8")

    processed_since_save = 0
    total_processed = 0
    session_start = time.time()

    try:
        for e_id in sorted(grouped.keys()):
            arts = grouped[e_id]
            already_done = state["museum_processed"].get(e_id, 0)

            # 이미 완료된 전시 스킵
            if already_done >= len(arts):
                state["stats"]["total_skipped"] = state["stats"].get("total_skipped", 0) + len(arts)
                continue

            print(f"\n🏛️  [{e_id}] 처리 시작 ({len(arts):,}개, 이미 완료: {already_done:,}개)")
            update_progress_md(state, current_e=e_id)

            # 미처리 항목만 추려냄
            pending = []
            for art in arts:
                art_id = art.get("id") or f"{art.get('e','x')}-{art.get('n','x')}"
                if art_id not in processed_ids:
                    pending.append(art)

            if not pending:
                state["museum_processed"][e_id] = len(arts)
                save_state(state)
                update_progress_md(state, current_e=e_id)
                continue

            # 배치 단위로 처리
            for batch_start in range(0, len(pending), BATCH_SIZE):
                batch_arts = pending[batch_start:batch_start + BATCH_SIZE]
                batch_with_idx = list(enumerate(batch_arts))

                # 병렬 이미지 다운로드
                downloaded = [None] * len(batch_arts)
                with ThreadPoolExecutor(max_workers=min(MAX_WORKERS, len(batch_arts))) as ex:
                    futures = {ex.submit(download_image, (i, art)): i for i, art in batch_with_idx}
                    for fut in as_completed(futures):
                        idx, art, img = fut.result()
                        downloaded[idx] = (idx, art, img)

                # 임베딩 생성
                results = embed_batch(model, processor, downloaded, device)

                # 결과 저장
                for _, art, vec, success in results:
                    art_id = art.get("id") or f"{art.get('e','x')}-{art.get('n','x')}"

                    if success and vec:
                        record = {
                            "id":  art_id,
                            "e":   e_id,
                            "n":   art.get("n", ""),
                            "a":   art.get("a", ""),
                            "m":   art.get("m", ""),
                            "i":   art.get("i", ""),
                            "u":   art.get("u", ""),
                            "vector": vec
                        }
                        with write_lock:
                            output_f.write(json.dumps(record, ensure_ascii=False) + "\n")
                            output_f.flush()
                        state["stats"]["total_success"] += 1
                    else:
                        state["stats"]["total_failed"] += 1

                    # 처리된 ID 기록
                    with write_lock:
                        with open(PROCESSED_FILE, "a") as pf:
                            pf.write(art_id + "\n")
                    processed_ids.add(art_id)
                    state["museum_processed"][e_id] = state["museum_processed"].get(e_id, 0) + 1

                processed_since_save += len(batch_arts)
                total_processed += len(batch_arts)

                # 진행률 출력
                elapsed = time.time() - session_start
                speed = total_processed / elapsed if elapsed > 0 else 0
                done_this_e = state["museum_processed"].get(e_id, 0)
                print(
                    f"\r   [{e_id}] {done_this_e}/{len(arts)} | "
                    f"전체: {state['stats']['total_success']:,}✓ {state['stats']['total_failed']:,}✗ | "
                    f"속도: {speed:.1f}/s",
                    end=""
                )

                # 주기적 저장
                if processed_since_save >= SAVE_INTERVAL:
                    save_state(state)
                    update_progress_md(state, current_e=e_id)
                    processed_since_save = 0

            # 전시 완료 시 저장
            state["museum_processed"][e_id] = len(arts)
            save_state(state)
            update_progress_md(state, current_e=e_id)
            print(f"\n   ✅ [{e_id}] 완료!")

    except KeyboardInterrupt:
        print("\n\n⚠️  중단됨. 진행 상황이 저장되었습니다. 다시 실행하면 이어서 처리합니다.")
    finally:
        output_f.close()
        save_state(state)
        update_progress_md(state)
        print(f"\n\n🎉 처리 종료!")
        print(f"   성공: {state['stats']['total_success']:,}개")
        print(f"   실패: {state['stats']['total_failed']:,}개")
        print(f"   출력: {OUTPUT_JSONL}")
        print(f"   현황: {PROGRESS_MD}")

if __name__ == "__main__":
    main()
