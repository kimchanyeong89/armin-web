"""
SigLIP 고속 임베딩 스크립트 - 프리페치(prefetch) 방식
이미지 다운로드를 백그라운드 스레드에서 병렬로 미리 받아두고,
GPU(MPS)는 쉬지 않고 추론만 담당 → 기존 대비 ~2-2.5배 속도 향상

기존: 다운로드(8초) → GPU(0.3초) → 업로드 → 반복 (GPU 대기시간 낭비)
개선: [다운로드x4 병렬] → GPU 큐에서 연속 처리 → [업로드 비동기]
"""
import json
import requests
import time
import datetime
import gc
import torch
import urllib3
import traceback
from io import BytesIO
from pathlib import Path
from PIL import Image
from transformers import AutoProcessor, AutoModel
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
from concurrent.futures import ThreadPoolExecutor, as_completed
from queue import Queue, Empty
import threading

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

WORKER_UPSERT_URL = "https://armin-semantic-search.armin-art.workers.dev/upsert"
BATCH_SIZE = 50
DATA_DIR = Path('public/data')
OUTPUT_DIR = Path('embedding_results')
OUTPUT_DIR.mkdir(exist_ok=True)

# 기존 파일과 공유 (재개 가능)
STATE_FILE = Path('siglip_state.json')
PROCESSED_FILE = Path('siglip_processed_ids.txt')
FAILED_FILE = Path('siglip_failed.jsonl')
DASHBOARD_FILE = Path('EMBEDDING_PROGRESS.md')

# 다운로드 병렬 수 (I/O bound이므로 4~8개가 적절)
PREFETCH_WORKERS = 6
# GPU 배치 크기 (한 번에 여러 이미지 추론 - 메모리 허용 시)
GPU_BATCH = 4  # MPS에서 안정적인 배치 크기

MODEL_ID = "google/siglip-base-patch16-224"

session = requests.Session()
retries = Retry(total=2, backoff_factor=0.5, status_forcelist=[500, 502, 503, 504])
session.mount('http://', HTTPAdapter(max_retries=retries, pool_connections=20, pool_maxsize=20))
session.mount('https://', HTTPAdapter(max_retries=retries, pool_connections=20, pool_maxsize=20))

# 파일 쓰기 lock (스레드 안전)
file_lock = threading.Lock()

def load_state():
    state = { "stats": {"total_success": 0, "total_failed": 0, "total_upserted": 0}, "museum_counts": {}, "museum_processed": {}, "museum_failed": {} }
    if STATE_FILE.exists():
        try:
            state.update(json.loads(STATE_FILE.read_text()))
        except: pass
        
    if "museum_failed" not in state:
        state["museum_failed"] = {}

    processed_set = set()
    if PROCESSED_FILE.exists():
        try:
            for line in PROCESSED_FILE.read_text().splitlines():
                if line.strip(): processed_set.add(line.strip())
        except: pass
        
    # 복구: siglip_failed.jsonl에서 실패 내역 가져오기
    if FAILED_FILE.exists():
        try:
            for line in FAILED_FILE.read_text().splitlines():
                if line.strip():
                    item = json.loads(line)
                    e_id = item.get("e", "unknown")
                    state["museum_failed"][e_id] = state["museum_failed"].get(e_id, 0) + 1
        except: pass
        
    return state, processed_set

def save_state(state):
    with file_lock:
        STATE_FILE.write_text(json.dumps(state))

START_TIME = time.time()
ITEMS_PROCESSED_THIS_SESSION = 0

