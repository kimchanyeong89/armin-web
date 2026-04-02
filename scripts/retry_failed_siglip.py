import os
import json
import time
import requests
from io import BytesIO
from PIL import Image
from pathlib import Path
from tqdm import tqdm
from concurrent.futures import ThreadPoolExecutor
import torch
import torch.nn.functional as F
from transformers import AutoProcessor, AutoModel

# -- Config --
MODEL_ID = "google/siglip-base-patch16-224"
DEVICE = "mps" if torch.backends.mps.is_available() else "cpu"
FAILED_LOG = Path("siglip_failed.jsonl")
NEW_FAILED_LOG = Path("siglip_failed_retry.jsonl")
PROCESSED_FILE = Path("siglip_processed_ids.txt")
STATE_FILE = Path("siglip_state.json")
MAX_RETRIES_202 = 5
DELAY_202 = 3.0 # seconds to wait before retrying 202 (famsf server)

# Cloudflare Vectorize Config
VECTORIZE_UPSERT_URL = "https://vectorize-upload.kietzsche.workers.dev/upsert"
UPSERT_BATCH_SIZE = 50

print("1. Loading failed items...")
if not FAILED_LOG.exists():
    print("No failures to retry!")
    exit(0)

# Load failures
failed_items = []
for line in FAILED_LOG.read_text().splitlines():
    if not line.strip(): continue
    try:
        j = json.loads(line)
        failed_items.append(j)
    except: pass

print(f"Total isolated failed items to retry: {len(failed_items)}")

# Load model
print(f"2. Loading model {MODEL_ID} on {DEVICE}...")
processor = AutoProcessor.from_pretrained(MODEL_ID)
model = AutoModel.from_pretrained(MODEL_ID).to(DEVICE)
model.eval()

def download_with_retry(url, retries=MAX_RETRIES_202, delay=DELAY_202):
    for attempt in range(retries):
        try:
            rs = requests.get(url, timeout=10)
            if rs.status_code == 200:
                return rs.content
            elif rs.status_code == 202:
                # FAMSF specific: "Accepted" but image not generated yet
                if attempt < retries - 1:
                    print(f"  [202 Wait] {url} - Retrying in {delay}s ({attempt+1}/{retries})...")
                    time.sleep(delay)
                    continue
                else:
                    raise Exception(f"HTTP 202 Timeout after {retries} retries")
            else:
                raise Exception(f"HTTP {rs.status_code}")
        except Exception as e:
            if attempt == retries - 1:
                raise e
            time.sleep(delay)
    return None

def process_item(item):
    url = item.get("url")
    if not url: return None, "No URL"
    
    try:
        content = download_with_retry(url)
        img = Image.open(BytesIO(content)).convert("RGB")
        inputs = processor(images=img, return_tensors="pt").to(DEVICE)
        with torch.no_grad():
            outputs = model.get_image_features(**inputs)
            emb = F.normalize(outputs, p=2, dim=-1).squeeze().tolist()
        return emb, None
    except Exception as e:
        return None, str(e)[:80]

print("3. Starting retry processing...")
success_batch = []
still_failed = []

def flush_batch():
    global success_batch
    if not success_batch: return
    
    # Send to cloudflare
    try:
        resp = requests.post(
            VECTORIZE_UPSERT_URL, 
            json={"vectors": success_batch},
            headers={"Content-Type": "application/json"},
            timeout=30
        )
        if resp.status_code == 200:
            # Update files
            with open(PROCESSED_FILE, "a") as f:
                for b in success_batch: f.write(b["id"] + "\n")
            
            # Note: For dashboard update, we just rely on total counts in PROCESSED_FILE since recover script cleans it
            success_batch = []
        else:
            raise Exception(f"Cloudflare Error: {resp.status_code}")
    except Exception as e:
        print(f"Upload failed: {str(e)[:50]}")
        # Mark as failed again so they don't get lost
        for b in success_batch:
            still_failed.append({"id": b["id"], "e": b["metadata"]["e"], "url": "", "error": str(e)[:80]})
        success_batch = []

pbar = tqdm(total=len(failed_items), desc="Retrying Failures")
for item in failed_items:
    i_id = item.get("id")
    e_id = item.get("e")
    
    emb, err = process_item(item)
    if emb is None:
        still_failed.append({"id": i_id, "e": e_id, "url": item.get("url"), "error": err})
    else:
        success_batch.append({"id": i_id, "values": emb, "metadata": {"e": e_id}})
        if len(success_batch) >= UPSERT_BATCH_SIZE:
            flush_batch()
            
    pbar.update(1)

flush_batch() # remaining
pbar.close()

print(f"Done. Successfully recovered: {len(failed_items) - len(still_failed)} items.")
print(f"Still failing: {len(still_failed)} items.")

# 4. Overwrite failed log with remaining failures
with open(FAILED_LOG, "w") as f:
    for sf in still_failed:
        f.write(json.dumps(sf) + "\n")

# Run the recovery tool to safely fix up the state numbers for dashboard!
import os
os.system("python3 scripts/recover_dashboard.py")
os.system("python3 scripts/refresh_dashboard.py")
