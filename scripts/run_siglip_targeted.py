"""
SigLIP 타겟 임베딩 스크립트 - collection JSON 직접 처리
- 매니페스트에 없는 누락 작품만 골라서 임베딩
- 기존 run_siglip_fast.py와 동일한 prefetch 방식 (6스레드 + GPU배치4)
- 기존 siglip_processed_ids.txt 공유 → 중복 없음
- ID 계산: 프론트엔드 InteractiveGlobeRealModal과 동일 로직 사용
"""
import json, os, re, gc, time, datetime, threading, traceback
import torch, urllib3, requests
from io import BytesIO
from pathlib import Path
from PIL import Image
from transformers import AutoProcessor, AutoModel
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
from concurrent.futures import ThreadPoolExecutor, as_completed

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

WORKER_UPSERT_URL = "https://armin-semantic-search.armin-art.workers.dev/upsert"
BATCH_SIZE = 50
DATA_DIR = Path('public/data')
OUTPUT_DIR = Path('embedding_results')
OUTPUT_DIR.mkdir(exist_ok=True)

# 기존 스크립트와 공유 파일 (재개 가능)
PROCESSED_FILE = Path('siglip_processed_ids.txt')
FAILED_FILE    = Path('siglip_failed_targeted.jsonl')
STATE_FILE     = Path('siglip_state_targeted.json')
OVERRIDES_FILE = Path('public/semantic-id-overrides.json')
DASHBOARD_FILE = Path('EMBEDDING_PROGRESS.md')

PREFETCH_WORKERS = 6
GPU_BATCH = 4
MODEL_ID = "google/siglip-base-patch16-224"

# ── 타겟 전시 목록 ──────────────────────────────────────────
TARGETS = [
    'dpm-intl-paintings',
    'rodin-collection',
    'smb-neues-museum-collection',
    'pompidou-newmedia-collection',
    'pompidou-cinema-collection',
    'pompidou-painting-collection',
    'pompidou-design-collection',
    'guggenheim-venice-collection',
    'moma-highlights',
    'aic-highlights',
    'masp-collection',
    'rijksmuseum-drawings',
    'grenoble-collection',
    'mplus-collection-sigg',
    'whitney-collection',
    'sfmoma-collection',
    'psa-collection-all',
    'tm-perm-1',
    'high-museum-collection',
    'thebroad-collection',
    'mplus-collection-mplus',
    'kanazawa-collection',   # 외부 URL — 마지막으로
]

session = requests.Session()
retries = Retry(total=2, backoff_factor=0.5, status_forcelist=[500,502,503,504])
session.mount('http://',  HTTPAdapter(max_retries=retries, pool_connections=20, pool_maxsize=20))
session.mount('https://', HTTPAdapter(max_retries=retries, pool_connections=20, pool_maxsize=20))

file_lock = threading.Lock()

# ── 상태 로드 ─────────────────────────────────────────────
def load_state():
    state = {"total_success": 0, "total_failed": 0, "total_upserted": 0, "exh_done": {}}
    if STATE_FILE.exists():
        try: state.update(json.loads(STATE_FILE.read_text()))
        except: pass
    return state

def save_state(state):
    with file_lock:
        STATE_FILE.write_text(json.dumps(state, ensure_ascii=False))

def load_processed():
    processed = set()
    if PROCESSED_FILE.exists():
        for line in PROCESSED_FILE.read_text(encoding='utf-8').splitlines():
            if line.strip(): processed.add(line.strip())
    return processed

# ── 전시별 누락 작품 목록 빌드 ────────────────────────────
def get_exh_to_file():
    with open('src/data/exhibitions.js') as f:
        raw = f.read()
    blocks = re.findall(r'\{[^{}]*?collectionFile[^{}]*?\}', raw, re.DOTALL)
    mapping = {}
    for b in blocks:
        id_m = re.search(r'\bid:\s*["\']([^"\']+)["\']', b)
        cf_m = re.search(r'collectionFile:\s*["\']([^"\']+)["\']', b)
        if id_m and cf_m:
            mapping[id_m.group(1)] = cf_m.group(1)
    return mapping

def load_manifest_ids():
    """매니페스트에 있는 모든 ID 수집 → 이미 임베딩된 것 판별용"""
    ids = set()
    for i in range(16):
        fname = DATA_DIR / f'search-index-part-{i}.json'
        if not fname.exists(): continue
        with open(fname) as f:
            data = json.load(f)
        arts = data[0] if isinstance(data[0], list) else data
        for a in arts:
            aid = str(a.get('id',''))
            if aid: ids.add(aid)
    return ids