def render_dashboard(state, current_e=None, last_error=None):
    total_imgs = sum(state['museum_counts'].values())
    total_done = sum(state['museum_processed'].values())
    total_percent = (total_done / total_imgs * 100) if total_imgs > 0 else 0
    elapsed = time.time() - START_TIME
    if ITEMS_PROCESSED_THIS_SESSION > 5:
        items_per_sec = ITEMS_PROCESSED_THIS_SESSION / elapsed
        remaining_items = total_imgs - total_done
        eta_seconds = remaining_items / items_per_sec if items_per_sec > 0 else 0
        eta_str = str(datetime.timedelta(seconds=int(eta_seconds)))
        speed_str = f"{items_per_sec:.2f} 개/초"
    else:
        eta_str = "계산중..."
        speed_str = "계산중..."
    md = "# 🎨 SigLIP 임베딩 진행 현황 대시보드 (MacBook Pro 로컬 구동중 - 고속모드)\n\n"
    md += f"> **마지막 업데이트**: {time.strftime('%Y-%m-%d %H:%M:%S')}\n"
    md += f"> **총 처리율**: **{total_percent:.2f}% ({total_done:,} / {total_imgs:,})**\n"
    md += f"> **현재 속도**: {speed_str} | **예상 남은 시간**: {eta_str}\n\n"
    md += f"- ✅ **성공(생성완료)**: {state['stats'].get('total_success',0):,} 건\n"
    md += f"- ☁️ **Cloudflare 업로드**: {state['stats'].get('total_upserted',0):,} 건\n"
    md += f"- ❌ **실패**: {state['stats'].get('total_failed',0):,} 건\n\n"
    md += f"💡 **실패한 데이터는 `siglip_failed.jsonl`에 누적 기록됩니다.**\n\n"
    if last_error:
        md += f"⚠️ **최근 에러**: `{last_error}`\n\n"
    if current_e and current_e != "모두 완료 🎉":
        md += f"🔥 **현재 집중 처리 중인 영구전시**: `{current_e}`\n\n"
    elif current_e == "모두 완료 🎉":
        md += f"🎊 **모든 처리가 완료되었습니다!**\n\n"
    md += "| 영구전시 ID | 전체 수 | 처리완료 | 실패 | 진행률(%) | 상태 |\n"
    md += "|:---|---:|---:|---:|---:|:---:|\n"
    for e_id, total in sorted(state['museum_counts'].items()):
        done = state['museum_processed'].get(e_id, 0)
        failed = state.get('museum_failed', {}).get(e_id, 0)
        percent = (done / total) * 100 if total > 0 else 0
        
        status = "✅ 완료" if done >= total and total > 0 else "⏳ 대기중"
        if done >= total and total > 0 and failed > 0:
            status = "⚠️ 실패포함"
        elif current_e == e_id:
            status = "🔥 **진행중**"
        elif done > 0 and done < total:
            status = "⏳ 부분 진행"
            
        md += f"| **{e_id}** | {total:,} | {done:,} | {failed:,} | {percent:.1f}% | {status} |\n"
    try:
        with file_lock:
            DASHBOARD_FILE.write_text(md)
    except: pass

def download_image(art):
    """단일 이미지 다운로드 (스레드풀에서 실행)"""
    art_id = art.get("id") or f"{art.get('e','x')}-{art.get('n','x')}"
    img_url = art.get("i")
    try:
        # User-Agent를 최대한 실제 브라우저와 비슷하게 설정하여 Cloudflare 등 차단 우회
        headers = {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
            "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
        }
        resp = session.get(img_url, timeout=10, verify=False, headers=headers)
        if resp.status_code == 200:
            try:
                image = Image.open(BytesIO(resp.content)).convert("RGB")
                return art_id, img_url, image, None
            except Exception as e:
                # HTTP 200으로 반환된 HTML 페이지, 혹은 PIL 지원 안되는 이미지 등
                return art_id, img_url, None, f"이미지 파싱 실패: {str(e)[:30]}"
        else:
            return art_id, img_url, None, f"HTTP {resp.status_code}"
    except Exception as e:
        return art_id, img_url, None, str(e)[:60]

def upload_to_cloudflare(batch):
    if not batch: return True, None
    payload = {"vectors": batch}
    try:
        resp = session.post(WORKER_UPSERT_URL, json=payload, timeout=20)
        if resp.status_code == 200:
            return True, None
        else:
            return False, f"HTTP {resp.status_code}: {resp.text[:100]}"
    except Exception as e:
        return False, f"Exception: {str(e)[:100]}"

print("🚀 SigLIP 고속 임베딩 (프리페치 모드) 시작", flush=True)
device = "mps" if torch.backends.mps.is_available() else "cpu"
print(f"   device: {device}", flush=True)
model = AutoModel.from_pretrained(MODEL_ID).to(device)
processor = AutoProcessor.from_pretrained(MODEL_ID)
model.eval()

state, processed_ids_set = load_state()
manifest_path = DATA_DIR / "search-manifest.json"
last_err_msg = None

if not manifest_path.exists():
    print("❌ manifest.json not found.")
    exit(1)

manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
grouped_artworks = {}
print("📂 데이터 분류 중...", flush=True)
for chunk_file in manifest.get("chunks", []):
    chunk_path = DATA_DIR / chunk_file
    if not chunk_path.exists(): continue
    data = json.loads(chunk_path.read_text(encoding="utf-8"))
    artworks = data[0] if isinstance(data[0], list) else data
    for art in artworks:
        if not art.get("i"): continue
        e_id = art.get("e", "unknown")
        if e_id not in grouped_artworks: grouped_artworks[e_id] = []
        grouped_artworks[e_id].append(art)

