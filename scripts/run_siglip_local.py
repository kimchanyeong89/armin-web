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

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

WORKER_UPSERT_URL = "https://armin-semantic-search.armin-art.workers.dev/upsert"
BATCH_SIZE = 50
DATA_DIR = Path('public/data')
OUTPUT_DIR = Path('embedding_results')
OUTPUT_DIR.mkdir(exist_ok=True)
STATE_FILE = Path('siglip_state.json')
PROCESSED_FILE = Path('siglip_processed_ids.txt')
FAILED_FILE = Path('siglip_failed.jsonl')
DASHBOARD_FILE = Path('EMBEDDING_PROGRESS.md')

MODEL_ID = "google/siglip-base-patch16-224"

session = requests.Session()
retries = Retry(total=2, backoff_factor=0.5, status_forcelist=[500, 502, 503, 504])
session.mount('http://', HTTPAdapter(max_retries=retries))
session.mount('https://', HTTPAdapter(max_retries=retries))

def load_state():
    state = { "stats": {"total_success": 0, "total_failed": 0, "total_upserted": 0}, "museum_counts": {}, "museum_processed": {} }
    if STATE_FILE.exists():
        try:
            state.update(json.loads(STATE_FILE.read_text()))
        except: pass
    processed_set = set()
    if PROCESSED_FILE.exists():
        try:
            for line in PROCESSED_FILE.read_text().splitlines():
                if line.strip(): processed_set.add(line.strip())
        except: pass
    return state, processed_set

def save_state(state):
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
    
    md = "# 🎨 SigLIP 임베딩 진행 현황 대시보드 (MacBook Pro 로컬 구동중)\n\n"
    md += f"> **마지막 업데이트**: {time.strftime('%Y-%m-%d %H:%M:%S')}\n"
    md += f"> **총 처리율**: **{total_percent:.2f}% ({total_done:,} / {total_imgs:,})**\n"
    md += f"> **현재 속도**: {speed_str} | **예상 남은 시간**: {eta_str}\n\n"
    md += f"- ✅ **성공(생성완료)**: {state['stats'].get('total_success',0):,} 건\n"
    md += f"- ☁️ **Cloudflare 업로드**: {state['stats'].get('total_upserted',0):,} 건\n"
    md += f"- ❌ **실패(로그 확인/자동 재시도 대상)**: {state['stats'].get('total_failed',0):,} 건\n\n"
    md += f"💡 **실패한 데이터는 `siglip_failed.jsonl`에 누적 기록되며 자동 스킵 후 언제든 다시 돌리면 재시도됩니다.**\n\n"
    
    if last_error:
        md += f"⚠️ **최근 에러 원인**: `{last_error}`\n\n"
    if current_e and current_e != "모두 완료 🎉":
        md += f"🔥 **현재 집중 처리 중인 영구전시**: `{current_e}`\n\n"
    elif current_e == "모두 완료 🎉":
        md += f"🎊 **모든 처리가 완료되었습니다!**\n\n"
        
    md += "| 영구전시 ID | 전체 수 | 완료 | 진행률(%) | 상태 |\n"
    md += "|:---|---:|---:|---:|:---:|\n"
    
    for e_id, total in sorted(state['museum_counts'].items()):
        done = state['museum_processed'].get(e_id, 0)
        percent = (done / total) * 100 if total > 0 else 0
        status = "✅ 완료" if done >= total and total > 0 else "⏳ 대기중"
        if current_e == e_id: status = "🔥 **진행중**"
        elif done > 0 and done < total: status = "⏳ 부분 진행"
        md += f"| **{e_id}** | {total:,} | {done:,} | {percent:.1f}% | {status} |\n"
        
    try: DASHBOARD_FILE.write_text(md)
    except: pass

def upload_to_cloudflare(batch):
    if not batch: return True
    payload = {"vectors": batch}
    try:
        resp = session.post(WORKER_UPSERT_URL, json=payload, timeout=20) # Reducted timeout
        if resp.status_code == 200: return True
        return False
    except Exception as e:
        return False

print("🚀 MacBook Pro 환경 준비중 (MPS 가속)", flush=True)
device = "mps" if torch.backends.mps.is_available() else "cpu"
model = AutoModel.from_pretrained(MODEL_ID).to(device)
processor = AutoProcessor.from_pretrained(MODEL_ID)
model.eval()

state, processed_ids_set = load_state()
manifest_path = DATA_DIR / "search-manifest.json"
last_err_msg = None