def build_pending(exh_id, cfile, overrides, processed, manifest_ids):
    """collection JSON에서 아직 임베딩 안 된 작품 목록 반환"""
    fpath = DATA_DIR / cfile
    if not fpath.exists():
        return []
    with open(fpath) as f:
        data = json.load(f)
    items = data if isinstance(data, list) else data.get(
        'artworks', data.get('objects', data.get('items', data.get('results', []))))

    exh_overrides = overrides.get(exh_id, {})
    pending = []
    for idx, a in enumerate(items):
        native = str(
            a.get('id') or a.get('objectNumber') or a.get('registrationNumber') or
            a.get('inventoryNumber') or a.get('accessionNum') or ''
        ).strip()

        # 프론트엔드와 동일한 ID 계산 로직
        if native:
            vec_id = exh_overrides.get(native, native)
        else:
            vec_id = f'{exh_id}-{idx}'

        # 이미 처리됐으면 스킵
        if vec_id in processed or vec_id in manifest_ids:
            continue

        # 이미지 URL
        img = str(
            a.get('image') or a.get('imageUrl') or a.get('img') or
            a.get('i') or ''
        ).strip()
        # NGA IIIF → 고해상도
        if not img and isinstance(a.get('primaryImage'), dict):
            iiif = a['primaryImage'].get('iiifUrl') or a['primaryImage'].get('iiifurl','')
            if iiif and 'nga.gov' in iiif:
                img = iiif.rstrip('/') + '/full/800,/0/default.jpg'
        if not img:
            continue

        pending.append({'id': vec_id, 'e': exh_id, 'i': img})

    return pending

# ── 이미지 다운로드 (스레드) ──────────────────────────────
def download_image(item):
    art_id, img_url, e_id = item['id'], item['i'], item['e']
    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
    }
    try:
        resp = session.get(img_url, timeout=12, verify=False, headers=headers)
        if resp.status_code == 200:
            image = Image.open(BytesIO(resp.content)).convert("RGB")
            return art_id, e_id, img_url, image, None
        return art_id, e_id, img_url, None, f"HTTP {resp.status_code}"
    except Exception as ex:
        return art_id, e_id, img_url, None, str(ex)[:80]

# ── Cloudflare 업로드 ────────────────────────────────────
def upload_batch(batch):
    if not batch: return True, None
    try:
        resp = session.post(WORKER_UPSERT_URL, json={"vectors": batch}, timeout=30)
        if resp.status_code == 200: return True, None
        return False, f"HTTP {resp.status_code}: {resp.text[:100]}"
    except Exception as ex:
        return False, str(ex)[:100]

# ── 대시보드 업데이트 ────────────────────────────────────
def update_dashboard(state, current_exh, elapsed):
    total = sum(state['exh_done'].get('__total__', {e: 0 for e in TARGETS}).values()) if '__total__' in state else 0
    done = state['total_success']
    speed = done / elapsed if elapsed > 0 else 0
    lines = [
        "# 🎨 SigLIP 타겟 임베딩 진행 (targeted)\n",
        f"> **업데이트**: {datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')}",
        f"> **완료**: {done:,} | **실패**: {state['total_failed']:,} | **업로드**: {state['total_upserted']:,}",
        f"> **속도**: {speed:.1f} 개/초\n",
        "| 전시 ID | 완료 | 상태 |",
        "|:---|---:|:---|",
    ]
    for e in TARGETS:
        cnt = state['exh_done'].get(e, 0)
        icon = "🔥" if e == current_exh else ("✅" if cnt > 0 else "⏳")
        lines.append(f"| {e} | {cnt:,} | {icon} |")
    try:
        DASHBOARD_FILE.write_text('\n'.join(lines))
    except: pass
    print('\n'.join(lines[-5:]), flush=True)

# ═══════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════
print("🚀 SigLIP 타겟 임베딩 시작", flush=True)
device = "mps" if torch.backends.mps.is_available() else ("cuda" if torch.cuda.is_available() else "cpu")
print(f"   device: {device}", flush=True)

model = AutoModel.from_pretrained(MODEL_ID).to(device)
processor = AutoProcessor.from_pretrained(MODEL_ID)
model.eval()

state = load_state()
processed = load_processed()
print(f"   기존 processed IDs: {len(processed):,}", flush=True)

overrides = {}
if OVERRIDES_FILE.exists():
    with open(OVERRIDES_FILE) as f:
        overrides = json.load(f)

exh_to_file = get_exh_to_file()
manifest_ids = load_manifest_ids()
print(f"   매니페스트 IDs: {len(manifest_ids):,}", flush=True)

output_file = OUTPUT_DIR / "siglip_targeted_embeddings.jsonl"
upload_buf = []
START_TIME = time.time()
session_done = 0