for e_id, arts in grouped_artworks.items():
    state["museum_counts"][e_id] = len(arts)

output_file = OUTPUT_DIR / "siglip_embeddings.jsonl"
sorted_exhibitions = sorted(grouped_artworks.keys())
upload_batch = []
render_dashboard(state)

print(f"⚡ 고속 임베딩 시작 (프리페치 {PREFETCH_WORKERS}개, GPU배치 {GPU_BATCH})...", flush=True)

for e_id in sorted_exhibitions:
    arts = grouped_artworks[e_id]
    if state["museum_processed"].get(e_id, 0) >= len(arts): continue

    # 미처리 항목만 필터
    pending = [a for a in arts if (a.get("id") or f"{a.get('e','x')}-{a.get('n','x')}") not in processed_ids_set]
    if not pending: continue

    print(f"\n🏛️  [{e_id}] 미처리: {len(pending)}개 처리 시작", flush=True)

    # ThreadPoolExecutor로 이미지 프리페치
    with ThreadPoolExecutor(max_workers=PREFETCH_WORKERS) as executor:
        futures = {executor.submit(download_image, art): art for art in pending}

        gpu_buffer = []  # (art_id, img_url, image) 버퍼
        for future in as_completed(futures):
            art_id, img_url, image, err = future.result()

            if err or image is None:
                state["stats"]["total_failed"] = state["stats"].get("total_failed", 0) + 1
                last_err_msg = f"다운로드 실패: {err}"
                state["museum_failed"][e_id] = state["museum_failed"].get(e_id, 0) + 1
                state["museum_processed"][e_id] = state["museum_processed"].get(e_id, 0) + 1
                with file_lock:
                    with open(FAILED_FILE, "a") as f:
                        f.write(json.dumps({"id": art_id, "e": e_id, "error": err, "url": img_url}) + "\n")
                    with open(PROCESSED_FILE, "a") as f:
                        f.write(art_id + "\n")
                processed_ids_set.add(art_id)
                ITEMS_PROCESSED_THIS_SESSION += 1
                continue

            gpu_buffer.append((art_id, img_url, image))

            # GPU_BATCH 개 또는 마지막 배치 처리
            if len(gpu_buffer) >= GPU_BATCH:
                batch_arts = gpu_buffer[:GPU_BATCH]
                gpu_buffer = gpu_buffer[GPU_BATCH:]

                try:
                    images_tensor = processor(images=[b[2] for b in batch_arts], return_tensors="pt", padding=True).to(device)
                    with torch.no_grad():
                        feats = model.get_image_features(**images_tensor)
                    feats = feats / feats.norm(p=2, dim=-1, keepdim=True)
                    vectors = feats.cpu().numpy().tolist()
                    del images_tensor, feats
                    for b in batch_arts:
                        b[2].close()

                    for i, (bid, burl, _) in enumerate(batch_arts):
                        vec = vectors[i]
                        with file_lock:
                            with open(output_file, "a") as f_out:
                                f_out.write(json.dumps({"id": bid, "e": e_id, "vector": vec}) + "\n")
                        upload_batch.append({"id": bid, "values": vec, "metadata": {"e": e_id}})
                        state["stats"]["total_success"] = state["stats"].get("total_success", 0) + 1
                        state["museum_processed"][e_id] = state["museum_processed"].get(e_id, 0) + 1
                        ITEMS_PROCESSED_THIS_SESSION += 1
                    last_err_msg = None

                except Exception as gpu_e:
                    last_err_msg = f"GPU에러: {str(gpu_e)[:30]}"
                    for bid, burl, img in batch_arts:
                        state["stats"]["total_failed"] = state["stats"].get("total_failed", 0) + 1
                        with file_lock:
                            state["museum_failed"][e_id] = state["museum_failed"].get(e_id, 0) + 1
                            state["museum_processed"][e_id] = state["museum_processed"].get(e_id, 0) + 1
                            with open(FAILED_FILE, "a") as f:
                                f.write(json.dumps({"id": bid, "e": e_id, "error": str(gpu_e)[:80], "url": burl}) + "\n")
                            with open(PROCESSED_FILE, "a") as f:
                                f.write(bid + "\n")
                        processed_ids_set.add(bid)
                        ITEMS_PROCESSED_THIS_SESSION += 1

                # Cloudflare 업로드
                if len(upload_batch) >= BATCH_SIZE:
                    cf_ok, cf_err = upload_to_cloudflare(upload_batch)
                    if cf_ok:
                        state["stats"]["total_upserted"] = state["stats"].get("total_upserted", 0) + len(upload_batch)
                        for b in upload_batch:
                            with file_lock:
                                with open(PROCESSED_FILE, "a") as f:
                                    f.write(b["id"] + "\n")
                            processed_ids_set.add(b["id"])
                    else:
                        state["stats"]["total_failed"] = state["stats"].get("total_failed", 0) + len(upload_batch)
                        last_err_msg = f"Cloudflare 업로드 실패: {cf_err}"
                        print(last_err_msg, flush=True)
                        for b in upload_batch:
                            with file_lock:
                                state["museum_failed"][b["metadata"]["e"]] = state["museum_failed"].get(b["metadata"]["e"], 0) + 1
                                # museum_processed was already incremented during GPU phase, so no need to increment it again
                                with open(FAILED_FILE, "a") as f:
                                    f.write(json.dumps({"id": b["id"], "e": b["metadata"]["e"], "error": cf_err}) + "\n")
                                with open(PROCESSED_FILE, "a") as f:
                                    f.write(b["id"] + "\n")
                            processed_ids_set.add(b["id"])
                    upload_batch = []

                render_dashboard(state, current_e=e_id, last_error=last_err_msg)
                if ITEMS_PROCESSED_THIS_SESSION % 50 == 0:
                    save_state(state)
                    gc.collect()
                    print(f"  ✅ {state['stats'].get('total_success')}개 완료 ({ITEMS_PROCESSED_THIS_SESSION/(time.time()-START_TIME):.2f}/초)", flush=True)

        # 남은 gpu_buffer 처리
        if gpu_buffer:
            try:
                images_tensor = processor(images=[b[2] for b in gpu_buffer], return_tensors="pt", padding=True).to(device)
                with torch.no_grad():
                    feats = model.get_image_features(**images_tensor)
                feats = feats / feats.norm(p=2, dim=-1, keepdim=True)
                vectors = feats.cpu().numpy().tolist()
                del images_tensor, feats
                for b in gpu_buffer:
                    b[2].close()
                for i, (bid, burl, _) in enumerate(gpu_buffer):
                    vec = vectors[i]
                    with file_lock:
                        with open(output_file, "a") as f_out:
                            f_out.write(json.dumps({"id": bid, "e": e_id, "vector": vec}) + "\n")
                    upload_batch.append({"id": bid, "values": vec, "metadata": {"e": e_id}})
                    state["stats"]["total_success"] = state["stats"].get("total_success", 0) + 1
                    state["museum_processed"][e_id] = state["museum_processed"].get(e_id, 0) + 1
                    ITEMS_PROCESSED_THIS_SESSION += 1
            except Exception as e:
                for bid, burl, _ in gpu_buffer:
                    with file_lock:
                        with open(FAILED_FILE, "a") as f:
                            f.write(json.dumps({"id": bid, "e": e_id, "error": str(e)[:80], "url": burl}) + "\n")
                        with open(PROCESSED_FILE, "a") as f:
                            f.write(bid + "\n")
                    processed_ids_set.add(bid)
                    ITEMS_PROCESSED_THIS_SESSION += 1