if not manifest_path.exists():
    print("❌ manifest.json not found.", flush=True)
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

print("⚡ 임베딩 및 업로드 시작...", flush=True)

for e_id in sorted_exhibitions:
    arts = grouped_artworks[e_id]
    if state["museum_processed"].get(e_id, 0) >= len(arts): continue
    
    for idx, art in enumerate(arts):
        art_id = art.get("id") or f"{art.get('e','x')}-{art.get('n','x')}"
        img_url = art.get("i")
        if art_id in processed_ids_set: continue
        
        try:
            resp = session.get(img_url, timeout=8, verify=False, headers={"User-Agent": "Mozilla/5.0"})
            if resp.status_code == 200:
                try:
                    image = Image.open(BytesIO(resp.content)).convert("RGB")
                    inputs = processor(images=image, return_tensors="pt").to(device)
                    with torch.no_grad():
                        image_features = model.get_image_features(**inputs)
                    image_features = image_features / image_features.norm(p=2, dim=-1, keepdim=True)
                    vector = image_features[0].cpu().numpy().tolist()
                    del inputs, image_features, image
                    
                    with open(output_file, "a", encoding="utf-8") as f_out:
                        f_out.write(json.dumps({"id": art_id, "e": e_id, "vector": vector}) + "\n")
                        
                    upload_batch.append({ "id": art_id, "values": vector, "metadata": {"e": e_id} })
                    state["stats"]["total_success"] = state["stats"].get("total_success", 0) + 1
                    state["museum_processed"][e_id] = state["museum_processed"].get(e_id, 0) + 1
                    last_err_msg = None
                    ITEMS_PROCESSED_THIS_SESSION += 1
                except Exception as eval_e:
                    raise Exception(f"처리 중 에러(이미지 손상 등): {str(eval_e)[:20]}")
                    
                if len(upload_batch) >= BATCH_SIZE:
                    if upload_to_cloudflare(upload_batch):
                        state["stats"]["total_upserted"] = state.get("stats", {}).get("total_upserted", 0) + len(upload_batch)
                        for b in upload_batch:
                            with open(PROCESSED_FILE, "a", encoding="utf-8") as f:
                                f.write(b["id"] + "\n")
                            processed_ids_set.add(b["id"])
                    else:
                        for b in upload_batch:
                            with open(FAILED_FILE, "a", encoding="utf-8") as f:
                                f.write(json.dumps({"id": b["id"], "e": b["metadata"]["e"], "error": "Cloudflare Upload Error", "url": img_url}) + "\n")
                            with open(PROCESSED_FILE, "a", encoding="utf-8") as f:
                                f.write(b["id"] + "\n")
                            processed_ids_set.add(b["id"])
                        state["stats"]["total_failed"] = state["stats"].get("total_failed", 0) + len(upload_batch)
                        last_err_msg = "Cloudflare Worker 50x/타임아웃(실패)"
                    upload_batch = []
            else:
                raise Exception(f"HTTP {resp.status_code}")
                
        except Exception as e:
            state["stats"]["total_failed"] = state["stats"].get("total_failed", 0) + 1
            last_err_msg = f"에러: {str(e)[:30]}"
            with open(FAILED_FILE, "a", encoding="utf-8") as f:
                f.write(json.dumps({"id": art_id, "e": e_id, "error": str(e)[:100], "url": img_url}) + "\n")
            with open(PROCESSED_FILE, "a", encoding="utf-8") as f:
                f.write(art_id + "\n")
            processed_ids_set.add(art_id)
            ITEMS_PROCESSED_THIS_SESSION += 1
            
        render_dashboard(state, current_e=e_id, last_error=last_err_msg)
        if ITEMS_PROCESSED_THIS_SESSION % 20 == 0:
            save_state(state)
            gc.collect()
            print(f"Processed {state['stats'].get('total_success')} items...", flush=True)
            
if upload_batch:
    if upload_to_cloudflare(upload_batch):
        state["stats"]["total_upserted"] = state.get("stats", {}).get("total_upserted", 0) + len(upload_batch)
        for b in upload_batch:
            with open(PROCESSED_FILE, "a", encoding="utf-8") as f:
                f.write(b["id"] + "\n")
            processed_ids_set.add(b["id"])
            
save_state(state)
render_dashboard(state, current_e="모두 완료 🎉")
print("\n🎊 모든 영구전시 SigLIP 임베딩 및 클라우드 업로드가 끝났습니다!", flush=True)