for exh_id in TARGETS:
    cfile = exh_to_file.get(exh_id)
    if not cfile:
        print(f"⚠️  {exh_id}: collectionFile 없음 — 스킵", flush=True)
        continue

    pending = build_pending(exh_id, cfile, overrides, processed, manifest_ids)
    if not pending:
        print(f"✅ {exh_id}: 모두 처리됨", flush=True)
        continue

    print(f"\n🏛️  [{exh_id}] 미처리 {len(pending):,}개 시작...", flush=True)
    exh_done_count = [0]  # mutable so nested function can modify

    with ThreadPoolExecutor(max_workers=PREFETCH_WORKERS) as executor:
        futures = {executor.submit(download_image, item): item for item in pending}
        gpu_buf = []

        def flush_gpu(buf):
            global upload_buf, session_done
            if not buf: return
            try:
                inputs = processor(images=[b[3] for b in buf], return_tensors="pt", padding=True).to(device)
                with torch.no_grad():
                    feats = model.get_image_features(**inputs)
                feats = feats / feats.norm(p=2, dim=-1, keepdim=True)
                vecs = feats.cpu().numpy().tolist()
                del inputs, feats
                for b in buf: b[3].close()

                for i, (aid, eid, _, _, _) in enumerate(buf):
                    vec = vecs[i]
                    with file_lock:
                        with open(output_file, 'a') as fo:
                            fo.write(json.dumps({"id": aid, "e": eid, "vector": vec}) + "\n")
                    upload_buf.append({"id": aid, "values": vec, "metadata": {"e": eid}})
                    state['total_success'] += 1
                    state['exh_done'][eid] = state['exh_done'].get(eid, 0) + 1
                    exh_done_count[0] += 1
                    session_done += 1
                    with file_lock:
                        with open(PROCESSED_FILE, 'a') as fp:
                            fp.write(aid + "\n")
                    processed.add(aid)

            except Exception as gpu_e:
                err_str = str(gpu_e)[:80]
                print(f"  ⚠️  GPU 오류: {err_str}", flush=True)
                for aid, eid, url, _, _ in buf:
                    state['total_failed'] += 1
                    with file_lock:
                        with open(FAILED_FILE, 'a') as ff:
                            ff.write(json.dumps({"id": aid, "e": eid, "error": err_str, "url": url}) + "\n")
                        with open(PROCESSED_FILE, 'a') as fp:
                            fp.write(aid + "\n")
                    processed.add(aid)

            # 업로드
            if len(upload_buf) >= BATCH_SIZE:
                ok, err = upload_batch(upload_buf[:BATCH_SIZE])
                if ok:
                    state['total_upserted'] += BATCH_SIZE
                else:
                    print(f"  ⚠️  업로드 실패: {err}", flush=True)
                del upload_buf[:BATCH_SIZE]

        for future in as_completed(futures):
            aid, eid, url, image, err = future.result()

            if err or image is None:
                state['total_failed'] += 1
                with file_lock:
                    with open(FAILED_FILE, 'a') as ff:
                        ff.write(json.dumps({"id": aid, "e": eid, "error": err, "url": url}) + "\n")
                    with open(PROCESSED_FILE, 'a') as fp:
                        fp.write(aid + "\n")
                processed.add(aid)
                session_done += 1
                continue

            gpu_buf.append((aid, eid, url, image, None))
            if len(gpu_buf) >= GPU_BATCH:
                flush_gpu(gpu_buf[:GPU_BATCH])
                gpu_buf = gpu_buf[GPU_BATCH:]

            if session_done % 100 == 0 and session_done > 0:
                elapsed = time.time() - START_TIME
                speed = session_done / elapsed
                print(f"  ⚡ {session_done}개 완료, {speed:.1f}/초 | 성공 {state['total_success']:,} 실패 {state['total_failed']:,}", flush=True)
                save_state(state)
                gc.collect()
                update_dashboard(state, exh_id, elapsed)

        flush_gpu(gpu_buf)
        gpu_buf = []

    print(f"  ✅ {exh_id}: {exh_done_count[0]}개 임베딩 완료", flush=True)
    save_state(state)

# 마지막 업로드
if upload_buf:
    ok, err = upload_batch(upload_buf)
    if ok:
        state['total_upserted'] += len(upload_buf)
    else:
        print(f"마지막 업로드 실패: {err}", flush=True)

save_state(state)
elapsed = time.time() - START_TIME
update_dashboard(state, "완료", elapsed)
print(f"\n🎊 완료! 성공 {state['total_success']:,} | 실패 {state['total_failed']:,} | 업로드 {state['total_upserted']:,} | {elapsed/60:.1f}분", flush=True)