# 마지막 업로드
if upload_batch:
    cf_ok, cf_err = upload_to_cloudflare(upload_batch)
    if cf_ok:
        state["stats"]["total_upserted"] = state["stats"].get("total_upserted", 0) + len(upload_batch)
        for b in upload_batch:
            with file_lock:
                with open(PROCESSED_FILE, "a") as f:
                    f.write(b["id"] + "\n")
            processed_ids_set.add(b["id"])
    else:
        state["stats"]["total_failed"] = state["stats"].get("total_failed", 0) + len(upload_batch)
        print(f"Cloudflare 마지막 업로드 실패: {cf_err}", flush=True)
        for b in upload_batch:
            with file_lock:
                state["museum_failed"][b["metadata"]["e"]] = state["museum_failed"].get(b["metadata"]["e"], 0) + 1
                with open(FAILED_FILE, "a") as f:
                    f.write(json.dumps({"id": b["id"], "e": b["metadata"]["e"], "error": cf_err}) + "\n")
                with open(PROCESSED_FILE, "a") as f:
                    f.write(b["id"] + "\n")
            processed_ids_set.add(b["id"])

save_state(state)
render_dashboard(state, current_e="모두 완료 🎉")
print("\n🎊 모든 SigLIP 임베딩 완료!", flush=True)
